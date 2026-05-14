import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RenderContext, RendererBackend, RenderRequest, RenderResult } from "../types.js";
import {
  jaUncyclopediaDefaultStyleTitles,
  jaUncyclopediaSkinStyleTitles,
  siteStylePageOverrides
} from "../site/styles.js";
import { runScribuntoServer, type SpawnApi } from "./scribuntoServer.js";

export interface PhpWasmBackendOptions {
  mediaWikiRoot?: string;
  workDir?: string;
  phpVersion?: "8.3" | "8.2" | "8.1" | "8.0" | "7.4";
  forceReinstall?: boolean;
  scribuntoEnabled?: boolean;
}

export class ExactMediaWikiSnapshotMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExactMediaWikiSnapshotMissingError";
  }
}

export class ExactMediaWikiRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExactMediaWikiRuntimeError";
  }
}

const INSTALLATION_VERSION = "mw-1.39.3-ja-ucp-php-wasm-v2";

const RENDER_EXTENSIONS = [
  "CategoryTree",
  "Cite",
  "EmbedVideo",
  "ImageMap",
  "InputBox",
  "ParserFunctions",
  "Poem",
  "SyntaxHighlight_GeSHi",
  "TemplateStyles",
  "Variables",
  "SimpleMathJax",
  "RSS",
  "UserFunctions",
  "UrlGetParameters",
  "AddHTMLMetaAndTitle",
  "CharInsert",
  "YouTube",
  "Josa",
  "Babel",
  "CSS",
  "DynamicPageList3",
  "DPLforum",
  "LogoFunctions",
  "RandomSelection",
  "RandomImage",
  "Spoilers",
  "SimpleTooltip"
] as const;

const RENDER_EXTENSIONS_WITH_SCRIBUNTO = [...RENDER_EXTENSIONS, "Scribunto"] as const;

const SKINS = ["Vector", "MonoBook", "Timeless", "MinervaNeue", "CologneBlue", "Modern"] as const;

interface InstallationPaths {
  root: string;
  localSettingsPath: string;
  requestsDir: string;
}

interface PhpResponse {
  text: string;
  errors: string;
  exitCode: number;
}

interface PhpInstance {
  run(opts: { code?: string; scriptPath?: string; env?: Record<string, string> }): Promise<PhpResponse>;
  runStream?: (opts: {
    code?: string;
    scriptPath?: string;
    env?: Record<string, string>;
  }) => Promise<{
    stdout: ReadableStream<Uint8Array>;
    stderr: ReadableStream<Uint8Array>;
    exitCode: Promise<number>;
  }>;
  setSpawnHandler?: (handler: unknown) => Promise<void>;
  setSapiName?: (name: string) => Promise<void>;
  chdir?: (path: string) => void;
}

export class PhpWasmBackend implements RendererBackend {
  readonly name = "mediawiki-php-wasm";

  private readonly mediaWikiRoot: string;
  private readonly workDir: string;
  private readonly phpVersion: NonNullable<PhpWasmBackendOptions["phpVersion"]>;
  private readonly forceReinstall: boolean;
  private readonly bridgePath: string;
  private readonly scribuntoEnabled: boolean;
  private installationPromise?: Promise<InstallationPaths>;
  private phpPromise?: Promise<PhpInstance>;
  private renderQueue: Promise<unknown> = Promise.resolve();

  private readonly luaStubPath: string;

  constructor(options: PhpWasmBackendOptions = {}) {
    const packageRoot = findPackageRoot();
    this.mediaWikiRoot = resolve(options.mediaWikiRoot ?? join(packageRoot, "vendor", "mediawiki-1.39.3"));
    this.workDir = resolve(options.workDir ?? join(process.cwd(), ".ja-ucp-preview-work"));
    this.phpVersion = options.phpVersion ?? "8.3";
    this.forceReinstall = options.forceReinstall ?? false;
    this.bridgePath = join(packageRoot, "src", "php", "ja-ucp-render.php");
    this.scribuntoEnabled = options.scribuntoEnabled ?? false;
    this.luaStubPath = join(this.workDir, "scribunto-lua-stub.sh");
  }

  async render(request: RenderRequest, context: RenderContext): Promise<RenderResult> {
    const work = this.renderQueue.then(async () => this.renderOnce(request, context));
    this.renderQueue = work.catch(() => undefined);
    return work;
  }

