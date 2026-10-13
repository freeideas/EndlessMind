// What `endlessmind setup` would write for given answers.

import assert from "node:assert/strict";
import { caddyfile, caddyInstaller, describe, freeAddress, normalizeBase, serviceUnit } from "../host/setup.js";

Deno.test("the free name is made from the server's number", () => {
  assert.equal(freeAddress("203.0.113.7"), "https://203-0-113-7.sslip.io/");
  assert.throws(() => freeAddress("example.com"));
});

Deno.test("the web address is a site's root", () => {
  assert.equal(normalizeBase("myvps.example"), "https://myvps.example/");
  assert.equal(normalizeBase(" https://myvps.example "), "https://myvps.example/");
  assert.throws(() => normalizeBase("https://myvps.example/game/"));
  assert.throws(() => normalizeBase("http://myvps.example/"));
});

Deno.test("Caddy is installed with the first package manager the system has", () => {
  assert.deepEqual(caddyInstaller((name) => name === "pacman"), ["pacman", "-S", "--noconfirm", "caddy"]);
  assert.deepEqual(caddyInstaller(() => true), ["apt-get", "install", "-y", "caddy"]);
  assert.equal(caddyInstaller(() => false), undefined);
});

Deno.test("the Caddyfile is host/Caddyfile, with the host's port", async () => {
  const template = await Deno.readTextFile(new URL("../host/Caddyfile", import.meta.url));
  assert.equal(caddyfile(template), template);
  const other = caddyfile(template, 8790);
  assert.ok(other.includes("ask http://127.0.0.1:8790/endlessmind/known"));
  assert.ok(other.includes("reverse_proxy 127.0.0.1:8790"));
  assert.ok(!other.includes("8000"));
});

Deno.test("the unit runs the host as its own account with the answers given", () => {
  const unit = serviceUnit({ command: "/usr/lib/endlessmind/endlessmind", base: "https://203-0-113-7.sslip.io/", game: "/var/lib/endlessmind/maze" });
  assert.ok(unit.includes("ExecStart=/usr/lib/endlessmind/endlessmind host --base https://203-0-113-7.sslip.io/ --game /var/lib/endlessmind/maze --port 8000\n"));
  assert.ok(unit.includes("User=endlessmind\n"));
  assert.ok(unit.includes("WorkingDirectory=/var/lib/endlessmind\n"));
  assert.ok(unit.includes("Restart=always\n"));
  const spaced = serviceUnit({ command: "/opt/my tools/endlessmind", base: "https://a.example/", port: 8790 });
  assert.ok(spaced.includes('ExecStart="/opt/my tools/endlessmind" host --base https://a.example/ --port 8790\n'));
});

Deno.test("the plan says plainly what will change", () => {
  const lines = describe({ base: "https://a.example/", game: "/var/lib/endlessmind/maze", source: "/usr/lib/endlessmind/lib/examples/maze", installer: ["apt-get", "install", "-y", "caddy"] });
  assert.ok(lines[0].includes("apt-get install -y caddy"));
  assert.ok(lines.some((line) => line.includes("/etc/caddy/Caddyfile")));
  assert.ok(lines.some((line) => line.includes("/etc/systemd/system/endless-host.service")));
});
