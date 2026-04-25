import type { PageOverride } from "../types.js";

export interface SiteStylePage {
  title: string;
  exists: boolean;
  contentModel: string;
  text: string;
}

export const jaUncyclopediaSiteStylePages: SiteStylePage[] = [
  {
    title: "MediaWiki:Common.css",
    exists: true,
    contentModel: "css",
    text: String.raw`/*
ここに書いた CSS は全ての外装に反映されます

'''注意:''' スキンに関係するもの (ロゴ関連、JavaScript関連)は、[[MediaWiki:Uncyclopedia.css]]で設定して下さい。

ツール: [https://ja.uncyclopedia.info/index.php?title=MediaWiki:Common.css&action=raw&ctype=text/css&smaxage=18000 キャッシュのリロード] | [http://jigsaw.w3.org/css-validator/validator?uri=http%3A%2F%2Fja.uncyclopedia.info%2Findex.php%3Ftitle%3DMediaWiki%3ACommon.css%26action%3Draw%26ctype%3Dtext%2Fcss%26smaxage%3D18000&usermedium=all W3Cバリデーション・チェック]

*/

/* タイトルと記事の間の要素 (リダイレクト表示など)*/
/* #contentSub { display:none } */

#bodyContent { line-height:150%; }/* 記事本体 */

/* メインページでは、タイトルを表示しない */
body.page-メインページ #siteSub,
body.page-メインページ .subtitle,
body.page-メインページ h1.firstHeading,
body.page-メインページ h1.pagetitle,
body.page-UnNews:バ科ニュース #siteSub,
body.page-UnNews:バ科ニュース .subtitle,
body.page-UnNews:バ科ニュース h1.firstHeading,
body.page-UnNews:バ科ニュース h1.pagetitle {
    display: none;
}

/* メインページヘッダー用 */
.globegris {  background-image: url("https://images.uncyc.org/ja/1/12/Uncyclopedia_Logo_for_mainpage.png");}

/* Forum formatting -Algorithm & -Splaka */
.forumheader { border: 1px solid #aaa; background-color: #f9f9f9; margin-top: 1em; padding: 12px; }
.forumlist td.forum_edited a { color: black; text-decoration: none }
.forumlist td.forum_title a { padding-left: 20px; }
.forumlist td.forum_title a.forum_new:visited { font-weight: normal; background: none; padding-left: 20px; }
.forumlist th.forum_title { padding-left: 20px; }
 
/* Maintenance formatting -Algorithm */
.expired td.forum_title a { font-weight: bold }
.expired td.forum_title a.forum_new { font-weight: normal }
 
/* custom namespace logos (still under testing, this only works on full namespaces) -Splaka */
body.ns-6 #p-logo a { background-image: url(https://images.uncyc.org/commons/d/d5/Uncyclomedia_Commons.png); }
body.ns-7 #p-logo a { background-image: url(https://images.uncyc.org/commons/d/d5/Uncyclomedia_Commons.png); }
body.ns-102 #p-logo a { background-image: url(https://images.uncyc.org/ja/2/2e/New-UnNews-logo.png); }
body.ns-103 #p-logo a { background-image: url(https://images.uncyc.org/ja/2/2e/New-UnNews-logo.png); }
body.ns-104 #p-logo a { background-image: url(https://images.uncyc.org/commons/thumb/d/d8/Undictionary-logo-ja.svg/152px-Undictionary-logo-ja.svg.png); }
body.ns-105 #p-logo a { background-image: url(https://images.uncyc.org/commons/thumb/d/d8/Undictionary-logo-ja.svg/152px-Undictionary-logo-ja.svg.png); }
body.ns-106 #p-logo a { background-image: url(https://images.uncyc.org/ja/b/b7/New-Game-logo.png); }
body.ns-107 #p-logo a { background-image: url(https://images.uncyc.org/ja/b/b7/New-Game-logo.png); }
body.ns-110 #p-logo a { background-image: url(https://images.uncyc.org/ja/7/73/New-Forum-logo.png); }
body.ns-111 #p-logo a { background-image: url(https://images.uncyc.org/commons/d/db/Forum_talk.png); }
body.ns-112 #p-logo a { background-image: url(https://images.uncyc.org/ja/5/51/UnTunes-new-logo.png); }
body.ns-113 #p-logo a { background-image: url(https://images.uncyc.org/ja/5/51/UnTunes-new-logo.png); }
body.ns-116 #p-logo a { background-image: url(https://images.uncyc.org/ja/6/65/New-Unbooks-logo.png); }
body.ns-117 #p-logo a { background-image: url(https://images.uncyc.org/ja/6/65/New-Unbooks-logo.png);}

/* Puts a redirect indicator before redirects in Special:Allpages -Spl */
.allpagesredirect { font-style: italic; }
.allpagesredirect a { background: url(/images/5/5c/Allpagesredirect.gif) center left no-repeat; padding-left: 13px; }
 
/* Class to force links to be underlined --Paulgb */
.underlinelink a{ text-decoration: underline ! important; }
.nounderlinelink a{ text-decoration: none ! important; }
.nowraplinks a{ white-space: nowrap;} 

/* For Zork related pages. See [[Template:ゾークヘッダー]]. -Paulgb */
table.zorkclass td { padding: 3px; }
.zorkclass { background-color: #000000; color: #FFFFFF; }
.zorkclass a { color: #FFFFCC; }
.zorkclass a:visited { color: #FFFFCC; }
.zorkclass a:hover { color: #FFFFFF; }
.zorkclass a.new { color: #FF6666; }
.zorkclass ul { list-style-type: circle; color:#FFFFCC; list-style-image: url(/images/d/d4/Zorkbullet.gif); }
.zorkcmd { color: #FFFFCC; }
.zorkclue tt:hover { color:#FFFFFF; }
.zorkclass * a.extiw { color: #CCFFCC !important; }
.zorkclass * a.external { color: #CCFFCC !important; }
 
/* This makes vfp headers automatically clear the floating image -Paulgb */
#headclear h1 { clear: both; }
#headclear h2 { clear: both; }
#headclear div.editsection { clear: both; position: relative; top: 2em;}
 
/* wikitable/prettytable class for skinning normal tables -Keitei */
table.wikitable, table.prettytable {
  margin: 1em 1em 1em 0;
  background: #f9f9f9;
  border: 1px #aaaaaa solid;
  border-collapse: collapse;
}
table.wikitable th, table.wikitable td, table.prettytable th, table.prettytable td {
  border: 1px #aaaaaa solid;
  padding: 0.2em;
}
table.wikitable th, table.prettytable th {
  background: #f2f2f2;
  text-align: center;
}
table.wikitable caption, table.prettytable caption {
  margin-left: inherit;
  margin-right: inherit;
}
 
/* stealth external links almost like normal links (remove if abused) -Spl */
#bodyContent .stealthexternallink a { background: none; padding: 0; color: #002bb8; }
#bodyContent .stealthexternallink a.new { color: #CC2200 !important; }
#bodyContent .stealthexternallink a:visited { color: #5a3696; }
#bodyContent .stealthexternallink a:active { color: #faa700; }
#bodyContent .stealthexternallink a:hover { text-decoration: underline; }

/* stealth new links test per [[Forum:Deliberate_Red_Links]] -Spl */
.new a { color:#cc2200; }
.new a:visited { color:#a55858; }
 
span.buttonlink { border-style: outset; }
span.buttonlink:active { border-style: inset; }
.noeditlink .editlink { display: none }

/* [[Template:Link FA]] */
#mw-panel div.portal div.body ul li.FA,
#mw-panel li.interlanguage-link.FA {
    background: url("https://images.uncyc.org/commons/6/60/LinkFA-star.png") no-repeat 0% 0%;
    background-position: left center;
    margin-left: -14px;
    padding-left: 14px;
}

ol.references { font-size: 100%;}
.references-small { font-size: 90%;}
ol.references > li:target,
sup.reference:target,
cite:target { background-color: #DEF; }

code {
    border: 1px solid rgb(221, 221, 221);
    padding: 1px 4px;
    border-radius: 2px;
}

/* ナビゲーションフレーム用 [[Uncyclopedia:NavFrameの使い方]]*/
div.Boxmerge,
div.NavFrame {
        margin: 0px;
        padding: 2px;
        border: 1px solid #aaaaaa;
        text-align: center;
        border-collapse: collapse;
        font-size: 95%;
}
div.Boxmerge div.NavFrame {
        border-style: none;
        border-style: hidden;
}
div.NavFrame + div.NavFrame {
        border-top-style: none;
        border-top-style: hidden;
}
div.NavPic {
        background-color: #ffffff;
        margin: 0px;
        padding: 2px;
        float: left;
}
div.NavFrame div.NavHead {
        height: 1.6em;
        font-weight: bold;
        font-size: 100%;
        background-color: #efefef;
        position:relative;
}
div.NavFrame p,
div.NavFrame div.NavContent,
div.NavFrame div.NavContent p {
        font-size: 100%;
}
div.NavEnd {
        margin: 0px;
        padding: 0px;
        line-height: 1px;
        clear: both;
}
span.NavToggle,
span.DLToggle,
span.TableToggle {
        font-weight:normal;
        font-size:83.3%;
}
span.NavToggle {
        position:absolute;
        top:0px;
        right:3px;
}
span.TableToggle {
        float:right;
}

/* [[Template:偽外部リンク]]用 */
span.fakelink {
        background: url('/skins/Vector/resources/common/images/link-external-small-ltr-progressive.svg?14604') no-repeat scroll right center transparent;
        padding-right: 13px;
}

table.navigation {background:transparent; line-height:130%;}
table.navigation th {text-align:right; vertical-align:top; white-space:nowrap; }
table.navigation td {text-align:left; font-size:90%; padding-left:5px; }
table.navigation span.nobr {white-space: nowrap;}
table.navigation span.city {background:#33c; color:#fff; padding:2px 5px; font-weight:bold;}

table.lexicon th {border-right:1px solid #aaaaaa; border-bottom:1px solid #888;}
table.right-tab th {border-right:5px solid #999;}

/* class="wikitable calendar"の設定 ([[Template:カレンダー]]用) */
table.calendar { margin-top : 0; }
table.calendar caption { margin-top : 1em; font-weight : bold; }
table.calendar tr th, table.calendar tr td { text-align : center; font-weight : bold; }
table.calendar tr td a.new { font-weight : normal; color : rgb(75,75,75); }
table.calendar tr.header th { background-color : rgb(225,225,225); }
table.calendar tr.header th a { color : rgb(0,0,0); }
table.calendar tr.header th.sun { background-color : rgb(250,200,200); }
table.calendar tr.header th.sun a { color : rgb(250,0,0); }
table.calendar tr.header th.sat { background-color : rgb(200,200,250); }
table.calendar tr.header th.sat a { color : rgb(0, 0, 250); }
table.calendar tr td { background-color : rgb(240,240,240); }
table.calendar tr td.sun { background-color : rgb(250,225,225); }
table.calendar tr td.sat { background-color : rgb(225,225,250); }
table.calendar tr.footer td { background-color : rgb(250,250,250); font-size : smaller; }

/* Donation parody stuff */
#siteNotice .siteNoticehide {display: none;}
.walesh1{ background-color: #8ca5b6; background-image: url(http://images2.wikia.nocookie.net/uncyclopedia/images/9/96/Jimbo-bikini-babes_gradient.png); background-repeat:repeat-x; }
.walesh2{ background-color: #c0a282; background-image: url(http://images4.wikia.nocookie.net/uncyclopedia/images/1/19/Grad_header2.png); background-repeat:repeat-x; }
.walesh3{ background-color: #a19f93; background-image: url(http://images4.wikia.nocookie.net/uncyclopedia/images/3/3f/Grad_header3.png); background-repeat:repeat-x; }
.walesh4{ background-color: #242304; background-image: url(http://images4.wikia.nocookie.net/uncyclopedia/images/4/4c/Leafy.png); background-repeat:repeat-x; }
.walesh5{ background-color: #491787; background-image: url(http://images2.wikia.nocookie.net/uncyclopedia/images/b/bc/Purpley.png); background-repeat:repeat-x; }
.sannseh6{ background-image: url(http://images1.wikia.nocookie.net/uncyclopedia/images/3/3e/Prettiestpretty_pattern.png); background-repeat:repeat-x; }
.gradientg6{ background-image: url(http://images2.wikia.nocookie.net/uncyclopedia/images/b/b7/Banner_gradient.gif); background-repeat:repeat-x; }

.nt-button-2011-start { background-image: url("http://images3.wikia.nocookie.net/__cb20111102171618/uncyclopedia/images/a/a7/CNtranslatebutton2.png"); background-position: 100% 100%; float: right; height: 30px; width: 4px; }
.nt-button-2011-end { background-image: url("http://images3.wikia.nocookie.net/__cb20111102171618/uncyclopedia/images/a/a7/CNtranslatebutton2.png"); background-position: 0% 0%; float: right; height: 30px; width: 4px; }
.nt-button-2011-label { background-image: url("http://images3.wikia.nocookie.net/__cb20111102171618/uncyclopedia/images/a/a7/CNtranslatebutton2.png"); background-position: 50% 50%; background-repeat: repeat-x; color: rgb(0, 0, 0); cursor: pointer; float: right; font-family: sans-serif; font-size: 1em; font-weight: 700; height: 30px; line-height: 30px; padding-bottom: 0px; padding-left: 4px; padding-right: 4px; padding-top: 0px; text-decoration: none; white-space: nowrap; }

/* [[森羅万象棋]]用 */
table.kifu { border: outset 1pt; }
table.kifu td { width: 1em; height:1.1em; text-align:center; vertical-align: middle; padding:3px; border:inset 1pt; }

/* 水平方向のリスト */
.hlist dl,
.hlist ol,
.hlist ul { margin: 0; padding: 0; }
.hlist dd,
.hlist dt,
.hlist li { margin: 0; display: inline; }
.hlist.inline,
.hlist.inline dl,
.hlist.inline ol,
.hlist.inline ul,
.hlist dl dl,
.hlist dl ol,
.hlist dl ul,
.hlist ol dl,
.hlist ol ol,
.hlist ol ul,
.hlist ul dl,
.hlist ul ol,
.hlist ul ul { display: inline; }
.hlist .mw-empty-li { display: none; }
.hlist dt:after { content: ": "; }
.hlist dd:after,
.hlist li:after { content: " · "; font-weight: bold; }
.hlist dd:last-child:after,
.hlist dt:last-child:after,
.hlist li:last-child:after { content: none; }
.hlist dd dd:first-child:before,
.hlist dd dt:first-child:before,
.hlist dd li:first-child:before,
.hlist dt dd:first-child:before,
.hlist dt dt:first-child:before,
.hlist dt li:first-child:before,
.hlist li dd:first-child:before,
.hlist li dt:first-child:before,
.hlist li li:first-child:before { content: " ("; font-weight: normal; }
.hlist dd dd:last-child:after,
.hlist dd dt:last-child:after,
.hlist dd li:last-child:after,
.hlist dt dd:last-child:after,
.hlist dt dt:last-child:after,
.hlist dt li:last-child:after,
.hlist li dd:last-child:after,
.hlist li dt:last-child:after,
.hlist li li:last-child:after { content: ")"; font-weight: normal; }
.hlist ol { counter-reset: listitem; }
.hlist ol > li { counter-increment: listitem; }
.hlist ol > li:before { content: " " counter(listitem) "\a0"; }
.hlist dd ol > li:first-child:before,
.hlist dt ol > li:first-child:before,
.hlist li ol > li:first-child:before { content: " (" counter(listitem) "\a0"; }

/* 「・」中黒（ビュレット）のないリスト */
.plainlist ol,
.plainlist ul {
	line-height: inherit;
	list-style: none none;
	margin: 0;
}
.plainlist ol li,
.plainlist ul li {
	margin-bottom: 0;
}`
  },
  {
    title: "MediaWiki:Vector.css",
    exists: false,
    contentModel: "css",
    text: ""
  },
  {
    title: "MediaWiki:Monobook.css",
    exists: true,
    contentModel: "css",
    text: String.raw`/* このページを編集するとサイト全体での外装 monobook のカスタマイズになります */
/*<pre><nowiki>*/

/* MediaWiki:Uncyclopedia.css を読み込み */
@import "/index.php?title=MediaWiki:Uncyclopedia.css&usemsgcache=yes&action=raw&ctype=text/css&smaxage=18000";

body { font-family:　"Hiragino Kaku Gothic Pro", sans-serif; }
#bodyContent { font-size: 118%; }

#MainPageSearchForm form input#search,
#MainPageSearchForm form input[name=search]
	{
	width:25em;
	margin: 0.5em !important;
	padding: 0.05em !important;
	border:thin solid rgb(150,150,150);
	background-color:rgb(240,240,240);
	font-size:medium;
	}
#MainPageSearchForm form input#search:hover,
#MainPageSearchForm form input[name=search]:hover
	{
	border-color:rgb(130,130,130);
	background-color:rgb(245,245,245);
	}

#MainPageSearchForm form input#search:focus,
#MainPageSearchForm form input[name=search]:focus
	{
	border-color:rgb(100,100,100);
	background-color:rgb(255,255,255);
	}
#MainPageSearchForm form input[type=submit]
	{
	margin:0 0.2em;
	padding: 0.1em 1em;
	border:thin solid rgb(130,130,130);
	background-color:rgb(210,210,210);
	}
#MainPageSearchForm form input[type=submit]:hover
	{
	border-color:rgb(120,120,120);
	background-color:rgb(200,200,200);
	}

#MainPageSearchForm form input[type=submit]:active
	{
	border-color:rgb(100,100,100);
	background-color:rgb(170,170,170);
	}
/*</nowiki></pre>*/`
  },
  {
    title: "MediaWiki:Timeless.css",
    exists: true,
    contentModel: "css",
    text: String.raw`/* ここにあるすべてのCSSは、Timeless外装を使用している利用者に対して読み込まれます */
/* 「アンサイクロペディア」の表示崩れ修正 */
#p-logo-text {
	max-width: none;
}`
  },
  {
    title: "MediaWiki:Minerva.css",
    exists: true,
    contentModel: "css",
    text: String.raw`/* ここに記述したCSSは、全てのミネルバスキン利用者に読み込まれます　*/

/* [[特別:最近の更新]]で要約欄の改行を任意の場所で */
span.mw-changeslist-log-entry .comment {
	overflow-wrap: anywhere;
}
/* [[特別:版指定削除]]でのレイアウト崩れを修正 */
#wpRevDeleteReasonList {
	width: 100%;
}
/* [[特別:復元]]でのテキストエリアの横幅修正 */
.mw-special-Undelete textarea {
	max-width: 100%;
	box-sizing: border-box;
}`
  },
  {
    title: "MediaWiki:Uncyclopedia.css",
    exists: true,
    contentModel: "css",
    text: String.raw`/* 

'''注意:''' スキンに関係しないものは[[MediaWiki:Common.css]]で設定できます。

ツール: [http://ja.uncyclopedia.info/index.php?title=MediaWiki:Uncyclopedia.css&action=raw&ctype=text/css&smaxage=18000 キャッシュのリロード] | [http://jigsaw.w3.org/css-validator/validator?uri=http%3A%2F%2Fja.uncyclopedia.info%2Findex.php%3Ftitle%3DMediaWiki%3AUncyclopedia.css%26action%3Draw%26ctype%3Dtext%2Fcss%26smaxage%3D18000&usermedium=all W3C妥当性検証]
==main==
*/
 
/* Bottom box borders. -Paulgb */
.pBody {
padding-top: 3px;
border-bottom: 1.4px solid rgb(170, 170, 170);
}
 
/* White borders for images on non-white backgrounds. Updated to only work when needed. */
.nonwhite div.thumb {
border: none;
margin-top: 10px;
margin-bottom: 0px;
}
.nonwhite div.tleft { border: none; }
.nonwhite div.tright { margin-left: 13px; }

/* default coloring for Special:Allmessages (missing from our default skin) -Spl 09:21, 9 March 2006 (UTC) */
#allmessagestable th { background-color: #b2b2ff; }
#allmessagestable tr.orig { background-color: #ffe2e2; }
#allmessagestable tr.new { background-color: #e2ffe2; }
#allmessagestable tr.def { background-color: #f0f0ff; }

/* comment boxes adapted from french wikipedia. Applied to Forum_talk: currently -keitei */
.ns-111 #content, .ns-111 #p-cactions li, .ns-111 #p-cactions li a {background: #F8FCFF;}
.ns-111 dd { margin: 0; padding: 0; }
.ns-111 dl { border-top: solid 1px #70E0E0; border-left: solid 1px #70E0E0; padding-top: 0.5em; padding-left: 0.5em; margin-left: 1em; }
.ns-111 dl { background-color: #EEF6FF; }
.ns-111 dl dl { background-color: #F8FCFF; }
.ns-111 dl dl dl { background-color: #EEF6FF; }
.ns-111 dl dl dl dl { background-color: #F8FCFF; }
.ns-111 dl dl dl dl dl { background-color: #EEF6FF; }
.ns-111 dl dl dl dl dl dl { background-color: #F8FCFF; }
.ns-111 dl dl dl dl dl dl dl { background-color: #EEF6FF; }
.ns-111 dl dl dl dl dl dl dl dl { background-color: #F8FCFF; }
.ns-111 dl dl dl dl dl dl dl dl dl { background-color: #EEF6FF; }
.ns-111 dl dl dl dl dl dl dl dl dl dl { background-color: #F8FCFF; }
.ns-111 dl dl dl dl dl dl dl dl dl dl dl { background-color: #EEF6FF; }
.ns-111 dl dl dl dl dl dl dl dl dl dl dl dl { background-color: #F8FCFF; }
.ns-111 dl dl dl dl dl dl dl dl dl dl dl dl dl { background-color: #EEF6FF; }
.ns-111 dl dl dl dl dl dl dl dl dl dl dl dl dl dl { background-color: #F8FCFF; }

/* Featured interwiki */
li.FA { list-style-image: url(http://images.uncyc.org/ja/d/d4/Monobook-bullet-star.png) }`
  },
  {
    title: "MediaWiki:Gadgets-definition",
    exists: true,
    contentModel: "wikitext",
    text: String.raw`* UsernameReplace[ResourceLoader|default|targets=desktop,mobile]|UsernameReplace.js
* SysopNicks[ResourceLoader|default|type=styles|targets=desktop,mobile]|SysopNicks.css
* FakeTitle[ResourceLoader|default|targets=desktop,mobile]|FakeTitle.js
* LoadLatestSettings[ResourceLoader]|LoadLatestSettings.js
* MakeMobileCollapsible[ResourceLoader|skins=minerva|targets=desktop,mobile|default|hidden]|MakeMobileCollapsible.js`
  },
  {
    title: "MediaWiki:Gadget-SysopNicks.css",
    exists: true,
    contentModel: "css",
    text: String.raw`/* Make sysop nicks bold in recent changes */
.mw-userlink[title="利用者:.旻"],
.mw-userlink[title="利用者:Carlb"],
.mw-userlink[title="利用者:Lemmingdead"],
.mw-userlink[title="利用者:Micch"],
.mw-userlink[title="利用者:Rotoryu"],
.mw-userlink[title="利用者:えふ氏"],
.mw-userlink[title="利用者:きま"],
.mw-userlink[title="利用者:まほまほ～ん"],
.mw-userlink[title="利用者:フィクミア"],
.mw-userlink[title="利用者:一石二鳥＝一石一鳥"],
.mw-userlink[title="利用者:扇町グロシア"],
.mw-userlink[title="利用者:抹消済みのアカウント"],
.mw-userlink[title="利用者:烏天狗"],
.mw-userlink[title="利用者:誰か"],
.mw-userlink[title="利用者:黒土"]{ font-weight: bold; }`
  }
];

export const jaUncyclopediaDefaultStyleTitles = [
  "MediaWiki:Common.css",
  "MediaWiki:Gadget-SysopNicks.css"
] as const;

export const jaUncyclopediaSkinStyleTitles: Record<string, readonly string[]> = {
  vector: ["MediaWiki:Vector.css"],
  "vector-2022": ["MediaWiki:Vector.css"],
  monobook: ["MediaWiki:Monobook.css"],
  timeless: ["MediaWiki:Timeless.css"],
  minerva: ["MediaWiki:Minerva.css"],
  minervaneue: ["MediaWiki:Minerva.css"],
  cologneblue: ["MediaWiki:Cologneblue.css"],
  modern: ["MediaWiki:Modern.css"]
};

export function siteStylePageOverrides(): Record<string, PageOverride> {
  return Object.fromEntries(
    jaUncyclopediaSiteStylePages
      .filter((page) => page.exists)
      .map((page) => [page.title, { text: page.text, contentModel: page.contentModel }])
  );
}

export function stylePageText(title: string): string | undefined {
  const page = jaUncyclopediaSiteStylePages.find((entry) => entry.title === title && entry.exists);
  return page?.text;
}
