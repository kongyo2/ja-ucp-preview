// Minimal Scribunto LuaStandalone protocol server, implemented in Node.js +
// `wasmoon-lua5.1`, so the renderer can evaluate `{{#invoke:Module|fn}}` /
// `Module:Foo` Lua source without needing an external Lua binary that PHP/WASM
// cannot spawn on its own.
//
// This is **not** a full re-implementation of upstream Scribunto's
// LuaStandalone MWServer.lua – it covers the message-protocol surface the
// renderer actually exercises:
//
//   - getStatus / cleanupChunks / quit (control)
//   - loadString (compile a chunk and remember it)
//   - call (invoke a chunk with args, return results)
//   - registerLibrary / wrapPhpFunction (registered as opaque PHP-side ids
//     that get serialized back when needed)
//
// The Scribunto-side `mw` library is intentionally NOT modeled here; modules
// that depend on `mw.*` (mw.title, mw.text, etc.) will fail to load. The
// `scribuntoEnabled` flag is still opt-in for that reason.

import { readFile } from "node:fs/promises";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function debugLog(line: string): void {
  const target = process.env.JA_UCP_SCRIBUNTO_DEBUG;
  if (!target) return;
  try {
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, `[${new Date().toISOString()}] ${line}\n`, "utf8");
  } catch {
    /* ignore */
  }
}

export interface SpawnApi {
  notifySpawn(): void;
  stdout(data: string | ArrayBuffer | Uint8Array): void;
  stderr(data: string | ArrayBuffer | Uint8Array): void;
  exit(code: number): void;
  on(eventName: "stdin", handler: (data: ArrayBuffer | Uint8Array) => void): void;
}

interface ScribuntoMessage {
  op: string;
  [key: string]: unknown;
}

interface ChunkEntry {
  source: string;
  chunkName: string;
  kind: "user" | "fake-mw-package" | "fake-setupInterface" | "fake-executeModule" | "fake-clone" | "fake-noop" | "module-function";
  // For module-function: parent chunkId (the module's chunk) and the
  // function name inside the returned table.
  parentChunkId?: number;
  functionName?: string;
}

