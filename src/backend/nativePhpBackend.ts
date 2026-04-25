import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { RenderContext, RendererBackend, RenderRequest, RenderResult } from "../types.js";
import {
  jaUncyclopediaDefaultStyleTitles,
  jaUncyclopediaSkinStyleTitles,
  siteStylePageOverrides
} from "../site/styles.js";
import { ExactMediaWikiSnapshotMissingError } from "./phpWasmBackend.js";

export interface NativePhpBackendOptions {
  mediaWikiRoot?: string;
  workDir?: string;
  phpBinary?: string;
  forceReinstall?: boolean;
}

export class ExactMediaWikiRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExactMediaWikiRuntimeError";
  }
}

const INSTALLATION_VERSION = "mw-1.39.3-ja-ucp-observable-config-v5";

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
  "Scribunto",
  "SimpleTooltip"
] as const;

const SKINS = ["Vector", "MonoBook", "Timeless", "MinervaNeue", "CologneBlue", "Modern"] as const;

export class NativePhpBackend implements RendererBackend {
  readonly name = "mediawiki-native-php";

  private readonly mediaWikiRoot: string;
  private readonly workDir: string;
  private readonly phpBinary: string;
  private readonly forceReinstall: boolean;
  private readonly bridgePath: string;
  private installationPromise?: Promise<InstallationPaths>;

  constructor(options: NativePhpBackendOptions = {}) {
    const packageRoot = findPackageRoot();
    this.mediaWikiRoot = resolve(options.mediaWikiRoot ?? join(packageRoot, "vendor", "mediawiki-1.39.3"));
    this.workDir = resolve(options.workDir ?? join(process.cwd(), ".ja-ucp-preview-work"));
    this.phpBinary = options.phpBinary ?? "php";
    this.forceReinstall = options.forceReinstall ?? false;
    this.bridgePath = join(packageRoot, "src", "php", "ja-ucp-render.php");
  }

  async render(request: RenderRequest, context: RenderContext): Promise<RenderResult> {
    const installation = await this.ensureInstalled();
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
    try {
      const output = await runCommand(
        this.phpBinary,
        [this.bridgePath, requestPath, installation.localSettingsPath, this.mediaWikiRoot],
        { cwd: this.mediaWikiRoot }
      );
      const text = output.stdout.trim();
      try {
        return JSON.parse(text) as RenderResult;
      } catch (error) {
        throw new ExactMediaWikiRuntimeError(
          `MediaWiki render bridge did not return JSON.\nSTDOUT:\n${output.stdout}\nSTDERR:\n${output.stderr}`
        );
      }
    } finally {
      await rm(requestPath, { force: true });
    }
  }

  private ensureInstalled(): Promise<InstallationPaths> {
    this.installationPromise ??= this.install();
    return this.installationPromise;
  }

  private async install(): Promise<InstallationPaths> {
    assertMediaWikiRoot(this.mediaWikiRoot);
    assertBridge(this.bridgePath);
    await this.assertPhpRuntime();
    assertBundledExtensionDependencies(this.mediaWikiRoot);

    const id = createHash("sha256")
      .update(this.mediaWikiRoot)
      .update(INSTALLATION_VERSION)
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

    if (!existsSync(markerPath) || !existsSync(dbPath) || !existsSync(localSettingsPath)) {
      await rm(root, { recursive: true, force: true });
      await mkdir(sqliteDir, { recursive: true });
      await mkdir(confDir, { recursive: true });
      await mkdir(cacheDir, { recursive: true });
      await mkdir(tmpDir, { recursive: true });
      await mkdir(requestsDir, { recursive: true });

      await runCommand(
        this.phpBinary,
        [
          join(this.mediaWikiRoot, "maintenance", "install.php"),
          "--server",
          "https://ansaikuropedia.org",
          "--scriptpath",
          "",
          "--lang",
          "ja",
          "--dbtype",
          "sqlite",
          "--dbpath",
          sqliteDir,
          "--dbname",
          "ja_ucp_preview",
          "--dbuser",
          "",
          "--dbpass",
          "",
          "--pass",
          `Preview-${id}-Password`,
          "--confpath",
          confDir,
          "Uncyclopedia",
          "PreviewAdmin"
        ],
        { cwd: this.mediaWikiRoot }
      );

      await writeFile(localSettingsPath, createLocalSettings(this.mediaWikiRoot, sqliteDir, cacheDir, tmpDir), "utf8");
      await runCommand(
        this.phpBinary,
        [join(this.mediaWikiRoot, "maintenance", "update.php"), "--quick", "--conf", localSettingsPath],
        { cwd: this.mediaWikiRoot }
      );
      await this.installWikibaseClientEmptyRepoTables(dbPath);
      await writeFile(
        markerPath,
        JSON.stringify({ installedAt: new Date().toISOString(), version: INSTALLATION_VERSION }, null, 2),
        "utf8"
      );
    }

    return { root, localSettingsPath, requestsDir };
  }

