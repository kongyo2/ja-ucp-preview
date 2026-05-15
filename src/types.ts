export type DiagnosticSeverity = "info" | "warning" | "error";

export interface RenderDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  source?: string;
}

export interface WikiUserContext {
  username?: string;
  realName?: string;
  nickname?: string;
  email?: string;
  groups?: string[];
  blocked?: boolean;
  anonymous?: boolean;
  ip?: string;
}

export interface RenderRequest {
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

export interface PageOverride {
  text: string;
  contentModel?: "wikitext" | "Scribunto" | "sanitized-css" | string;
}

export interface RenderResult {
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

export interface RendererBackend {
  readonly name: string;
  render(request: RenderRequest, context: RenderContext): Promise<RenderResult>;
}

export interface RenderContext {
  site: SiteSnapshot;
  defaultUser: WikiUserContext;
  strict: boolean;
}

export interface SiteSnapshot {
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
  readonly magicWords: string[];
}

export interface NamespaceInfo {
  id: number;
  name: string;
  canonical?: string;
  case: "first-letter" | "case-sensitive";
  subpages?: boolean;
  content?: boolean;
}

export interface ExtensionInfo {
  name: string;
  type: string;
  version: string | null;
  url?: string;
  license?: string | null;
}