  private async renderOnce(request: RenderRequest, context: RenderContext): Promise<RenderResult> {
    const installation = await this.ensureInstalled();
    const php = await this.ensurePhp();

    const requestPath = join(installation.requestsDir, `${randomUUID()}.json`);
    const skin = request.skin ?? "vector";
    const includeSiteStyles = request.includeSiteStyles ?? true;
    const defaultPageOverrides = siteStylePageOverrides();
    const pageOverrides =
      request.pageOverrides === undefined
        ? defaultPageOverrides
        : { ...defaultPageOverrides, ...request.pageOverrides };
    const payload = {
      ...request,
      skin,
      includeSiteStyles,
      pageOverrides,
      siteStyleTitles: includeSiteStyles ? siteStyleTitlesForSkin(skin) : [],
      now: normalizeDateInput(request.now),
      revisionTimestamp: normalizeDateInput(request.revisionTimestamp),
      user: { ...context.defaultUser, ...request.user }
    };

    await writeFile(requestPath, JSON.stringify(payload), "utf8");
    const responseFile = `${requestPath}.response`;
    // PHP/WASM can throw a wasm "unreachable" trap during script shutdown
    // (especially when Scribunto destructors run after the bridge has
    // already produced its JSON payload). Ensure a process-level handler
    // is installed once, persistently, so the trap doesn't kill Node even
    // when it fires AFTER renderOnce() has already returned its result.
    installWasmTrapHandler();
    const wasmTrappedAtStart = wasmTrapEvents;

    const captureBuffer = { stdout: "", stderr: "" };
    try {
      const runPromise = runPhpScript(
        php,
        this.bridgePath,
        [requestPath, installation.localSettingsPath, this.mediaWikiRoot],
        {
          MW_INSTALL_PATH: this.mediaWikiRoot,
          HOME: this.workDir,
          TMPDIR: join(this.workDir, "tmp")
        },
        captureBuffer
      ).then(
        (r) => ({ kind: "ok" as const, response: r }),
        (err) => ({ kind: "error" as const, error: err })
      );

      // Race the PHP run against polling the response file. The bridge writes
      // the rendered JSON to `<requestPath>.response` BEFORE PHP's shutdown
      // destructor sequence runs, so the file is present even if the wasm
      // runtime later traps and runPhpScript never resolves.
      const fileWatcher = waitForResponseFile(responseFile, () => wasmTrapEvents > wasmTrappedAtStart);

      const outcome = await Promise.race([runPromise, fileWatcher]);

      if (outcome.kind === "ok") {
        const text = outcome.response.text.trim();
        try {
          return JSON.parse(text) as RenderResult;
        } catch (error) {
          throw new ExactMediaWikiRuntimeError(
            `MediaWiki render bridge did not return JSON.\nSTDOUT:\n${outcome.response.text}\nSTDERR:\n${outcome.response.errors}`
          );
        }
      }

      if (outcome.kind === "file") {
        // The bridge wrote its response to disk. The wasm runtime may still
        // be in the middle of its destructor crash, so discard the cached
        // PHP instance and let the next render boot a fresh one.
        delete this.phpPromise;
        return JSON.parse(outcome.text) as RenderResult;
      }

      throw outcome.error;
    } finally {
      await rm(requestPath, { force: true });
      await rm(responseFile, { force: true });
    }
  }

  private ensureInstalled(): Promise<InstallationPaths> {
    this.installationPromise ??= this.install();
    return this.installationPromise;
  }

