# @kongyo2/ja-ucp-preview

Japanese Uncyclopedia preview renderer for TypeScript/Node.js.

This package does not contain a hand-written wikitext parser, reduced grammar,
or approximate fallback. The default backend runs real MediaWiki 1.39.3 under
native PHP 8.3 and loads the bundled parser-affecting Japanese Uncyclopedia
extensions.

The package is DB-snapshot-free and network-free at render time. Japanese
Uncyclopedia's public API is Cloudflare-protected, so runtime rendering uses the
bundled MediaWiki tree plus captured site configuration/style pages instead of
calling the live wiki.

```ts
import { createJaUcpRenderer } from "@kongyo2/ja-ucp-preview";

const renderer = createJaUcpRenderer();
const result = await renderer.render({
  title: "プレビュー",
  wikitext: "'''本文''' {{#css:MediaWiki:Example.css}}",
  pageOverrides: {
    "MediaWiki:Example.css": {
      contentModel: "css",
      text: ".preview-example { color: #0645ad; }"
    }
  }
});

console.log(result.html);
console.log(result.css);
```

By default `result.css` includes captured `MediaWiki:Common.css`, default
site gadget CSS, skin-specific CSS where the live page exists, TemplateStyles
output, and CSS-extension output. Use `includeSiteStyles: false` for parser-only
CSS, or `skin: "monobook" | "timeless" | "minerva" | "vector"` to select the
captured skin stylesheet set.
