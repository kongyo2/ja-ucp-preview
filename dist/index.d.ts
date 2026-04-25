type DiagnosticSeverity = "info" | "warning" | "error";
interface RenderDiagnostic {
    severity: DiagnosticSeverity;
    code: string;
    message: string;
    source?: string;
}
interface WikiUserContext {
    username?: string;
    realName?: string;
    nickname?: string;
    email?: string;
    groups?: string[];
    blocked?: boolean;
    anonymous?: boolean;
    ip?: string;
}
interface RenderRequest {
    title: string;
    wikitext: string;
    skin?: string;
    includeSiteStyles?: boolean;
    now?: Date | string | number;
    revisionTimestamp?: Date | string | number;
    pageId?: number;
    revisionId?: number;
    user?: WikiUserContext;
    urlParameters?: Record<string, string>;
    templateOverrides?: Record<string, string>;
    pageOverrides?: Record<string, string | PageOverride>;
}
interface PageOverride {
    text: string;
    contentModel?: "wikitext" | "Scribunto" | "sanitized-css" | string;
}
interface RenderResult {
    html: string;
    css: string;
    categories: string[];
    links: string[];
    templates: string[];
    defaultSort?: string;
    diagnostics: RenderDiagnostic[];
    metadata: {
        title: string;
        displayTitle?: string;
        generator: string;
        backend: string;
    };
}
interface RendererBackend {
    readonly name: string;
    render(request: RenderRequest, context: RenderContext): Promise<RenderResult>;
}
interface RenderContext {
    site: SiteSnapshot;
    defaultUser: WikiUserContext;
    strict: boolean;
}
interface SiteSnapshot {
    readonly id: string;
    readonly capturedAt: string;
    readonly generator: string;
    readonly phpVersion: string;
    readonly lang: string;
    readonly timezone: string;
    readonly server: string;
    readonly articlePath: string;
    readonly scriptPath: string;
    readonly mainPage: string;
    readonly namespaces: Record<number, NamespaceInfo>;
    readonly namespaceAliases: Record<string, number>;
    readonly extensions: ExtensionInfo[];
    readonly extensionTags: string[];
    readonly functionHooks: string[];
    readonly variables: string[];
}
interface NamespaceInfo {
    id: number;
    name: string;
    canonical?: string;
    case: "first-letter" | "case-sensitive";
    subpages?: boolean;
    content?: boolean;
}
interface ExtensionInfo {
    name: string;
    type: string;
    version: string | null;
    url?: string;
    license?: string | null;
}

interface JaUcpRendererOptions {
    backend?: RendererBackend;
    site?: SiteSnapshot;
    user?: WikiUserContext;
    strict?: boolean;
}
declare class JaUcpRenderer {
    private readonly backend;
    private readonly context;
    constructor(options?: JaUcpRendererOptions);
    render(request: RenderRequest): Promise<RenderResult>;
}
declare function createJaUcpRenderer(options?: JaUcpRendererOptions): JaUcpRenderer;

interface PhpWasmBackendOptions {
    mediaWikiRoot?: string;
    phpVersion?: "8.3" | "8.4" | "8.2" | "8.1" | "8.0" | "7.4";
}
declare class ExactMediaWikiSnapshotMissingError extends Error {
    constructor(message: string);
}
declare class PhpWasmBackend implements RendererBackend {
    readonly name = "mediawiki-php-wasm";
    private readonly options;
    constructor(options?: PhpWasmBackendOptions);
    render(_request: RenderRequest, _context: RenderContext): Promise<RenderResult>;
}
declare function createPhpWasmBackend(options?: PhpWasmBackendOptions): PhpWasmBackend;

interface NativePhpBackendOptions {
    mediaWikiRoot?: string;
    workDir?: string;
    phpBinary?: string;
    forceReinstall?: boolean;
}
declare class ExactMediaWikiRuntimeError extends Error {
    constructor(message: string);
}
declare class NativePhpBackend implements RendererBackend {
    readonly name = "mediawiki-native-php";
    private readonly mediaWikiRoot;
    private readonly workDir;
    private readonly phpBinary;
    private readonly forceReinstall;
    private readonly bridgePath;
    private installationPromise?;
    constructor(options?: NativePhpBackendOptions);
    render(request: RenderRequest, context: RenderContext): Promise<RenderResult>;
    private ensureInstalled;
    private install;
    private installWikibaseClientEmptyRepoTables;
    private assertPhpRuntime;
}
declare function createNativePhpBackend(options?: NativePhpBackendOptions): NativePhpBackend;

declare const jaUncyclopediaSnapshot: SiteSnapshot;

interface SiteStylePage {
    title: string;
    exists: boolean;
    contentModel: string;
    text: string;
}
declare const jaUncyclopediaSiteStylePages: SiteStylePage[];
declare const jaUncyclopediaDefaultStyleTitles: readonly ["MediaWiki:Common.css", "MediaWiki:Gadget-SysopNicks.css"];
declare const jaUncyclopediaSkinStyleTitles: Record<string, readonly string[]>;

interface ParsedTitle {
    prefixedText: string;
    namespaceId: number;
    namespace: NamespaceInfo;
    dbKey: string;
    text: string;
    fullText: string;
    baseText: string;
    rootText: string;
    subpageText: string;
    talkPageText: string;
    subjectPageText: string;
}
declare function normalizeTitleText(input: string): string;
declare function parseTitle(input: string, site: SiteSnapshot): ParsedTitle;
declare function pageUrl(title: string, site: SiteSnapshot): string;

export { type DiagnosticSeverity, ExactMediaWikiRuntimeError, ExactMediaWikiSnapshotMissingError, type ExtensionInfo, JaUcpRenderer, type JaUcpRendererOptions, type NamespaceInfo, NativePhpBackend, type NativePhpBackendOptions, type PageOverride, PhpWasmBackend, type PhpWasmBackendOptions, type RenderContext, type RenderDiagnostic, type RenderRequest, type RenderResult, type RendererBackend, type SiteSnapshot, type SiteStylePage, type WikiUserContext, createJaUcpRenderer, createNativePhpBackend, createPhpWasmBackend, jaUncyclopediaDefaultStyleTitles, jaUncyclopediaSiteStylePages, jaUncyclopediaSkinStyleTitles, jaUncyclopediaSnapshot, normalizeTitleText, pageUrl, parseTitle };
