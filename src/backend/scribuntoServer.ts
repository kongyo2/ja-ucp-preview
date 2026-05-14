// Minimal Scribunto LuaStandalone protocol server, implemented in Node.js +
// `wasmoon-lua5.1`, so the renderer can evaluate `{{#invoke:Module|fn}}` /
// `Module:Foo` Lua source without needing an external Lua binary that PHP/WASM
// cannot spawn on its own.
//
// This is **not** a full re-implementation of upstream Scribunto's
// LuaStandalone MWServer.lua – it covers the message-protocol surface the
// renderer actually exercises:
//
//   - getStatus / cleanupChunks / quit (control)
//   - loadString (compile a chunk and remember it)
//   - call (invoke a chunk with args, return results)
//   - registerLibrary / wrapPhpFunction (registered as opaque PHP-side ids
//     that get serialized back when needed)
//
// The Scribunto-side `mw` library is intentionally NOT modeled here; modules
// that depend on `mw.*` (mw.title, mw.text, etc.) will fail to load. The
// `scribuntoEnabled` flag is still opt-in for that reason.

import { readFile } from "node:fs/promises";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function debugLog(line: string): void {
  const target = process.env.JA_UCP_SCRIBUNTO_DEBUG;
  if (!target) return;
  try {
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, `[${new Date().toISOString()}] ${line}\n`, "utf8");
  } catch {
    /* ignore */
  }
}

