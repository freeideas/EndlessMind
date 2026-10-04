#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.48"]
# ///
"""End-to-end check in real browsers: one browser publishes and hosts the maze,
another opens its link, and both see each other move. Then: sandboxed code
cannot reach the network, a guest carries on after the host reloads, and a
realm's saved keys let another browser take over hosting. Last, a browser
visits a realm with private rules that the host program referees.

Usage: uv run tests/e2e.py [chromium|firefox|webkit ...]
Starts its own server on a spare port with a temporary data folder. The first
run for firefox or webkit downloads that browser (uv run --with playwright
playwright install firefox webkit).
"""

import json
import os
import re
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


def run(browser_name: str, base: str, remote: str, well_link: str) -> None:
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
            alone_and_room(browser, base, link_of(host))
            well(guest, well_link)
            regressions(browser, base, remote)
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
        host.locator('#owned .host-toggle').wait_for()
        host.click('#owned .host-toggle')
        wait_for(lambda: host.locator('#owned .host-toggle').inner_text() == 'Stop hosting', what='explicit hosting')
        host.click('#owned a')
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
        host.goto(base + '/#')
        # Browsing home does not stop the referee.
        guest.evaluate('globalThis.endlessmindLastView = null')
        wait_for(lambda: guest.evaluate('globalThis.endlessmindLastView?.players?.length') == 1, what='hosting while owner browses')
        host.reload()
        host.wait_for_selector('body[data-ready]')
        host.click('#owned .host-toggle')
        wait_for(lambda: host.locator('#owned .host-toggle').inner_text() == 'Stop hosting', what='hosting after reload')
        host.click('#owned a')
        time.sleep(1)
        guest.evaluate("globalThis.endlessmindLastView = null")
        wait_for(lambda: guest.evaluate("globalThis.endlessmindLastView?.players?.length") == 2, timeout=40, what="guest rejoining after host reload")

        # The realm's key is the realm: another browser loads the saved keys and takes over hosting.
        keys = host.evaluate("import('/keyfile.js').then((m) => m.saveKeys({files:true,storage:true}))")
        mover = host.context.browser.new_context().new_page()
        mover.goto(base + "/")
        mover.wait_for_selector("body[data-ready]")
        loaded = mover.evaluate("(text) => import('/keyfile.js').then((m) => m.loadKeys(text))", keys)
        assert loaded == {"character": True, "realms": 1}, loaded
        mover.reload()
        mover.wait_for_selector('body[data-ready]')
        mover.goto(link)
        # Merely opening a realm whose key we hold must not take over hosting.
        wait_for(lambda: mover.evaluate('globalThis.endlessmindLastView?.players?.length') == 2, what='owner visiting existing host')
        assert 'somewhere else' not in host.locator('#status').inner_text()
        mover.goto(base + '/#')
        mover.click('#owned .host-toggle')
        wait_for(lambda: mover.locator('#owned .host-toggle').inner_text() == 'Stop hosting', what='explicit takeover')
        mover.click('#owned a')
        wait_for(lambda: mover.evaluate("globalThis.endlessmindLastView?.players?.length") == 2, timeout=40, what="guest joining the moved realm")
        wait_for(lambda: "somewhere else" in host.evaluate("document.getElementById('status').textContent"), what="old host told it was replaced")


def link_of(page):
    return page.locator('#owned a').first.get_attribute('href')


def alone_and_room(browser, base, link):
    """Public rules need no referee: one browser plays its own copy, then referees a room that another joins."""
    one = browser.new_context().new_page()
    one.goto(link)
    one.locator('#play-alone').click()
    # Ask the page for its address: the test tool's own copy goes stale between calls.
    here = lambda: one.evaluate('location.href')
    wait_for(lambda: 'emind:sha256-' in here(), what='the release link')
    wait_for(lambda: 'your own copy' in one.locator('#status').inner_text(), what='playing alone')
    wait_for(lambda: one.evaluate('globalThis.endlessmindLastView?.players?.length') == 1, what='a view of the solo game')
    alone = here()
    one.locator('#start-room').click()
    wait_for(lambda: 'emind:ed25519-' in here() and here() != link, what='the room link')
    one.evaluate('globalThis.endlessmindLastView = null')
    wait_for(lambda: one.evaluate('globalThis.endlessmindLastView?.players?.length') == 1, what='the room host inside')
    two = browser.new_context().new_page()
    two.goto(here())
    wait_for(lambda: two.evaluate('globalThis.endlessmindLastView?.players?.length') == 2, what='a friend in the room')
    # The release link alone is enough for anyone, with no host anywhere.
    two.goto(alone)
    two.evaluate('globalThis.endlessmindLastView = null')
    wait_for(lambda: two.evaluate('globalThis.endlessmindLastView?.players?.length') == 1, what='a stranger playing alone')
    one.context.close()
    two.context.close()


