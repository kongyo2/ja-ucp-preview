import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const mediaWikiRoot = join(root, "vendor", "mediawiki-1.39.3");
const extensionRoot = join(mediaWikiRoot, "extensions");
const skinRoot = join(mediaWikiRoot, "skins");

const repositories = [
  { name: "TemplateStyles" },
  { name: "Variables" },
  {
    name: "EmbedVideo",
    fallbacks: [
      ["clone", "--depth", "1", "--branch", "v2.8.0", "https://github.com/StarCitizenTools/mediawiki-extensions-EmbedVideo.git"]
    ]
  },
  { name: "CSS" },
  {
    name: "DynamicPageList3",
    fallbacks: [
      ["clone", "--depth", "1", "--branch", "REL1_39", "https://github.com/Universal-Omega/DynamicPageList3.git"]
    ]
  },
  { name: "DPLforum" },
  { name: "LogoFunctions" },
  { name: "RandomSelection" },
  { name: "RandomImage" },
  {
    name: "Spoilers",
    fallbacks: [
      ["clone", "--depth", "1", "--branch", "2.2.3", "https://github.com/Telshin/Spoilers.git"],
      ["clone", "--depth", "1", "https://github.com/Telshin/Spoilers.git"]
    ]
  },
  {
    name: "SimpleTooltip",
    fallbacks: [
      ["clone", "--depth", "1", "--branch", "1.1.0", "https://github.com/gesinn-it-pub/SimpleTooltip.git"],
      ["clone", "--depth", "1", "https://github.com/gesinn-it-pub/SimpleTooltip.git"]
    ]
  },
  { name: "UserFunctions" },
  { name: "UrlGetParameters" },
  { name: "Babel" },
  { name: "MultiMaps" },
  { name: "YouTube" },
  { name: "Josa" },
  { name: "AddHTMLMetaAndTitle" },
  { name: "RSS" },
  {
    name: "SimpleMathJax",
    fallbacks: [["clone", "--depth", "1", "--branch", "v0.8.3", "https://github.com/jmnote/SimpleMathJax.git"]]
  },
  { name: "CharInsert" },
  { name: "CommonsMetadata" },
  { name: "DismissableSiteNotice" },
  { name: "LocalisationUpdate" },
  { name: "HAWelcome" },
  { name: "GlobalUsage" },
  { name: "CreatedPagesList" },
  { name: "Poll" },
  { name: "Contributors" },
  { name: "MassMessage" },
  { name: "MobileFrontend" },
  { name: "Popups" },
  { name: "RevisionSlider" },
  { name: "SandboxLink" },
  { name: "Thanks" },
  { name: "TwoColConflict" },
  { name: "WikiLove" },
  { name: "Echo" },
  { name: "CheckUser" },
  { name: "DeleteBatch" },
  { name: "NewestPages" },
  { name: "RefreshSpecial" },
  { name: "TemplateSandbox" },
  { name: "Editcount" },
  { name: "UserMerge" },
  { name: "MassEditRegex" },
  { name: "CodeMirror" },
  { name: "TimedMediaHandler" },
  { name: "SmiteSpam" },
  {
    name: "Antispam",
    fallbacks: [
      ["clone", "--depth", "1", "--branch", "2.3", "https://github.com/CleanTalk/mediawiki-antispam.git"],
      ["clone", "--depth", "1", "https://github.com/CleanTalk/mediawiki-antispam.git"]
    ]
  },
  { name: "Wikibase" }
];

const skins = [{ name: "CologneBlue" }, { name: "Modern" }];

await mkdir(extensionRoot, { recursive: true });

for (const repo of repositories) {
  const target = join(extensionRoot, repo.name);
  if (existsSync(target)) {
    console.log(`${repo.name}: present`);
    continue;
  }

  const url = `https://gerrit.wikimedia.org/r/mediawiki/extensions/${repo.name}`;
  const cloned = await tryGit(["clone", "--depth", "1", "--branch", "REL1_39", url, target]);
  if (cloned) {
    console.log(`${repo.name}: REL1_39`);
    continue;
  }

  const fallback = await tryGit(["clone", "--depth", "1", url, target]);
  if (fallback) {
    console.log(`${repo.name}: default`);
    continue;
  }

  let thirdParty = false;
  for (const fallbackArgs of repo.fallbacks ?? []) {
    thirdParty = await tryGit([...fallbackArgs, target]);
    if (thirdParty) {
      break;
    }
  }
  console.log(`${repo.name}: ${thirdParty ? "third-party" : "failed"}`);
}

await mkdir(skinRoot, { recursive: true });

for (const skin of skins) {
  const target = join(skinRoot, skin.name);
  if (existsSync(target)) {
    console.log(`skin:${skin.name}: present`);
    continue;
  }

  const url = `https://gerrit.wikimedia.org/r/mediawiki/skins/${skin.name}`;
  const cloned = await tryGit(["clone", "--depth", "1", "--branch", "REL1_39", url, target]);
  if (cloned) {
    console.log(`skin:${skin.name}: REL1_39`);
    continue;
  }

  const fallback = await tryGit(["clone", "--depth", "1", url, target]);
  console.log(`skin:${skin.name}: ${fallback ? "default" : "failed"}`);
}

function tryGit(args) {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0 && stderr.trim()) {
        const label = args.at(-1) ?? "git";
        console.error(`${label}: ${stderr.trim().split("\n").at(-1)}`);
      }
      resolve(code === 0);
    });
  });
}