// Pure-Lua `mw` stub installed into the wasmoon environment before any user
// Scribunto module runs. The full Scribunto `mw` library re-enters PHP via
// `mw_interface`, which `wasmoon-lua5.1` can't dispatch synchronously today.
// This stub covers the common pure-Lua helpers (mw.text.*, mw.ustring.*,
// mw.html.*) that ja-ucp Scribunto modules typically use without needing a
// round-trip into PHP.
const MW_STUB_LUA = `
mw = mw or {}

-- mw.text -----------------------------------------------------------------
mw.text = mw.text or {}

function mw.text.trim(s)
	if s == nil then return '' end
	return (tostring(s):gsub('^%s*(.-)%s*$', '%1'))
end

function mw.text.split(s, pattern, plain)
	local out, start, count = {}, 1, 0
	s = tostring(s or '')
	pattern = pattern or ''
	if pattern == '' then
		for i = 1, #s do out[i] = s:sub(i, i) end
		return out
	end
	if plain then
		while true do
			local a, b = s:find(pattern, start, true)
			if not a then break end
			count = count + 1
			out[count] = s:sub(start, a - 1)
			start = b + 1
		end
	else
		while true do
			local a, b = s:find(pattern, start)
			if not a then break end
			count = count + 1
			out[count] = s:sub(start, a - 1)
			start = b + 1
			if a > b then start = start + 1 end
		end
	end
	out[count + 1] = s:sub(start)
	return out
end

function mw.text.gsplit(s, pattern, plain)
	local parts = mw.text.split(s, pattern, plain)
	local i = 0
	return function()
		i = i + 1
		return parts[i]
	end
end

function mw.text.listToText(list, separator, conjunction)
	if type(list) ~= 'table' then return '' end
	separator = separator or ', '
	conjunction = conjunction or separator
	local n = #list
	if n == 0 then return '' end
	if n == 1 then return tostring(list[1]) end
	if n == 2 then return tostring(list[1]) .. conjunction .. tostring(list[2]) end
	local out = {}
	for i = 1, n - 1 do out[i] = tostring(list[i]) end
	return table.concat(out, separator) .. conjunction .. tostring(list[n])
end

local html_entities = { ['<']='&lt;', ['>']='&gt;', ['&']='&amp;', ['"']='&quot;', ["'"]='&#039;' }
function mw.text.encode(s, charset)
	s = tostring(s or '')
	charset = charset or [=[<>&"']=]
	return (s:gsub('[' .. charset:gsub('([%%%]%^%-])', '%%%1') .. ']', html_entities))
end

local decode_entities = { ['lt']='<', ['gt']='>', ['amp']='&', ['quot']='"', ['nbsp']=' ' }
function mw.text.decode(s)
	s = tostring(s or '')
	return (s:gsub('&([%a#][%w]*);', function(name)
		if name:sub(1, 1) == '#' then
			local n
			if name:sub(2, 2) == 'x' or name:sub(2, 2) == 'X' then
				n = tonumber(name:sub(3), 16)
			else
				n = tonumber(name:sub(2))
			end
			if n and n > 0 and n < 0x110000 then
				if n < 0x80 then return string.char(n) end
				-- best-effort UTF-8 encoding for common code points
				if n < 0x800 then return string.char(0xC0 + math.floor(n/0x40), 0x80 + (n % 0x40)) end
				if n < 0x10000 then return string.char(0xE0 + math.floor(n/0x1000), 0x80 + math.floor(n/0x40) % 0x40, 0x80 + (n % 0x40)) end
				return string.char(0xF0 + math.floor(n/0x40000), 0x80 + math.floor(n/0x1000) % 0x40, 0x80 + math.floor(n/0x40) % 0x40, 0x80 + (n % 0x40))
			end
		end
		return decode_entities[name] or ('&' .. name .. ';')
	end))
end

function mw.text.nowiki(s)
	return tostring(s or '')
end
mw.text.unstripNoWiki = mw.text.nowiki
mw.text.unstrip = mw.text.nowiki

function mw.text.tag(name, attrs, content)
	if type(name) == 'table' then
		attrs = name.attrs
		content = name.content
		name = name.name
	end
	local buf = '<' .. tostring(name)
	if type(attrs) == 'table' then
		for k, v in pairs(attrs) do
			buf = buf .. ' ' .. tostring(k) .. '="' .. mw.text.encode(tostring(v)) .. '"'
		end
	end
	if content == nil or content == false then
		return buf .. ' />'
	end
	return buf .. '>' .. tostring(content) .. '</' .. tostring(name) .. '>'
end

function mw.text.truncate(s, n, ell, adjust)
	s = tostring(s or '')
	if #s <= (n or #s) then return s end
	local truncated = s:sub(1, n or #s)
	if ell ~= nil and ell ~= false then
		truncated = truncated .. tostring(ell)
	end
	return truncated
end

-- mw.ustring (Unicode-aware string library). For our use we delegate to the
-- standard string lib where the input is ASCII and otherwise return a
-- byte-wise approximation, which matches what most simple Scribunto modules
-- actually need.
mw.ustring = mw.ustring or {}
mw.ustring.maxStringLength = 2 ^ 30
mw.ustring.maxPatternLength = 2 ^ 30

local function utf8_len(s)
	s = tostring(s or '')
	local _, count = s:gsub('[^\\128-\\193]', '')
	return count
end

mw.ustring.len = utf8_len

function mw.ustring.sub(s, i, j)
	s = tostring(s or '')
	-- Naive char-counting sub for valid UTF-8 input. Good enough for simple
	-- Scribunto modules; modules that depend on rigorous boundary handling
	-- should expect to need the real Scribunto mw.ustring.
	local idx, byte_start = 0, 1
	if i and i > 0 then
		while idx < i - 1 do
			local b = s:byte(byte_start)
			if not b then break end
			byte_start = byte_start + utf8_byte_step(b)
			idx = idx + 1
		end
	end
	if j == nil then return s:sub(byte_start) end
	local byte_end = byte_start
	while idx < (j or 0) do
		local b = s:byte(byte_end)
		if not b then break end
		byte_end = byte_end + utf8_byte_step(b)
		idx = idx + 1
	end
	return s:sub(byte_start, byte_end - 1)
end

function utf8_byte_step(b)
	if b < 0x80 then return 1 end
	if b < 0xC0 then return 1 end
	if b < 0xE0 then return 2 end
	if b < 0xF0 then return 3 end
	return 4
end

mw.ustring.upper = function(s) return string.upper(tostring(s or '')) end
mw.ustring.lower = function(s) return string.lower(tostring(s or '')) end
mw.ustring.byte = function(s, i, j) return string.byte(tostring(s or ''), i, j) end
mw.ustring.byteoffset = function(s, n, i)
	-- Best effort: byte offset of the n-th character starting at byte i
	s = tostring(s or '')
	local idx, off = 0, i or 1
	while idx < (n or 0) do
		local b = s:byte(off)
		if not b then return nil end
		off = off + utf8_byte_step(b)
		idx = idx + 1
	end
	return off
end
mw.ustring.find = function(s, pat, init, plain) return string.find(tostring(s or ''), tostring(pat or ''), init, plain) end
mw.ustring.match = function(s, pat, init) return string.match(tostring(s or ''), tostring(pat or ''), init) end
mw.ustring.gmatch = function(s, pat) return string.gmatch(tostring(s or ''), tostring(pat or '')) end
mw.ustring.gsub = function(s, pat, repl, n) return string.gsub(tostring(s or ''), tostring(pat or ''), repl, n) end
mw.ustring.format = function(...) return string.format(...) end
mw.ustring.rep = function(s, n) return string.rep(tostring(s or ''), n or 0) end
mw.ustring.char = function(...) return string.char(...) end
mw.ustring.codepoint = function(s, i, j)
	s = tostring(s or '')
	return string.byte(s, i or 1, j or i or 1)
end

-- Generic helpers that some modules pull out of mw directly.
function mw.allToString(...)
	local out, n = {}, select('#', ...)
	for i = 1, n do out[i] = tostring(select(i, ...)) end
	return table.concat(out, '\\t')
end

function mw.dumpObject(obj)
	if type(obj) ~= 'table' then return tostring(obj) end
	local parts = {}
	for k, v in pairs(obj) do
		parts[#parts + 1] = tostring(k) .. '=' .. tostring(v)
	end
	return '{' .. table.concat(parts, ', ') .. '}'
end

function mw.clone(val)
	if type(val) ~= 'table' then return val end
	local out = {}
	for k, v in pairs(val) do
		out[k] = mw.clone(v)
	end
	return out
end

mw.log = function() end
mw.logObject = function() end

-- mw.title --------------------------------------------------------------
-- Render-time title information. Populated via __ja_ucp_set_context which
-- the Scribunto server invokes at boot with the current page's metadata.
__ja_ucp_context = {
	title = '',
	ns = 0,
	nsName = '',
	pageName = '',
	wgServer = '',
	wgArticlePath = '/wiki/$1',
	lang = 'ja'
}

function __ja_ucp_set_context(ctx)
	for k, v in pairs(ctx) do __ja_ucp_context[k] = v end
end

local title_mt = { __tostring = function(self) return self.prefixedText end }
local function make_title(args)
	local text = tostring(args.text or '')
	local ns = tonumber(args.ns) or 0
	local nsName = tostring(args.nsName or '')
	local prefixedText = (nsName ~= '' and (nsName .. ':') or '') .. text
	local urlPath = (__ja_ucp_context.wgArticlePath or '/wiki/$1'):gsub('%$1', (prefixedText:gsub(' ', '_')))
	local t = setmetatable({
		isLocal = true,
		isRedirect = false,
		exists = false,
		fileExists = false,
		text = text,
		prefixedText = prefixedText,
		fullText = prefixedText,
		rootText = text,
		baseText = text,
		subpageText = text,
		canTalk = ns ~= -1,
		namespace = ns,
		id = 0,
		fragment = '',
		interwiki = '',
		contentModel = ns == 828 and 'Scribunto' or 'wikitext',
		nsText = nsName,
		subjectNsText = nsName,
		talkNsText = nsName .. (nsName ~= '' and ' talk' or 'Talk'),
		fileUrl = '',
		fullUrl = (__ja_ucp_context.wgServer or '') .. urlPath,
		canonicalUrl = (__ja_ucp_context.wgServer or '') .. urlPath,
		localUrl = urlPath
	}, title_mt)
	function t:getContent() return nil end
	function t:isSubpageOf() return false end
	function t:partialUrl() return (self.text:gsub(' ', '_')) end
	function t:inNamespace(query)
		return tonumber(query) == self.namespace or tostring(query) == self.nsText
	end
	function t:inNamespaces(...)
		for _, n in ipairs({...}) do
			if self:inNamespace(n) then return true end
		end
		return false
	end
	function t:hasSubjectNamespace(query) return self:inNamespace(query) end
	function t:subPageTitle(t2)
		return make_title({ text = self.text .. '/' .. tostring(t2), ns = self.namespace, nsName = self.nsText })
	end
	return t
end

mw.title = {}

function mw.title.makeTitle(ns, text, fragment, interwiki)
	if text == nil then return nil end
	return make_title({ text = tostring(text), ns = ns, nsName = '' })
end

function mw.title.new(text, ns)
	if text == nil then return nil end
	return make_title({ text = tostring(text), ns = ns or 0, nsName = '' })
end

function mw.title.getCurrentTitle()
	return make_title({
		text = __ja_ucp_context.pageName ~= '' and __ja_ucp_context.pageName or __ja_ucp_context.title,
		ns = __ja_ucp_context.ns,
		nsName = __ja_ucp_context.nsName
	})
end

function mw.title.equals(a, b)
	if type(a) ~= 'table' or type(b) ~= 'table' then return false end
	return a.prefixedText == b.prefixedText
end
function mw.title.compare(a, b)
	local ap = type(a) == 'table' and a.prefixedText or tostring(a)
	local bp = type(b) == 'table' and b.prefixedText or tostring(b)
	if ap < bp then return -1 end
	if ap > bp then return 1 end
	return 0
end

-- mw.uri ----------------------------------------------------------------
mw.uri = {}

local function uri_encode(s, kind)
	s = tostring(s or '')
	if kind == 'WIKI' then
		s = s:gsub(' ', '_')
		return (s:gsub('([^%w%-_./~:_])', function(c)
			return string.format('%%%02X', c:byte())
		end))
	end
	return (s:gsub('([^%w%-_.~])', function(c)
		if c == ' ' and kind == 'QUERY' then return '+' end
		return string.format('%%%02X', c:byte())
	end))
end

function mw.uri.encode(s, kind) return uri_encode(s, kind or 'QUERY') end
function mw.uri.decode(s, kind)
	s = tostring(s or '')
	if kind == 'QUERY' then s = s:gsub('+', ' ') end
	return (s:gsub('%%(%x%x)', function(hex)
		return string.char(tonumber(hex, 16))
	end))
end
function mw.uri.anchorEncode(s)
	s = tostring(s or ''):gsub(' ', '_')
	return s
end

function mw.uri.localUrl(page, query)
	page = tostring(page or '')
	local url = (__ja_ucp_context.wgArticlePath or '/wiki/$1'):gsub('%$1', (page:gsub(' ', '_')))
	if type(query) == 'table' then
		local parts = {}
		for k, v in pairs(query) do
			parts[#parts + 1] = uri_encode(tostring(k), 'QUERY') .. '=' .. uri_encode(tostring(v), 'QUERY')
		end
		if #parts > 0 then url = url .. '?' .. table.concat(parts, '&') end
	elseif type(query) == 'string' and query ~= '' then
		url = url .. '?' .. query
	end
	return url
end
function mw.uri.fullUrl(page, query) return (__ja_ucp_context.wgServer or '') .. mw.uri.localUrl(page, query) end
mw.uri.canonicalUrl = mw.uri.fullUrl

function mw.uri.new(s) return { tostring = function() return tostring(s) end } end
function mw.uri.parse(s) return mw.uri.new(s) end

-- mw.message ------------------------------------------------------------
local Message = {}
Message.__index = Message
function Message:params(...)
	self.parameters = self.parameters or {}
	for _, v in ipairs({...}) do self.parameters[#self.parameters + 1] = v end
	return self
end
function Message:rawParams(...) return self:params(...) end
function Message:numParams(...) return self:params(...) end
function Message:inLanguage(lang) self.language = lang; return self end
function Message:useDatabase(use) self.useDatabaseFlag = use; return self end
function Message:plain()
	local s = self.key or ''
	if self.parameters then
		for i, v in ipairs(self.parameters) do
			s = s:gsub('%$' .. i, tostring(v))
		end
	end
	return s
end
function Message:text() return self:plain() end
function Message:escaped() return mw.text.encode(self:plain()) end
function Message:parse() return self:plain() end
function Message:exists() return false end
function Message:isBlank() return false end
function Message:isDisabled() return false end

mw.message = {}
function mw.message.new(key, ...)
	return setmetatable({ key = tostring(key), parameters = {...} }, Message)
end
mw.message.newRawMessage = mw.message.new
function mw.message.newFallbackSequence(...) return mw.message.new((...)) end
function mw.message.getDefaultLanguage() return __ja_ucp_context.lang or 'ja' end
function mw.message.rawParam(v) return v end
function mw.message.numParam(v) return v end

-- mw.language -----------------------------------------------------------
local Language = {}
Language.__index = Language
function Language:getCode() return self.code end
function Language:isRTL() return false end
function Language:formatNum(n) return tostring(n) end
function Language:formatDate(format, timestamp, local_) return tostring(timestamp or os.date()) end
function Language:formatDuration(seconds) return string.format('%d seconds', seconds or 0) end
function Language:caseFold(s) return string.lower(tostring(s or '')) end
function Language:lc(s) return string.lower(tostring(s or '')) end
function Language:uc(s) return string.upper(tostring(s or '')) end
function Language:lcfirst(s)
	s = tostring(s or '')
	return string.lower(s:sub(1, 1)) .. s:sub(2)
end
function Language:ucfirst(s)
	s = tostring(s or '')
	return string.upper(s:sub(1, 1)) .. s:sub(2)
end
function Language:plain(s) return tostring(s or '') end

mw.language = {}
function mw.language.new(code) return setmetatable({ code = tostring(code or 'ja') }, Language) end
function mw.language.getContentLanguage() return mw.language.new(__ja_ucp_context.lang or 'ja') end
mw.language.getFallbacksFor = function() return {} end
mw.language.isKnownLanguageTag = function() return true end
mw.language.isSupportedLanguage = function() return true end
mw.language.isValidCode = function() return true end
mw.language.fetchLanguageName = function(code) return tostring(code or '') end
mw.language.fetchLanguageNames = function() return {} end

-- mw.site ---------------------------------------------------------------
mw.site = {
	siteName = 'Uncyclopedia',
	server = '',
	currentVersion = 'MediaWiki 1.39.3',
	scriptPath = '',
	stylePath = '/skins',
	namespaces = setmetatable({}, { __index = function() return nil end }),
	contentNamespaces = setmetatable({}, { __index = function() return nil end })
}
function mw.site.stats() return { pages = 0, articles = 0, files = 0, edits = 0, users = 0, activeUsers = 0, admins = 0 } end

-- mw.html (builder pattern) ---------------------------------------------
local HtmlBuilder = {}
HtmlBuilder.__index = HtmlBuilder

local void_tags = {
	area = true, base = true, br = true, col = true, embed = true, hr = true,
	img = true, input = true, link = true, meta = true, param = true,
	source = true, track = true, wbr = true
}

function HtmlBuilder:_attrString()
	if not self._attrs or not next(self._attrs) then return '' end
	local out = {}
	for k, v in pairs(self._attrs) do
		if v == true then
			out[#out + 1] = ' ' .. tostring(k)
		elseif v ~= nil and v ~= false then
			out[#out + 1] = ' ' .. tostring(k) .. '="' .. mw.text.encode(tostring(v)) .. '"'
		end
	end
	return table.concat(out)
end

function HtmlBuilder:_styleString()
	if not self._style or not next(self._style) then return '' end
	local props = {}
	for k, v in pairs(self._style) do
		props[#props + 1] = tostring(k) .. ': ' .. tostring(v)
	end
	if #props == 0 then return '' end
	return ' style="' .. mw.text.encode(table.concat(props, '; ')) .. '"'
end

function HtmlBuilder:_classString()
	if not self._classes or #self._classes == 0 then return '' end
	return ' class="' .. mw.text.encode(table.concat(self._classes, ' ')) .. '"'
end

function HtmlBuilder:tag(name, attrs)
	local child = setmetatable({
		_tag = tostring(name or ''),
		_children = {},
		_attrs = attrs and mw.clone(attrs) or {},
		_classes = {},
		_style = {},
		_parent = self
	}, HtmlBuilder)
	self._children[#self._children + 1] = child
	return child
end

function HtmlBuilder:attr(key, value)
	if type(key) == 'table' then
		for k, v in pairs(key) do self._attrs[k] = v end
	else
		self._attrs[key] = value
	end
	return self
end

function HtmlBuilder:addClass(c)
	if c == nil then return self end
	self._classes[#self._classes + 1] = tostring(c)
	return self
end

function HtmlBuilder:css(key, value)
	if type(key) == 'table' then
		for k, v in pairs(key) do self._style[k] = v end
	else
		self._style[key] = value
	end
	return self
end

function HtmlBuilder:cssText(text)
	self._style[#self._style + 1] = tostring(text or '')
	return self
end

function HtmlBuilder:wikitext(...)
	for _, v in ipairs({...}) do
		self._children[#self._children + 1] = { _raw = tostring(v) }
	end
	return self
end

function HtmlBuilder:newline()
	self._children[#self._children + 1] = { _raw = '\\n' }
	return self
end

function HtmlBuilder:node(n)
	self._children[#self._children + 1] = n
	return self
end

function HtmlBuilder:done() return self._parent or self end
function HtmlBuilder:allDone()
	local root = self
	while root._parent do root = root._parent end
	return root
end

function HtmlBuilder:_serializeChildren()
	local buf = {}
	for _, child in ipairs(self._children) do
		if child._raw ~= nil then
			buf[#buf + 1] = child._raw
		else
			buf[#buf + 1] = tostring(child)
		end
	end
	return table.concat(buf)
end

HtmlBuilder.__tostring = function(self)
	if not self._tag or self._tag == '' then
		return self:_serializeChildren()
	end
	local open = '<' .. self._tag .. self:_classString() .. self:_styleString() .. self:_attrString()
	if void_tags[self._tag] then return open .. ' />' end
	return open .. '>' .. self:_serializeChildren() .. '</' .. self._tag .. '>'
end

mw.html = {}
function mw.html.create(name, args)
	return setmetatable({
		_tag = name and tostring(name) or '',
		_children = {},
		_attrs = args and mw.clone(args.attrs or {}) or {},
		_classes = {},
		_style = {},
		_parent = nil
	}, HtmlBuilder)
end

-- mw.hash (lightweight, deterministic, not crypto-grade) ----------------
mw.hash = {}
function mw.hash.hashValue(algo, value)
	local h = 5381
	for i = 1, #tostring(value or '') do
		h = ((h * 33) + tostring(value):byte(i)) % 0x100000000
	end
	return string.format('%08x', h)
end
function mw.hash.listAlgorithms() return { 'djb2' } end

-- mw.loadData / mw.loadJsonData ------------------------------------------
-- Routed through the running coroutine (set up per-call by the JS-side
-- executeFunction handler) so the JS layer can fetch the requested data
-- from PHP via the LuaStandalone protocol callbacks.
local __ja_ucp_loaded_data = {}
local __ja_ucp_loaded_json = {}

function mw.loadData(name)
	if type(name) ~= 'string' then
		error("bad argument #1 to 'mw.loadData' (string expected)", 2)
	end
	if __ja_ucp_loaded_data[name] ~= nil then
		if __ja_ucp_loaded_data[name] == false then
			error("module '" .. name .. "' not found", 2)
		end
		return __ja_ucp_loaded_data[name]
	end
	local data = coroutine.yield({ op = 'loadData', name = name })
	if data == nil then
		__ja_ucp_loaded_data[name] = false
		error("module '" .. name .. "' not found", 2)
	end
	__ja_ucp_loaded_data[name] = data
	return data
end

function mw.loadJsonData(name)
	if type(name) ~= 'string' then
		error("bad argument #1 to 'mw.loadJsonData' (string expected)", 2)
	end
	if __ja_ucp_loaded_json[name] ~= nil then
		if __ja_ucp_loaded_json[name] == false then
			error("module '" .. name .. "' not found", 2)
		end
		return __ja_ucp_loaded_json[name]
	end
	local data = coroutine.yield({ op = 'loadJsonData', name = name })
	if data == nil then
		__ja_ucp_loaded_json[name] = false
		error("module '" .. name .. "' not found", 2)
	end
	__ja_ucp_loaded_json[name] = data
	return data
end

mw.getCurrentFrame = function()
	return {
		getTitle = function() return __ja_ucp_context.title or '' end,
		args = setmetatable({}, { __index = function() return nil end }),
		getParent = function() return nil end,
		getArgument = function() return nil end,
		newChild = function() return mw.getCurrentFrame() end,
		expandTemplate = function() return '' end,
		callParserFunction = function() return '' end,
		preprocess = function(_, s) return tostring(s or '') end
	}
end
`;

