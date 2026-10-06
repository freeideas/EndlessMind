// Keeps the EntryPortal in step with shared/: copies the shared code into the newest version's page
// between its "begin shared" and "end shared" lines, puts the SHA-256 hashes of its script and style
// into its security policy, writes the page's fingerprint next to it, and writes EntryPortal/index.html,
// which forwards to the newest version.
//
//   deno task portal          update the files
//   deno task portal --check  fail if they are out of date
//
// Improvements are welcome, as new versions: a published version is never edited in place, so a check
// of it stays true. To change the EntryPortal after VERSION is published, copy its folder to the next
// version (v0.1, v0.2, ... v1.0), set VERSION to it, and edit the copy.

export const VERSION = "v0.1";
const ROOT = new URL("../", import.meta.url);
const SHARED = ["words-en.js", "keys.js", "signed.js"];

export const pagePath = () => new URL(`site/EntryPortal/${VERSION}/index.html`, ROOT);
export const sumsPath = () => new URL(`site/EntryPortal/${VERSION}/SHA256SUMS`, ROOT);
export const forwardPath = () => new URL("site/EntryPortal/index.html", ROOT);

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
      .filter((line) => !line.startsWith("import "))
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
 * EntryPortal/index.html: forwards to the newest version, keeping the part after "#", so a realm can
 * name EntryPortal/ and its players always reach the newest version. The player still lands on a
 * versioned address they can check.
 */
export async function forwardPage() {
  const script = `location.replace(${JSON.stringify(VERSION + "/")} + location.hash);`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${b64(await sha256(script))}'">
<meta name="referrer" content="no-referrer">
<title>EntryPortal | Endless Mind</title>
<script>${script}</script></head>
<body><p>The newest Endless Mind EntryPortal is <a href="${VERSION}/">${VERSION}</a>.</p></body></html>
`;
}

/** Each file as it should be, with what it holds now. */
async function files() {
  const read = (/** @type {URL} */ path) => Deno.readTextFile(path).catch(() => "");
  const page = await build(await read(pagePath()));
  return [
    { path: pagePath(), want: page, have: await read(pagePath()) },
    { path: sumsPath(), want: await sums(page), have: await read(sumsPath()) },
    { path: forwardPath(), want: await forwardPage(), have: await read(forwardPath()) },
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
      console.error("site/EntryPortal/ is out of date: run deno task portal");
      Deno.exit(1);
    }
  } else {
    for (const f of all) await Deno.writeTextFile(f.path, f.want);
  }
  console.log(`EntryPortal ${VERSION} SHA-256: ${all[1].want.split(" ")[0]}`);
}