  private async installWikibaseClientEmptyRepoTables(dbPath: string): Promise<void> {
    await runCommand(
      this.phpBinary,
      [
        "-r",
        [
          "$db = new SQLite3($argv[1]);",
          "$sql = str_replace('/*_*/', '', file_get_contents($argv[2]));",
          "$sql = preg_replace('/CREATE TABLE /', 'CREATE TABLE IF NOT EXISTS ', $sql);",
          "$sql = preg_replace('/CREATE UNIQUE INDEX /', 'CREATE UNIQUE INDEX IF NOT EXISTS ', $sql);",
          "$sql = preg_replace('/CREATE INDEX /', 'CREATE INDEX IF NOT EXISTS ', $sql);",
          "if (!$db->exec($sql)) { fwrite(STDERR, $db->lastErrorMsg()); exit(1); }"
        ].join(" "),
        dbPath,
        join(this.mediaWikiRoot, "extensions", "Wikibase", "repo", "sql", "sqlite", "wb_items_per_site.sql")
      ],
      { cwd: this.mediaWikiRoot }
    );
  }

  private async assertPhpRuntime(): Promise<void> {
    const output = await runCommand(
      this.phpBinary,
      [
        "-r",
        "echo PHP_VERSION, \"\\n\"; echo implode(\"\\n\", get_loaded_extensions()), \"\\n\";"
      ],
      { cwd: process.cwd() }
    ).catch((error: unknown) => {
      throw new ExactMediaWikiSnapshotMissingError(
        `PHP CLI is required for exact MediaWiki rendering and was not executable as ${JSON.stringify(
          this.phpBinary
        )}. Install PHP 8.3 CLI with intl, mbstring, sqlite3, pdo_sqlite, xml, curl, and gd.`
      );
    });

    const lines = output.stdout.trim().split(/\r?\n/);
    const version = lines.shift() ?? "";
    const extensions = new Set(lines.map((line) => line.toLowerCase()));
    const missing = ["intl", "mbstring", "sqlite3", "pdo_sqlite", "xml", "curl", "gd"].filter(
      (extension) => !extensions.has(extension)
    );
    if (!version.startsWith("8.3.") || missing.length > 0) {
      throw new ExactMediaWikiRuntimeError(
        `Exact target requires PHP 8.3.x with MediaWiki runtime extensions. Detected PHP ${version}; missing: ${
          missing.length > 0 ? missing.join(", ") : "none"
        }.`
      );
    }
  }
}

export function createNativePhpBackend(options: NativePhpBackendOptions = {}): NativePhpBackend {
  return new NativePhpBackend(options);
}

interface InstallationPaths {
  root: string;
  localSettingsPath: string;
  requestsDir: string;
}

function createLocalSettings(mediaWikiRoot: string, sqliteDir: string, cacheDir: string, tmpDir: string): string {
  const allowedUserFunctionNamespaces = [
    -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 32, 33, 102, 103, 104, 105, 106, 107,
    110, 111, 112, 113, 116, 117, 710, 711, 828, 829, 2300, 2301, 2302, 2303
  ];

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
$wgScribuntoDefaultEngine = 'luastandalone';
$wgScribuntoEngineConf['luastandalone']['luaPath'] = '/usr/bin/lua5.1';
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
${RENDER_EXTENSIONS.map((extension) => `wfLoadExtension( '${extension}' );`).join("\n")}
$wgHooks['ParserFirstCallInit'][] = static function ( $parser ) {
	$parser->setHook( 'css', static function ( $input, $args, $parser, $frame ) {
		CSS::CSSRender( $parser, (string)$input );
		return '';
	} );
	return true;
};
`;
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

interface CommandOutput {
  stdout: string;
  stderr: string;
}

function runCommand(command: string, args: string[], options: { cwd: string }): Promise<CommandOutput> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, MW_INSTALL_PATH: options.cwd },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      };
      if (code === 0) {
        resolveCommand(output);
        return;
      }
      reject(
        new ExactMediaWikiRuntimeError(
          `${command} ${args.join(" ")} exited with ${code}.\nSTDOUT:\n${output.stdout}\nSTDERR:\n${output.stderr}`
        )
      );
    });
  });
}