// Hand-written parser for the Lua table-literal subset that Scribunto's
// LuaStandalone protocol uses for PHP -> Lua message bodies. Supports:
//   - Table constructors: `{ ... }`
//   - Bracketed keys: `["op"] = "call"`
//   - Identifier keys: `op = "call"` (not used by the protocol, but accept it)
//   - Sequential values: `{1, 2, 3}` -> 1-based array
//   - String literals: `"…"` (with Lua \r \n \\ and \" escapes)
//   - Numbers (decimal integers and decimals)
//   - Booleans `true`/`false`
//   - `nil`
// Does NOT support: long-bracket strings, hex/scientific numbers, function
// calls, or arbitrary Lua expressions (none of which appear in protocol
// messages).
function parseLuaTableLiteral(source: string): unknown {
  const ctx = { src: source, pos: 0 };
  skipWs(ctx);
  const value = readLuaValue(ctx);
  skipWs(ctx);
  if (ctx.pos !== ctx.src.length) {
    throw new Error(`trailing content after Lua value at position ${ctx.pos}`);
  }
  return value;
}

interface ParseCtx {
  src: string;
  pos: number;
}

function skipWs(ctx: ParseCtx): void {
  while (ctx.pos < ctx.src.length) {
    const c = ctx.src[ctx.pos] ?? "";
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      ctx.pos++;
    } else if (c === "-" && ctx.src[ctx.pos + 1] === "-") {
      // Line comment
      while (ctx.pos < ctx.src.length && ctx.src[ctx.pos] !== "\n") ctx.pos++;
    } else {
      break;
    }
  }
}

function readLuaValue(ctx: ParseCtx): unknown {
  skipWs(ctx);
  if (ctx.pos >= ctx.src.length) throw new Error("unexpected EOF");
  const c = ctx.src[ctx.pos] ?? "";
  if (c === "{") return readLuaTable(ctx);
  if (c === '"' || c === "'") return readLuaString(ctx);
  if (c === "-" || (c >= "0" && c <= "9")) return readLuaNumber(ctx);
  // Try identifier / keyword
  return readLuaIdentOrKeyword(ctx);
}