  private async install(): Promise<InstallationPaths> {
    assertMediaWikiRoot(this.mediaWikiRoot);
    assertBridge(this.bridgePath);
    assertBundledExtensionDependencies(this.mediaWikiRoot);

    const id = createHash("sha256")
      .update(this.mediaWikiRoot)
      .update(INSTALLATION_VERSION)
      .update(this.scribuntoEnabled ? "scribunto" : "no-scribunto")
      .digest("hex")
      .slice(0, 16);
    const root = join(this.workDir, id);
    const sqliteDir = join(root, "sqlite");
    const confDir = join(root, "conf");
    const cacheDir = join(root, "cache");
    const tmpDir = join(root, "tmp");
    const requestsDir = join(root, "requests");
    const localSettingsPath = join(confDir, "LocalSettings.php");
    const markerPath = join(root, "installed.json");
    const dbPath = join(sqliteDir, "ja_ucp_preview.sqlite");

    if (this.forceReinstall) {
      await rm(root, { recursive: true, force: true });
    }

    await mkdir(sqliteDir, { recursive: true });
    await mkdir(confDir, { recursive: true });
    await mkdir(cacheDir, { recursive: true });
    await mkdir(tmpDir, { recursive: true });
    await mkdir(requestsDir, { recursive: true });

    if (this.scribuntoEnabled) {
      await ensureLuaStub(this.luaStubPath);
    }

    if (!existsSync(markerPath) || !existsSync(dbPath) || !existsSync(localSettingsPath)) {
      await rm(root, { recursive: true, force: true });
      await mkdir(sqliteDir, { recursive: true });
      await mkdir(confDir, { recursive: true });
      await mkdir(cacheDir, { recursive: true });
      await mkdir(tmpDir, { recursive: true });
      await mkdir(requestsDir, { recursive: true });

      const php = await this.ensurePhp();
      const packageRoot = findPackageRoot();
      const installScript = join(packageRoot, "src", "php", "ja-ucp-install.php");
      await runPhpScript(
        php,
        installScript,
        ["Uncyclopedia", "PreviewAdmin"],
        {
          MW_INSTALL_PATH: this.mediaWikiRoot,
          HOME: this.workDir,
          TMPDIR: tmpDir,
          JA_UCP_DBPATH: sqliteDir,
          JA_UCP_DBNAME: "ja_ucp_preview",
          JA_UCP_CONFPATH: confDir,
          JA_UCP_PASS: `Preview-${id}-Password`,
          JA_UCP_SERVER: "https://ansaikuropedia.org",
          JA_UCP_SCRIPTPATH: "",
          JA_UCP_LANG: "ja"
        }
      );

      await writeFile(
        localSettingsPath,
        createLocalSettings(
          this.mediaWikiRoot,
          sqliteDir,
          cacheDir,
          tmpDir,
          this.scribuntoEnabled,
          this.luaStubPath
        ),
        "utf8"
      );

      await runPhpScript(
        php,
        join(this.mediaWikiRoot, "maintenance", "update.php"),
        ["--quick", "--conf", localSettingsPath],
        { MW_INSTALL_PATH: this.mediaWikiRoot, HOME: this.workDir, TMPDIR: tmpDir }
      );

      await this.installWikibaseClientEmptyRepoTables(php, dbPath);

      await writeFile(
        markerPath,
        JSON.stringify({ installedAt: new Date().toISOString(), version: INSTALLATION_VERSION }, null, 2),
        "utf8"
      );
    }

    return { root, localSettingsPath, requestsDir };
  }

