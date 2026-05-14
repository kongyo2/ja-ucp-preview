import { describe, expect, it } from "vitest";
import {
  createJaUcpRenderer,
  createPhpWasmBackend,
  jaUncyclopediaSnapshot
} from "../src/index.js";

describe("ja ucp renderer", () => {
  const backend = createPhpWasmBackend({ workDir: ".ja-ucp-preview-work/vitest" });

  it("renders with MediaWiki 1.39.3 and the Japanese Uncyclopedia parser extensions", async () => {
    const renderer = createJaUcpRenderer({ backend });

    const result = await renderer.render({
      title: "Claude",
      now: "2026-04-24T05:15:17Z",
      wikitext: "'''Claude'''\n\n{{#expr: 2 + 3}}"
    });

    expect(result.html).toContain("<b>Claude</b>");
    expect(result.html).toContain(">5\n");
    expect(result.metadata.generator).toBe("MediaWiki 1.39.3");
  }, 600_000);

  it("uses supplied page overrides instead of requiring a DB snapshot", async () => {
    const renderer = createJaUcpRenderer({ backend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{Foo|X}}",
      templateOverrides: {
        Foo: "BAR {{{1|}}}"
      }
    });

    expect(result.html).toContain("BAR X");
    expect(result.templates).toContain("テンプレート:Foo");
  }, 600_000);

  it("runs override-backed extension paths through MediaWiki (no Scribunto)", async () => {
    const renderer = createJaUcpRenderer({ backend });

    const result = await renderer.render({
      title: "Claude",
      wikitext:
        '<templatestyles src="Style/styles.css" />{{#vardefine:x|変数OK}}{{#var:x}} / {{#urlget:q}} / {{#property:P31}} / {{WBREPONAME}}',
      urlParameters: { q: "URL_OK" },
      pageOverrides: {
        "Template:Style/styles.css": {
          contentModel: "sanitized-css",
          text: ".ja-ucp-smoke { color: #0645ad; }"
        }
      }
    });

    expect(result.html).toContain("変数OK");
    expect(result.html).toContain("URL_OK");
    expect(result.html).toContain("/ Wikidata");
    expect(result.html).toContain(".mw-parser-output .ja-ucp-smoke{color:#0645ad}");
  }, 600_000);

  it("dispatches Scribunto #invoke through the bundled wasmoon-lua5.1 server", async () => {
    // The wasmoon-lua5.1-backed Scribunto server in
    // src/backend/scribuntoServer.ts now exchanges the full LuaStandalone
    // protocol for simple `{{#invoke}}` modules: registerLibrary,
    // loadString, fake-mw package, executeModule dispatch, executeFunction
    // dispatch. wasmoon-lua5.1 actually executes the user module and
    // returns "Lua_OK" to PHP. The remaining failure is in PHP's shutdown
    // path: when LuaStandaloneInterpreterFunction objects run their
    // destructors they trip a wasm "unreachable" trap inside
    // zend_std_write_property. The trap kills the wasm runtime before
    // php.run / php.runStream can return the already-echo'd JSON, so the
    // test still cannot observe "Lua_OK" in the result. Skip until that
    // shutdown crash is worked around (see README "Scribunto / Lua").
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{#invoke:Example|hello}}",
      pageOverrides: {
        "Module:Example": {
          contentModel: "Scribunto",
          text: "local p = {}; function p.hello(frame) return 'Lua_OK' end; return p"
        }
      }
    });

    expect(result.html).toContain("Lua_OK");
  }, 600_000);

  it("renders Scribunto modules that exercise Lua stdlib + mw.text", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-stdlib",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{#invoke:Utility|stitch}}",
      pageOverrides: {
        "Module:Utility": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.stitch(frame)",
            "  local parts = mw.text.split('one,two,three', ',')",
            "  local upper = {}",
            "  for i, v in ipairs(parts) do",
            "    upper[i] = string.upper(v)",
            "  end",
            "  return mw.text.listToText(upper, ' / ')",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain("ONE / TWO / THREE");
  }, 600_000);

  it("renders Scribunto modules that compute with Lua tables", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-tables",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{#invoke:Math|sum}}",
      pageOverrides: {
        "Module:Math": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.sum(frame)",
            "  local total = 0",
            "  for _, v in ipairs({1, 2, 3, 4, 5, 6, 7, 8, 9, 10}) do",
            "    total = total + v",
            "  end",
            "  return tostring(total)",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain("55");
  }, 600_000);

  it("renders Scribunto modules that read mw.title.getCurrentTitle()", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-title",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "アンサイクロペディア",
      wikitext: "{{#invoke:Title|here}}",
      pageOverrides: {
        "Module:Title": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.here(frame)",
            "  local t = mw.title.getCurrentTitle()",
            "  return 'page=' .. t.text .. ' ns=' .. tostring(t.namespace)",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain("page=アンサイクロペディア");
    expect(result.html).toContain("ns=0");
  }, 600_000);

  it("renders Scribunto modules that build HTML via mw.html", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-html",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{#invoke:Box|render}}",
      pageOverrides: {
        "Module:Box": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.render(frame)",
            "  local root = mw.html.create('div'):addClass('ja-ucp-box'):css('color', 'red')",
            "  root:tag('span'):wikitext('hi')",
            "  return tostring(root:allDone())",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain('class="ja-ucp-box"');
    expect(result.html).toContain("color: red");
    expect(result.html).toContain("<span>hi</span>");
  }, 600_000);

  it("renders Scribunto modules that format URLs via mw.uri", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-uri",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{#invoke:Link|render}}",
      pageOverrides: {
        "Module:Link": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.render(frame)",
            "  return mw.uri.localUrl('Hello World', { x = 'y' })",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain("/wiki/Hello_World?x=y");
  }, 600_000);

  it("renders Scribunto modules that operate on Japanese text via mw.ustring", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-ustring",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{#invoke:UString|render}}",
      pageOverrides: {
        "Module:UString": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.render(frame)",
            "  local s = 'アンサイクロペディア'",
            "  return 'len=' .. mw.ustring.len(s) .. ' first2=' .. mw.ustring.sub(s, 1, 2)",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain("len=10");
    expect(result.html).toContain("first2=アン");
  }, 600_000);

  it("renders #invoke alongside a regular template override", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-mixed",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "Result: {{Greet|name=World}} and {{#invoke:Square|of}}.",
      templateOverrides: {
        Greet: "Hello {{{name|friend}}}"
      },
      pageOverrides: {
        "Module:Square": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.of(frame)",
            "  return tostring(7 * 7)",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain("Hello World");
    expect(result.html).toContain("49");
  }, 600_000);

  it("renders Scribunto modules that read frame.args from #invoke parameters", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-args",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{#invoke:Echo|render|hello|name=World}}",
      pageOverrides: {
        "Module:Echo": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.render(frame)",
            "  local first = frame.args[1] or 'no-1'",
            "  local name = frame.args.name or 'no-name'",
            "  return '[' .. tostring(first) .. ' | ' .. tostring(name) .. ']'",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain("[hello | World]");
  }, 600_000);

  it("renders Scribunto modules that expand templates via frame:expandTemplate", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-expand",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{#invoke:Wrapper|render}}",
      templateOverrides: {
        Inner: "INNER:{{{1|}}}|{{{name|}}}"
      },
      pageOverrides: {
        "Module:Wrapper": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.render(frame)",
            "  return frame:expandTemplate{ title = 'Inner', args = { 'positional', name = 'kw' } }",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain("INNER:positional|kw");
  }, 600_000);

  it("renders Scribunto modules that use frame:preprocess", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-preprocess",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{#invoke:Pp|render}}",
      pageOverrides: {
        "Module:Pp": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.render(frame)",
            "  return frame:preprocess('{{#expr: 6 * 7}}')",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain("42");
  }, 600_000);

  it("renders Scribunto modules that use mw.message", async () => {
    const scribuntoBackend = createPhpWasmBackend({
      workDir: ".ja-ucp-preview-work/vitest-scribunto-message",
      scribuntoEnabled: true
    });
    const renderer = createJaUcpRenderer({ backend: scribuntoBackend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "{{#invoke:Msg|render}}",
      pageOverrides: {
        "Module:Msg": {
          contentModel: "Scribunto",
          text: [
            "local p = {}",
            "function p.render(frame)",
            "  return mw.message.newRawMessage('hello $1 world $2'):params('A', 'B'):plain()",
            "end",
            "return p"
          ].join("\n")
        }
      }
    });

    expect(result.html).toContain("hello A world B");
  }, 600_000);

  it("includes captured ja-ucp site styles by default without network access", async () => {
    const renderer = createJaUcpRenderer({ backend });

    const result = await renderer.render({
      title: "Claude",
      wikitext: "site styles"
    });

    expect(result.css).toContain('data-ja-ucp-source="MediaWiki:Common.css"');
    expect(result.css).toContain("table.wikitable");
    expect(result.css).toContain('data-ja-ucp-source="MediaWiki:Gadget-SysopNicks.css"');
    expect(result.css).toContain("Make sysop nicks bold");
  }, 600_000);

  it("can suppress captured site styles for parser-only consumers", async () => {
    const renderer = createJaUcpRenderer({ backend });

    const result = await renderer.render({
      title: "Claude",
      includeSiteStyles: false,
      wikitext: "parser only"
    });

    expect(result.css).not.toContain('data-ja-ucp-source="MediaWiki:Common.css"');
  }, 600_000);

  it("resolves CSS extension page references into offline inline styles", async () => {
    const renderer = createJaUcpRenderer({ backend });

    const result = await renderer.render({
      title: "Claude",
      includeSiteStyles: false,
      wikitext: "{{#css:MediaWiki:Preview.css}}X",
      pageOverrides: {
        "MediaWiki:Preview.css": {
          contentModel: "css",
          text: ".from-page { color: blue; }"
        }
      }
    });

    expect(result.html).toContain(">X\n");
    expect(result.css).toContain('data-ja-ucp-source="MediaWiki:Preview.css"');
    expect(result.css).toContain(".from-page { color: blue; }");
    expect(result.css).not.toContain("<link");
  }, 600_000);

  it("supports the ja-ucp CSS extension tag form", async () => {
    const renderer = createJaUcpRenderer({ backend });

    const result = await renderer.render({
      title: "Claude",
      includeSiteStyles: false,
      wikitext: "<css>.tagcss { color: green; }</css>X"
    });

    expect(result.html).toContain(">X\n");
    expect(result.html).not.toContain("&lt;css&gt;");
    expect(result.css).toContain('data-ja-ucp-source="inline-css"');
    expect(result.css).toContain(".tagcss { color: green; }");
  }, 600_000);

  it("exposes the exact target extension snapshot", () => {
    expect(jaUncyclopediaSnapshot.extensions).toHaveLength(83);
    expect(jaUncyclopediaSnapshot.extensions.find((extension) => extension.name === "CSS")?.version).toBe(
      "3.5.0"
    );
    expect(jaUncyclopediaSnapshot.extensions.find((extension) => extension.name === "DynamicPageList3")?.version).toBe(
      "3.3.8"
    );
    expect(jaUncyclopediaSnapshot.extensions.some((extension) => extension.name === "WikibaseClient")).toBe(true);
    expect(jaUncyclopediaSnapshot.extensions.some((extension) => extension.name === "CodeMirror")).toBe(true);
    expect(jaUncyclopediaSnapshot.extensionTags).toContain("evlplayer");
    expect(jaUncyclopediaSnapshot.extensionTags).toContain("css");
    expect(jaUncyclopediaSnapshot.functionHooks).toContain("simple-tooltip");
    expect(jaUncyclopediaSnapshot.functionHooks).toContain("invoke");
    expect(jaUncyclopediaSnapshot.functionHooks).toContain("property");
    expect(jaUncyclopediaSnapshot.variables).toContain("stylepath");
    expect(jaUncyclopediaSnapshot.variables).toContain("directionmark");
  });

  it("identifies the bundled PHP/WASM backend", () => {
    expect(createPhpWasmBackend().name).toBe("mediawiki-php-wasm");
  });
});