function readLuaTable(ctx: ParseCtx): Record<string, unknown> {
  if (ctx.src[ctx.pos] !== "{") throw new Error(`expected '{' at ${ctx.pos}`);
  ctx.pos++;
  skipWs(ctx);
  const out: Record<string, unknown> = {};
  let seq = 1;
  if (ctx.src[ctx.pos] === "}") {
    ctx.pos++;
    return out;
  }
  while (true) {
    skipWs(ctx);
    let key: string | null = null;
    if (ctx.src[ctx.pos] === "[") {
      ctx.pos++;
      skipWs(ctx);
      const k = readLuaValue(ctx);
      skipWs(ctx);
      if (ctx.src[ctx.pos] !== "]") throw new Error(`expected ']' at ${ctx.pos}`);
      ctx.pos++;
      key = String(k);
    } else {
      // Possibly identifier key `name = value`. We need to peek ahead.
      const savedPos = ctx.pos;
      const ident = tryReadIdent(ctx);
      skipWs(ctx);
      if (ident !== null && ctx.src[ctx.pos] === "=") {
        key = ident;
      } else {
        // Not an identifier-key; rewind and treat the whole thing as a value
        // in the sequential portion of the table.
        ctx.pos = savedPos;
      }
    }
    if (key !== null) {
      skipWs(ctx);
      if (ctx.src[ctx.pos] !== "=") throw new Error(`expected '=' at ${ctx.pos}`);
      ctx.pos++;
      skipWs(ctx);
      out[key] = readLuaValue(ctx);
    } else {
      out[String(seq++)] = readLuaValue(ctx);
    }
    skipWs(ctx);
    const ch = ctx.src[ctx.pos];
    if (ch === "," || ch === ";") {
      ctx.pos++;
      skipWs(ctx);
      if (ctx.src[ctx.pos] === "}") {
        ctx.pos++;
        return out;
      }
      continue;
    }
    if (ch === "}") {
      ctx.pos++;
      return out;
    }
    throw new Error(`expected ',' or '}' at ${ctx.pos}, got '${ch}'`);
  }
}

