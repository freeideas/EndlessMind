// Keeps the EntryPortal page in step with shared/: copies the shared code into the page between its
// "begin shared" and "end shared" lines, puts the SHA-256 hashes of its script and style into its
// security policy, and writes the page's fingerprint next to it.
//
//   deno task portal          update the page
//   deno task portal --check  fail if the page is out of date
//
// A published version never changes. To change the EntryPortal after VERSION is published, copy its
// folder to the next number, raise VERSION, and edit the copy.

export const VERSION = 1;
const ROOT = new URL("../", import.meta.url);
const SHARED = ["words-en.js", "keys.js", "signed.js"];

export const pagePath = () => new URL(`site/EntryPortal/${VERSION}/index.html`, ROOT);
export const sumsPath = () => new URL(`site/EntryPortal/${VERSION}/SHA256SUMS`, ROOT);

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

if (import.meta.main) {
  const current = await Deno.readTextFile(pagePath());
  const page = await build(current);
  const fingerprint = await sums(page);
  let currentSums = "";
  try {
    currentSums = await Deno.readTextFile(sumsPath());
  } catch {
    // written below
  }
  if (Deno.args.includes("--check")) {
    if (page !== current || fingerprint !== currentSums) {
      console.error(`site/EntryPortal/${VERSION}/ is out of date: run deno task portal`);
      Deno.exit(1);
    }
  } else {
    await Deno.writeTextFile(pagePath(), page);
    await Deno.writeTextFile(sumsPath(), fingerprint);
  }
  console.log(`EntryPortal ${VERSION} SHA-256: ${fingerprint.split(" ")[0]}`);
}