def well(page, link):
    """The well's rules run only in the host program; the browser sends a question and sees the answer."""
    page.goto(link)
    page.reload()
    frame = page.frame_locator("iframe.renderer")
    frame.locator("input").fill("is anyone down there?")
    frame.locator("input").press("Enter")
    answer = wait_for(lambda: page.evaluate("globalThis.endlessmindLastView?.talk?.at(-1)?.answer"), what="the well's answer")
    assert "is anyone down there?" in answer, answer


def regressions(browser, base, remote):
    page = browser.new_context().new_page()
    page.goto(base)
    page.wait_for_selector('body[data-ready]')
    secret = page.evaluate("import('/character.js').then(m => m.myCharacter()).then(c => c.secret)")
    page.fill('#server-address', remote)
    page.click('#server-form button')
    wait_for(lambda: page.evaluate("import('/store.js').then(m => m.get('server'))") == remote)
    address = page.evaluate('''async (remote) => {
      const { publish } = await import('/realms.js');
      const enc = new TextEncoder();
      const files = new Map([
        ['realm.json', enc.encode(JSON.stringify({name:'Saved counter',main:'rules.js',renderer:'renderer.js'}))],
        ['rules.js', enc.encode(`let storage; export default {
          async init(o) { storage=o.storage; return {count:await storage.get('count') ?? 0}; },
          async act(s) { s.count++; await storage.put('count',s.count); },
          view(s) { return {count:s.count}; }
        };`)],
        ['renderer.js', enc.encode(`export default {start(root,game) {
          root.innerHTML='<button>Count</button><output></output>';
          root.querySelector('button').onclick=()=>game.act({});
          game.onView(v=>root.querySelector('output').textContent=v.count);
        }};`)],
        ['asset.bin', new Uint8Array([0,137,255,128])]
      ]);
      return (await publish(files,remote)).address;
    }''', remote)
    page.reload()
    page.wait_for_selector('body[data-ready]')
    page.click('#owned .host-toggle')
    wait_for(lambda: page.locator('#owned .host-toggle').inner_text() == 'Stop hosting')
    page.click('#owned a')
    wait_for(lambda: page.evaluate('globalThis.endlessmindLastView?.count') == 0)
    page.frame_locator('iframe.renderer').locator('button').click()
    wait_for(lambda: page.evaluate('globalThis.endlessmindLastView?.count') == 1)
    wait_for(lambda: page.evaluate("a => import('/store.js').then(m => m.realmStorage(a).get('count'))", address) == 1)
    assert page.url.startswith(base), 'visiting another server moved the app origin'
    assert secret == page.evaluate("import('/character.js').then(m => m.myCharacter()).then(c => c.secret)")
    page.goto(base + '/#')
    page.click('#owned .host-toggle')
    wait_for(lambda: page.locator('#owned .host-toggle').inner_text() == 'Start hosting')

    # Neither export touches the helper server, and binary bytes survive import.
    page.route('**/blob/**', lambda route: route.abort())
    keys = page.evaluate("import('/keyfile.js').then(m => m.saveKeys())")
    backup = page.evaluate("import('/keyfile.js').then(m => m.saveKeys({files:true,storage:true}))")
    assert 'files' not in json.loads(keys)['realms'][0]
    page.unroute('**/blob/**')
    moved = browser.new_context().new_page()
    moved.goto(base)
    moved.wait_for_selector('body[data-ready]')
    moved.evaluate("text => import('/keyfile.js').then(m => m.loadKeys(text))", keys)
    assert moved.evaluate("import('/keyfile.js').then(m => m.saveKeys({files:true})).then(() => false, () => true)"), 'a full backup must not silently omit missing files'
    moved.evaluate("text => import('/keyfile.js').then(m => m.loadKeys(text))", backup)
    assert moved.evaluate("a => import('/realms.js').then(m => m.ownedRealm(a)).then(r => [...r.files['asset.bin']])", address) == [0,137,255,128]
    assert moved.evaluate("a => import('/store.js').then(m => m.realmStorage(a).get('count'))", address) == 1

    # The owner can republish and host after the announcement has expired.
    page.evaluate('''async ({address,remote}) => {
      const r=await (await import('/realms.js')).ownedRealm(address);
      const a=await (await import('/shared/envelope.js')).seal(r.keys,null,'announce',
        {manifest:r.manifest,name:r.name,tags:[],expires:Date.now()+100});
      await fetch(remote+'/announce',{method:'POST',body:JSON.stringify(a)});
    }''', {'address': address, 'remote': remote})
    page.wait_for_timeout(150)
    assert page.evaluate("async ({address,remote}) => (await fetch(remote+'/announce/'+address)).status", {'address': address, 'remote': remote}) == 404
    page.click('#owned .host-toggle')
    wait_for(lambda: page.locator('#owned .host-toggle').inner_text() == 'Stop hosting')
    page.click('#owned a')
    wait_for(lambda: page.evaluate('globalThis.endlessmindLastView?.count') == 1)
    link = page.evaluate('location.href')
    # A dead server named first in a link is skipped: the app tries each hint in turn.
    moved.goto(link.replace('via=', 'via=http%3A%2F%2Flocalhost%3A9,'))
    wait_for(lambda: moved.evaluate('globalThis.endlessmindLastView?.count') == 1, what='opening past a dead server hint')
    moved.goto(base + '/#')
    page.goto(base + '/#')
    page.click('#owned .host-toggle')
    wait_for(lambda: page.locator('#owned .host-toggle').inner_text() == 'Start hosting')

    # A cancelled load cannot install a hidden renderer or visitor.
    result = page.evaluate('''async link => {
      const original=globalThis.fetch;
      globalThis.fetch=async (...args) => {
        if (String(args[0]).includes('/announce/')) await new Promise(r=>setTimeout(r,300));
        return original(...args);
      };
      location.hash=new URL(link).hash;
      setTimeout(()=>location.hash='',50);
      await new Promise(r=>setTimeout(r,700));
      globalThis.fetch=original;
      return {home:!document.querySelector('#home').hidden,frames:document.querySelectorAll('iframe.renderer').length};
    }''', link)
    assert result == {'home': True, 'frames': 0}, result
    # Rules stuck in an endless loop must not freeze the page, and a realm that
    # did not close cleanly is not reopened without asking.
    alive = page.evaluate('''async () => {
      const box=document.body.appendChild(document.createElement('div'));
      const {startRules}=await import('/sandbox.js');
      const rules=await startRules(box,'export default {init(){return {}}, tick(){for(;;){}}, view(){return 1}}',{get:async()=>{},put:async()=>{}});
      rules.step();
      await new Promise(r=>setTimeout(r,500));
      rules.stop(); box.remove();
      return true;
    }''')
    assert alive, 'runaway rules froze the page'
    page.goto(link)
    wait_for(lambda: page.evaluate("sessionStorage.getItem('emind-entering')"), what='the note of the realm being entered')
    # A frozen page never gets to clear its note; imitate that across a reload.
    page.evaluate("addEventListener('pagehide', () => sessionStorage.setItem('emind-entering', location.hash.match(/emind:([a-z0-9-]+)/)[1]))")
    page.reload()
    page.wait_for_selector('#open-anyway')
    assert page.locator('iframe.renderer').count() == 0, 'a realm that froze was reopened without asking'
    page.goto(base + '/#')
    rejected = page.evaluate('''async () => {
      const box=document.body.appendChild(document.createElement('div'));
      try { await (await import('/sandbox.js')).startRules(box,'broken syntax',{get:async()=>{},put:async()=>{}}); return false; }
      catch { return box.children.length===0; }
      finally {box.remove();}
    }''')
    assert rejected, 'broken rules did not reject and clean up'
    page.context.close()
    moved.context.close()