  private async installWikibaseClientEmptyRepoTables(php: PhpInstance, dbPath: string): Promise<void> {
    const sqlPath = join(this.mediaWikiRoot, "extensions", "Wikibase", "repo", "sql", "sqlite", "wb_items_per_site.sql");
    const sql = await readFile(sqlPath, "utf8");
    const transformed = sql
      .replace(/\/\*_\*\//g, "")
      .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
      .replace(/CREATE UNIQUE INDEX /g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
      .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ");

    const response = await php.run({
      code: `<?php
$db = new SQLite3(${jsonString(dbPath)});
$sql = ${jsonString(transformed)};
if (!$db->exec($sql)) { fwrite(STDERR, $db->lastErrorMsg()); exit(1); }
echo 'ok';
`
    });
    if (response.exitCode !== 0 || !response.text.includes("ok")) {
      throw new ExactMediaWikiRuntimeError(
        `Failed to install Wikibase repo tables: ${response.errors}\n${response.text}`
      );
    }
  }

  private ensurePhp(): Promise<PhpInstance> {
    this.phpPromise ??= this.bootPhp();
    return this.phpPromise;
  }

  private async bootPhp(): Promise<PhpInstance> {
    const [{ PHP }, { loadNodeRuntime, useHostFilesystem }, utilMod] = await Promise.all([
      import("@php-wasm/universal"),
      import("@php-wasm/node"),
      import("@php-wasm/util")
    ]);

    const runtimeId = await loadNodeRuntime(this.phpVersion as never, {
      withIntl: true,
      emscriptenOptions: { processId: process.pid }
    });
    const php = new PHP(runtimeId);
    useHostFilesystem(php);
    await php.setSapiName("cli");

    const createSpawnHandler = (utilMod as { createSpawnHandler: (program: (cmd: string[], api: SpawnProcessApi, options: { cwd?: string; env?: Record<string, string> }) => void | Promise<void>) => unknown })
      .createSpawnHandler;
    if (typeof (php as unknown as { setSpawnHandler?: unknown }).setSpawnHandler === "function" && typeof createSpawnHandler === "function") {
      const scribuntoEnabled = this.scribuntoEnabled;
      await (php as unknown as { setSpawnHandler: (h: unknown) => Promise<void> }).setSpawnHandler(
        createSpawnHandler(async (argvIn, api, options) => {
          const argv = unwrapShellArgv(argvIn);
          logSpawnEvent(`spawn enabled=${scribuntoEnabled} isLua=${isLuaCommand(argv)} argvIn=${JSON.stringify(argvIn)} argv=${JSON.stringify(argv)}`);
          if (scribuntoEnabled && isLuaCommand(argv)) {
            await runScribuntoServer(argv, api as unknown as SpawnApi, options);
            return;
          }
          api.notifySpawn();
          api.stderr(`ja-ucp-preview: blocked spawn ${argv.join(" ")}\n`);
          api.exit(127);
        })
      );
    }

    return php as unknown as PhpInstance;
  }
}

interface SpawnProcessApi {
  notifySpawn(): void;
  stdout(data: string | ArrayBuffer): void;
  stderr(data: string | ArrayBuffer): void;
  exit(code: number): void;
  on?(eventName: string, handler: (data: ArrayBuffer | Uint8Array) => void): void;
}

function unwrapShellArgv(argv: string[]): string[] {
  // The sandboxed Spawn API hands us argv after PHP's proc_open call. On Linux
  // Scribunto wraps the lua invocation in /bin/sh `lua_ulimit.sh` `… "exec
  // <cmd>"`, and the wrapper script itself runs `eval "exec $4"` on the last
  // arg, so peel off both the shell wrapper and ulimit prefix until we see the
  // actual lua command.
  let out = [...argv];
  for (let i = 0; i < 4; i++) {
    if (out[0] === "exec") out.shift();
    if (out[0] === "/bin/sh" && out[1] === "-c" && typeof out[2] === "string") {
      out = splitShellCommand(out[2]);
      continue;
    }
    if (out[0] && out[0].endsWith("/lua_ulimit.sh")) {
      // lua_ulimit.sh <cpu_soft> <cpu_hard> <mem_kb> <actual cmd as single arg>
      const rest = out[4];
      if (typeof rest === "string") {
        out = splitShellCommand(rest);
        continue;
      }
      out = out.slice(4);
      continue;
    }
    break;
  }
  if (out[0] === "exec") out.shift();
  return out;
}

function splitShellCommand(line: string): string[] {
  const tokens: string[] = [];
  let buffer = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) {
        quote = null;
      } else if (c === "\\" && i + 1 < line.length) {
        buffer += line[++i];
      } else {
        buffer += c;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === " " || c === "\t") {
      if (buffer.length > 0) {
        tokens.push(buffer);
        buffer = "";
      }
    } else if (c === "\\" && i + 1 < line.length) {
      buffer += line[++i];
    } else {
      buffer += c;
    }
  }
  if (buffer.length > 0) tokens.push(buffer);
  return tokens;
}

