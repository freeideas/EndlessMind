// `endlessmind setup`: turns a Linux server into a host. It installs Caddy (HTTPS), writes the
// Caddyfile and a systemd unit for `endlessmind host`, starts both, and prints the address to open.
// What it writes is made by the pure functions below; `setup` is the part that asks and changes things.
// See host/README.md.

import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = "/var/lib/endlessmind"; // the service's home: the host's store and the resident game live here
const USER = "endlessmind"; // the service's own account, with no login
const UNIT_FILE = "/etc/systemd/system/endless-host.service";
const CADDYFILE = "/etc/caddy/Caddyfile";
const PORT = 8000; // the port host/Caddyfile passes everything to

/** The package managers setup can install Caddy with, and how. */
const INSTALLERS = /** @type {Record<string, string[]>} */ ({
  "apt-get": ["apt-get", "install", "-y", "caddy"],
  pacman: ["pacman", "-S", "--noconfirm", "caddy"],
  dnf: ["dnf", "install", "-y", "caddy"],
});

/**
 * The free name made from a server's public number: 203.0.113.7 is `https://203-0-113-7.sslip.io/`.
 * @param {string} ip an IPv4 address
 */
export function freeAddress(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error(`Not an IPv4 address: ${ip}`);
  return `https://${ip.replaceAll(".", "-")}.sslip.io/`;
}

/**
 * The address players use, as a site's root with `https` and a trailing slash.
 * @param {string} answer
 */
export function normalizeBase(answer) {
  const text = answer.trim();
  const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`The web address must be a site's root, such as https://myvps.example/ (got ${answer})`);
  }
  return url.origin + "/";
}

/**
 * The first package manager on the list that the system has, with the command that installs Caddy.
 * @param {(name: string) => boolean} has whether a program is on this system
 * @returns {string[] | undefined}
 */
export function caddyInstaller(has) {
  const name = Object.keys(INSTALLERS).find(has);
  return name ? INSTALLERS[name] : undefined;
}

/**
 * The Caddyfile: host/Caddyfile, with the host program's port filled in. That file is the one
 * template; its comment says what it is for.
 * @param {string} template
 * @param {number} [port]
 */
export function caddyfile(template, port = PORT) {
  return template.replaceAll(`127.0.0.1:${PORT}`, `127.0.0.1:${port}`);
}

/**
 * The systemd unit that keeps the host running.
 * @param {{ command: string, base: string, game?: string, port?: number }} options `command` is the endlessmind program's path
 */
