import type { RenderContext, RendererBackend, RenderRequest, RenderResult } from "../types.js";

export interface PhpWasmBackendOptions {
  mediaWikiRoot?: string;
  phpVersion?: "8.3" | "8.4" | "8.2" | "8.1" | "8.0" | "7.4";
}

export class ExactMediaWikiSnapshotMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExactMediaWikiSnapshotMissingError";
  }
}

export class PhpWasmBackend implements RendererBackend {
  readonly name = "mediawiki-php-wasm";
  private readonly options: { phpVersion: NonNullable<PhpWasmBackendOptions["phpVersion"]>; mediaWikiRoot?: string };

  constructor(options: PhpWasmBackendOptions = {}) {
    this.options =
      options.mediaWikiRoot === undefined
        ? { phpVersion: options.phpVersion ?? "8.3" }
        : { phpVersion: options.phpVersion ?? "8.3", mediaWikiRoot: options.mediaWikiRoot };
  }

  async render(_request: RenderRequest, _context: RenderContext): Promise<RenderResult> {
    if (this.options.mediaWikiRoot === undefined) {
      throw new ExactMediaWikiSnapshotMissingError(
        "No MediaWiki 1.39.3 root was configured for the PHP/WASM backend. " +
          "This package intentionally has no approximate TypeScript renderer; configure MediaWiki 1.39.3 + Japanese Uncyclopedia extensions or use the native PHP backend."
      );
    }

    const [{ PHP }, { loadNodeRuntime, useHostFilesystem }] = await Promise.all([
      import("@php-wasm/universal"),
      import("@php-wasm/node")
    ]);

    const php = new PHP(
      await loadNodeRuntime(this.options.phpVersion, { emscriptenOptions: { processId: process.pid } })
    );
    useHostFilesystem(php);
    await php.setSapiName("cli");
    const response = await php.run({
      code: `<?php echo json_encode(['ok' => true, 'php' => PHP_VERSION, 'extensions' => get_loaded_extensions()]);`
    });

    const details = response.text;
    throw new Error(
      `PHP/WASM runtime is available (${details}), but the bundled @php-wasm/node runtime does not include PHP intl, which MediaWiki 1.39 requires. ` +
        "Rendering is refused because approximate output is not allowed; use NativePhpBackend or provide an intl-capable PHP/WASM runtime."
    );
  }
}

export function createPhpWasmBackend(options: PhpWasmBackendOptions = {}): PhpWasmBackend {
  return new PhpWasmBackend(options);
}
