// src/backend/nativePhpBackend.ts
import { createHash, randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, rm, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

// src/site/styles.ts
var jaUncyclopediaSiteStylePages = [
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
var jaUncyclopediaDefaultStyleTitles = [
  "MediaWiki:Common.css",
  "MediaWiki:Gadget-SysopNicks.css"
];
var jaUncyclopediaSkinStyleTitles = {
  vector: ["MediaWiki:Vector.css"],
  "vector-2022": ["MediaWiki:Vector.css"],
  monobook: ["MediaWiki:Monobook.css"],
  timeless: ["MediaWiki:Timeless.css"],
  minerva: ["MediaWiki:Minerva.css"],
  minervaneue: ["MediaWiki:Minerva.css"],
  cologneblue: ["MediaWiki:Cologneblue.css"],
  modern: ["MediaWiki:Modern.css"]
};
function siteStylePageOverrides() {
  return Object.fromEntries(
    jaUncyclopediaSiteStylePages.filter((page) => page.exists).map((page) => [page.title, { text: page.text, contentModel: page.contentModel }])
  );
}

// src/backend/phpWasmBackend.ts
var ExactMediaWikiSnapshotMissingError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ExactMediaWikiSnapshotMissingError";
  }
};
var PhpWasmBackend = class {
  name = "mediawiki-php-wasm";
  options;
  constructor(options = {}) {
    this.options = options.mediaWikiRoot === void 0 ? { phpVersion: options.phpVersion ?? "8.3" } : { phpVersion: options.phpVersion ?? "8.3", mediaWikiRoot: options.mediaWikiRoot };
  }
  async render(_request, _context) {
    if (this.options.mediaWikiRoot === void 0) {
      throw new ExactMediaWikiSnapshotMissingError(
        "No MediaWiki 1.39.3 root was configured for the PHP/WASM backend. This package intentionally has no approximate TypeScript renderer; configure MediaWiki 1.39.3 + Japanese Uncyclopedia extensions or use the native PHP backend."
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
      `PHP/WASM runtime is available (${details}), but the bundled @php-wasm/node runtime does not include PHP intl, which MediaWiki 1.39 requires. Rendering is refused because approximate output is not allowed; use NativePhpBackend or provide an intl-capable PHP/WASM runtime.`
    );
  }
};
function createPhpWasmBackend(options = {}) {
  return new PhpWasmBackend(options);
}

// src/backend/nativePhpBackend.ts
var ExactMediaWikiRuntimeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ExactMediaWikiRuntimeError";
  }
};
var INSTALLATION_VERSION = "mw-1.39.3-ja-ucp-observable-config-v5";
var RENDER_EXTENSIONS = [
  "CategoryTree",
  "Cite",
  "EmbedVideo",
  "ImageMap",
  "InputBox",
  "ParserFunctions",
  "Poem",
  "SyntaxHighlight_GeSHi",
  "TemplateStyles",
  "Variables",
  "SimpleMathJax",
  "RSS",
  "UserFunctions",
  "UrlGetParameters",
  "AddHTMLMetaAndTitle",
  "CharInsert",
  "YouTube",
  "Josa",
  "Babel",
  "CSS",
  "DynamicPageList3",
  "DPLforum",
  "LogoFunctions",
  "RandomSelection",
  "RandomImage",
  "Spoilers",
  "Scribunto",
  "SimpleTooltip"
];
var SKINS = ["Vector", "MonoBook", "Timeless", "MinervaNeue", "CologneBlue", "Modern"];
var NativePhpBackend = class {
  name = "mediawiki-native-php";
  mediaWikiRoot;
  workDir;
  phpBinary;
  forceReinstall;
  bridgePath;
  installationPromise;
  constructor(options = {}) {
    const packageRoot = findPackageRoot();
    this.mediaWikiRoot = resolve(options.mediaWikiRoot ?? join(packageRoot, "vendor", "mediawiki-1.39.3"));
    this.workDir = resolve(options.workDir ?? join(process.cwd(), ".ja-ucp-preview-work"));
    this.phpBinary = options.phpBinary ?? "php";
    this.forceReinstall = options.forceReinstall ?? false;
    this.bridgePath = join(packageRoot, "src", "php", "ja-ucp-render.php");
  }
  async render(request, context) {
    const installation = await this.ensureInstalled();
    const requestPath = join(installation.requestsDir, `${randomUUID()}.json`);
    const skin = request.skin ?? "vector";
    const includeSiteStyles = request.includeSiteStyles ?? true;
    const defaultPageOverrides = siteStylePageOverrides();
    const pageOverrides = request.pageOverrides === void 0 ? defaultPageOverrides : { ...defaultPageOverrides, ...request.pageOverrides };
    const payload = {
      ...request,
      skin,
      includeSiteStyles,
      pageOverrides,
      siteStyleTitles: includeSiteStyles ? siteStyleTitlesForSkin(skin) : [],
      now: normalizeDateInput(request.now),
      revisionTimestamp: normalizeDateInput(request.revisionTimestamp),
      user: { ...context.defaultUser, ...request.user }
    };
    await writeFile(requestPath, JSON.stringify(payload), "utf8");
    try {
      const output = await runCommand(
        this.phpBinary,
        [this.bridgePath, requestPath, installation.localSettingsPath, this.mediaWikiRoot],
        { cwd: this.mediaWikiRoot }
      );
      const text = output.stdout.trim();
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new ExactMediaWikiRuntimeError(
          `MediaWiki render bridge did not return JSON.
STDOUT:
${output.stdout}
STDERR:
${output.stderr}`
        );
      }
    } finally {
      await rm(requestPath, { force: true });
    }
  }
  ensureInstalled() {
    this.installationPromise ??= this.install();
    return this.installationPromise;
  }
  async install() {
    assertMediaWikiRoot(this.mediaWikiRoot);
    assertBridge(this.bridgePath);
    await this.assertPhpRuntime();
    assertBundledExtensionDependencies(this.mediaWikiRoot);
    const id = createHash("sha256").update(this.mediaWikiRoot).update(INSTALLATION_VERSION).digest("hex").slice(0, 16);
    const root = join(this.workDir, id);
    const sqliteDir = join(root, "sqlite");
    const confDir = join(root, "conf");
    const cacheDir = join(root, "cache");
    const tmpDir = join(root, "tmp");
    const requestsDir = join(root, "requests");
    const localSettingsPath = join(confDir, "LocalSettings.php");
    const markerPath = join(root, "installed.json");
    const dbPath = join(sqliteDir, "ja_ucp_preview.sqlite");
    if (this.forceReinstall) {
      await rm(root, { recursive: true, force: true });
    }
    await mkdir(sqliteDir, { recursive: true });
    await mkdir(confDir, { recursive: true });
    await mkdir(cacheDir, { recursive: true });
    await mkdir(tmpDir, { recursive: true });
    await mkdir(requestsDir, { recursive: true });
    if (!existsSync(markerPath) || !existsSync(dbPath) || !existsSync(localSettingsPath)) {
      await rm(root, { recursive: true, force: true });
      await mkdir(sqliteDir, { recursive: true });
      await mkdir(confDir, { recursive: true });
      await mkdir(cacheDir, { recursive: true });
      await mkdir(tmpDir, { recursive: true });
      await mkdir(requestsDir, { recursive: true });
      await runCommand(
        this.phpBinary,
        [
          join(this.mediaWikiRoot, "maintenance", "install.php"),
          "--server",
          "https://ansaikuropedia.org",
          "--scriptpath",
          "",
          "--lang",
          "ja",
          "--dbtype",
          "sqlite",
          "--dbpath",
          sqliteDir,
          "--dbname",
          "ja_ucp_preview",
          "--dbuser",
          "",
          "--dbpass",
          "",
          "--pass",
          `Preview-${id}-Password`,
          "--confpath",
          confDir,
          "Uncyclopedia",
          "PreviewAdmin"
        ],
        { cwd: this.mediaWikiRoot }
      );
      await writeFile(localSettingsPath, createLocalSettings(this.mediaWikiRoot, sqliteDir, cacheDir, tmpDir), "utf8");
      await runCommand(
        this.phpBinary,
        [join(this.mediaWikiRoot, "maintenance", "update.php"), "--quick", "--conf", localSettingsPath],
        { cwd: this.mediaWikiRoot }
      );
      await this.installWikibaseClientEmptyRepoTables(dbPath);
      await writeFile(
        markerPath,
        JSON.stringify({ installedAt: (/* @__PURE__ */ new Date()).toISOString(), version: INSTALLATION_VERSION }, null, 2),
        "utf8"
      );
    }
    return { root, localSettingsPath, requestsDir };
  }
  async installWikibaseClientEmptyRepoTables(dbPath) {
    await runCommand(
      this.phpBinary,
      [
        "-r",
        [
          "$db = new SQLite3($argv[1]);",
          "$sql = str_replace('/*_*/', '', file_get_contents($argv[2]));",
          "$sql = preg_replace('/CREATE TABLE /', 'CREATE TABLE IF NOT EXISTS ', $sql);",
          "$sql = preg_replace('/CREATE UNIQUE INDEX /', 'CREATE UNIQUE INDEX IF NOT EXISTS ', $sql);",
          "$sql = preg_replace('/CREATE INDEX /', 'CREATE INDEX IF NOT EXISTS ', $sql);",
          "if (!$db->exec($sql)) { fwrite(STDERR, $db->lastErrorMsg()); exit(1); }"
        ].join(" "),
        dbPath,
        join(this.mediaWikiRoot, "extensions", "Wikibase", "repo", "sql", "sqlite", "wb_items_per_site.sql")
      ],
      { cwd: this.mediaWikiRoot }
    );
  }
  async assertPhpRuntime() {
    const output = await runCommand(
      this.phpBinary,
      [
        "-r",
        'echo PHP_VERSION, "\\n"; echo implode("\\n", get_loaded_extensions()), "\\n";'
      ],
      { cwd: process.cwd() }
    ).catch((error) => {
      throw new ExactMediaWikiSnapshotMissingError(
        `PHP CLI is required for exact MediaWiki rendering and was not executable as ${JSON.stringify(
          this.phpBinary
        )}. Install PHP 8.3 CLI with intl, mbstring, sqlite3, pdo_sqlite, xml, curl, and gd.`
      );
    });
    const lines = output.stdout.trim().split(/\r?\n/);
    const version = lines.shift() ?? "";
    const extensions = new Set(lines.map((line) => line.toLowerCase()));
    const missing = ["intl", "mbstring", "sqlite3", "pdo_sqlite", "xml", "curl", "gd"].filter(
      (extension) => !extensions.has(extension)
    );
    if (!version.startsWith("8.3.") || missing.length > 0) {
      throw new ExactMediaWikiRuntimeError(
        `Exact target requires PHP 8.3.x with MediaWiki runtime extensions. Detected PHP ${version}; missing: ${missing.length > 0 ? missing.join(", ") : "none"}.`
      );
    }
  }
};
function createNativePhpBackend(options = {}) {
  return new NativePhpBackend(options);
}
function createLocalSettings(mediaWikiRoot, sqliteDir, cacheDir, tmpDir) {
  const allowedUserFunctionNamespaces = [
    -1,
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    32,
    33,
    102,
    103,
    104,
    105,
    106,
    107,
    110,
    111,
    112,
    113,
    116,
    117,
    710,
    711,
    828,
    829,
    2300,
    2301,
    2302,
    2303
  ];
  return `<?php
# Generated by @kongyo2/ja-ucp-preview. This is not a DB snapshot.
$IP = ${phpString(mediaWikiRoot)};
$wgSitename = 'Uncyclopedia';
$wgMetaNamespace = 'Uncyclopedia';
$wgLanguageCode = 'ja';
$wgLocaltimezone = 'Asia/Tokyo';
$wgServer = 'https://ansaikuropedia.org';
$wgScriptPath = '';
$wgArticlePath = '/wiki/$1';
$wgUsePathInfo = true;
$wgDBtype = 'sqlite';
$wgDBserver = '';
$wgDBname = 'ja_ucp_preview';
$wgDBuser = '';
$wgDBpassword = '';
$wgSQLiteDataDir = ${phpString(sqliteDir)};
$wgMainCacheType = CACHE_NONE;
$wgParserCacheType = CACHE_NONE;
$wgMessageCacheType = CACHE_NONE;
$wgSessionCacheType = CACHE_NONE;
$wgCacheDirectory = ${phpString(cacheDir)};
$wgTmpDirectory = ${phpString(tmpDir)};
$wgEnableUploads = true;
$wgShellLocale = 'C.UTF-8';
$wgDefaultSkin = 'vector';
$wgLogo = '//images.uncyc.org/ja/b/bc/Wiki.png';
$wgFavicon = 'https://images.uncyc.org/ja/6/64/Favicon.ico';
$wgSecretKey = '0000000000000000000000000000000000000000000000000000000000000000';
$wgUpgradeKey = 'ja-ucp-preview';
$wgMaxArticleSize = 16384;
$wgCategoryCollation = 'uppercase';
$wgNoFollowLinks = true;
$wgNoFollowDomainExceptions = [ 'mediawiki.org' ];
$wgAllowUserCss = true;
$wgAllowUserJs = true;
$wgUseImageMagick = false;
$wgUseInstantCommons = false;
$wgThumbLimits = [ 120, 150, 180, 200, 250, 300 ];
$wgImageLimits = [
	[ 320, 240 ], [ 640, 480 ], [ 800, 600 ], [ 1024, 768 ], [ 1280, 1024 ], [ 2560, 2048 ]
];

if ( !defined( 'NS_PORTAL' ) ) { define( 'NS_PORTAL', 32 ); }
if ( !defined( 'NS_PORTAL_TALK' ) ) { define( 'NS_PORTAL_TALK', 33 ); }
if ( !defined( 'NS_UNNEWS' ) ) { define( 'NS_UNNEWS', 102 ); }
if ( !defined( 'NS_UNNEWS_TALK' ) ) { define( 'NS_UNNEWS_TALK', 103 ); }
if ( !defined( 'NS_UNDICTIONARY' ) ) { define( 'NS_UNDICTIONARY', 104 ); }
if ( !defined( 'NS_UNDICTIONARY_TALK' ) ) { define( 'NS_UNDICTIONARY_TALK', 105 ); }
if ( !defined( 'NS_GAME' ) ) { define( 'NS_GAME', 106 ); }
if ( !defined( 'NS_GAME_TALK' ) ) { define( 'NS_GAME_TALK', 107 ); }
if ( !defined( 'NS_FORUM' ) ) { define( 'NS_FORUM', 110 ); }
if ( !defined( 'NS_FORUM_TALK' ) ) { define( 'NS_FORUM_TALK', 111 ); }
if ( !defined( 'NS_UNTUNES' ) ) { define( 'NS_UNTUNES', 112 ); }
if ( !defined( 'NS_UNTUNES_TALK' ) ) { define( 'NS_UNTUNES_TALK', 113 ); }
if ( !defined( 'NS_UNBOOKS' ) ) { define( 'NS_UNBOOKS', 116 ); }
if ( !defined( 'NS_UNBOOKS_TALK' ) ) { define( 'NS_UNBOOKS_TALK', 117 ); }
if ( !defined( 'NS_TIMEDTEXT' ) ) { define( 'NS_TIMEDTEXT', 710 ); }
if ( !defined( 'NS_TIMEDTEXT_TALK' ) ) { define( 'NS_TIMEDTEXT_TALK', 711 ); }

$wgExtraNamespaces[32] = 'Portal';
$wgExtraNamespaces[33] = 'Portal_talk';
$wgExtraNamespaces[102] = 'UnNews';
$wgExtraNamespaces[103] = 'UnNews_talk';
$wgExtraNamespaces[104] = 'Undictionary';
$wgExtraNamespaces[105] = 'Undictionary_talk';
$wgExtraNamespaces[106] = 'Game';
$wgExtraNamespaces[107] = 'Game_talk';
$wgExtraNamespaces[110] = 'Forum';
$wgExtraNamespaces[111] = 'Forum_talk';
$wgExtraNamespaces[112] = 'UnTunes';
$wgExtraNamespaces[113] = 'UnTunes_talk';
$wgExtraNamespaces[116] = 'UnBooks';
$wgExtraNamespaces[117] = 'UnBooks_talk';
$wgExtraNamespaces[710] = 'TimedText';
$wgExtraNamespaces[711] = 'TimedText_talk';
$wgExtraNamespaces[2300] = 'Gadget';
$wgExtraNamespaces[2301] = 'Gadget_talk';
$wgExtraNamespaces[2302] = 'Gadget_definition';
$wgExtraNamespaces[2303] = 'Gadget_definition_talk';

$wgNamespacesWithSubpages[2] = true;
$wgNamespacesWithSubpages[3] = true;
$wgNamespacesWithSubpages[4] = true;
$wgNamespacesWithSubpages[5] = true;
$wgNamespacesWithSubpages[10] = true;
$wgNamespacesWithSubpages[11] = true;
$wgNamespacesWithSubpages[12] = true;
$wgNamespacesWithSubpages[13] = true;
$wgNamespacesWithSubpages[828] = true;
$wgNamespacesWithSubpages[829] = true;
$wgNamespaceAliases['\u30CE\u30FC\u30C8'] = NS_TALK;
$wgNamespaceAliases['\u5229\u7528\u8005\u2010\u4F1A\u8A71'] = NS_USER_TALK;
$wgNamespaceAliases['Uncyclopedia\u2010\u30CE\u30FC\u30C8'] = NS_PROJECT_TALK;
$wgNamespaceAliases['Image'] = NS_FILE;
$wgNamespaceAliases['\u753B\u50CF'] = NS_FILE;
$wgNamespaceAliases['Image talk'] = NS_FILE_TALK;
$wgNamespaceAliases['\u30D5\u30A1\u30A4\u30EB\u2010\u30CE\u30FC\u30C8'] = NS_FILE_TALK;
$wgNamespaceAliases['\u753B\u50CF\u2010\u30CE\u30FC\u30C8'] = NS_FILE_TALK;
$wgNamespaceAliases['MediaWiki\u2010\u30CE\u30FC\u30C8'] = NS_MEDIAWIKI_TALK;
$wgNamespaceAliases['Template\u2010\u30CE\u30FC\u30C8'] = NS_TEMPLATE_TALK;
$wgNamespaceAliases['Help\u2010\u30CE\u30FC\u30C8'] = NS_HELP_TALK;
$wgNamespaceAliases['Category\u2010\u30CE\u30FC\u30C8'] = NS_CATEGORY_TALK;

$wgUFEnabledPersonalDataFunctions = [ 'realname', 'username', 'useremail', 'nickname', 'ip' ];
$wgUFAllowedNamespaces = ${phpArrayFromNumberKeys(allowedUserFunctionNamespaces)};
$wgScribuntoDefaultEngine = 'luastandalone';
$wgScribuntoEngineConf['luastandalone']['luaPath'] = '/usr/bin/lua5.1';
$wgWBClientSettings['siteGlobalID'] = 'uncyc_ja';
$wgWBClientSettings['repoUrl'] = 'https://www.wikidata.org';
$wgWBClientSettings['repoArticlePath'] = '/wiki/$1';
$wgWBClientSettings['repoScriptPath'] = '/w';
$wgWBClientSettings['repoSiteName'] = 'Wikidata';
$wgWBClientSettings['entitySources'] = [
	'wikidata' => [
		'repoDatabase' => false,
		'baseUri' => 'http://www.wikidata.org/entity/',
		'entityNamespaces' => [ 'item' => 0, 'property' => 120 ],
		'rdfNodeNamespacePrefix' => 'wd',
		'rdfPredicateNamespacePrefix' => '',
		'interwikiPrefix' => 'd',
	],
];
$wgWBClientSettings['itemAndPropertySourceName'] = 'wikidata';
$wgWBClientSettings['allowDataAccessInUserLanguage'] = false;

${SKINS.map((skin) => `wfLoadSkin( '${skin}' );`).join("\n")}
require_once $IP . '/extensions/MultiMaps/MultiMaps.php';
require_once $IP . '/extensions/Wikibase/vendor/autoload.php';
wfLoadExtension( 'WikibaseClient', $IP . '/extensions/Wikibase/extension-client.json' );
${RENDER_EXTENSIONS.map((extension) => `wfLoadExtension( '${extension}' );`).join("\n")}
$wgHooks['ParserFirstCallInit'][] = static function ( $parser ) {
	$parser->setHook( 'css', static function ( $input, $args, $parser, $frame ) {
		CSS::CSSRender( $parser, (string)$input );
		return '';
	} );
	return true;
};
`;
}
function assertMediaWikiRoot(mediaWikiRoot) {
  if (!existsSync(join(mediaWikiRoot, "includes", "WebStart.php")) || !existsSync(join(mediaWikiRoot, "autoload.php"))) {
    throw new ExactMediaWikiSnapshotMissingError(
      `MediaWiki 1.39.3 root was not found at ${mediaWikiRoot}. Bundle or configure the official MediaWiki tree.`
    );
  }
}
function assertBridge(bridgePath) {
  if (!existsSync(bridgePath)) {
    throw new ExactMediaWikiSnapshotMissingError(`MediaWiki render bridge was not found at ${bridgePath}.`);
  }
}
function assertBundledExtensionDependencies(mediaWikiRoot) {
  const templateStylesAutoload = join(mediaWikiRoot, "extensions", "TemplateStyles", "vendor", "autoload.php");
  if (!existsSync(templateStylesAutoload)) {
    throw new ExactMediaWikiSnapshotMissingError(
      `TemplateStyles composer dependencies are missing at ${templateStylesAutoload}. Run composer install --no-dev in extensions/TemplateStyles before packing.`
    );
  }
  const wikibaseAutoload = join(mediaWikiRoot, "extensions", "Wikibase", "vendor", "autoload.php");
  if (!existsSync(wikibaseAutoload)) {
    throw new ExactMediaWikiSnapshotMissingError(
      `WikibaseClient composer dependencies are missing at ${wikibaseAutoload}. Run composer install --no-dev in extensions/Wikibase before packing.`
    );
  }
}
function findPackageRoot() {
  let current = dirname(fileURLToPath(import.meta.url));
  while (current !== dirname(current)) {
    if (existsSync(join(current, "package.json")) && existsSync(join(current, "vendor", "mediawiki-1.39.3"))) {
      return current;
    }
    current = dirname(current);
  }
  throw new ExactMediaWikiSnapshotMissingError("Cannot locate package root with bundled MediaWiki 1.39.3.");
}
function phpString(value) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function phpArrayFromNumberKeys(keys) {
  return `[ ${keys.map((key) => `${key} => true`).join(", ")} ]`;
}
function normalizeDateInput(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  return value;
}
function siteStyleTitlesForSkin(skin) {
  const normalizedSkin = skin.toLowerCase();
  const [commonStyleTitle, ...defaultStyleTitles] = jaUncyclopediaDefaultStyleTitles;
  return [
    commonStyleTitle,
    ...jaUncyclopediaSkinStyleTitles[normalizedSkin] ?? [],
    ...defaultStyleTitles
  ];
}
function runCommand(command, args, options) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, MW_INSTALL_PATH: options.cwd },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      };
      if (code === 0) {
        resolveCommand(output);
        return;
      }
      reject(
        new ExactMediaWikiRuntimeError(
          `${command} ${args.join(" ")} exited with ${code}.
STDOUT:
${output.stdout}
STDERR:
${output.stderr}`
        )
      );
    });
  });
}

