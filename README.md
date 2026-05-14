# @kongyo2/ja-ucp-preview

Offline Japanese Uncyclopedia (アンサイクロペディア / ja-ucp) preview renderer for
TypeScript / Node.js.

The package ships the official MediaWiki 1.39.3 tree together with every
parser-affecting Japanese Uncyclopedia extension (`ParserFunctions`,
`TemplateStyles`, `Variables`, `UserFunctions`, `DynamicPageList3`, `Spoilers`,
`SimpleTooltip`, the ja-ucp `CSS` extension, `WikibaseClient`, etc.) and runs
them under a bundled PHP 8.3 / WebAssembly runtime via `@php-wasm/node`. **No
system PHP is required**: install with `npm` and the renderer Just Works on any
Node 20.10+ host.

```ts
import { createJaUcpRenderer } from "@kongyo2/ja-ucp-preview";

const renderer = createJaUcpRenderer();
const { html, css, categories, links, templates } = await renderer.render({
  title: "Claude",
  wikitext: "'''Claude'''\n\n{{#expr: 2 + 3}}"
});
```

## Why this exists

The Japanese Uncyclopedia preview is not a vanilla MediaWiki preview – it
depends on a specific MediaWiki version (1.39.3, PHP 8.x) and a specific list
of extensions / template defaults. Calling the live ja-ucp API from local
tooling is fragile and unfriendly to the site. This package instead bundles
that exact runtime and returns the same HTML / CSS the site would emit for a
given wikitext input.

## Networking

The renderer never contacts the live ja-ucp site. All template / Module /
MediaWiki: page lookups go through `templateOverrides` / `pageOverrides`
provided by the caller, plus the bundled site-style snapshot captured from
ja-ucp at packaging time.

## Scribunto / Lua

Scribunto is bundled but disabled by default – it needs an external Lua 5.1
interpreter and the upstream `LuaStandalone` engine launches a subprocess that
the in-WASM PHP cannot spawn on its own. If you have a Lua 5.1 binary on the
host, opt in like this:

```ts
import { createJaUcpRenderer, createPhpWasmBackend } from "@kongyo2/ja-ucp-preview";

const backend = createPhpWasmBackend({ scribuntoEnabled: true });
const renderer = createJaUcpRenderer({ backend });
```

In that mode `wfLoadExtension('Scribunto')` is included in the generated
`LocalSettings.php` and `$wgScribuntoDefaultEngine = 'luastandalone'`. The
runtime spawn handler will then forward `lua` invocations to a host Lua
interpreter that you provide via the standard `$wgScribuntoEngineConf`.

## Public API

```ts
import {
  createJaUcpRenderer,
  createPhpWasmBackend,
  jaUncyclopediaSnapshot,
  jaUncyclopediaSiteStylePages,
  parseTitle,
  pageUrl
} from "@kongyo2/ja-ucp-preview";
```

`jaUncyclopediaSnapshot` exposes the captured ja-ucp site identity (namespaces,
extension versions, parser hooks, function hooks, magic variables, …) so it can
be consumed without a live render. `jaUncyclopediaSiteStylePages` exposes the
captured site CSS pages (`MediaWiki:Common.css`, gadget CSS, etc.).