export function serviceUnit({ command, base, game, port = PORT }) {
  const args = ["host", "--base", base, ...(game ? ["--game", game] : []), "--port", String(port)];
  return `[Unit]
Description=Endless Mind host at ${base}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
Group=${USER}
WorkingDirectory=${HOME}
Environment=HOME=${HOME}
ExecStart=${[command, ...args].map(quote).join(" ")}
NoNewPrivileges=true
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}

/** @param {string} word a word for a systemd command line */
function quote(word) {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `"${word.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * What setup is about to change, in plain words.
 * @param {{ base: string, game: string, source: string, installer?: string[] }} plan
 */
export function describe({ base, game, source, installer }) {
  return [
    installer ? `Install Caddy (it provides HTTPS) with: ${installer.join(" ")}` : "Use the Caddy already installed (it provides HTTPS)",
    `Write ${CADDYFILE} (an existing one is kept as ${CADDYFILE}.old) and restart Caddy`,
    `Make an account named ${USER} with no login, whose files are in ${HOME}`,
    `Copy the game in ${source} to ${game}, so its saved data belongs to you`,
    `Write ${UNIT_FILE} and start it, so the host runs now and whenever this computer starts`,
    `Then the game is at ${base}`,
  ];
}

/**
 * @param {string[]} command
 * @param {{ allowFail?: boolean }} [options]
 */
async function run(command, { allowFail = false } = {}) {
  console.log(`  $ ${command.join(" ")}`);
  const status = await new Deno.Command(command[0], { args: command.slice(1), stdin: "null" }).spawn().status;
  if (!status.success && !allowFail) throw new Error(`${command.join(" ")} failed`);
  return status.success;
}

/** This server's public number, as the web sees it. */
async function publicIp() {
  for (const url of ["https://api.ipify.org", "https://ipv4.icanhazip.com"]) {
    try {
      const text = (await (await fetch(url, { signal: AbortSignal.timeout(8000) })).text()).trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return text;
    } catch { /* try the next */ }
  }
  throw new Error("Could not find this server's public number. Give the web address with --base.");
}

/**
 * @param {string} question
 * @param {string} fallback
 */
function ask(question, fallback) {
  return (prompt(`${question} [${fallback}]`) ?? "").trim() || fallback;
}

/**
 * Set this server up as a host.
 * @param {Record<string, string>} flags `base` (the web address), `game` (the resident game's folder), `yes` (do not ask)
 */
export async function setup(flags) {
  if (Deno.build.os !== "linux") throw new Error("setup is for a Linux server.");
  if (Deno.uid() !== 0) throw new Error("setup changes the system: run it as root, with `sudo endlessmind setup`.");
  const unattended = "yes" in flags;
  const root = fileURLToPath(new URL("..", import.meta.url));
  const command = Deno.env.get("ENDLESSMIND_COMMAND");
  if (!command) throw new Error("Run setup through the endlessmind command.");

  const base = normalizeBase(flags.base || (unattended ? freeAddress(await publicIp()) : ask("Web address", freeAddress(await publicIp()))));
  const source = flags.game || (unattended ? join(root, "examples/maze") : ask("Folder of the resident game", join(root, "examples/maze")));
  await Deno.stat(join(source, "card.json")); // a game's folder has a card
  const game = join(HOME, basename(source.replace(/\/+$/, "")));
  const installer = has("caddy") ? undefined : caddyInstaller(has);
  if (!installer && !has("caddy")) throw new Error("Caddy is not installed, and none of apt-get, pacman or dnf was found to install it.");

  console.log("\nThis will change this computer:");
  for (const line of describe({ base, game, source, installer })) console.log(`  - ${line}`);
  if (!unattended && ask("\nGo ahead? (yes/no)", "no").toLowerCase() !== "yes") {
    console.log("Nothing was changed.");
    return;
  }

  if (installer) await run(installer);
  await run(["id", USER], { allowFail: true }) ||
    await run(["useradd", "--system", "--home-dir", HOME, "--create-home", "--shell", "/usr/sbin/nologin", USER]);
  await Deno.mkdir(HOME, { recursive: true });
  if (!(await exists(game))) await copyGame(source, game);
  await run(["chown", "-R", `${USER}:${USER}`, HOME]);

  const template = await Deno.readTextFile(join(root, "host/Caddyfile"));
  await Deno.mkdir(dirname(CADDYFILE), { recursive: true });
  if (await exists(CADDYFILE)) await Deno.copyFile(CADDYFILE, `${CADDYFILE}.old`);
  await Deno.writeTextFile(CADDYFILE, caddyfile(template));
  await run(["systemctl", "enable", "caddy"]);
  await run(["systemctl", "restart", "caddy"]);

  await Deno.writeTextFile(UNIT_FILE, serviceUnit({ command, base, game }));
  await run(["systemctl", "daemon-reload"]);
  await run(["systemctl", "enable", "endless-host"]);
  await run(["systemctl", "restart", "endless-host"]);

  console.log(`\nDone. Open ${base}\nThe first visit to each name waits a few seconds while Caddy gets its certificate. Ports 80 and 443 must be open to the internet.`);
}

/** @param {string} path */
async function exists(path) {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} name a program that may be on this system */
function has(name) {
  try {
    return new Deno.Command("sh", { args: ["-c", `command -v ${name}`], stdout: "null", stderr: "null" }).outputSync().success;
  } catch {
    return false;
  }
}

/**
 * Copy a game's folder, leaving out what starts with a dot (its saved data, the maker's tools).
 * @param {string} from
 * @param {string} to
 */
async function copyGame(from, to) {
  await Deno.mkdir(to, { recursive: true });
  for await (const entry of Deno.readDir(from)) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory) await copyGame(join(from, entry.name), join(to, entry.name));
    else await Deno.copyFile(join(from, entry.name), join(to, entry.name));
  }
}