// src/site/snapshot.ts
var jaUncyclopediaSnapshot = {
  id: "uncyc_ja",
  capturedAt: "2026-04-25T03:59:12Z",
  generator: "MediaWiki 1.39.3",
  phpVersion: "8.3.6",
  lang: "ja",
  timezone: "Asia/Tokyo",
  server: "https://ansaikuropedia.org",
  articlePath: "/wiki/$1",
  scriptPath: "",
  mainPage: "\u30E1\u30A4\u30F3\u30DA\u30FC\u30B8",
  namespaces: {
    "-2": { id: -2, name: "\u30E1\u30C7\u30A3\u30A2", canonical: "Media", case: "first-letter" },
    "-1": { id: -1, name: "\u7279\u5225", canonical: "Special", case: "first-letter", subpages: true },
    0: { id: 0, name: "", case: "first-letter", content: true },
    1: { id: 1, name: "\u30C8\u30FC\u30AF", canonical: "Talk", case: "first-letter", subpages: true },
    2: { id: 2, name: "\u5229\u7528\u8005", canonical: "User", case: "first-letter", subpages: true },
    3: {
      id: 3,
      name: "\u5229\u7528\u8005\u30FB\u30C8\u30FC\u30AF",
      canonical: "User talk",
      case: "first-letter",
      subpages: true
    },
    4: {
      id: 4,
      name: "Uncyclopedia",
      canonical: "Project",
      case: "first-letter",
      subpages: true
    },
    5: {
      id: 5,
      name: "Uncyclopedia\u30FB\u30C8\u30FC\u30AF",
      canonical: "Project talk",
      case: "first-letter",
      subpages: true
    },
    6: { id: 6, name: "\u30D5\u30A1\u30A4\u30EB", canonical: "File", case: "first-letter" },
    7: {
      id: 7,
      name: "\u30D5\u30A1\u30A4\u30EB\u30FB\u30C8\u30FC\u30AF",
      canonical: "File talk",
      case: "first-letter",
      subpages: true
    },
    8: {
      id: 8,
      name: "MediaWiki",
      canonical: "MediaWiki",
      case: "first-letter",
      subpages: true
    },
    9: {
      id: 9,
      name: "MediaWiki\u30FB\u30C8\u30FC\u30AF",
      canonical: "MediaWiki talk",
      case: "first-letter",
      subpages: true
    },
    10: { id: 10, name: "\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8", canonical: "Template", case: "first-letter", subpages: true },
    11: {
      id: 11,
      name: "\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u30FB\u30C8\u30FC\u30AF",
      canonical: "Template talk",
      case: "first-letter",
      subpages: true
    },
    12: { id: 12, name: "\u30D8\u30EB\u30D7", canonical: "Help", case: "first-letter", subpages: true },
    13: { id: 13, name: "\u30D8\u30EB\u30D7\u30FB\u30C8\u30FC\u30AF", canonical: "Help talk", case: "first-letter", subpages: true },
    14: { id: 14, name: "\u30AB\u30C6\u30B4\u30EA", canonical: "Category", case: "first-letter" },
    15: {
      id: 15,
      name: "\u30AB\u30C6\u30B4\u30EA\u30FB\u30C8\u30FC\u30AF",
      canonical: "Category talk",
      case: "first-letter",
      subpages: true
    },
    32: { id: 32, name: "Portal", canonical: "Portal", case: "first-letter" },
    33: { id: 33, name: "Portal talk", canonical: "Portal talk", case: "first-letter" },
    102: { id: 102, name: "UnNews", canonical: "UnNews", case: "first-letter" },
    103: { id: 103, name: "UnNews talk", canonical: "UnNews talk", case: "first-letter" },
    104: { id: 104, name: "Undictionary", canonical: "Undictionary", case: "first-letter" },
    105: {
      id: 105,
      name: "Undictionary talk",
      canonical: "Undictionary talk",
      case: "first-letter"
    },
    106: { id: 106, name: "Game", canonical: "Game", case: "first-letter" },
    107: { id: 107, name: "Game talk", canonical: "Game talk", case: "first-letter" },
    110: { id: 110, name: "Forum", canonical: "Forum", case: "first-letter" },
    111: { id: 111, name: "Forum talk", canonical: "Forum talk", case: "first-letter" },
    112: { id: 112, name: "UnTunes", canonical: "UnTunes", case: "first-letter" },
    113: { id: 113, name: "UnTunes talk", canonical: "UnTunes talk", case: "first-letter" },
    116: { id: 116, name: "UnBooks", canonical: "UnBooks", case: "first-letter" },
    117: { id: 117, name: "UnBooks talk", canonical: "UnBooks talk", case: "first-letter" },
    710: { id: 710, name: "TimedText", canonical: "TimedText", case: "first-letter" },
    711: { id: 711, name: "TimedText talk", canonical: "TimedText talk", case: "first-letter" },
    828: { id: 828, name: "\u30E2\u30B8\u30E5\u30FC\u30EB", canonical: "Module", case: "first-letter", subpages: true },
    829: {
      id: 829,
      name: "\u30E2\u30B8\u30E5\u30FC\u30EB\u30FB\u30C8\u30FC\u30AF",
      canonical: "Module talk",
      case: "first-letter",
      subpages: true
    },
    2300: { id: 2300, name: "Gadget", canonical: "Gadget", case: "case-sensitive" },
    2301: { id: 2301, name: "Gadget talk", canonical: "Gadget talk", case: "case-sensitive" },
    2302: {
      id: 2302,
      name: "Gadget definition",
      canonical: "Gadget definition",
      case: "case-sensitive"
    },
    2303: {
      id: 2303,
      name: "Gadget definition talk",
      canonical: "Gadget definition talk",
      case: "case-sensitive"
    }
  },
  namespaceAliases: {
    media: -2,
    "\u30E1\u30C7\u30A3\u30A2": -2,
    special: -1,
    "\u7279\u5225": -1,
    talk: 1,
    "\u30C8\u30FC\u30AF": 1,
    "\u30CE\u30FC\u30C8": 1,
    user: 2,
    "\u5229\u7528\u8005": 2,
    "user talk": 3,
    "\u5229\u7528\u8005\u30FB\u30C8\u30FC\u30AF": 3,
    "\u5229\u7528\u8005\u2010\u4F1A\u8A71": 3,
    project: 4,
    uncyclopedia: 4,
    "uncyclopedia\u2010\u30CE\u30FC\u30C8": 5,
    file: 6,
    image: 6,
    "\u30D5\u30A1\u30A4\u30EB": 6,
    "\u753B\u50CF": 6,
    "file talk": 7,
    "image talk": 7,
    "\u30D5\u30A1\u30A4\u30EB\u30FB\u30C8\u30FC\u30AF": 7,
    "\u30D5\u30A1\u30A4\u30EB\u2010\u30CE\u30FC\u30C8": 7,
    "\u753B\u50CF\u2010\u30CE\u30FC\u30C8": 7,
    mediawiki: 8,
    "mediawiki\u30FB\u30C8\u30FC\u30AF": 9,
    "mediawiki\u2010\u30CE\u30FC\u30C8": 9,
    template: 10,
    "\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8": 10,
    "template talk": 11,
    "\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u30FB\u30C8\u30FC\u30AF": 11,
    "template\u2010\u30CE\u30FC\u30C8": 11,
    help: 12,
    "\u30D8\u30EB\u30D7": 12,
    "help talk": 13,
    "\u30D8\u30EB\u30D7\u30FB\u30C8\u30FC\u30AF": 13,
    "help\u2010\u30CE\u30FC\u30C8": 13,
    category: 14,
    "\u30AB\u30C6\u30B4\u30EA": 14,
    "category talk": 15,
    "\u30AB\u30C6\u30B4\u30EA\u30FB\u30C8\u30FC\u30AF": 15,
    "category\u2010\u30CE\u30FC\u30C8": 15,
    module: 828,
    "\u30E2\u30B8\u30E5\u30FC\u30EB": 828
  },
  extensions: [
    { name: "MultiMaps", type: "parserhook", version: "0.7.3" },
    { name: "CategoryTree", type: "parserhook", version: null },
    { name: "Cite", type: "parserhook", version: null },
    { name: "EmbedVideo", type: "parserhook", version: "2.8.0" },
    { name: "ImageMap", type: "parserhook", version: null },
    { name: "InputBox", type: "parserhook", version: "0.3.0" },
    { name: "ParserFunctions", type: "parserhook", version: "1.6.0" },
    { name: "Poem", type: "parserhook", version: null },
    { name: "SyntaxHighlight", type: "parserhook", version: "2.0" },
    { name: "TemplateStyles", type: "parserhook", version: "1.0" },
    { name: "Variables", type: "parserhook", version: "2.5.1" },
    { name: "SimpleMathJax", type: "parserhook", version: "0.8.3" },
    { name: "RSS feed", type: "parserhook", version: "2.25.1" },
    { name: "UserFunctions", type: "parserhook", version: "2.8.1" },
    { name: "UrlGetParameters", type: "parserhook", version: "1.6.0" },
    { name: "AddHTMLMetaAndTitle", type: "parserhook", version: "0.7" },
    { name: "CharInsert", type: "parserhook", version: null },
    { name: "YouTube", type: "parserhook", version: "1.9.3" },
    { name: "Josa", type: "parserhook", version: "0.2.0" },
    { name: "Babel", type: "parserhook", version: "1.12.0" },
    { name: "CSS", type: "parserhook", version: "3.5.0" },
    { name: "DynamicPageList3", type: "parserhook", version: "3.3.8" },
    { name: "DPLforum", type: "parserhook", version: "3.7.2" },
    { name: "LogoFunctions", type: "parserhook", version: "2.1" },
    { name: "RandomSelection", type: "parserhook", version: "2.3.0" },
    { name: "RandomImage", type: "parserhook", version: "1.5.1" },
    { name: "Spoilers", type: "parserhook", version: "2.2.3" },
    { name: "Scribunto", type: "parserhook", version: null },
    { name: "SimpleTooltip", type: "other", version: "1.1.0" },
    { name: "Gadgets", type: "other", version: null },
    { name: "LocalisationUpdate", type: "other", version: "1.4.0" },
    { name: "MultimediaViewer", type: "other", version: null },
    { name: "OATHAuth", type: "other", version: "0.5.0" },
    { name: "Thanks", type: "other", version: "1.2.0" },
    { name: "MobileFrontend", type: "other", version: "2.4.0" },
    { name: "TextExtracts", type: "other", version: null },
    { name: "Popups", type: "other", version: null },
    { name: "DismissableSiteNotice", type: "other", version: "1.0.1" },
    { name: "Highly Automated Welcome Tool", type: "other", version: "0.8.3" },
    { name: "RevisionSlider", type: "other", version: null },
    { name: "SandboxLink", type: "other", version: null },
    { name: "TwoColConflict", type: "other", version: null },
    { name: "CommonsMetadata", type: "other", version: null },
    { name: "WikiLove", type: "other", version: "1.3.1" },
    { name: "WikibaseClient", type: "wikibase", version: null },
    { name: "MonoBook", type: "skin", version: null },
    { name: "Timeless", type: "skin", version: "0.9.1" },
    { name: "Vector", type: "skin", version: "1.0.0" },
    { name: "Cologne Blue", type: "skin", version: null },
    { name: "Modern", type: "skin", version: null },
    { name: "MinervaNeue", type: "skin", version: null },
    { name: "CiteThisPage", type: "specialpage", version: null },
    { name: "Global Usage", type: "specialpage", version: "2.2.0" },
    { name: "Interwiki", type: "specialpage", version: "3.2" },
    { name: "CreatedPagesList", type: "specialpage", version: "1.2.1" },
    { name: "Echo", type: "specialpage", version: null },
    { name: "Poll", type: "specialpage", version: "2.0" },
    { name: "Contributors", type: "specialpage", version: "2.0" },
    { name: "MassMessage", type: "specialpage", version: "0.4.0" },
    { name: "CheckUser", type: "specialpage", version: "2.5" },
    { name: "DeleteBatch", type: "specialpage", version: "1.8.1" },
    { name: "Newest Pages", type: "specialpage", version: "1.22" },
    { name: "Nuke", type: "specialpage", version: null },
    { name: "Replace Text", type: "specialpage", version: "1.7" },
    { name: "Renameuser", type: "specialpage", version: null },
    { name: "RefreshSpecial", type: "specialpage", version: "1.6.0" },
    { name: "TemplateSandbox", type: "specialpage", version: "1.1.0" },
    { name: "Editcount", type: "specialpage", version: null },
    { name: "UserMerge", type: "specialpage", version: "1.10.1" },
    { name: "MassEditRegex", type: "specialpage", version: "8.4.1" },
    { name: "CodeEditor", type: "editor", version: null },
    { name: "WikiEditor", type: "editor", version: "0.5.3" },
    { name: "CodeMirror", type: "editor", version: "4.0.0" },
    { name: "PDF Handler", type: "media", version: null },
    { name: "TimedMediaHandler", type: "media", version: "0.6.0" },
    { name: "SpamBlacklist", type: "antispam", version: null },
    { name: "SmiteSpam", type: "antispam", version: "0.4" },
    { name: "TitleBlacklist", type: "antispam", version: "1.5.0" },
    { name: "Antispam by CleanTalk", type: "antispam", version: "2.3" },
    { name: "ConfirmEdit", type: "antispam", version: "1.6.0" },
    { name: "ReCaptchaNoCaptcha", type: "antispam", version: null },
    { name: "Abuse Filter", type: "antispam", version: null },
    { name: "PageImages", type: "api", version: null }
  ],
  extensionTags: [
    "pre",
    "nowiki",
    "gallery",
    "indicator",
    "langconvert",
    "css",
    "embedvideo",
    "evlplayer",
    "vplayer",
    "archiveorg",
    "bambuser",
    "bambuser_channel",
    "beam",
    "disclose",
    "blip",
    "bing",
    "collegehumor",
    "dailymotion",
    "divshare",
    "facebook",
    "funnyordie",
    "gfycat",
    "jwplayer",
    "kickstarter",
    "mediacccde",
    "metacafe",
    "microsoftstream",
    "mixer",
    "nico",
    "rutube",
    "smashcast",
    "soundcloud",
    "spotifyalbum",
    "spotifyartist",
    "spotifytrack",
    "teachertube",
    "ted",
    "tubitv",
    "tudou",
    "tvpot",
    "twitch",
    "twitchclip",
    "twitchvod",
    "videomaten",
    "vimeo",
    "vine",
    "yahoo",
    "youtube",
    "youtubeplaylist",
    "youtubevideolist",
    "youku",
    "source",
    "syntaxhighlight",
    "templatestyles",
    "math",
    "chem",
    "rss",
    "seo",
    "aovideo",
    "aoaudio",
    "wegame",
    "tangler",
    "gtrailer",
    "nicovideo",
    "dpl",
    "dynamicpagelist",
    "forum",
    "choose",
    "randomimage",
    "spoiler",
    "categorytree",
    "ref",
    "references",
    "imagemap",
    "inputbox",
    "poem",
    "charinsert"
  ],
  functionHooks: [
    "ns",
    "nse",
    "urlencode",
    "lcfirst",
    "ucfirst",
    "lc",
    "uc",
    "localurl",
    "localurle",
    "fullurl",
    "fullurle",
    "canonicalurl",
    "canonicalurle",
    "formatnum",
    "grammar",
    "gender",
    "plural",
    "bidi",
    "numberofpages",
    "numberofusers",
    "numberofactiveusers",
    "numberofarticles",
    "numberoffiles",
    "numberofadmins",
    "numberingroup",
    "numberofedits",
    "language",
    "padleft",
    "padright",
    "anchorencode",
    "defaultsort",
    "filepath",
    "pagesincategory",
    "pagesize",
    "protectionlevel",
    "protectionexpiry",
    "namespace",
    "namespacee",
    "namespacenumber",
    "talkspace",
    "talkspacee",
    "subjectspace",
    "subjectspacee",
    "pagename",
    "pagenamee",
    "fullpagename",
    "fullpagenamee",
    "rootpagename",
    "rootpagenamee",
    "basepagename",
    "basepagenamee",
    "subpagename",
    "subpagenamee",
    "talkpagename",
    "talkpagenamee",
    "subjectpagename",
    "subjectpagenamee",
    "pageid",
    "revisionid",
    "revisionday",
    "revisionday2",
    "revisionmonth",
    "revisionmonth1",
    "revisionyear",
    "revisiontimestamp",
    "revisionuser",
    "cascadingsources",
    "int",
    "special",
    "speciale",
    "tag",
    "formatdate",
    "displaytitle",
    "pagesinnamespace",
    "multimaps",
    "simple-tooltip",
    "tip-text",
    "simple-tooltip-info",
    "tip-info",
    "simple-tooltip-img",
    "tip-img",
    "ev",
    "evt",
    "evp",
    "evu",
    "evl",
    "vlink",
    "var",
    "varexists",
    "var_final",
    "vardefine",
    "vardefineecho",
    "ifanon",
    "ifblocked",
    "ifsysop",
    "ifingroup",
    "username",
    "realname",
    "nickname",
    "useremail",
    "ip",
    "urlget",
    "contributors",
    "target",
    "Eul/Ruel",
    "Eun/Neun",
    "E/Ga",
    "Gwa/Wa",
    "A/Ya",
    "Euro/Ro",
    "E/",
    "babel",
    "css",
    "dpl",
    "dplnum",
    "dplvar",
    "dplreplace",
    "dplchapter",
    "dplmatrix",
    "forumlink",
    "setlogo",
    "stamplogo",
    "choose",
    "spoiler",
    "invoke",
    "noexternallanglinks",
    "property",
    "statements",
    "commaSeparatedList",
    "categorytree",
    "if",
    "ifeq",
    "switch",
    "ifexist",
    "ifexpr",
    "iferror",
    "time",
    "timel",
    "expr",
    "rel2abs",
    "titleparts",
    "len",
    "pos",
    "rpos",
    "sub",
    "count",
    "replace",
    "explode",
    "urldecode"
  ],
  variables: [
    "!",
    "=",
    "currentmonth",
    "currentmonth1",
    "currentmonthname",
    "currentmonthnamegen",
    "currentmonthabbrev",
    "currentday",
    "currentday2",
    "currentdayname",
    "currentyear",
    "currenttime",
    "currenthour",
    "localmonth",
    "localmonth1",
    "localmonthname",
    "localmonthnamegen",
    "localmonthabbrev",
    "localday",
    "localday2",
    "localdayname",
    "localyear",
    "localtime",
    "localhour",
    "numberofarticles",
    "numberoffiles",
    "numberofedits",
    "articlepath",
    "pageid",
    "sitename",
    "server",
    "servername",
    "scriptpath",
    "stylepath",
    "pagename",
    "pagenamee",
    "fullpagename",
    "fullpagenamee",
    "namespace",
    "namespacee",
    "namespacenumber",
    "currentweek",
    "currentdow",
    "localweek",
    "localdow",
    "revisionid",
    "revisionday",
    "revisionday2",
    "revisionmonth",
    "revisionmonth1",
    "revisionyear",
    "revisiontimestamp",
    "revisionuser",
    "revisionsize",
    "subpagename",
    "subpagenamee",
    "talkspace",
    "talkspacee",
    "subjectspace",
    "subjectspacee",
    "talkpagename",
    "talkpagenamee",
    "subjectpagename",
    "subjectpagenamee",
    "numberofusers",
    "numberofactiveusers",
    "numberofpages",
    "currentversion",
    "rootpagename",
    "rootpagenamee",
    "basepagename",
    "basepagenamee",
    "currenttimestamp",
    "localtimestamp",
    "directionmark",
    "contentlanguage",
    "pagelanguage",
    "numberofadmins",
    "cascadingsources",
    "choose",
    "noexternallanglinks",
    "wbreponame"
  ]
};

