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

The Node-side server implements the LuaStandalone wire protocol – 16-byte
hex headers, PHP `serialize()` body, and a hand-written Lua-literal parser
(the protocol's PHP→Lua bodies are parsed outside wasmoon to avoid re-entry
into the JS event loop). It intercepts Scribunto's bundled `mwInit.lua` /
`mw.lua` / `mw.*.lua` files at `loadString` time and substitutes a
JS-implemented `mw` package whose `executeModule` runs user modules through
wasmoon-lua5.1, and whose `executeFunction` invokes the resolved Lua
function and returns its primitive result to PHP.

The bridge writes the rendered JSON to a sidecar file before returning, so
the TypeScript backend can recover the response even if PHP/WASM trips a
wasm trap during its shutdown destructor sequence (which it currently does
after Scribunto-using renders – the trap is swallowed by an in-process
`uncaughtException` handler installed for the duration of the render).

```ts
const backend = createPhpWasmBackend({ scribuntoEnabled: true });
const renderer = createJaUcpRenderer({ backend });
const { html } = await renderer.render({
  title: "Claude",
  wikitext: "{{#invoke:Example|hello}}",
  pageOverrides: {
    "Module:Example": {
      contentModel: "Scribunto",
      text: "local p = {}; function p.hello(frame) return 'Lua_OK' end; return p"
    }
  }
});
// html contains "Lua_OK"
```

Modules that touch `mw.title` / `mw.text` / `mw.html` / etc. are not yet
fully supported – those require routing PHP-implemented callbacks back into
Lua synchronously, and `wasmoon-lua5.1` 1.x doesn't expose Promise-await
semantics that Lua 5.1 could use. Simple modules that only use Lua's
standard library work end-to-end today.

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
