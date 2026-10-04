#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.48"]
# ///
"""End-to-end check in real browsers: one browser publishes and hosts the maze,
another opens its link, and both see each other move. Then: sandboxed code
cannot reach the network, a guest carries on after the host reloads, and a
realm's saved keys let another browser take over hosting.

Usage: uv run tests/e2e.py [chromium|firefox|webkit ...]
Starts its own server on a spare port with a temporary data folder. The first
run for firefox or webkit downloads that browser (uv run --with playwright
playwright install firefox webkit).
"""

import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for(predicate, timeout=15.0, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        value = predicate()
        if value:
            return value
        time.sleep(0.2)
    raise AssertionError(f"timed out waiting for {what}")


def run(browser_name: str, base: str) -> None:
    with sync_playwright() as p:
        launcher = getattr(p, browser_name)
        browser = launcher.launch(channel="chrome") if browser_name == "chromium" else launcher.launch()
        host = browser.new_context().new_page()
        guest = browser.new_context().new_page()
        errors = []
        for page in (host, guest):
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))

        try:
            steps(host, guest, base, browser_name)
        except Exception:
            print("errors:", errors)
            print("host status:", host.evaluate("document.getElementById('status')?.textContent"), "| guest:", guest.evaluate("document.getElementById('status')?.textContent"))
            raise
        browser.close()
        bad = [e for e in errors if "favicon" not in e and "leak=" not in e]
        assert not bad, f"browser errors: {bad}"
        print(f"{browser_name}: ok")


def steps(host, guest, base, browser_name):
        host.goto(base + "/")
        host.wait_for_selector("body[data-ready]")
        host.click("#publish-example")
        wait_for(lambda: "#emind:" in host.evaluate("location.href"), what="publish")
        link = host.evaluate("location.href")
        wait_for(lambda: host.evaluate("globalThis.endlessmindLastView?.players?.length") == 1, what="host view")

        guest.goto(link)
        wait_for(lambda: guest.evaluate("globalThis.endlessmindLastView?.players?.length") == 2, what="guest view")
        wait_for(lambda: host.evaluate("globalThis.endlessmindLastView?.players?.length") == 2, what="host sees guest")

        # The guest moves; the host must see the guest's position change.
        def guest_pos():
            return host.evaluate("JSON.stringify(globalThis.endlessmindLastView.players.filter(p => !p.me).map(p => [p.x, p.y]))")

        frame = guest.frame_locator("iframe.renderer")
        frame.locator("canvas").click()
        # Try one direction at a time (some are walls) until the host sees the guest move.
        moved = False
        for key in ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]:
            start = guest_pos()
            guest.keyboard.press(key)
            try:
                wait_for(lambda: guest_pos() != start, timeout=3, what="move")
                moved = True
                break
            except AssertionError:
                continue
        assert moved, "the host never saw the guest move" 

        Path(tempfile.gettempdir(), f"endlessmind-{browser_name}-guest.png").write_bytes(guest.screenshot())

        # Sandboxed code that tries to fetch, or to send its own frame to a web address, reaches nothing.
        leaks = []
        guest.on("request", lambda r: leaks.append(r.url) if "leak=" in r.url else None)
        guest.evaluate("""async (base) => {
          const { startRenderer } = await import('/sandbox.js');
          const code = `export default { start(root, game) {
            fetch('${base}/style.css?leak=fetch').catch(() => {});
            setTimeout(() => { location.href = '${base}/style.css?leak=navigate'; }, 100);
          } };`;
          const box = document.body.appendChild(document.createElement('div'));
          await startRenderer(box, code, 'me', {}, () => {});
          await new Promise((r) => setTimeout(r, 1500));
          box.remove();
        }""", base)
        assert not leaks, f"sandboxed code reached the network: {leaks}"

        # The host reloads (a new referee that knows no one); the guest must get back in by itself.
        host.reload()
        time.sleep(1)
        guest.evaluate("globalThis.endlessmindLastView = null")
        wait_for(lambda: guest.evaluate("globalThis.endlessmindLastView?.players?.length") == 2, timeout=40, what="guest rejoining after host reload")

        # The realm's key is the realm: another browser loads the saved keys and takes over hosting.
        keys = host.evaluate("import('/keyfile.js').then((m) => m.saveKeys())")
        mover = host.context.browser.new_context().new_page()
        mover.goto(base + "/")
        mover.wait_for_selector("body[data-ready]")
        loaded = mover.evaluate("(text) => import('/keyfile.js').then((m) => m.loadKeys(text))", keys)
        assert loaded == {"character": True, "realms": 1}, loaded
        mover.goto(link)
        mover.reload()
        wait_for(lambda: mover.evaluate("globalThis.endlessmindLastView?.players?.length") == 2, timeout=40, what="guest joining the moved realm")
        wait_for(lambda: "somewhere else" in host.evaluate("document.getElementById('status').textContent"), what="old host told it was replaced")


def main() -> None:
    browsers = sys.argv[1:] or ["chromium"]
    port = free_port()
    with tempfile.TemporaryDirectory() as data:
        server = subprocess.Popen(
            ["deno", "run", "--allow-net", f"--allow-read=.,{data}", f"--allow-write={data}",
             "server/server.js", "--port", str(port), "--hostname", "127.0.0.1", "--data", data],
            cwd=ROOT, stdout=subprocess.DEVNULL,
        )
        try:
            base = f"http://localhost:{port}"
            wait_for(lambda: socket.socket().connect_ex(("127.0.0.1", port)) == 0, what="server")
            for name in browsers:
                run(name, base)
        finally:
            server.terminate()
            server.wait()


if __name__ == "__main__":
    main()