// src/renderer.ts
var JaUcpRenderer = class {
  backend;
  context;
  constructor(options = {}) {
    this.backend = options.backend ?? new NativePhpBackend();
    this.context = {
      site: options.site ?? jaUncyclopediaSnapshot,
      defaultUser: options.user ?? { username: "\u3042\u306A\u305F", anonymous: true, groups: [] },
      strict: options.strict ?? false
    };
  }
  render(request) {
    return this.backend.render(request, this.context);
  }
};
function createJaUcpRenderer(options = {}) {
  return new JaUcpRenderer(options);
}

// src/site/title.ts
function normalizeTitleText(input) {
  return input.replace(/_/g, " ").replace(/[ \t\r\n]+/g, " ").trim();
}
function parseTitle(input, site) {
  const normalized = normalizeTitleText(input || site.mainPage);
  const firstColon = normalized.indexOf(":");
  let namespaceId = 0;
  let text = normalized;
  if (firstColon > -1) {
    const prefix2 = normalized.slice(0, firstColon);
    const prefixKey = prefix2.toLowerCase();
    const aliasId = site.namespaceAliases[prefixKey];
    const canonicalId = Object.values(site.namespaces).find(
      (ns) => ns.name.toLowerCase() === prefixKey || ns.canonical !== void 0 && ns.canonical.toLowerCase() === prefixKey
    )?.id;
    const foundId = aliasId ?? canonicalId;
    if (foundId !== void 0) {
      namespaceId = foundId;
      text = normalized.slice(firstColon + 1);
    }
  }
  const namespace = site.namespaces[namespaceId] ?? site.namespaces[0];
  if (!namespace) {
    throw new Error(`Unknown namespace ${namespaceId}`);
  }
  text = normalizeTitleCase(text, namespace.case);
  const prefix = namespaceId === 0 ? "" : namespace.name;
  const fullText = prefix ? `${prefix}:${text}` : text;
  const parts = text.split("/");
  const rootText = parts[0] ?? text;
  const baseText = parts.length > 1 ? parts.slice(0, -1).join("/") : text;
  const subpageText = parts.length > 1 ? parts[parts.length - 1] ?? text : text;
  return {
    prefixedText: fullText,
    namespaceId,
    namespace,
    dbKey: fullText.replace(/ /g, "_"),
    text,
    fullText,
    baseText,
    rootText,
    subpageText,
    talkPageText: talkPageFor(namespaceId, text, site),
    subjectPageText: subjectPageFor(namespaceId, text, site)
  };
}
function normalizeTitleCase(title, mode) {
  const trimmed = normalizeTitleText(title);
  if (mode === "case-sensitive" || trimmed.length === 0) {
    return trimmed;
  }
  return trimmed.charAt(0).toLocaleUpperCase("ja-JP") + trimmed.slice(1);
}
function talkPageFor(namespaceId, text, site) {
  const talkId = namespaceId % 2 === 0 ? namespaceId + 1 : namespaceId;
  const ns = site.namespaces[talkId];
  return ns && talkId !== 0 ? `${ns.name}:${text}` : text;
}
function subjectPageFor(namespaceId, text, site) {
  const subjectId = namespaceId % 2 === 1 ? namespaceId - 1 : namespaceId;
  const ns = site.namespaces[subjectId];
  return ns && subjectId !== 0 ? `${ns.name}:${text}` : text;
}
function pageUrl(title, site) {
  const encoded = encodeURIComponent(normalizeTitleText(title).replace(/ /g, "_")).replace(
    /%2F/g,
    "/"
  );
  return `${site.server}${site.articlePath.replace("$1", encoded)}`;
}
export {
  ExactMediaWikiRuntimeError,
  ExactMediaWikiSnapshotMissingError,
  JaUcpRenderer,
  NativePhpBackend,
  PhpWasmBackend,
  createJaUcpRenderer,
  createNativePhpBackend,
  createPhpWasmBackend,
  jaUncyclopediaDefaultStyleTitles,
  jaUncyclopediaSiteStylePages,
  jaUncyclopediaSkinStyleTitles,
  jaUncyclopediaSnapshot,
  normalizeTitleText,
  pageUrl,
  parseTitle
};
//# sourceMappingURL=index.js.map