function tryReadIdent(ctx: ParseCtx): string | null {
  const c = ctx.src[ctx.pos] ?? "";
  if (!((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_")) return null;
  let end = ctx.pos + 1;
  while (end < ctx.src.length) {
    const c2 = ctx.src[end] ?? "";
    if (
      (c2 >= "a" && c2 <= "z") ||
      (c2 >= "A" && c2 <= "Z") ||
      (c2 >= "0" && c2 <= "9") ||
      c2 === "_"
    ) {
      end++;
    } else {
      break;
    }
  }
  const ident = ctx.src.slice(ctx.pos, end);
  ctx.pos = end;
  return ident;
}

function readLuaString(ctx: ParseCtx): string {
  const quote = ctx.src[ctx.pos];
  if (quote !== '"' && quote !== "'") throw new Error(`expected string at ${ctx.pos}`);
  ctx.pos++;
  let out = "";
  while (ctx.pos < ctx.src.length) {
    const c = ctx.src[ctx.pos];
    if (c === quote) {
      ctx.pos++;
      return out;
    }
    if (c === "\\") {
      const next = ctx.src[ctx.pos + 1];
      if (next === undefined) throw new Error("unterminated escape");
      if (next === "n") {
        out += "\n";
        ctx.pos += 2;
      } else if (next === "r") {
        out += "\r";
        ctx.pos += 2;
      } else if (next === "t") {
        out += "\t";
        ctx.pos += 2;
      } else if (next === "0") {
        out += "\0";
        ctx.pos += 2;
      } else if (next === "\\") {
        out += "\\";
        ctx.pos += 2;
      } else if (next === '"') {
        out += '"';
        ctx.pos += 2;
      } else if (next === "'") {
        out += "'";
        ctx.pos += 2;
      } else if (next >= "0" && next <= "9") {
        // Lua decimal escape: up to 3 digits
        let digits = "";
        let p = ctx.pos + 1;
        while (digits.length < 3 && p < ctx.src.length) {
          const d = ctx.src[p];
          if (d && d >= "0" && d <= "9") {
            digits += d;
            p++;
          } else {
            break;
          }
        }
        out += String.fromCharCode(parseInt(digits, 10));
        ctx.pos = p;
      } else {
        out += next;
        ctx.pos += 2;
      }
    } else {
      out += c;
      ctx.pos++;
    }
  }
  throw new Error("unterminated string literal");
}

function readLuaNumber(ctx: ParseCtx): number {
  let end = ctx.pos;
  if (ctx.src[end] === "-") end++;
  while (end < ctx.src.length) {
    const c = ctx.src[end] ?? "";
    if ((c >= "0" && c <= "9") || c === ".") {
      end++;
    } else {
      break;
    }
  }
  const text = ctx.src.slice(ctx.pos, end);
  ctx.pos = end;
  const num = Number(text);
  if (!Number.isFinite(num)) throw new Error(`invalid number "${text}"`);
  return num;
}

function readLuaIdentOrKeyword(ctx: ParseCtx): unknown {
  const ident = tryReadIdent(ctx);
  if (ident === null) throw new Error(`unexpected character at ${ctx.pos}`);
  if (ident === "true") return true;
  if (ident === "false") return false;
  if (ident === "nil") return null;
  // `chunks[N]` references – Scribunto's PHP-side encodes a previously seen
  // function value back to Lua by emitting `chunks[<id>]`. We translate it
  // into our function-id marker so handlers can recognize it.
  if (ident === "chunks") {
    skipWs(ctx);
    if (ctx.src[ctx.pos] === "[") {
      ctx.pos++;
      skipWs(ctx);
      const idVal = readLuaNumber(ctx);
      skipWs(ctx);
      if (ctx.src[ctx.pos] !== "]") throw new Error(`expected ']' after chunks[ at ${ctx.pos}`);
      ctx.pos++;
      return { __scribunto_function_id__: idVal };
    }
  }
  return ident;
}

export interface SpawnApi {
  notifySpawn(): void;
  stdout(data: string | ArrayBuffer | Uint8Array): void;
  stderr(data: string | ArrayBuffer | Uint8Array): void;
  exit(code: number): void;
  on(eventName: "stdin", handler: (data: ArrayBuffer | Uint8Array) => void): void;
}

export interface RenderContextForLua {
  title: string;
  ns: number;
  nsName: string;
  pageName: string;
  wgServer: string;
  wgArticlePath: string;
  lang: string;
}

// NOTE: do **not** make this a module-level mutable singleton – two
// concurrently-running `PhpWasmBackend` instances would race on it. The
// render context is instead threaded through `runScribuntoServer`'s
// `currentRenderContext` argument, captured in the spawn-handler closure
// per `PhpWasmBackend` boot.

interface ScribuntoMessage {
  op: string;
  [key: string]: unknown;
}

interface ChunkEntry {
  source: string;
  chunkName: string;
  kind:
    | "user"
    | "fake-mw-package"
    | "fake-mw-sub"
    | "fake-setupInterface"
    | "fake-executeModule"
    | "fake-executeFunction"
    | "fake-getLogBuffer"
    | "fake-clone"
    | "fake-noop"
    | "module-function";
  // For module-function: parent chunkId (the module's chunk) and the
  // function name inside the returned table.
  parentChunkId?: number;
  functionName?: string;
}

export async function runScribuntoServer(
  argv: string[],
  api: SpawnApi,
  options: { cwd?: string; env?: Record<string, string> },
  currentRenderContext: RenderContextForLua | null
): Promise<void> {
  void options;
  debugLog(`enter runScribuntoServer argv=${JSON.stringify(argv)}`);
  api.notifySpawn();
  debugLog("notifySpawn done");

  // `lua -v` probe used by LuaStandaloneInterpreter::getLuaVersion()
  if (argv.includes("-v")) {
    api.stdout("Lua 5.1.5 (ja-ucp-preview/wasmoon-lua5.1)\n");
    api.exit(0);
    return;
  }

  const mwMainIdx = argv.findIndex((a) => a.endsWith("mw_main.lua"));
  if (mwMainIdx < 0) {
    api.stderr(`ja-ucp-preview Scribunto server: not a Scribunto invocation: ${argv.join(" ")}\n`);
    api.exit(127);
    return;
  }
  void argv[mwMainIdx + 1]; // scribuntoDir (unused – we do not load MWServer.lua)
  const interpreterId = parseInt(argv[mwMainIdx + 2] ?? "0", 10);
  debugLog(`scribunto mode, interpreterId=${interpreterId}`);

  let lua: { doString(s: string): Promise<unknown>; global: { close(): void } };
  try {
    const mod = (await import("wasmoon-lua5.1")) as unknown as {
      Lua: { create(): Promise<typeof lua> };
    };
    lua = await mod.Lua.create();
    debugLog("wasmoon Lua created");
    // Install a minimal `mw` global so that user modules can rely on the
    // common Scribunto helpers (mw.text.*, mw.ustring.*, mw.title basics)
    // without our backend having to faithfully model `mw_interface` callbacks.
    await lua.doString(MW_STUB_LUA);
    if (currentRenderContext) {
      const c = currentRenderContext;
      await lua.doString(
        `__ja_ucp_set_context({` +
          `title=${JSON.stringify(c.title)},` +
          `ns=${c.ns},` +
          `nsName=${JSON.stringify(c.nsName)},` +
          `pageName=${JSON.stringify(c.pageName)},` +
          `wgServer=${JSON.stringify(c.wgServer)},` +
          `wgArticlePath=${JSON.stringify(c.wgArticlePath)},` +
          `lang=${JSON.stringify(c.lang)}` +
          `})`
      );
    }
    debugLog("mw stub installed");
  } catch (error: unknown) {
    api.stderr(
      `ja-ucp-preview Scribunto server: wasmoon-lua5.1 unavailable (${
        error instanceof Error ? error.message : String(error)
      })\n`
    );
    api.exit(127);
    return;
  }

  const chunks = new Map<number, ChunkEntry>();
  let nextChunkId = 1;
  // Latest registered library function id by function name. Each `registerLibrary`
  // call from PHP arrives with its own uid suffix; we keep the most recent so
  // we can call back into PHP via the Scribunto protocol (e.g. to fetch frame
  // args, expand templates, …).
  const registeredFuncs = new Map<string, string>();

  const stdinBuffer: Buffer[] = [];
  let stdinResolver: (() => void) | null = null;

  api.on("stdin", (data) => {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
    debugLog(`stdin event: ${u8.length} bytes`);
    stdinBuffer.push(Buffer.from(u8));
    const resolver = stdinResolver;
    if (resolver) {
      stdinResolver = null;
      resolver();
    }
  });

  async function readBytes(n: number, idleTimeoutMs: number): Promise<Buffer | null> {
    if (n === 0) return Buffer.alloc(0);
    for (;;) {
      const total = stdinBuffer.reduce((a, b) => a + b.length, 0);
      if (total >= n) {
        const all = Buffer.concat(stdinBuffer);
        stdinBuffer.length = 0;
        if (all.length > n) stdinBuffer.push(all.subarray(n));
        return all.subarray(0, n);
      }
      // Hold the timer handle so we can clearTimeout() the moment stdin
      // data wakes us up. Otherwise every healthy `readBytes` call would
      // leak a setTimeout (up to 60s in `dispatchToPhp`), keeping the
      // event loop ref'd until it eventually fires – which delays
      // teardown of finished Scribunto workers and creates avoidable
      // timer churn under heavy `#invoke` usage.
      let timer: ReturnType<typeof setTimeout> | null = null;
      const got = await new Promise<boolean>((resolve) => {
        stdinResolver = () => {
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
          resolve(true);
        };
        if (idleTimeoutMs > 0) {
          timer = setTimeout(() => {
            timer = null;
            resolve(false);
          }, idleTimeoutMs);
        }
      });
      if (!got && idleTimeoutMs > 0) {
        return null;
      }
    }
  }

  // The outer dispatch loop passes idleTimeout=true so we can give up
  // cleanly when PHP stops sending messages (otherwise PHP's proc_close
  // for the spawned lua process would block forever). Nested reads
  // inside `dispatchToPhp` pass a longer in-flight timeout: short enough
  // to fail fast on a genuinely stuck PHP, but long enough that slow but
  // legitimate PHP-side callbacks (template expansion, parser functions,
  // …) aren't misread as EOF.
  async function readMessage(idleTimeoutMs: number): Promise<ScribuntoMessage | null> {
    const header = await readBytes(16, idleTimeoutMs);
    if (!header) return null;
    const lenHex = header.toString("utf8", 0, 8);
    const length = parseInt(lenHex, 16);
    if (!Number.isFinite(length) || length < 0) {
      throw new Error(`Invalid Scribunto header length: ${lenHex}`);
    }
    // Body read uses the same in-flight timeout as the header so we don't
    // get stuck on a partial message either.
    const body = await readBytes(length, idleTimeoutMs);
    if (!body) {
      throw new Error("Scribunto stdin closed mid-message");
    }
    const bodyStr = body.toString("utf8");
    debugLog(`raw body (${length} bytes): ${bodyStr.slice(0, 200)}`);
    // The body is a Lua expression. We *could* parse it via `lua.doString`,
    // but every readMessage cycle would then await wasmoon - and wasmoon
    // appears to deadlock when its async run loop is re-entered from inside a
    // PHP/WASM spawn handler. Parse the body manually instead; the protocol
    // only uses a small subset of Lua-literal syntax that fits in a hand
    // written parser.
    let result: unknown;
    try {
      result = parseLuaTableLiteral(bodyStr);
    } catch (error: unknown) {
      throw new Error(
        `Scribunto message parse failed: ${
          error instanceof Error ? error.message : String(error)
        }; body: ${bodyStr.slice(0, 200)}`
      );
    }
    if (!result || typeof result !== "object") {
      throw new Error(`Scribunto message did not parse to a table: ${bodyStr.slice(0, 200)}`);
    }
    return result as ScribuntoMessage;
  }

  function encodeForPhp(msg: ScribuntoMessage): Buffer {
    let serialized = phpSerialize(msg);
    // PHP-side strtr inverts these escapes when reading.
    serialized = serialized
      .replace(/\\/g, "\\\\")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
    const length = Buffer.byteLength(serialized, "utf8");
    const check = length * 2 - 1;
    const header = `${length.toString(16).padStart(8, "0")}${check.toString(16).padStart(8, "0")}`;
    return Buffer.from(header + serialized, "utf8");
  }

  function phpSerialize(value: unknown, depth = 0): string {
    if (depth > 100) throw new Error("phpSerialize: recursion limit exceeded");
    if (value === null || value === undefined) return "N;";
    if (typeof value === "boolean") return `b:${value ? 1 : 0};`;
    if (typeof value === "number") {
      if (Number.isInteger(value)) return `i:${value};`;
      if (!Number.isFinite(value)) {
        if (Number.isNaN(value)) return "d:NAN;";
        return value > 0 ? "d:INF;" : "d:-INF;";
      }
      return `d:${value};`;
    }
    if (typeof value === "string") {
      const bytes = Buffer.byteLength(value, "utf8");
      return `s:${bytes}:"${value}";`;
    }
    if (typeof value === "object") {
      // Scribunto's chunk-reference marker, set by handleCall when wasmoon
      // returned a Lua function or table-with-function. The id must be a
      // real number; nil-returned-from-lua-via-wasmoon-proxy comes through
      // as null/undefined and must not be confused with a real marker.
      const markerId = (value as { __scribunto_function_id__?: unknown }).__scribunto_function_id__;
      if (typeof markerId === "number") {
        const inner = `s:13:"interpreterId";i:${interpreterId};s:2:"id";i:${markerId};`;
        return `O:42:"Scribunto_LuaStandaloneInterpreterFunction":2:{${inner}}`;
      }
      const entries: [string | number, unknown][] = [];
      if (value instanceof Map) {
        for (const [k, v] of value) {
          entries.push([k as string | number, v]);
        }
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) entries.push([i + 1, value[i]]);
      } else {
        for (const [k, v] of Object.entries(value)) {
          const intKey = /^-?\d+$/.test(k);
          entries.push([intKey ? parseInt(k, 10) : k, v]);
        }
      }
      const body = entries
        .map(
          ([k, v]) =>
            (typeof k === "number" ? `i:${k};` : phpSerialize(k, depth + 1)) +
            phpSerialize(v, depth + 1)
        )
        .join("");
      return `a:${entries.length}:{${body}}`;
    }
    throw new Error(`phpSerialize: unsupported type ${typeof value}`);
  }

  async function handleLoadString(msg: ScribuntoMessage): Promise<ScribuntoMessage> {
    const text = String(msg.text ?? "");
    const chunkName = String(msg.chunkName ?? "");
    const id = nextChunkId++;

    // Detect Scribunto's own infrastructure files. We intercept them so we
    // don't have to faithfully implement the full mw.*/mw_interface re-entry
    // protocol, which wasmoon-lua5.1 cannot do synchronously today.
    const baseName = chunkName.replace(/^@/, "").split("/").pop() ?? chunkName;
    if (baseName === "mwInit.lua") {
      // We don't actually execute mwInit.lua – it only defines globals like
      // mw.clone that simple Scribunto modules don't depend on.
      chunks.set(id, { source: text, chunkName, kind: "fake-noop" });
      return { op: "return", nvalues: 1, values: { 1: id } };
    }
    if (baseName === "mw.lua") {
      // Calling this chunk will return a stub mw "package" with the methods
      // PHP actually drives during module execution.
      chunks.set(id, { source: text, chunkName, kind: "fake-mw-package" });
      return { op: "return", nvalues: 1, values: { 1: id } };
    }
    // Other Scribunto-bundled libraries (mw.text.lua, mw.uri.lua, mw.site.lua,
    // mw.html.lua, mw.message.lua, mw.hash.lua, mw.language.lua, etc) – stub
    // out the whole package as a returns-an-empty-table chunk so that
    // require/setupInterface paths don't blow up when our user module never
    // touches them.
    if (
      baseName.startsWith("mw.") && baseName.endsWith(".lua") ||
      baseName === "libraryUtil.lua" ||
      baseName === "bit32.lua"
    ) {
      chunks.set(id, { source: text, chunkName, kind: "fake-mw-sub" });
      return { op: "return", nvalues: 1, values: { 1: id } };
    }

    try {
      const luaCode = `local fn, err = loadstring(${JSON.stringify(text)}, ${JSON.stringify(chunkName)})
if not fn then error(err, 0) end
return true`;
      await lua.doString(luaCode);
    } catch (error: unknown) {
      return {
        op: "error",
        value: error instanceof Error ? error.message : String(error)
      };
    }
    chunks.set(id, { source: text, chunkName, kind: "user" });
    return { op: "return", nvalues: 1, values: { 1: id } };
  }

  function mkFakeChunk(kind: ChunkEntry["kind"], extra: Partial<ChunkEntry> = {}): number {
    const id = nextChunkId++;
    chunks.set(id, { source: "", chunkName: `<fake:${kind}>`, kind, ...extra });
    return id;
  }

  async function handleCall(msg: ScribuntoMessage): Promise<ScribuntoMessage> {
    const chunkId = Number(msg.id);
    const chunk = chunks.get(chunkId);
    if (!chunk) {
      return { op: "error", value: `function id ${chunkId} does not exist` };
    }
    try {
      switch (chunk.kind) {
        case "fake-noop":
          return { op: "return", nvalues: 0, values: {} };

        case "fake-mw-package": {
          // PHP calls this once after mw.lua loadString. The result is the
          // "package" table that LuaEngine.php stores as $this->mw. The PHP
          // engine indexes into it for executeModule / setupInterface / etc.
          const setupId = mkFakeChunk("fake-setupInterface");
          const execModId = mkFakeChunk("fake-executeModule");
          const execFnId = mkFakeChunk("fake-executeFunction");
          const cloneId = mkFakeChunk("fake-clone");
          const logId = mkFakeChunk("fake-getLogBuffer");
          const noopId = mkFakeChunk("fake-noop");
          return {
            op: "return",
            nvalues: 1,
            values: {
              1: {
                setupInterface: { __scribunto_function_id__: setupId },
                executeModule: { __scribunto_function_id__: execModId },
                executeFunction: { __scribunto_function_id__: execFnId },
                clone: { __scribunto_function_id__: cloneId },
                getLogBuffer: { __scribunto_function_id__: logId },
                clearLogBuffer: { __scribunto_function_id__: noopId },
                allToString: { __scribunto_function_id__: noopId },
                tostringOrNil: { __scribunto_function_id__: noopId }
              }
            }
          };
        }

        case "fake-setupInterface":
        case "fake-clone":
        case "fake-noop":
          return { op: "return", nvalues: 0, values: {} };

        case "fake-getLogBuffer":
          return { op: "return", nvalues: 1, values: { 1: "" } };

        case "fake-executeFunction": {
          // mw.executeFunction(chunk, frame_args...) – PHP calls this to
          // actually invoke the user module function we returned from
          // executeModule. The first arg is the function reference; remaining
          // args carry the frame. Before calling the user function we
          // pre-fetch the frame's expanded #invoke args from PHP via
          // `getAllExpandedArguments`, so user code can read frame.args[N].
          const args = (msg.args as Record<string, unknown>) ?? {};
          const fnRef = args["1"] as unknown;
          let fnId: number | undefined;
          if (
            typeof fnRef === "object" &&
            fnRef !== null &&
            typeof (fnRef as { __scribunto_function_id__?: unknown }).__scribunto_function_id__ ===
              "number"
          ) {
            fnId = (fnRef as { __scribunto_function_id__: number }).__scribunto_function_id__;
          }
          if (fnId === undefined || !chunks.has(fnId)) {
            return {
              op: "error",
              value: "executeFunction: missing function reference"
            };
          }
          const target = chunks.get(fnId)!;
          if (target.kind !== "module-function") {
            return {
              op: "error",
              value: `executeFunction: target chunk is ${target.kind}, not module-function`
            };
          }
          const parent = target.parentChunkId;
          const name = target.functionName;
          if (parent === undefined || !name) {
            return { op: "error", value: "executeFunction: missing binding" };
          }

          // Pre-fetch frame.args from PHP. PHP's setupCurrentFrames() has
          // already bound the active #invoke frame to the string id 'current'
          // server-side, so we can ask `getAllExpandedArguments('current')`
          // and get back the #invoke parameters that the user wrote (e.g.
          // `{{#invoke:Mod|fn|hello|name=World}}` => {1: 'hello', name: 'World'}).
          let frameArgsLua = "{}";
          try {
            const fetched = await fetchExpandedArgs("current");
            frameArgsLua = serializeArgsToLua(fetched);
            debugLog(`fetched frame.args: ${JSON.stringify(fetched)}`);
          } catch (err) {
            debugLog(`getAllExpandedArguments fetch failed: ${err instanceof Error ? err.message : String(err)}`);
          }

          const globalSlot = `__ja_ucp_module_${parent}`;

          // Set up the coroutine that runs the user function. The frame
          // surface uses `coroutine.yield` to ask JS for help with the
          // dynamic PHP-backed operations (expandTemplate, preprocess,
          // getExpandedArgument-for-arbitrary-frame, …). The yield value is
          // a Lua table {op = "...", ...}; the JS side does the PHP
          // round-trip and resumes the coroutine with the result.
          await lua.doString(`
local __args = ${frameArgsLua}
local __frame
__frame = {
	args = setmetatable(__args, { __index = function(t, k)
		if type(k) == 'number' then return rawget(t, tostring(k)) end
		return rawget(t, k)
	end }),
	getTitle = function() return __ja_ucp_context.title or '' end,
	getArgument = function(_, n) return __frame.args[n] end,
	getAllArguments = function() return __frame.args end,
	getParent = function() return nil end,
	newChild = function() return __frame end,
	expandTemplate = function(_, params)
		return coroutine.yield({ op = 'expandTemplate', title = (params or {}).title, args = (params or {}).args })
	end,
	callParserFunction = function(_, params)
		if type(params) == 'string' then params = { name = params } end
		return coroutine.yield({ op = 'callParserFunction', name = (params or {}).name, args = (params or {}).args })
	end,
	preprocess = function(_, s)
		return coroutine.yield({ op = 'preprocess', text = tostring(s or '') })
	end
}
mw.getCurrentFrame = function() return __frame end
__ja_ucp_user_co = coroutine.create(function()
	return ${globalSlot}[${JSON.stringify(name)}](__frame)
end)
__ja_ucp_resume_value = nil
`);

          // Step the coroutine, dispatching any yields out to PHP. The loop
          // terminates when the coroutine reaches "dead" status. We
          // serialize the step result through a pure-Lua JSON encoder so
          // that the wasmoon JS proxy doesn't have to traverse Lua tables
          // (which can throw "target[key].bind is not a function" for nested
          // table values).
          let userResult: unknown = null;
          for (;;) {
            const stepJson = (await lua.doString(`
local ok, ret = coroutine.resume(__ja_ucp_user_co, __ja_ucp_resume_value)
__ja_ucp_resume_value = nil
local status = coroutine.status(__ja_ucp_user_co)

local function encode(v)
	local t = type(v)
	if v == nil then return 'null' end
	if t == 'boolean' then return v and 'true' or 'false' end
	if t == 'number' then
		if v ~= v then return 'null' end
		if v == math.huge or v == -math.huge then return 'null' end
		return tostring(v)
	end
	if t == 'string' then
		return '"' .. v:gsub('\\\\', '\\\\\\\\'):gsub('"', '\\\\"'):gsub('\\n', '\\\\n'):gsub('\\r', '\\\\r'):gsub('\\t', '\\\\t') .. '"'
	end
	if t == 'table' then
		-- Detect sequence
		local n = 0
		for _ in pairs(v) do n = n + 1 end
		local seq_len = #v
		if n == seq_len and seq_len > 0 then
			local parts = {}
			for i = 1, seq_len do parts[i] = encode(v[i]) end
			return '[' .. table.concat(parts, ',') .. ']'
		end
		local parts = {}
		for k, val in pairs(v) do
			parts[#parts + 1] = encode(tostring(k)) .. ':' .. encode(val)
		end
		return '{' .. table.concat(parts, ',') .. '}'
	end
	return 'null'
end

if not ok then
	return encode({ kind = 'error', message = tostring(ret) })
end
if status == 'dead' then
	return encode({ kind = 'done', value = ret })
end
if type(ret) == 'table' then
	if ret.op == 'preprocess' then
		return encode({ kind = 'preprocess', text = tostring(ret.text or '') })
	elseif ret.op == 'expandTemplate' then
		local args_s = {}
		if type(ret.args) == 'table' then
			for k, val in pairs(ret.args) do args_s[tostring(k)] = tostring(val) end
		end
		return encode({ kind = 'expandTemplate', title = tostring(ret.title or ''), args = args_s })
	elseif ret.op == 'callParserFunction' then
		local args_s = {}
		if type(ret.args) == 'table' then
			local seq_len = #ret.args
			if seq_len > 0 then
				for i = 1, seq_len do args_s[i] = tostring(ret.args[i]) end
			else
				for k, val in pairs(ret.args) do args_s[tostring(k)] = tostring(val) end
			end
		end
		return encode({ kind = 'callParserFunction', name = tostring(ret.name or ''), args = args_s })
	elseif ret.op == 'loadData' then
		return encode({ kind = 'loadData', name = tostring(ret.name or '') })
	elseif ret.op == 'loadJsonData' then
		return encode({ kind = 'loadJsonData', name = tostring(ret.name or '') })
	end
end
return encode({ kind = 'unknown', value = tostring(ret) })
`)) as string;

            const step = JSON.parse(stepJson) as {
              kind: string;
              value?: unknown;
              message?: string;
              text?: string;
              title?: string;
              args?: Record<string, string> | string[];
              name?: string;
            };
            if (step.kind === "done") {
              userResult = step.value;
              break;
            }
            if (step.kind === "error") {
              return { op: "error", value: String(step.message ?? "module error") };
            }
            if (step.kind === "preprocess") {
              const text = String(step.text ?? "");
              const out = await dispatchScalar("preprocess", "current", text);
              await lua.doString(`__ja_ucp_resume_value = ${JSON.stringify(String(out ?? ""))}`);
              continue;
            }
            if (step.kind === "expandTemplate") {
              const title = String(step.title ?? "");
              const tplArgs = (step.args ?? {}) as Record<string, string>;
              const out = await dispatchScalar("expandTemplate", "current", title, tplArgs);
              await lua.doString(`__ja_ucp_resume_value = ${JSON.stringify(String(out ?? ""))}`);
              continue;
            }
            if (step.kind === "callParserFunction") {
              const fnName = String(step.name ?? "");
              const cpArgs = (step.args ?? {}) as Record<string, string> | string[];
              const out = await dispatchScalar("callParserFunction", "current", fnName, cpArgs);
              await lua.doString(`__ja_ucp_resume_value = ${JSON.stringify(String(out ?? ""))}`);
              continue;
            }
            if (step.kind === "loadData") {
              const moduleName = String(step.name ?? "");
              // mw.loadData expects to run the Lua module and get back its
              // returned table. We can't easily marshal arbitrary Lua tables
              // back into Lua, so the simplest correct path is: send the
              // PHP-side loadPackage call which returns a Scribunto chunk
              // reference, then execute that chunk in our wasmoon state
              // and bind the resulting table to a global the resume code
              // unwraps. Concretely: locate the source by asking PHP for
              // the page content, compile + run it in wasmoon, and resume
              // with the result.
              const loaded = await loadModuleData(moduleName);
              await lua.doString(`__ja_ucp_resume_value = ${loaded}`);
              continue;
            }
            if (step.kind === "loadJsonData") {
              const moduleName = String(step.name ?? "");
              const loaded = await loadJsonModuleData(moduleName);
              await lua.doString(`__ja_ucp_resume_value = ${loaded}`);
              continue;
            }
            await lua.doString("__ja_ucp_resume_value = nil");
          }

          const values: Record<number, unknown> = {};
          const arr = normalizeLuaReturn(userResult);
          arr.forEach((v, i) => {
            values[i + 1] = stringifyLuaValue(v);
          });
          return { op: "return", nvalues: arr.length, values };
        }

        case "fake-mw-sub": {
          // Stub mw.*.lua / libraryUtil.lua: return an empty package table
          // plus a no-op setupInterface so require()/setupInterface() that
          // mw.lua wires up don't crash.
          const setupId = mkFakeChunk("fake-noop");
          return {
            op: "return",
            nvalues: 1,
            values: { 1: { setupInterface: { __scribunto_function_id__: setupId } } }
          };
        }

        case "fake-executeModule": {
          // args: 1=chunkId of user module, 2=function name, 3=frame
          const args = (msg.args as Record<string, unknown>) ?? {};
          const userChunkRef = args["1"] as unknown;
          const functionName = args["2"] as string | undefined;

          let userChunkId: number | undefined;
          if (
            typeof userChunkRef === "object" &&
            userChunkRef !== null &&
            typeof (userChunkRef as { __scribunto_function_id__?: unknown }).__scribunto_function_id__ ===
              "number"
          ) {
            userChunkId = (userChunkRef as { __scribunto_function_id__: number }).__scribunto_function_id__;
          } else if (typeof userChunkRef === "number") {
            userChunkId = userChunkRef;
          }
          if (userChunkId === undefined || !chunks.has(userChunkId)) {
            return {
              op: "return",
              nvalues: 2,
              values: { 1: false, 2: "executeModule: missing user module chunk" }
            };
          }

          const userChunk = chunks.get(userChunkId)!;
          // Run the module source in wasmoon and bind its result to a global
          // we can re-access later when PHP calls the looked-up function.
          const globalSlot = `__ja_ucp_module_${userChunkId}`;
          await lua.doString(
            `local fn, err = loadstring(${JSON.stringify(userChunk.source)}, ${JSON.stringify(
              userChunk.chunkName
            )})
if not fn then error(err, 0) end
${globalSlot} = fn()`
          );
          // Probe the table for the requested function name.
          const typeProbe = (await lua.doString(
            `local m = ${globalSlot}; if type(m) ~= 'table' then return type(m) end; return type(m[${JSON.stringify(
              functionName ?? ""
            )}])`
          )) as string;
          if (typeProbe !== "function") {
            return {
              op: "return",
              nvalues: 2,
              values: { 1: false, 2: typeProbe }
            };
          }
          const fnId = mkFakeChunk("module-function", {
            parentChunkId: userChunkId,
            functionName: functionName ?? ""
          });
          return {
            op: "return",
            nvalues: 2,
            values: { 1: true, 2: { __scribunto_function_id__: fnId } }
          };
        }

        case "module-function": {
          // Call the previously looked-up function. For now we drop the frame
          // argument because faithfully marshalling Scribunto's frame object
          // would require the full mw_interface protocol.
          const parent = chunk.parentChunkId;
          const name = chunk.functionName;
          if (parent === undefined || !name) {
            return { op: "error", value: "module-function: missing binding" };
          }
          const globalSlot = `__ja_ucp_module_${parent}`;
          const result = (await lua.doString(
            `return ${globalSlot}[${JSON.stringify(name)}]()`
          )) as unknown;
          const values: Record<number, unknown> = {};
          const arr = normalizeLuaReturn(result);
          arr.forEach((v, i) => {
            values[i + 1] = stringifyLuaValue(v);
          });
          return { op: "return", nvalues: arr.length, values };
        }

        case "user":
        default: {
          const luaCode = `local fn, err = loadstring(${JSON.stringify(chunk.source)}, ${JSON.stringify(chunk.chunkName)})
if not fn then error(err, 0) end
local result = fn()
return result`;
          const result = (await lua.doString(luaCode)) as unknown;
          const values: Record<number, unknown> = {};
          const arr = normalizeLuaReturn(result);
          arr.forEach((v, i) => {
            values[i + 1] = stringifyLuaValue(v);
          });
          return { op: "return", nvalues: arr.length, values };
        }
      }
    } catch (error: unknown) {
      return { op: "error", value: error instanceof Error ? error.message : String(error) };
    }
  }

  // Send a `call` message to PHP and wait for the matching `return` /
  // `error` response, interleaving with any nested calls PHP makes back to
  // us while it's processing ours. Mirrors MWServer.lua's `dispatch` loop.
  async function dispatchToPhp(outgoing: ScribuntoMessage): Promise<ScribuntoMessage> {
    const enc = encodeForPhp(outgoing);
    debugLog(`dispatch -> PHP op=${outgoing.op} id=${JSON.stringify(outgoing.id)}`);
    api.stdout(enc);
    for (;;) {
      // 60s in-flight timeout: generous enough for slow PHP-side
      // callbacks (expandTemplate, preprocess), tight enough to surface
      // a genuinely stuck PHP rather than hanging forever.
      const incoming = await readMessage(60_000);
      if (!incoming) {
        throw new Error("dispatchToPhp: stdin closed before reply arrived");
      }
      debugLog(`dispatch <- PHP op=${incoming.op}`);
      if (incoming.op === "return" || incoming.op === "error") {
        return incoming;
      }
      // Nested call from PHP – process it inline and reply, then keep waiting
      // for our own reply.
      let nestedResponse: ScribuntoMessage;
      switch (incoming.op) {
        case "loadString":
          nestedResponse = await handleLoadString(incoming);
          break;
        case "call":
          nestedResponse = await handleCall(incoming);
          break;
        case "registerLibrary": {
          const fns = (incoming.functions as Record<string, unknown>) ?? {};
          for (const [n, id] of Object.entries(fns)) {
            if (typeof id === "string") registeredFuncs.set(n, id);
          }
          nestedResponse = { op: "return", nvalues: 0, values: {} };
          break;
        }
        case "cleanupChunks": {
          const ids = (incoming.ids as Record<string, unknown>) ?? {};
          for (const id of chunks.keys()) {
            if (!(String(id) in ids)) chunks.delete(id);
          }
          nestedResponse = { op: "return", nvalues: 0, values: {} };
          break;
        }
        case "getStatus":
          nestedResponse = {
            op: "return",
            nvalues: 1,
            values: { 1: { pid: 1, time: 0, vsize: 0, rss: 0 } }
          };
          break;
        default:
          nestedResponse = { op: "error", value: `nested unknown op: ${incoming.op}` };
      }
      api.stdout(encodeForPhp(nestedResponse));
    }
  }

  async function fetchExpandedArgs(frameId: string | number): Promise<Record<string, string>> {
    const fnId = registeredFuncs.get("getAllExpandedArguments");
    if (!fnId) return {};
    const reply = await dispatchToPhp({
      op: "call",
      id: fnId,
      nargs: 1,
      args: { 1: frameId }
    });
    if (reply.op !== "return") return {};
    const values = (reply.values as Record<string, unknown>) ?? {};
    const first = values["1"];
    if (typeof first !== "object" || first === null) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(first as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      out[k] = String(v);
    }
    return out;
  }

  // Run a single round-trip into PHP from inside the executeFunction handler.
  // Used by the wasmoon-side `frame:expandTemplate` / `frame:preprocess`
  // helpers that we expose via the `__ja_ucp_yield` cooperative scheduling
  // trick below.
  async function dispatchScalar(funcName: string, ...callArgs: unknown[]): Promise<unknown> {
    const fnId = registeredFuncs.get(funcName);
    if (!fnId) return "";
    const argMap: Record<string, unknown> = {};
    callArgs.forEach((v, i) => {
      argMap[String(i + 1)] = v;
    });
    const reply = await dispatchToPhp({
      op: "call",
      id: fnId,
      nargs: callArgs.length,
      args: argMap
    });
    if (reply.op !== "return") return "";
    const values = (reply.values as Record<string, unknown>) ?? {};
    return values["1"] ?? "";
  }

  function serializeArgsToLua(args: Record<string, string>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(args)) {
      const numericKey = /^-?\d+$/.test(k);
      const luaKey = numericKey ? `[${k}]` : `[${JSON.stringify(k)}]`;
      parts.push(`${luaKey} = ${JSON.stringify(v)}`);
    }
    return `{${parts.join(", ")}}`;
  }

  async function loadModuleData(moduleName: string): Promise<string> {
    // Use the loadPackage callback Scribunto registers for us. It returns
    // a Scribunto_LuaStandaloneInterpreterFunction reference (chunks[N]).
    // The chunk source has been delivered to us via a nested `loadString`
    // call inside loadPackage, so our chunks Map already knows it. Run
    // that chunk in wasmoon and bind the result into a Lua table literal
    // we can paste back into the resume statement.
    const fnId = registeredFuncs.get("loadPackage");
    if (!fnId) return "nil";
    const reply = await dispatchToPhp({
      op: "call",
      id: fnId,
      nargs: 1,
      args: { 1: moduleName }
    });
    if (reply.op !== "return") return "nil";
    const values = (reply.values as Record<string, unknown>) ?? {};
    const ref = values["1"];
    if (
      typeof ref !== "object" ||
      ref === null ||
      typeof (ref as { __scribunto_function_id__?: unknown }).__scribunto_function_id__ !== "number"
    ) {
      return "nil";
    }
    const chunkId = (ref as { __scribunto_function_id__: number }).__scribunto_function_id__;
    const chunk = chunks.get(chunkId);
    if (!chunk) return "nil";
    // Compile + execute the chunk source, then JSON-encode the returned
    // value through Lua so we can paste it as a Lua literal into the
    // resume statement.
    const slot = `__ja_ucp_loaded_${chunkId}`;
    try {
      const luaCode = `
local fn, err = loadstring(${JSON.stringify(chunk.source)}, ${JSON.stringify(chunk.chunkName)})
if not fn then return 'ERROR:' .. tostring(err) end
local ok, val = pcall(fn)
if not ok then return 'ERROR:' .. tostring(val) end
${slot} = val
return ''
`;
      const result = (await lua.doString(luaCode)) as string;
      if (typeof result === "string" && result.startsWith("ERROR:")) {
        debugLog(`loadModuleData ${moduleName}: ${result}`);
        return "nil";
      }
      return slot;
    } catch (err) {
      debugLog(`loadModuleData ${moduleName} failed: ${err instanceof Error ? err.message : String(err)}`);
      return "nil";
    }
  }

  async function loadJsonModuleData(moduleName: string): Promise<string> {
    const fnId = registeredFuncs.get("loadJsonData");
    if (!fnId) return "nil";
    const reply = await dispatchToPhp({
      op: "call",
      id: fnId,
      nargs: 1,
      args: { 1: moduleName }
    });
    if (reply.op !== "return") return "nil";
    const values = (reply.values as Record<string, unknown>) ?? {};
    const data = values["1"];
    if (data === null || data === undefined) return "nil";
    return jsToLuaLiteral(data);
  }

  function jsToLuaLiteral(value: unknown, depth = 0): string {
    if (depth > 100) return "nil";
    if (value === null || value === undefined) return "nil";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return "nil";
      return String(value);
    }
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return "{" + value.map((v) => jsToLuaLiteral(v, depth + 1)).join(", ") + "}";
    }
    if (typeof value === "object") {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const isInt = /^-?\d+$/.test(k);
        const luaKey = isInt ? `[${k}]` : `[${JSON.stringify(k)}]`;
        parts.push(`${luaKey} = ${jsToLuaLiteral(v, depth + 1)}`);
      }
      return "{" + parts.join(", ") + "}";
    }
    return "nil";
  }

  function stringifyLuaValue(value: unknown): unknown {
    // wasmoon returns Lua tables as proxy objects with `alive`, `thread`,
    // `ref`, `pointer` fields. Without crossing back into Lua to enumerate
    // their contents we treat them as opaque – which is fine for scalars and
    // for the values produced by simple modules.
    if (
      value !== null &&
      typeof value === "object" &&
      "alive" in (value as object) &&
      "ref" in (value as object)
    ) {
      return null;
    }
    return value;
  }

  function normalizeLuaReturn(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return [];
    }
    return [value];
  }

  void readFile; // ensure import stays available for future expansion

  while (true) {
    let msg: ScribuntoMessage | null;
    try {
      debugLog("waiting for message");
      // Outer dispatch loop: 3s idle timeout so we exit cleanly when PHP
      // is done driving the Scribunto interpreter.
      msg = await readMessage(3_000);
      if (!msg) {
        // Idle timeout fired – PHP hasn't sent any more messages, so the
        // parent renderer is probably done with this Scribunto instance.
        // Exit so PHP's proc_close() in the engine destructor can complete;
        // otherwise it would block forever waiting for the spawned lua
        // process to die.
        debugLog("stdin idle, exiting Scribunto server");
        try {
          lua.global.close();
        } catch {
          /* ignore */
        }
        api.exit(0);
        return;
      }
      debugLog(`got message op=${msg.op}${
        msg.op === "call" ? ` id=${JSON.stringify(msg.id)} args=${JSON.stringify(msg.args)}` : ""
      }${msg.op === "loadString" ? ` chunkName=${JSON.stringify(msg.chunkName)} textLen=${String(msg.text).length}` : ""}`);
    } catch (error: unknown) {
      api.stderr(
        `ja-ucp-preview Scribunto server: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
      api.exit(1);
      try {
        lua.global.close();
      } catch {
        /* ignore */
      }
      return;
    }

    let response: ScribuntoMessage;
    switch (msg.op) {
      case "loadString":
        response = await handleLoadString(msg);
        break;
      case "call":
        response = await handleCall(msg);
        break;
      case "registerLibrary": {
        const fns = (msg.functions as Record<string, unknown>) ?? {};
        for (const [name, id] of Object.entries(fns)) {
          if (typeof id === "string") {
            registeredFuncs.set(name, id);
          }
        }
        response = { op: "return", nvalues: 0, values: {} };
        break;
      }
      case "wrapPhpFunction": {
        const id = nextChunkId++;
        response = { op: "return", nvalues: 1, values: { 1: id } };
        break;
      }
      case "cleanupChunks": {
        const ids = (msg.ids as Record<string, unknown>) ?? {};
        for (const id of chunks.keys()) {
          if (!(String(id) in ids)) {
            chunks.delete(id);
          }
        }
        response = { op: "return", nvalues: 0, values: {} };
        break;
      }
      case "getStatus":
        response = {
          op: "return",
          nvalues: 1,
          values: { 1: { pid: 1, time: 0, vsize: 0, rss: 0 } }
        };
        break;
      case "quit":
      case "testquit":
        try {
          lua.global.close();
        } catch {
          /* ignore */
        }
        api.exit(msg.op === "testquit" ? 42 : 0);
        return;
      default:
        api.stderr(`ja-ucp-preview Scribunto server: unknown op "${msg.op}"\n`);
        response = { op: "error", value: `unknown op: ${msg.op}` };
        break;
    }

    const enc = encodeForPhp(response);
    debugLog(
      `sending response op=${response.op} bytes=${enc.length}${
        response.op === "error" ? ` value=${JSON.stringify((response as { value?: unknown }).value)}` : ""
      } body=${enc.toString("utf8").slice(16, 316)}`
    );
    api.stdout(enc);
  }
}
