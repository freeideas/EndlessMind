// Realm links: `emind:<address>?via=<server>[,<server>...]`, alone or wrapped in
// a portal's web address after `#`. See "Version 0 formats" in specs/PROTOCOL.md.

import { isAddress, isHash } from "./crypto.js";

/** A link may name at most this many servers, and be at most this long. */
export const MAX_VIA = 8, MAX_LINK = 2048;

/**
 * Read a realm link such as `https://example.org/#emind:<address>?via=<server>`. A portal address
 * with no `via` counts as the hint itself.
 * @param {string} link
 * @returns {{address: string, servers: string[], release?: string, renderer?: string}}
 */
export function parseLink(link) {
  if (typeof link !== "string" || link.length > MAX_LINK) throw new Error("not a realm link");
  let text = link.includes("#") ? link.slice(link.indexOf("#") + 1) : link;
  if (!/^(?:web\+)?emind:/.test(text)) text = decodeURIComponent(text);
  const match = text.match(/^(?:web\+)?emind:([a-z0-9-]+)(?:\?(.*))?$/);
  if (!match || !(isAddress(match[1]) || isHash(match[1]))) throw new Error(`not a realm link: ${link}`);
  const query = new URLSearchParams(match[2] ?? "");
  const via = query.get("via")?.split(",").filter(Boolean) ?? [];
  const servers = (via.length ? via : link.startsWith("http") ? [new URL(link).origin] : []).map(origin);
  if (!servers.length) throw new Error("the link names no helper server; add ?via=<server address>");
  if (servers.length > MAX_VIA) throw new Error(`a link may name at most ${MAX_VIA} servers`);
  const release = query.get("release") ?? undefined, renderer = query.get("renderer") ?? undefined;
  return {
    address: match[1],
    servers: [...new Set(servers)],
    ...(release && isHash(release) ? { release } : {}),
    ...(renderer && isHash(renderer) ? { renderer } : {}),
  };
}

/** The canonical link: `emind:<address>?via=...`. @param {string} address @param {string[]} servers */
export function makeLink(address, servers) {
  return `emind:${address}?via=${servers.map(encodeURIComponent).join(",")}`;
}

/** An http or https server's origin. @param {string} value */
function origin(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("not a server address: " + value);
  return url.origin;
}