function logSpawnEvent(message: string): void {
  const target = process.env.JA_UCP_SCRIBUNTO_DEBUG;
  if (!target) return;
  try {
    // Synchronous logging so awaiting it cannot deadlock the WASM spawn
    // handler's call into PHP/WASM.
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {
    /* ignore */
  }
}

function isLuaCommand(argv: string[]): boolean {
  const head = argv[0];
  if (!head) return false;
  const base = head.split("/").pop() ?? head;
  if (
    base === "lua" ||
    base === "lua5.1" ||
    base === "lua5.1.exe" ||
    base === "lua.exe" ||
    base === "scribunto-lua-stub.sh"
  ) {
    return true;
  }
  // Heuristic: if any of the args points at mw_main.lua, this is a Scribunto
  // standalone invocation regardless of the lua binary's actual name.
  return argv.some((a) => a.endsWith("mw_main.lua"));
}

export function createPhpWasmBackend(options: PhpWasmBackendOptions = {}): PhpWasmBackend {
  return new PhpWasmBackend(options);
}

// Track wasm trap events globally so each render can detect "did a trap
// fire while I was running?" without contesting the process-level handler
// with other concurrent renders or tests.
let wasmTrapEvents = 0;
let wasmTrapHandlerInstalled = false;
function installWasmTrapHandler(): void {
  if (wasmTrapHandlerInstalled) return;
  wasmTrapHandlerInstalled = true;
  const isWasmTrap = (err: unknown): boolean => {
    if (!err) return false;
    const message = err instanceof Error ? err.message : String(err);
    return message.includes("unreachable") || message.includes("wasm");
  };
  process.on("uncaughtException", (err) => {
    if (isWasmTrap(err)) {
      wasmTrapEvents++;
      return;
    }
    throw err;
  });
  process.on("unhandledRejection", (err) => {
    if (isWasmTrap(err)) {
      wasmTrapEvents++;
    }
  });
}

async function waitForResponseFile(
  path: string,
  trapped: () => boolean
): Promise<{ kind: "file"; text: string }> {
  const { readFile: readFileAsync, stat } = await import("node:fs/promises");
  // Poll the response file. The bridge writes it atomically so the JSON is
  // complete by the time stat() sees it. After the wasm trap is observed we
  // also force-check once more to handle very short windows.
  for (;;) {
    try {
      const stats = await stat(path);
      if (stats.size > 0) {
        const text = await readFileAsync(path, "utf8");
        if (text.trim().startsWith("{") && text.trim().endsWith("}")) {
          return { kind: "file", text };
        }
      }
    } catch {
      /* file not yet present */
    }
    // When the wasm trap fires, give it one extra poll cycle in case the
    // file write was racing the shutdown sequence.
    if (trapped()) {
      try {
        const text = await readFileAsync(path, "utf8");
        if (text.trim().startsWith("{") && text.trim().endsWith("}")) {
          return { kind: "file", text };
        }
      } catch {
        /* still missing */
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}

async function runPhpScript(
  php: PhpInstance,
  scriptPath: string,
  args: string[],
  env: Record<string, string>,
  captureBuffer?: { stdout: string; stderr: string }
): Promise<PhpResponse> {
  const argv = [scriptPath, ...args];
  if (php.chdir) {
    try {
      php.chdir(dirname(scriptPath));
    } catch {
      /* ignore chdir failures */
    }
  }
  const seedScript = `<?php
$_SERVER['argv'] = ${JSON.stringify(argv)};
$_SERVER['argc'] = count($_SERVER['argv']);
$argv = $_SERVER['argv'];
$argc = $_SERVER['argc'];
chdir(${jsonString(dirname(scriptPath))});
require ${jsonString(scriptPath)};
`;
  // Prefer runStream when available so we can pipe output to `captureBuffer`
  // and recover it even when the wasm runtime traps during PHP shutdown
  // (which Scribunto's destructor sequence can trigger).
  if (captureBuffer) {
    // Run via php.run; the caller is responsible for handling wasm traps and
    // potentially recovering the response from elsewhere (e.g. the bridge's
    // on-disk response file) if this never resolves.
    try {
      const response = await php.run({ code: seedScript, env });
      captureBuffer.stdout = response.text;
      captureBuffer.stderr = response.errors;
      if (response.exitCode !== 0) {
        throw new ExactMediaWikiRuntimeError(
          `php-wasm script ${scriptPath} exited with ${response.exitCode}.\nSTDOUT:\n${response.text}\nSTDERR:\n${response.errors}`
        );
      }
      return response;
    } catch (err) {
      const maybeResp = (err as { response?: PhpResponse }).response;
      if (maybeResp) {
        captureBuffer.stdout = maybeResp.text;
        captureBuffer.stderr = maybeResp.errors;
      }
      throw err;
    }
  }

  const response = await php.run({ code: seedScript, env });
  if (response.exitCode !== 0) {
    throw new ExactMediaWikiRuntimeError(
      `php-wasm script ${scriptPath} exited with ${response.exitCode}.\nSTDOUT:\n${response.text}\nSTDERR:\n${response.errors}`
    );
  }
  return response;
}

function assertMediaWikiRoot(mediaWikiRoot: string): void {
  if (!existsSync(join(mediaWikiRoot, "includes", "WebStart.php")) || !existsSync(join(mediaWikiRoot, "autoload.php"))) {
    throw new ExactMediaWikiSnapshotMissingError(
      `MediaWiki 1.39.3 root was not found at ${mediaWikiRoot}. Bundle or configure the official MediaWiki tree.`
    );
  }
}

function assertBridge(bridgePath: string): void {
  if (!existsSync(bridgePath)) {
    throw new ExactMediaWikiSnapshotMissingError(`MediaWiki render bridge was not found at ${bridgePath}.`);
  }
}

function assertBundledExtensionDependencies(mediaWikiRoot: string): void {
  const templateStylesAutoload = join(mediaWikiRoot, "extensions", "TemplateStyles", "vendor", "autoload.php");
  if (!existsSync(templateStylesAutoload)) {
    throw new ExactMediaWikiSnapshotMissingError(
      `TemplateStyles composer dependencies are missing at ${templateStylesAutoload}. Run composer install --no-dev in extensions/TemplateStyles before packing.`
    );
  }
  const wikibaseAutoload = join(mediaWikiRoot, "extensions", "Wikibase", "vendor", "autoload.php");
  if (!existsSync(wikibaseAutoload)) {
    throw new ExactMediaWikiSnapshotMissingError(
      `WikibaseClient composer dependencies are missing at ${wikibaseAutoload}. Run composer install --no-dev in extensions/Wikibase before packing.`
    );
  }
}

function findPackageRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  while (current !== dirname(current)) {
    if (existsSync(join(current, "package.json")) && existsSync(join(current, "vendor", "mediawiki-1.39.3"))) {
      return current;
    }
    current = dirname(current);
  }
  throw new ExactMediaWikiSnapshotMissingError("Cannot locate package root with bundled MediaWiki 1.39.3.");
}

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function phpString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function phpArrayFromNumberKeys(keys: number[]): string {
  return `[ ${keys.map((key) => `${key} => true`).join(", ")} ]`;
}

function normalizeDateInput(value: Date | string | number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  return value;
}

function siteStyleTitlesForSkin(skin: string): string[] {
  const normalizedSkin = skin.toLowerCase();
  const [commonStyleTitle, ...defaultStyleTitles] = jaUncyclopediaDefaultStyleTitles;
  return [
    commonStyleTitle,
    ...(jaUncyclopediaSkinStyleTitles[normalizedSkin] ?? []),
    ...defaultStyleTitles
  ];
}

async function ensureLuaStub(path: string): Promise<void> {
  // PHP's `is_executable($luaPath)` is called before proc_open. Under PHP/WASM
  // the actual Linux ELF binary that Scribunto bundles can't be executed, and
  // even on hosts that have lua5.1 we deliberately route the call to our
  // wasmoon-lua5.1-based server. We create a small executable shell stub
  // simply so that `is_executable()` returns true – proc_open() is then
  // intercepted by our spawn handler.
  const { chmod, writeFile } = await import("node:fs/promises");
  await writeFile(path, "#!/bin/sh\nexit 0\n", "utf8");
  try {
    await chmod(path, 0o755);
  } catch {
    /* best effort */
  }
}

function createLocalSettings(
  mediaWikiRoot: string,
  sqliteDir: string,
  cacheDir: string,
  tmpDir: string,
  scribuntoEnabled: boolean,
  luaStubPath: string
): string {
  const allowedUserFunctionNamespaces = [
    -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 32, 33, 102, 103, 104, 105, 106, 107,
    110, 111, 112, 113, 116, 117, 710, 711, 828, 829, 2300, 2301, 2302, 2303
  ];
  const extensions = scribuntoEnabled ? RENDER_EXTENSIONS_WITH_SCRIBUNTO : RENDER_EXTENSIONS;

  return `<?php
# Generated by @kongyo2/ja-ucp-preview. This is not a DB snapshot.
$IP = ${phpString(mediaWikiRoot)};
$wgSitename = 'Uncyclopedia';
$wgMetaNamespace = 'Uncyclopedia';
$wgLanguageCode = 'ja';
$wgLocaltimezone = 'Asia/Tokyo';
$wgServer = 'https://ansaikuropedia.org';
$wgScriptPath = '';
$wgArticlePath = '/wiki/$1';
$wgUsePathInfo = true;
$wgDBtype = 'sqlite';
$wgDBserver = '';
$wgDBname = 'ja_ucp_preview';
$wgDBuser = '';
$wgDBpassword = '';
$wgSQLiteDataDir = ${phpString(sqliteDir)};
$wgMainCacheType = CACHE_NONE;
$wgParserCacheType = CACHE_NONE;
$wgMessageCacheType = CACHE_NONE;
$wgSessionCacheType = CACHE_NONE;
$wgCacheDirectory = ${phpString(cacheDir)};
$wgTmpDirectory = ${phpString(tmpDir)};
$wgEnableUploads = true;
$wgShellLocale = 'C.UTF-8';
$wgDefaultSkin = 'vector';
$wgLogo = '//images.uncyc.org/ja/b/bc/Wiki.png';
$wgFavicon = 'https://images.uncyc.org/ja/6/64/Favicon.ico';
$wgSecretKey = '0000000000000000000000000000000000000000000000000000000000000000';
$wgUpgradeKey = 'ja-ucp-preview';
$wgShowExceptionDetails = true;
$wgDevelopmentWarnings = false;
$wgShowDebug = false;
$wgMaxArticleSize = 16384;
$wgCategoryCollation = 'uppercase';
$wgNoFollowLinks = true;
$wgNoFollowDomainExceptions = [ 'mediawiki.org' ];
$wgAllowUserCss = true;
$wgAllowUserJs = true;
$wgUseImageMagick = false;
$wgUseInstantCommons = false;
$wgThumbLimits = [ 120, 150, 180, 200, 250, 300 ];
$wgImageLimits = [
    [ 320, 240 ], [ 640, 480 ], [ 800, 600 ], [ 1024, 768 ], [ 1280, 1024 ], [ 2560, 2048 ]
];

if ( !defined( 'NS_PORTAL' ) ) { define( 'NS_PORTAL', 32 ); }
if ( !defined( 'NS_PORTAL_TALK' ) ) { define( 'NS_PORTAL_TALK', 33 ); }
if ( !defined( 'NS_UNNEWS' ) ) { define( 'NS_UNNEWS', 102 ); }
if ( !defined( 'NS_UNNEWS_TALK' ) ) { define( 'NS_UNNEWS_TALK', 103 ); }
if ( !defined( 'NS_UNDICTIONARY' ) ) { define( 'NS_UNDICTIONARY', 104 ); }
if ( !defined( 'NS_UNDICTIONARY_TALK' ) ) { define( 'NS_UNDICTIONARY_TALK', 105 ); }
if ( !defined( 'NS_GAME' ) ) { define( 'NS_GAME', 106 ); }
if ( !defined( 'NS_GAME_TALK' ) ) { define( 'NS_GAME_TALK', 107 ); }
if ( !defined( 'NS_FORUM' ) ) { define( 'NS_FORUM', 110 ); }
if ( !defined( 'NS_FORUM_TALK' ) ) { define( 'NS_FORUM_TALK', 111 ); }
if ( !defined( 'NS_UNTUNES' ) ) { define( 'NS_UNTUNES', 112 ); }
if ( !defined( 'NS_UNTUNES_TALK' ) ) { define( 'NS_UNTUNES_TALK', 113 ); }
if ( !defined( 'NS_UNBOOKS' ) ) { define( 'NS_UNBOOKS', 116 ); }
if ( !defined( 'NS_UNBOOKS_TALK' ) ) { define( 'NS_UNBOOKS_TALK', 117 ); }
if ( !defined( 'NS_TIMEDTEXT' ) ) { define( 'NS_TIMEDTEXT', 710 ); }
if ( !defined( 'NS_TIMEDTEXT_TALK' ) ) { define( 'NS_TIMEDTEXT_TALK', 711 ); }

$wgExtraNamespaces[32] = 'Portal';
$wgExtraNamespaces[33] = 'Portal_talk';
$wgExtraNamespaces[102] = 'UnNews';
$wgExtraNamespaces[103] = 'UnNews_talk';
$wgExtraNamespaces[104] = 'Undictionary';
$wgExtraNamespaces[105] = 'Undictionary_talk';
$wgExtraNamespaces[106] = 'Game';
$wgExtraNamespaces[107] = 'Game_talk';
$wgExtraNamespaces[110] = 'Forum';
$wgExtraNamespaces[111] = 'Forum_talk';
$wgExtraNamespaces[112] = 'UnTunes';
$wgExtraNamespaces[113] = 'UnTunes_talk';
$wgExtraNamespaces[116] = 'UnBooks';
$wgExtraNamespaces[117] = 'UnBooks_talk';
$wgExtraNamespaces[710] = 'TimedText';
$wgExtraNamespaces[711] = 'TimedText_talk';
$wgExtraNamespaces[2300] = 'Gadget';
$wgExtraNamespaces[2301] = 'Gadget_talk';
$wgExtraNamespaces[2302] = 'Gadget_definition';
$wgExtraNamespaces[2303] = 'Gadget_definition_talk';

$wgNamespacesWithSubpages[2] = true;
$wgNamespacesWithSubpages[3] = true;
$wgNamespacesWithSubpages[4] = true;
$wgNamespacesWithSubpages[5] = true;
$wgNamespacesWithSubpages[10] = true;
$wgNamespacesWithSubpages[11] = true;
$wgNamespacesWithSubpages[12] = true;
$wgNamespacesWithSubpages[13] = true;
$wgNamespacesWithSubpages[828] = true;
$wgNamespacesWithSubpages[829] = true;
$wgNamespaceAliases['ノート'] = NS_TALK;
$wgNamespaceAliases['利用者‐会話'] = NS_USER_TALK;
$wgNamespaceAliases['Uncyclopedia‐ノート'] = NS_PROJECT_TALK;
$wgNamespaceAliases['Image'] = NS_FILE;
$wgNamespaceAliases['画像'] = NS_FILE;
$wgNamespaceAliases['Image talk'] = NS_FILE_TALK;
$wgNamespaceAliases['ファイル‐ノート'] = NS_FILE_TALK;
$wgNamespaceAliases['画像‐ノート'] = NS_FILE_TALK;
$wgNamespaceAliases['MediaWiki‐ノート'] = NS_MEDIAWIKI_TALK;
$wgNamespaceAliases['Template‐ノート'] = NS_TEMPLATE_TALK;
$wgNamespaceAliases['Help‐ノート'] = NS_HELP_TALK;
$wgNamespaceAliases['Category‐ノート'] = NS_CATEGORY_TALK;

$wgUFEnabledPersonalDataFunctions = [ 'realname', 'username', 'useremail', 'nickname', 'ip' ];
$wgUFAllowedNamespaces = ${phpArrayFromNumberKeys(allowedUserFunctionNamespaces)};
${scribuntoEnabled
  ? `$wgScribuntoDefaultEngine = 'luastandalone';\n$wgScribuntoEngineConf['luastandalone']['luaPath'] = ${phpString(
      luaStubPath
    )};`
  : "# Scribunto disabled in this preview installation"}
$wgWBClientSettings['siteGlobalID'] = 'uncyc_ja';
$wgWBClientSettings['repoUrl'] = 'https://www.wikidata.org';
$wgWBClientSettings['repoArticlePath'] = '/wiki/$1';
$wgWBClientSettings['repoScriptPath'] = '/w';
$wgWBClientSettings['repoSiteName'] = 'Wikidata';
$wgWBClientSettings['entitySources'] = [
    'wikidata' => [
        'repoDatabase' => false,
        'baseUri' => 'http://www.wikidata.org/entity/',
        'entityNamespaces' => [ 'item' => 0, 'property' => 120 ],
        'rdfNodeNamespacePrefix' => 'wd',
        'rdfPredicateNamespacePrefix' => '',
        'interwikiPrefix' => 'd',
    ],
];
$wgWBClientSettings['itemAndPropertySourceName'] = 'wikidata';
$wgWBClientSettings['allowDataAccessInUserLanguage'] = false;

${SKINS.map((skin) => `wfLoadSkin( '${skin}' );`).join("\n")}
require_once $IP . '/extensions/MultiMaps/MultiMaps.php';
require_once $IP . '/extensions/Wikibase/vendor/autoload.php';
wfLoadExtension( 'WikibaseClient', $IP . '/extensions/Wikibase/extension-client.json' );
${extensions.map((extension) => `wfLoadExtension( '${extension}' );`).join("\n")}
$wgHooks['ParserFirstCallInit'][] = static function ( $parser ) {
    $parser->setHook( 'css', static function ( $input, $args, $parser, $frame ) {
        CSS::CSSRender( $parser, (string)$input );
        return '';
    } );
    return true;
};
`;
}
