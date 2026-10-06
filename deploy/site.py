#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# ///
"""Publish endlessmind.com: copy site/ to the web folder and write docs/ from specs/; and publish
portal.endlessmind.com, the EntryPortal's own site, from portal/ to the folder beside it.

Run in the checkout on ordinarydata after `git pull --ff-only`. Usage: uv run deploy/site.py [web folder]
"""
import html, re, shutil, sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TARGET = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "domains" / "endlessmind.com")
PORTAL_TARGET = TARGET.with_name("portal.endlessmind.com")
GITHUB = "https://github.com/freeideas/EndlessMind/blob/main/"


def outside_links(text: str, depth: int) -> str:
    """Point links that leave specs/ at GitHub, since only specs/ is served."""
    up = "../" * (depth + 1)
    return re.sub(r"\]\(" + re.escape(up) + r"([^)]*)\)", lambda m: f"]({GITHUB}{m.group(1)})", text)


def main() -> None:
    staging = TARGET.with_name(TARGET.name + ".new")
    shutil.rmtree(staging, ignore_errors=True)
    shutil.copytree(REPO / "site", staging)
    docs = staging / "docs"
    rows = []
    for source in sorted((REPO / "specs").rglob("*")):
        if source.is_dir():
            continue
        relative = source.relative_to(REPO / "specs")
        target = docs / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.suffix == ".md":
            text = outside_links(source.read_text(encoding="utf-8"), len(relative.parts) - 1)
            target.write_text(text, encoding="utf-8")
            title = next((line[2:].strip() for line in text.splitlines() if line.startswith("# ")), relative.stem)
            rows.append(f'<li><a href="{relative.as_posix()}">{html.escape(title)}</a> <code>{relative.as_posix()}</code></li>')
        else:
            shutil.copy2(source, target)
    home = (REPO / "site" / "index.html").read_text(encoding="utf-8")
    nav = re.search(r"<nav>.*?</nav>", home, re.S).group(0)
    footer = re.search(r"<footer>.*?</footer>", home, re.S).group(0)
    (docs / "index.html").write_text(
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<title>Docs | Endless Mind</title><link rel="stylesheet" href="../style.css"></head><body><main>\n'
        f"{nav}\n<h1>Docs</h1>\n<p class=\"lead\">The design and the protocol, as plain Markdown."
        "</p>\n<ul>\n" + "\n".join(rows) + f"\n</ul>\n{footer}\n</main></body></html>\n",
        encoding="utf-8",
    )
    swap(staging, TARGET)
    print(f"Published {TARGET} ({len(rows)} docs)")
    portal = PORTAL_TARGET.with_name(PORTAL_TARGET.name + ".new")
    shutil.rmtree(portal, ignore_errors=True)
    shutil.copytree(REPO / "portal", portal, ignore=shutil.ignore_patterns("README.md"))
    swap(portal, PORTAL_TARGET)
    print(f"Published {PORTAL_TARGET}")


def swap(staging: Path, target: Path) -> None:
    """Replace target with staging, leaving no moment with neither."""
    old = target.with_name(target.name + ".old")
    shutil.rmtree(old, ignore_errors=True)
    if target.exists():
        target.rename(old)
    staging.rename(target)
    shutil.rmtree(old, ignore_errors=True)


if __name__ == "__main__":
    main()