def main() -> None:
    browsers = sys.argv[1:] or ["chromium"]
    port = free_port()
    remote_port = free_port()
    with tempfile.TemporaryDirectory() as data:
        server = subprocess.Popen(
            ["deno", "run", "--allow-net", f"--allow-read=.,{data}", f"--allow-write={data}",
             "server/server.js", "--port", str(port), "--hostname", "127.0.0.1", "--data", data],
            cwd=ROOT, stdout=subprocess.DEVNULL,
        )
        remote_server = subprocess.Popen(
            ['deno', 'run', '--allow-net', '--allow-read', f'--allow-write={data}',
             'server/server.js', '--port', str(remote_port), '--hostname', '127.0.0.1', '--data', str(Path(data, 'remote'))],
            cwd=ROOT, stdout=subprocess.DEVNULL,
        )
        try:
            base = f"http://localhost:{port}"
            remote = f"http://localhost:{remote_port}"
            wait_for(lambda: socket.socket().connect_ex(("127.0.0.1", port)) == 0, what="server")
            wait_for(lambda: socket.socket().connect_ex(('127.0.0.1', remote_port)) == 0, what='remote server')
            # The host program, with no model key, so the well only echoes.
            env = {k: v for k, v in os.environ.items() if k != "OPENROUTER_API_KEY"}
            well_host = subprocess.Popen(
                ["deno", "run", "--allow-net", "--allow-read", "--allow-env", f"--allow-write={data}", "host/host.js",
                 "--server", base, "--realm", "examples/listening-well", "--keys", f"{data}/keys/well.json"],
                cwd=ROOT, stdout=subprocess.PIPE, text=True, env=env,
            )
            try:
                well_link = re.search(r"http\S+", well_host.stdout.readline()).group(0)
                for name in browsers:
                    run(name, base, remote, well_link)
            finally:
                well_host.terminate()
                well_host.wait()
        finally:
            server.terminate()
            server.wait()
            remote_server.terminate()
            remote_server.wait()


if __name__ == "__main__":
    main()
