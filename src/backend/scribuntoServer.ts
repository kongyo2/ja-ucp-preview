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
  // If we already executed the chunk and the result was a Lua function,
  // calling this chunk again should re-run the function with new args.
  isFunction: boolean;
}

export async function runScribuntoServer(
  argv: string[],
  api: SpawnApi,
  options: { cwd?: string; env?: Record<string, string> }
): Promise<void> {
  api.notifySpawn();

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

  let lua: { doString(s: string): Promise<unknown>; global: { close(): void } };
  try {
    const mod = (await import("wasmoon-lua5.1")) as unknown as {
      Lua: { create(): Promise<typeof lua> };
    };
    lua = await mod.Lua.create();
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
    // The body is a Lua expression. Wrap with `return` and evaluate; `chunks`
    // is referenced occasionally so we expose an empty table to satisfy
    // resolution at minimum.
    const result = (await lua.doString(
      `local chunks = chunks or {}; return ${bodyStr}`
    )) as ScribuntoMessage;
    if (!result || typeof result !== "object") {
      throw new Error(`Scribunto message did not evaluate to a table: ${bodyStr.slice(0, 200)}`);
    }
    return result;
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
      // Scribunto's chunk-reference marker
      if ((value as { __scribunto_function_id__?: number }).__scribunto_function_id__ !== undefined) {
        const id = (value as { __scribunto_function_id__: number }).__scribunto_function_id__;
        const inner = `s:13:"interpreterId";i:${interpreterId};s:2:"id";i:${id};`;
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
    try {
      // Verify the source compiles by loadstring'ing it in the VM. We do not
      // execute it yet.
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
    chunks.set(id, { source: text, chunkName, isFunction: false });
    return { op: "return", nvalues: 1, values: { 1: id } };
  }

  async function handleCall(msg: ScribuntoMessage): Promise<ScribuntoMessage> {
    const chunkId = Number(msg.id);
    const chunk = chunks.get(chunkId);
    if (!chunk) {
      return { op: "error", value: `function id ${chunkId} does not exist` };
    }
    try {
      // Execute the chunk in a fresh wasmoon `doString` call. We can't easily
      // call back into a chunk-stored function across calls because wasmoon
      // does not expose persistent function references; instead, re-load the
      // source each time. For our case the source has no observable side
      // effects on rerun.
      const luaCode = `local fn, err = loadstring(${JSON.stringify(chunk.source)}, ${JSON.stringify(chunk.chunkName)})
if not fn then error(err, 0) end
local result = fn()
return result`;
      const result = (await lua.doString(luaCode)) as unknown;
      const values: Record<number, unknown> = {};
      const normalized = normalizeLuaReturn(result);
      normalized.forEach((v, i) => {
        values[i + 1] = v;
      });
      return { op: "return", nvalues: normalized.length, values };
    } catch (error: unknown) {
      return { op: "error", value: error instanceof Error ? error.message : String(error) };
    }
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
      msg = await readMessage();
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

    api.stdout(encodeForPhp(response));
  }
}
