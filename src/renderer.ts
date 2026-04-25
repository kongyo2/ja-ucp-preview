import { NativePhpBackend } from "./backend/nativePhpBackend.js";
import { jaUncyclopediaSnapshot } from "./site/snapshot.js";
import type {
  RenderContext,
  RendererBackend,
  RenderRequest,
  RenderResult,
  SiteSnapshot,
  WikiUserContext
} from "./types.js";

export interface JaUcpRendererOptions {
  backend?: RendererBackend;
  site?: SiteSnapshot;
  user?: WikiUserContext;
  strict?: boolean;
}

export class JaUcpRenderer {
  private readonly backend: RendererBackend;
  private readonly context: RenderContext;

  constructor(options: JaUcpRendererOptions = {}) {
    this.backend = options.backend ?? new NativePhpBackend();
    this.context = {
      site: options.site ?? jaUncyclopediaSnapshot,
      defaultUser: options.user ?? { username: "あなた", anonymous: true, groups: [] },
      strict: options.strict ?? false
    };
  }

  render(request: RenderRequest): Promise<RenderResult> {
    return this.backend.render(request, this.context);
  }
}

export function createJaUcpRenderer(options: JaUcpRendererOptions = {}): JaUcpRenderer {
  return new JaUcpRenderer(options);
}
