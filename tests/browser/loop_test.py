#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright", "opencv-python-headless", "numpy"]
# ///
"""The whole loop in real browsers: a PC playing Endless Maze and a phone holding the EntryPortal.

Guest play, sign-in by QR code (read from the screen), claiming a record, the public list, "sign in on
this computer", a typed address, and burning an identity. The EntryPortal and the realm run on
different local addresses, like two sites. Run: uv run tests/browser/loop_test.py [--headed]
(the first run may need: uv run --with playwright playwright install chromium)
"""
import base64, functools, http.server, json, os, socket, subprocess, sys, tempfile, threading, time
from pathlib import Path

import cv2
import numpy as np
from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[2]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


MAZE_PORT, PORTAL_PORT = free_port(), free_port()
MAZE = f"http://localhost:{MAZE_PORT}/"
# The EntryPortal has a site of its own; realms name its root, which forwards to the newest version.
PORTAL = f"http://127.0.0.1:{PORTAL_PORT}/"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:
        pass


def serve_portal() -> None:
    handler = functools.partial(Quiet, directory=str(REPO / "portal"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORTAL_PORT), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()


def start_maze(data: str) -> subprocess.Popen:
    env = {**os.environ, "MAZE_PORT": str(MAZE_PORT), "MAZE_BASE": MAZE, "MAZE_PORTAL": PORTAL, "MAZE_DATA": data}
    game = subprocess.Popen(
        ["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "examples/maze/server.js"],
        cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    for _ in range(100):
        try:
            socket.create_connection(("localhost", MAZE_PORT), timeout=0.2).close()
            return game
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("the maze did not start")


def read_qr(page, selector: str = ".em-qr") -> str:
    """Read the QR code on the screen the way a phone's camera would."""
    image = cv2.imdecode(np.frombuffer(page.locator(selector).screenshot(), np.uint8), cv2.IMREAD_COLOR)
    # OpenCV's reader sometimes misses a code at one size and reads it at another, as a camera would
    # after moving a little.
    text = ""
    for scale in (1, 0.5, 0.75, 1.5, 0.35):
        resized = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        for detector in (cv2.QRCodeDetector(), cv2.QRCodeDetectorAruco()):
            text = detector.detectAndDecode(resized)[0]
            if text:
                break
        if text:
            break
    if not text:
        cv2.imwrite("unreadable-qr.png", image)
    assert text, "the QR code could not be read; see unreadable-qr.png"
    assert text == page.locator(selector).get_attribute("data-link")
    return text


def photo_of_screen(png: bytes, tilt: float = 0.1) -> bytes:
    """A camera photo of a screen: the screen small in a large dark frame, tilted, blurred, noisy, JPEG."""
    image = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)
    height, width = 3024, 4032
    photo = np.full((height, width, 3), 40, np.uint8)
    image = cv2.resize(image, None, fx=0.8 * height / image.shape[0], fy=0.8 * height / image.shape[0])
    h, w = image.shape[:2]
    x, y, d = (width - w) // 2, (height - h) // 2, tilt * w
    corners = np.float32([[x + d, y], [x + w - d, y + d], [x + w, y + h], [x, y + h - d]])
    warp = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), corners)
    photo = cv2.warpPerspective(image, warp, (width, height), dst=photo, borderMode=cv2.BORDER_TRANSPARENT)
    photo = cv2.GaussianBlur(photo, (9, 9), 2.5)
    noise = np.random.default_rng(1).normal(0, 12, photo.shape)
    photo = (np.clip(photo + noise, 0, 255) * 0.85 + 20).astype(np.uint8)
    return cv2.imencode(".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes()


def set_up_new_phrase(phone) -> tuple[str, str, str, str, bytes]:
    """Returns the words, the player ID, the starting name, the link in the setup code, and a screenshot."""
    phone.goto(PORTAL)
    phone.get_by_role("button", name="Make a new secret phrase").click()
    words = phone.locator("#new-words li").all_text_contents()
    assert len(words) == 24
    name = phone.locator("#new-name").text_content()
    setup_link = read_qr(phone, "#new-qr")
    assert setup_link.startswith(PORTAL + "#phrase=")
    picture = phone.screenshot()
    phone.get_by_role("button", name="I have kept them").click()
    for label in phone.locator("#check-fields label").all():
        n = int(label.text_content().split()[1])
        label.locator("input").fill(words[n - 1])
    phone.get_by_role("button", name="Check").click()
    expect(phone.locator("#home-name")).to_have_text(name)
    blocked = phone.evaluate("fetch('https://example.com/', { mode: 'no-cors' }).then(() => 'allowed', () => 'blocked')")
    assert blocked == "blocked", "the EntryPortal's security policy must forbid connections"
    return " ".join(words), phone.locator("#home-id").text_content(), name, setup_link, picture


def paste_picture(page, png: bytes) -> None:
    """Paste a picture into the page, as Ctrl+V or Cmd+V would."""
    page.evaluate(
        """b64 => {
            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const data = new DataTransfer();
            data.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
            document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
        }""",
        base64.b64encode(png).decode(),
    )


def run_level(page, level: int) -> None:
    """Run one maze level with the arrow keys, along the shortest path, then wait for the next level."""
    expect(page.locator("#level")).to_have_text(f"Level {level}")
    moves = page.evaluate(f"import('./maze.js').then(m => m.solution(m.makeMaze({level})))")
    keys = {"U": "ArrowUp", "R": "ArrowRight", "D": "ArrowDown", "L": "ArrowLeft"}
    for letter in moves:
        page.keyboard.press(keys[letter], delay=15)
    expect(page.locator("#note")).to_contain_text(f"Level {level} done")
    expect(page.locator("#level")).to_have_text(f"Level {level + 1}")


def main() -> None:
    headed = "--headed" in sys.argv
    shots = Path(sys.argv[sys.argv.index("--screenshots") + 1]) if "--screenshots" in sys.argv else None

    def shot(page, name: str) -> None:
        if shots:
            shots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=shots / f"{name}.png", full_page=True)

    serve_portal()
    with tempfile.TemporaryDirectory() as data, sync_playwright() as pw:
        game = start_maze(data)
        try:
            browser = pw.chromium.launch(headless=not headed)
            errors: list[str] = []

            def watch(page):
                # Script errors and refusals by the security policy; a realm answering 400 is expected.
                # ...and the refusal of the deliberate probe of example.com below.
                page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and "example.com" not in m.text and errors.append(f"{page.url}: {m.text}"))
                page.on("pageerror", lambda e: errors.append(f"{page.url}: {e}"))
                page.on("popup", watch)
                return page

            phone = watch(browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page())
            pc = watch(browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2).new_page())

            print("phone: set up an EntryPortal with a new secret phrase")
            words, player, start_name, setup_link, picture = set_up_new_phrase(phone)
            assert len(player) == 52
            phone.get_by_role("button", name="Change name").click()
            phone.locator(".name-input").fill("Moon Pie")
            phone.get_by_role("button", name="Save", exact=True).click()
            expect(phone.locator("#home-name")).to_have_text("Moon Pie")
            phone.goto(setup_link)
            expect(phone.locator("#message-title")).to_have_text("Already set up")

            print("pc: play as a guest, then sign in by scanning the QR code with the phone")
            pc.goto(MAZE)
            expect(pc.get_by_text("Playing as a guest.")).to_be_visible()
            run_level(pc, 1)
            pc.get_by_role("button", name="Sign in").click()
            link = read_qr(pc)
            shot(pc, "1-pc-sign-in-code")
            assert link.startswith(PORTAL + "#url=")
            phone.goto(link)
            expect(phone.locator("#enter-site")).to_have_text(f"localhost:{MAZE_PORT}")
            shot(phone, "2-phone-confirm-sign-in")
            phone.locator("#enter-ok").click()
            expect(phone.get_by_role("heading", name="You're in")).to_be_visible()
            expect(pc.locator(".em-name")).to_have_text("Moon Pie")
            assert player in pc.locator(".em-name").get_attribute("title")
            phone.get_by_role("link", name="Play Endless Maze here").click()
            expect(phone.locator(".em-name")).to_have_text("Moon Pie")
            expect(phone.locator("#level")).to_have_text("Level 2")
            expect(pc.locator("#level")).to_have_text("Level 2")

            print("pc: change the name from the game; the phone saves it and signs in again")
            pc.get_by_role("button", name="Change name").click()
            rename = read_qr(pc)
            assert rename.endswith("&rename")
            phone.goto(rename)
            expect(phone.locator("#enter-title")).to_have_text("Change your name at")
            phone.locator("#enter-name").fill("Star Fish")
            phone.get_by_role("button", name="Save and sign in again").click()
            expect(phone.get_by_role("heading", name="You're in")).to_be_visible()
            expect(pc.locator(".em-name")).to_have_text("Star Fish")

            print("pc: run levels 2 and 3 and claim the record with the phone")
            run_level(pc, 2)
            run_level(pc, 3)
            expect(pc.get_by_text("1 record is waiting for you to claim.")).to_be_visible()
            shot(pc, "3-pc-maze")
            pc.get_by_role("button", name="Claim").click()
            claim = read_qr(pc)
            assert claim.startswith(MAZE + "claim/")
            phone.goto(claim)
            expect(phone.locator("#sign-records")).to_contain_text("Finished the first 3 mazes in Endless Maze.")
            expect(phone.get_by_label("Public: anyone may see this record")).to_be_checked()
            shot(phone, "4-phone-sign-record")
            phone.locator("#sign-ok").click()
            expect(phone.locator("#message-title")).to_have_text("Records kept")
            expect(pc.get_by_text("Signed in as")).to_be_visible()
            expect(pc.get_by_role("button", name="Claim")).to_have_count(0)
            phone.locator("#message-home").click()
            expect(phone.locator("#home-records")).to_contain_text("complete")
            expect(phone.locator("#home-records")).to_contain_text(f"Signed by you and localhost:{MAZE_PORT}")
            shot(phone, "5-phone-home")

            print("pc3: set up an EntryPortal from a camera photo of the setup screen")
            pc3 = watch(browser.new_context().new_page())
            pc3.goto(PORTAL)
            pc3.locator("#picture-input").set_input_files(files=[{"name": "IMG_0001.jpg", "mimeType": "image/jpeg", "buffer": photo_of_screen(picture)}])
            expect(pc3.locator("#restore-name")).to_have_text(start_name)
            pc3.get_by_role("button", name="Yes, this is me").click()
            expect(pc3.locator("#home-name")).to_have_text(start_name)
            assert pc3.locator("#home-id").text_content() == player
            pc3.context.close()

            print("pc4: make a phrase, then pass the check by pasting the screenshot instead of typing")
            pc4 = watch(browser.new_context().new_page())
            pc4.goto(PORTAL)
            pc4.get_by_role("button", name="Make a new secret phrase").click()
            expect(pc4.locator("#new-qr svg")).to_be_visible()
            screenshot = pc4.screenshot()
            pc4.get_by_role("button", name="I have kept them").click()
            paste_picture(pc4, screenshot)
            expect(pc4.locator("#s-home")).to_be_visible()
            pc4.context.close()

            print("anyone: the public list holds the complete record")
            listing = pc.request.get(MAZE + "endlessmind-list.json").json()
            card = pc.request.get(MAZE + "endlessmind-card.json").json()
            assert card["name"] == "Endless Maze" and listing["realm"] == card["signers"][0]
            [record] = listing["records"]
            assert record["public"] is True and set(record["sigs"]) == {player, listing["realm"]}

            print("pc2: set up its own EntryPortal from the setup code, then sign in on this computer")
            pc2 = watch(browser.new_context(viewport={"width": 1280, "height": 900}).new_page())
            restore = watch(pc2.context.new_page())
            restore.goto(setup_link)
            expect(restore.locator("#restore-name")).to_have_text(start_name)
            restore.get_by_role("button", name="Yes, this is me").click()
            expect(restore.locator("#home-name")).to_have_text(start_name)
            assert restore.locator("#home-id").text_content() == player
            restore.close()
            pc2.goto(MAZE)
            pc2.get_by_role("button", name="Sign in").click()
            pc2.get_by_text("No phone, or the code won't scan?").click()
            with pc2.expect_popup() as popup:
                pc2.get_by_role("link", name="Sign in on this computer").click()
            portal2 = popup.value
            expect(portal2.locator("#enter-site")).to_have_text(f"localhost:{MAZE_PORT}")
            portal2.locator("#enter-ok").click()
            expect(portal2.get_by_role("heading", name="You're in")).to_be_visible()
            expect(pc2.locator(".em-name")).to_have_text(start_name)
            expect(pc2.locator("#level")).to_have_text("Level 4")

            print("pc2: sign out, then sign in by typing the short address into the EntryPortal")
            pc2.get_by_role("button", name="Sign out").click()
            pc2.get_by_role("button", name="Sign in").click()
            typed = pc2.locator(".em-typed").text_content()
            portal2.goto(PORTAL)
            portal2.locator("#typed-address").fill(typed)
            portal2.get_by_role("button", name="Sign in").click()
            expect(portal2.get_by_role("heading", name="You're in")).to_be_visible()
            expect(pc2.locator(".em-name")).to_have_text(start_name)

            print("phone: burn the identity and tell the realm; the ID is refused from then on")
            phone.goto(PORTAL)
            phone.locator("#burn summary").click()
            phone.locator("#burn-words").fill(words)
            phone.locator("#burn-confirm").fill("burn this identity")
            phone.locator("#burn-ok").click()
            expect(phone.locator("#burned-id")).to_have_text(player)
            shot(phone, "6-phone-burned")
            notice = json.loads(phone.locator("#burned-notice").input_value())
            assert notice["type"] == "burn" and len(notice["key"]) == 43
            with phone.expect_popup() as told:
                phone.get_by_role("button", name=f"Tell localhost:{MAZE_PORT}").click()
            expect(told.value.get_by_text("that player ID is burned here")).to_be_visible()
            pc2.reload()
            expect(pc2.get_by_text("Playing as a guest.")).to_be_visible()
            assert pc.request.get(MAZE + "endlessmind-list.json").json()["records"] == []
            pc2.get_by_role("button", name="Sign in").click()
            portal2.goto(PORTAL)
            portal2.locator("#typed-address").fill(pc2.locator(".em-typed").text_content())
            portal2.get_by_role("button", name="Sign in").click()
            expect(portal2.get_by_text("That player ID has been burned")).to_be_visible()

            print("phone only: play, sign in on this phone, claim on this phone, and go back to the game")
            solo = watch(browser.new_context(**pw.devices["iPhone 13"]).new_page())
            solo.goto(MAZE)
            run_level(solo, 1)
            solo.get_by_role("button", name="Sign in", exact=True).click()
            solo.get_by_role("button", name="Make a new secret phrase").click()
            assert solo.url.startswith(PORTAL), "the EntryPortal opens in the same tab"
            expect(solo.locator("#new-qr svg")).to_be_visible()
            setup_screen = solo.screenshot()
            solo.get_by_role("button", name="I have kept them").click()
            solo.locator("#picture-input").set_input_files(files=[{"name": "IMG.png", "mimeType": "image/png", "buffer": setup_screen}])
            expect(solo.locator("#enter-site")).to_have_text(f"localhost:{MAZE_PORT}")
            solo.locator("#enter-ok").click()
            solo.get_by_role("link", name="Play Endless Maze here").click()
            expect(solo.locator(".em-name")).to_be_visible()
            run_level(solo, 2)
            run_level(solo, 3)
            solo.get_by_role("button", name="Claim").click()
            expect(solo.locator("#sign-records")).to_contain_text("Finished the first 3 mazes in Endless Maze.")
            solo.get_by_role("button", name="Sign and save").click()
            solo.get_by_role("link", name=f"Back to localhost:{MAZE_PORT}").click()
            expect(solo.locator("#level")).to_have_text("Level 4")
            expect(solo.get_by_role("button", name="Claim")).to_have_count(0)

            print("in another app's browser, the EntryPortal says to open it in the usual browser")
            agent = pw.devices["iPhone 13"]["user_agent"] + " Instagram 300.0.0.0"
            inside = watch(browser.new_context(**{**pw.devices["iPhone 13"], "user_agent": agent}).new_page())
            inside.goto(PORTAL)
            expect(inside.locator("#in-app")).to_be_visible()
            expect(solo.locator("#in-app")).to_have_count(0)  # the game page has no such warning

            browser.close()
            assert not errors, "errors in the browsers:\n" + "\n".join(errors)
            print("ok: the whole loop works")
        finally:
            game.terminate()
            out, _ = game.communicate(timeout=5)
            if headed or "--verbose" in sys.argv:
                print(out)


if __name__ == "__main__":
    main()
