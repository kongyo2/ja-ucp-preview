import type { RenderDiagnostic } from "./types.js";

export class DiagnosticBag {
  readonly items: RenderDiagnostic[] = [];

  info(code: string, message: string, source?: string): void {
    this.push("info", code, message, source);
  }

  warning(code: string, message: string, source?: string): void {
    this.push("warning", code, message, source);
  }

  error(code: string, message: string, source?: string): void {
    this.push("error", code, message, source);
  }

  push(
    severity: RenderDiagnostic["severity"],
    code: string,
    message: string,
    source?: string
  ): void {
    this.items.push(
      source === undefined ? { severity, code, message } : { severity, code, message, source }
    );
  }
}
