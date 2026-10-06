// Keeps the EntryPortal in step with shared/: copies the shared code into the newest version's page
// between its "begin shared" and "end shared" lines, puts the SHA-256 hashes of its script and style
// into its security policy, and writes the page's fingerprint next to it. It also writes the two
// forwarding pages: portal/index.html (portal.endlessmind.com/, to the newest version) and
// site/EntryPortal/index.html (the old address, endlessmind.com/EntryPortal/, to portal.endlessmind.com/).
//
// The EntryPortal has a site of its own, portal.endlessmind.com, served from portal/: any script on the
// same site could use the stored key, so nothing else may ever be served there. v0.1, published on
// endlessmind.com before this rule, stays in site/EntryPortal/v0.1/ unchanged.
//
//   deno task portal          update the files
//   deno task portal --check  fail if they are out of date
//
// Improvements are welcome, as new versions: a published version is never edited in place, so a check
// of it stays true. To change the EntryPortal after VERSION is published, copy its folder to the next
// version (after v0.4 come v0.61, v0.62, ... up to v1.0), set VERSION to it, and edit the copy.

export const VERSION = "v0.64";
export const PORTAL_SITE = "https://portal.endlessmind.com/";
const ROOT = new URL("../", import.meta.url);
const SHARED = ["words-en.js", "keys.js", "signed.js", "names.js", "qrcodegen.js", "qr.js", "jsqr.js"];

export const pagePath = () => new URL(`portal/${VERSION}/index.html`, ROOT);
export const sumsPath = () => new URL(`portal/${VERSION}/SHA256SUMS`, ROOT);
export const forwardPath = () => new URL("portal/index.html", ROOT);
export const oldForwardPath = () => new URL("site/EntryPortal/index.html", ROOT);

/** @param {string} text */
async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** @param {Uint8Array} bytes */
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));

/** The page as it should be, given the page as it is. @param {string} page */
export async function build(page) {
  for (const name of SHARED) {
    const code = (await Deno.readTextFile(new URL(`shared/${name}`, ROOT)))
      .split("\n")
      .filter((line) => !line.startsWith("import ") && !/^export \{.*\};$/.test(line))
      .map((line) => line.replace(/^export /, ""))
      .join("\n")
      .trim();
    const begin = `// ---- begin shared/${name} ----\n`;
    const end = `// ---- end shared/${name} ----`;
    const from = page.indexOf(begin);
    const to = page.indexOf(end);
    if (from < 0 || to < from) throw new Error(`markers for shared/${name} not found`);
    page = page.slice(0, from + begin.length) + code + "\n" + page.slice(to);
  }
  const script = page.match(/<script type="module">([\s\S]*?)<\/script>/);
  const style = page.match(/<style>([\s\S]*?)<\/style>/);
  if (!script || !style) throw new Error("the page needs one <script type=\"module\"> and one <style>");
  page = page.replace(/script-src 'sha256-[^']*'/, `script-src 'sha256-${b64(await sha256(script[1]))}'`);
  page = page.replace(/style-src 'sha256-[^']*'/, `style-src 'sha256-${b64(await sha256(style[1]))}'`);
  return page;
}

/** The fingerprint line, in the format `sha256sum -c` reads. @param {string} page */
export async function sums(page) {
  const hex = Array.from(await sha256(page), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}  index.html\n`;
}

/**
 * A page that forwards to `target`, keeping the part after "#". portal.endlessmind.com/ forwards to the
 * newest version, so a realm can name it and its players always reach the newest version; the player
 * still lands on a versioned address they can check.
 * @param {string} target
 */
export async function forwardPage(target) {
  const script = `location.replace(${JSON.stringify(target)} + location.hash);`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${b64(await sha256(script))}'">
<meta name="referrer" content="no-referrer">
<title>EntryPortal | Endless Mind</title>
<script>${script}</script></head>
<body><p>The Endless Mind EntryPortal is at <a href="${target}">${target}</a>.</p></body></html>
`;
}

/** Each file as it should be, with what it holds now. */
async function files() {
  const read = (/** @type {URL} */ path) => Deno.readTextFile(path).catch(() => "");
  const page = await build(await read(pagePath()));
  return [
    { path: pagePath(), want: page, have: await read(pagePath()) },
    { path: sumsPath(), want: await sums(page), have: await read(sumsPath()) },
    { path: forwardPath(), want: await forwardPage(VERSION + "/"), have: await read(forwardPath()) },
    { path: oldForwardPath(), want: await forwardPage(PORTAL_SITE), have: await read(oldForwardPath()) },
  ];
}

/** True when every file is up to date. */
export async function upToDate() {
  return (await files()).every((f) => f.want === f.have);
}

if (import.meta.main) {
  const all = await files();
  if (Deno.args.includes("--check")) {
    if (!all.every((f) => f.want === f.have)) {
      console.error("the EntryPortal files are out of date: run deno task portal");
      Deno.exit(1);
    }
  } else {
    for (const f of all) await Deno.writeTextFile(f.path, f.want);
  }
  console.log(`EntryPortal ${VERSION} SHA-256: ${all[1].want.split(" ")[0]}`);
}
