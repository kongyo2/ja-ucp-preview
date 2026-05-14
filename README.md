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

Scribunto is bundled but disabled by default. Opt in with
`createPhpWasmBackend({ scribuntoEnabled: true })`; when set, MediaWiki loads
Scribunto with `luastandalone`, and the renderer's WASM-side `proc_open`
handler routes the spawned `lua` to a Node-side server backed by
[`wasmoon-lua5.1`](https://www.npmjs.com/package/wasmoon-lua5.1) (no system
Lua binary required).

The Node-side server implements the LuaStandalone wire protocol (16-byte hex
headers, PHP `serialize()` body, Lua-expression decoding) and exchanges
`getStatus` / `cleanupChunks` / `loadString` / `call` /
`registerLibrary` / `quit` messages with MediaWiki. However, executing modules
that depend on `mw.*` requires also booting Scribunto's bundled
`mwInit.lua` + `mw.lua` infrastructure inside the same Lua interpreter, which
in turn re-enters PHP via `mw_interface` callbacks for each PHP-implemented
library method. That re-entrancy can't be expressed in `wasmoon-lua5.1` 1.x
because Lua 5.1 has no `:await()` for Promise-returning JS callbacks and the
Promise returned by the JS-side `proc_open` callback can't be awaited from
within a Lua-side `io.stdin:read()` call. Until that bridge lands, opting in
will exchange the initial protocol handshake but fail before user `#invoke`
output is produced.

If you have a Lua 5.1 binary on the host, you can override the engine path:

```ts
const backend = createPhpWasmBackend({
  scribuntoEnabled: true
});
// then pass $wgScribuntoEngineConf['luastandalone']['luaPath'] via your
// LocalSettings override – see src/backend/phpWasmBackend.ts.
```

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