export async function runScribuntoServer(
  argv: string[],
  api: SpawnApi,
  options: { cwd?: string; env?: Record<string, string> }
): Promise<void> {
  void options;
  debugLog(`enter runScribuntoServer argv=${JSON.stringify(argv)}`);
  api.notifySpawn();
  debugLog("notifySpawn done");

  // `lua -v` probe used by LuaStandaloneInterpreter::getLuaVersion()
  if (argv.includes("-v")) {
    api.stdout("Lua 5.1.5 (ja-ucp-preview/wasmoon-lua5.1)\n");
    api.exit(0);
    return;
  }

  const mwMainIdx = argv.findIndex((a) => a.endsWith("mw_main.lua"));
  if (mwMainIdx < 0) {
    api.stderr(`ja-ucp-preview Scribunto server: not a Scribunto invocation: ${argv.join(" ")}\n`);
    api.exit(127);
    return;
  }
  void argv[mwMainIdx + 1]; // scribuntoDir (unused – we do not load MWServer.lua)
  const interpreterId = parseInt(argv[mwMainIdx + 2] ?? "0", 10);
  debugLog(`scribunto mode, interpreterId=${interpreterId}`);

  let lua: { doString(s: string): Promise<unknown>; global: { close(): void } };
  try {
    const mod = (await import("wasmoon-lua5.1")) as unknown as {
      Lua: { create(): Promise<typeof lua> };
    };
    lua = await mod.Lua.create();
    debugLog("wasmoon Lua created");
  } catch (error: unknown) {
    api.stderr(
      `ja-ucp-preview Scribunto server: wasmoon-lua5.1 unavailable (${
        error instanceof Error ? error.message : String(error)
      })\n`
    );
    api.exit(127);
    return;
  }

  const chunks = new Map<number, ChunkEntry>();
  let nextChunkId = 1;

  const stdinBuffer: Buffer[] = [];
  let stdinResolver: (() => void) | null = null;

  api.on("stdin", (data) => {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
    debugLog(`stdin event: ${u8.length} bytes`);
    stdinBuffer.push(Buffer.from(u8));
    const resolver = stdinResolver;
    if (resolver) {
      stdinResolver = null;
      resolver();
    }
  });

  async function readBytes(n: number): Promise<Buffer> {
    if (n === 0) return Buffer.alloc(0);
    for (;;) {
      const total = stdinBuffer.reduce((a, b) => a + b.length, 0);
      if (total >= n) {
        const all = Buffer.concat(stdinBuffer);
        stdinBuffer.length = 0;
        if (all.length > n) stdinBuffer.push(all.subarray(n));
        return all.subarray(0, n);
      }
      await new Promise<void>((resolve) => {
        stdinResolver = resolve;
      });
    }
  }

  async function readMessage(): Promise<ScribuntoMessage> {
    const header = await readBytes(16);
    const lenHex = header.toString("utf8", 0, 8);
    const length = parseInt(lenHex, 16);
    if (!Number.isFinite(length) || length < 0) {
      throw new Error(`Invalid Scribunto header length: ${lenHex}`);
    }
    const body = await readBytes(length);
    const bodyStr = body.toString("utf8");
    debugLog(`raw body (${length} bytes): ${bodyStr.slice(0, 200)}`);
    // The body is a Lua expression. Wrap with `return` and evaluate; `chunks`
    // is referenced occasionally so we expose an empty table to satisfy
    // resolution at minimum.
    let result: unknown;
    try {
      result = await lua.doString(`local chunks = chunks or {}; return ${bodyStr}`);
    } catch (error: unknown) {
      throw new Error(
        `Scribunto message Lua-eval failed: ${
          error instanceof Error ? error.message : String(error)
        }; body: ${bodyStr.slice(0, 200)}`
      );
    }
    if (!result || typeof result !== "object") {
      throw new Error(`Scribunto message did not evaluate to a table: ${bodyStr.slice(0, 200)}`);
    }
    return result as ScribuntoMessage;
  }

  function encodeForPhp(msg: ScribuntoMessage): Buffer {
    let serialized = phpSerialize(msg);
    // PHP-side strtr inverts these escapes when reading.
    serialized = serialized
      .replace(/\\/g, "\\\\")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
    const length = Buffer.byteLength(serialized, "utf8");
    const check = length * 2 - 1;
    const header = `${length.toString(16).padStart(8, "0")}${check.toString(16).padStart(8, "0")}`;
    return Buffer.from(header + serialized, "utf8");
  }

  function phpSerialize(value: unknown, depth = 0): string {
    if (depth > 100) throw new Error("phpSerialize: recursion limit exceeded");
    if (value === null || value === undefined) return "N;";
    if (typeof value === "boolean") return `b:${value ? 1 : 0};`;
    if (typeof value === "number") {
      if (Number.isInteger(value)) return `i:${value};`;
      if (!Number.isFinite(value)) {
        if (Number.isNaN(value)) return "d:NAN;";
        return value > 0 ? "d:INF;" : "d:-INF;";
      }
      return `d:${value};`;
    }
    if (typeof value === "string") {
      const bytes = Buffer.byteLength(value, "utf8");
      return `s:${bytes}:"${value}";`;
    }
    if (typeof value === "object") {
      // Scribunto's chunk-reference marker, set by handleCall when wasmoon
      // returned a Lua function or table-with-function. The id must be a
      // real number; nil-returned-from-lua-via-wasmoon-proxy comes through
      // as null/undefined and must not be confused with a real marker.
      const markerId = (value as { __scribunto_function_id__?: unknown }).__scribunto_function_id__;
      if (typeof markerId === "number") {
        const inner = `s:13:"interpreterId";i:${interpreterId};s:2:"id";i:${markerId};`;
        return `O:42:"Scribunto_LuaStandaloneInterpreterFunction":2:{${inner}}`;
      }
      const entries: [string | number, unknown][] = [];
      if (value instanceof Map) {
        for (const [k, v] of value) {
          entries.push([k as string | number, v]);
        }
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) entries.push([i + 1, value[i]]);
      } else {
        for (const [k, v] of Object.entries(value)) {
          const intKey = /^-?\d+$/.test(k);
          entries.push([intKey ? parseInt(k, 10) : k, v]);
        }
      }
      const body = entries
        .map(
          ([k, v]) =>
            (typeof k === "number" ? `i:${k};` : phpSerialize(k, depth + 1)) +
            phpSerialize(v, depth + 1)
        )
        .join("");
      return `a:${entries.length}:{${body}}`;
    }
    throw new Error(`phpSerialize: unsupported type ${typeof value}`);
  }

  async function handleLoadString(msg: ScribuntoMessage): Promise<ScribuntoMessage> {
    const text = String(msg.text ?? "");
    const chunkName = String(msg.chunkName ?? "");
    const id = nextChunkId++;

    // Detect Scribunto's own infrastructure files. We intercept them so we
    // don't have to faithfully implement the full mw.*/mw_interface re-entry
    // protocol, which wasmoon-lua5.1 cannot do synchronously today.
    const baseName = chunkName.replace(/^@/, "").split("/").pop() ?? chunkName;
    if (baseName === "mwInit.lua") {
      // We don't actually execute mwInit.lua – it only defines globals like
      // mw.clone that simple Scribunto modules don't depend on.
      chunks.set(id, { source: text, chunkName, kind: "fake-noop" });
      return { op: "return", nvalues: 1, values: { 1: id } };
    }
    if (baseName === "mw.lua") {
      // Calling this chunk will return a stub mw "package" with the methods
      // PHP actually drives during module execution.
      chunks.set(id, { source: text, chunkName, kind: "fake-mw-package" });
      return { op: "return", nvalues: 1, values: { 1: id } };
    }

    try {
      const luaCode = `local fn, err = loadstring(${JSON.stringify(text)}, ${JSON.stringify(chunkName)})
if not fn then error(err, 0) end
return true`;
      await lua.doString(luaCode);
    } catch (error: unknown) {
      return {
        op: "error",
        value: error instanceof Error ? error.message : String(error)
      };
    }
    chunks.set(id, { source: text, chunkName, kind: "user" });
    return { op: "return", nvalues: 1, values: { 1: id } };
  }

  function mkFakeChunk(kind: ChunkEntry["kind"], extra: Partial<ChunkEntry> = {}): number {
    const id = nextChunkId++;
    chunks.set(id, { source: "", chunkName: `<fake:${kind}>`, kind, ...extra });
    return id;
  }

  async function handleCall(msg: ScribuntoMessage): Promise<ScribuntoMessage> {
    const chunkId = Number(msg.id);
    const chunk = chunks.get(chunkId);
    if (!chunk) {
      return { op: "error", value: `function id ${chunkId} does not exist` };
    }
    try {
      switch (chunk.kind) {
        case "fake-noop":
          return { op: "return", nvalues: 0, values: {} };

        case "fake-mw-package": {
          // PHP calls this once after mw.lua loadString. The result is the
          // "package" table that LuaEngine.php stores as $this->mw. The PHP
          // engine indexes into it for executeModule / setupInterface / etc.
          const setupId = mkFakeChunk("fake-setupInterface");
          const execId = mkFakeChunk("fake-executeModule");
          const cloneId = mkFakeChunk("fake-clone");
          const noopId = mkFakeChunk("fake-noop");
          return {
            op: "return",
            nvalues: 1,
            values: {
              1: {
                setupInterface: { __scribunto_function_id__: setupId },
                executeModule: { __scribunto_function_id__: execId },
                clone: { __scribunto_function_id__: cloneId },
                allToString: { __scribunto_function_id__: noopId },
                tostringOrNil: { __scribunto_function_id__: noopId }
              }
            }
          };
        }

        case "fake-setupInterface":
        case "fake-clone":
        case "fake-noop":
          return { op: "return", nvalues: 0, values: {} };

        case "fake-executeModule": {
          // args: 1=chunkId of user module, 2=function name, 3=frame
          const args = (msg.args as Record<string, unknown>) ?? {};
          const userChunkRef = args["1"] as unknown;
          const functionName = args["2"] as string | undefined;

          let userChunkId: number | undefined;
          if (
            typeof userChunkRef === "object" &&
            userChunkRef !== null &&
            typeof (userChunkRef as { __scribunto_function_id__?: unknown }).__scribunto_function_id__ ===
              "number"
          ) {
            userChunkId = (userChunkRef as { __scribunto_function_id__: number }).__scribunto_function_id__;
          } else if (typeof userChunkRef === "number") {
            userChunkId = userChunkRef;
          }
          if (userChunkId === undefined || !chunks.has(userChunkId)) {
            return {
              op: "return",
              nvalues: 2,
              values: { 1: false, 2: "executeModule: missing user module chunk" }
            };
          }

          const userChunk = chunks.get(userChunkId)!;
          // Run the module source in wasmoon and bind its result to a global
          // we can re-access later when PHP calls the looked-up function.
          const globalSlot = `__ja_ucp_module_${userChunkId}`;
          await lua.doString(
            `local fn, err = loadstring(${JSON.stringify(userChunk.source)}, ${JSON.stringify(
              userChunk.chunkName
            )})
if not fn then error(err, 0) end
${globalSlot} = fn()`
          );
          // Probe the table for the requested function name.
          const typeProbe = (await lua.doString(
            `local m = ${globalSlot}; if type(m) ~= 'table' then return type(m) end; return type(m[${JSON.stringify(
              functionName ?? ""
            )}])`
          )) as string;
          if (typeProbe !== "function") {
            return {
              op: "return",
              nvalues: 2,
              values: { 1: false, 2: typeProbe }
            };
          }
          const fnId = mkFakeChunk("module-function", {
            parentChunkId: userChunkId,
            functionName: functionName ?? ""
          });
          return {
            op: "return",
            nvalues: 2,
            values: { 1: true, 2: { __scribunto_function_id__: fnId } }
          };
        }

        case "module-function": {
          // Call the previously looked-up function. For now we drop the frame
          // argument because faithfully marshalling Scribunto's frame object
          // would require the full mw_interface protocol.
          const parent = chunk.parentChunkId;
          const name = chunk.functionName;
          if (parent === undefined || !name) {
            return { op: "error", value: "module-function: missing binding" };
          }
          const globalSlot = `__ja_ucp_module_${parent}`;
          const result = (await lua.doString(
            `return ${globalSlot}[${JSON.stringify(name)}]()`
          )) as unknown;
          const values: Record<number, unknown> = {};
          const arr = normalizeLuaReturn(result);
          arr.forEach((v, i) => {
            values[i + 1] = stringifyLuaValue(v);
          });
          return { op: "return", nvalues: arr.length, values };
        }

        case "user":
        default: {
          const luaCode = `local fn, err = loadstring(${JSON.stringify(chunk.source)}, ${JSON.stringify(chunk.chunkName)})
if not fn then error(err, 0) end
local result = fn()
return result`;
          const result = (await lua.doString(luaCode)) as unknown;
          const values: Record<number, unknown> = {};
          const arr = normalizeLuaReturn(result);
          arr.forEach((v, i) => {
            values[i + 1] = stringifyLuaValue(v);
          });
          return { op: "return", nvalues: arr.length, values };
        }
      }
    } catch (error: unknown) {
      return { op: "error", value: error instanceof Error ? error.message : String(error) };
    }
  }

  function stringifyLuaValue(value: unknown): unknown {
    // wasmoon returns Lua tables as proxy objects with `alive`, `thread`,
    // `ref`, `pointer` fields. Without crossing back into Lua to enumerate
    // their contents we treat them as opaque – which is fine for scalars and
    // for the values produced by simple modules.
    if (
      value !== null &&
      typeof value === "object" &&
      "alive" in (value as object) &&
      "ref" in (value as object)
    ) {
      return null;
    }
    return value;
  }

  function normalizeLuaReturn(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return [];
    }
    return [value];
  }

  void readFile; // ensure import stays available for future expansion

  while (true) {
    let msg: ScribuntoMessage;
    try {
      debugLog("waiting for message");
      msg = await readMessage();
      debugLog(`got message op=${msg.op}${
        msg.op === "call" ? ` id=${JSON.stringify(msg.id)} args=${JSON.stringify(msg.args)}` : ""
      }${msg.op === "loadString" ? ` chunkName=${JSON.stringify(msg.chunkName)} textLen=${String(msg.text).length}` : ""}`);
    } catch (error: unknown) {
      api.stderr(
        `ja-ucp-preview Scribunto server: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
      api.exit(1);
      try {
        lua.global.close();
      } catch {
        /* ignore */
      }
      return;
    }

    let response: ScribuntoMessage;
    switch (msg.op) {
      case "loadString":
        response = await handleLoadString(msg);
        break;
      case "call":
        response = await handleCall(msg);
        break;
      case "registerLibrary":
        response = { op: "return", nvalues: 0, values: {} };
        break;
      case "wrapPhpFunction": {
        const id = nextChunkId++;
        response = { op: "return", nvalues: 1, values: { 1: id } };
        break;
      }
      case "cleanupChunks": {
        const ids = (msg.ids as Record<string, unknown>) ?? {};
        for (const id of chunks.keys()) {
          if (!(String(id) in ids)) {
            chunks.delete(id);
          }
        }
        response = { op: "return", nvalues: 0, values: {} };
        break;
      }
      case "getStatus":
        response = {
          op: "return",
          nvalues: 1,
          values: { 1: { pid: 1, time: 0, vsize: 0, rss: 0 } }
        };
        break;
      case "quit":
      case "testquit":
        try {
          lua.global.close();
        } catch {
          /* ignore */
        }
        api.exit(msg.op === "testquit" ? 42 : 0);
        return;
      default:
        api.stderr(`ja-ucp-preview Scribunto server: unknown op "${msg.op}"\n`);
        response = { op: "error", value: `unknown op: ${msg.op}` };
        break;
    }

    const enc = encodeForPhp(response);
    debugLog(
      `sending response op=${response.op} bytes=${enc.length}${
        response.op === "error" ? ` value=${JSON.stringify((response as { value?: unknown }).value)}` : ""
      }`
    );
    api.stdout(enc);
  }
}
