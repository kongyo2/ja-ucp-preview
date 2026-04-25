import type { NamespaceInfo, SiteSnapshot } from "../types.js";

export interface ParsedTitle {
  prefixedText: string;
  namespaceId: number;
  namespace: NamespaceInfo;
  dbKey: string;
  text: string;
  fullText: string;
  baseText: string;
  rootText: string;
  subpageText: string;
  talkPageText: string;
  subjectPageText: string;
}

export function normalizeTitleText(input: string): string {
  return input.replace(/_/g, " ").replace(/[ \t\r\n]+/g, " ").trim();
}

export function parseTitle(input: string, site: SiteSnapshot): ParsedTitle {
  const normalized = normalizeTitleText(input || site.mainPage);
  const firstColon = normalized.indexOf(":");
  let namespaceId = 0;
  let text = normalized;

  if (firstColon > -1) {
    const prefix = normalized.slice(0, firstColon);
    const prefixKey = prefix.toLowerCase();
    const aliasId = site.namespaceAliases[prefixKey];
    const canonicalId = Object.values(site.namespaces).find(
      (ns) =>
        ns.name.toLowerCase() === prefixKey ||
        (ns.canonical !== undefined && ns.canonical.toLowerCase() === prefixKey)
    )?.id;
    const foundId = aliasId ?? canonicalId;
    if (foundId !== undefined) {
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

export function normalizeTitleCase(title: string, mode: NamespaceInfo["case"]): string {
  const trimmed = normalizeTitleText(title);
  if (mode === "case-sensitive" || trimmed.length === 0) {
    return trimmed;
  }
  return trimmed.charAt(0).toLocaleUpperCase("ja-JP") + trimmed.slice(1);
}

function talkPageFor(namespaceId: number, text: string, site: SiteSnapshot): string {
  const talkId = namespaceId % 2 === 0 ? namespaceId + 1 : namespaceId;
  const ns = site.namespaces[talkId];
  return ns && talkId !== 0 ? `${ns.name}:${text}` : text;
}

function subjectPageFor(namespaceId: number, text: string, site: SiteSnapshot): string {
  const subjectId = namespaceId % 2 === 1 ? namespaceId - 1 : namespaceId;
  const ns = site.namespaces[subjectId];
  return ns && subjectId !== 0 ? `${ns.name}:${text}` : text;
}

export function pageUrl(title: string, site: SiteSnapshot): string {
  const encoded = encodeURIComponent(normalizeTitleText(title).replace(/ /g, "_")).replace(
    /%2F/g,
    "/"
  );
  return `${site.server}${site.articlePath.replace("$1", encoded)}`;
}
