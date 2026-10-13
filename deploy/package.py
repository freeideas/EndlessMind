#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# ///
"""Builds the Endless Mind package into dist/ (ignored by Git). Publishes nothing.

    uv run deploy/package.py [target ...]

Targets: macos-arm64 macos-x64 linux-x64 linux-arm64 windows-x64 (all when none are named).

The package is the pinned Deno program, this repository's code and a small launcher. It is not a
compiled program because the host starts each game server as a separate `deno run` process with no
permissions, and a compiled program cannot do that. Per target it writes
`endlessmind-<version>-<target>.tar.gz` (`.zip` for Windows); for Linux also a `.deb`; and, once all
five archives exist, a Homebrew formula, an Arch PKGBUILD and a winget manifest naming the archives'
download addresses and SHA-256. The Windows launcher is a small compiled program (winget wants an
.exe), so building for Windows needs `deno` on this computer. How to publish: deploy/README.md.
"""

import gzip
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
CACHE = DIST / "cache"

DENO_VERSION = "2.9.6"  # the Deno the package carries; change it here only
DENO_URL = f"https://github.com/denoland/deno/releases/download/v{DENO_VERSION}/deno-%s.zip"
DENO_LICENSE_URL = f"https://raw.githubusercontent.com/denoland/deno/v{DENO_VERSION}/LICENSE.md"
RELEASES = "https://github.com/freeideas/EndlessMind/releases/download/v%s/%s"
HOMEPAGE = "https://endlessmind.com/"

# target -> (Deno's name for it, debian architecture, arch linux architecture)
TARGETS = {
    "macos-arm64": ("aarch64-apple-darwin", None, None),
    "macos-x64": ("x86_64-apple-darwin", None, None),
    "linux-x64": ("x86_64-unknown-linux-gnu", "amd64", "x86_64"),
    "linux-arm64": ("aarch64-unknown-linux-gnu", "arm64", "aarch64"),
    "windows-x64": ("x86_64-pc-windows-msvc", None, None),
}

# What goes in, from the repository. Names starting with a dot are left out.
CODE = ["host", "realm", "shared", "portal", "examples"]
LICENSES = ["LICENSE-MIT", "LICENSE-APACHE"]
README = "This is Endless Mind. Run `endlessmind` for what it can do; see https://endlessmind.com/.\n"

DEB_WRAPPER = '#!/bin/sh\nexec /usr/lib/endlessmind/endlessmind "$@"\n'

UNIX_LAUNCHER = """#!/bin/sh
# Starts the host program with the Deno beside it. Follows links, so a link on the PATH works.
self=$0
while [ -h "$self" ]; do
  dir=$(cd "$(dirname "$self")" && pwd)
  self=$(readlink "$self")
  case $self in /*) ;; *) self=$dir/$self ;; esac
done
here=$(cd "$(dirname "$self")" && pwd)
export ENDLESSMIND_COMMAND="$here/endlessmind"
export DENO_NO_UPDATE_CHECK=1
exec "$here/deno" run %(flags)s "$here/lib/host/main.js" "$@"
"""

WINDOWS_LAUNCHER = """// Starts the host program with the Deno beside this program.
const here = Deno.execPath().replace(/[\\\\/][^\\\\/]*$/, "");
const child = new Deno.Command(here + "\\\\deno.exe", {
  args: ["run", %(flags)s, here + "\\\\lib\\\\host\\\\main.js", ...Deno.args],
  env: { DENO_NO_UPDATE_CHECK: "1" },
}).spawn();
Deno.exit((await child.status).code);
"""


def config():
    """The version and the permission flags, from deno.json: the `deno task` lines are the one place."""
    deno_json = json.loads((ROOT / "deno.json").read_text())
    flags = [word for word in deno_json["tasks"]["host"].split() if word.startswith("--allow-")]
    return deno_json["version"], flags


def download(url, name):
    path = CACHE / name
    if not path.exists():
        print(f"  downloading {url}")
        CACHE.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url) as response:
            path.write_bytes(response.read())
    return path


def deno_zip(triple):
    """Deno's release for a target, checked against the SHA-256 it publishes."""
    url = DENO_URL % triple
    zip_path = download(url, f"deno-{DENO_VERSION}-{triple}.zip")
    published = download(url + ".sha256sum", f"deno-{DENO_VERSION}-{triple}.zip.sha256sum").read_text()
    expected = re.search(r"\b[0-9a-fA-F]{64}\b", published).group(0).lower()  # "hash  name", or PowerShell's table
    actual = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    if actual != expected:
        zip_path.unlink()
        raise SystemExit(f"{url}: SHA-256 is {actual}, but Deno publishes {expected}")
    return zip_path


def windows_launcher(flags):
    """A small compiled program that starts deno.exe beside it with the host program."""
    source = CACHE / "launcher.js"
    source.write_text(WINDOWS_LAUNCHER % {"flags": ", ".join(json.dumps(f) for f in flags)})
    out = CACHE / "endlessmind.exe"
    if shutil.which("deno") is None:
        raise SystemExit("Building for Windows needs `deno` on this computer (it compiles the launcher)")
    subprocess.run(["deno", "compile", "--quiet", "--target", "x86_64-pc-windows-msvc", "-o", str(out), str(source)], check=True)
    return out.read_bytes()


def files_of_package(target, flags):
    """The package's files as {path: (bytes, executable)}, paths relative to its top folder."""
    triple = TARGETS[target][0]
    windows = target.startswith("windows")
    files = {}
    with zipfile.ZipFile(deno_zip(triple)) as z:
        exe = "deno.exe" if windows else "deno"
        files[exe] = (z.read(exe), True)
    if windows:
        files["endlessmind.exe"] = (windows_launcher(flags), True)
    else:
        files["endlessmind"] = ((UNIX_LAUNCHER % {"flags": " ".join(flags)}).encode(), True)
    for folder in CODE:
        for path in sorted((ROOT / folder).rglob("*")):
            relative = path.relative_to(ROOT)
            if path.is_file() and not any(part.startswith(".") or part == "__pycache__" for part in relative.parts):
                files[f"lib/{relative.as_posix()}"] = (path.read_bytes(), False)
    for name in LICENSES:
        files[f"lib/{name}"] = ((ROOT / name).read_bytes(), False)
    files["lib/LICENSE-DENO.md"] = (download(DENO_LICENSE_URL, f"LICENSE-DENO-{DENO_VERSION}.md").read_bytes(), False)
    files["README.txt"] = (README.encode(), False)
    return files


def tar_gz(entries, prefix=""):
    """A reproducible .tar.gz of {path: (bytes, executable)}, with folders made as needed."""
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.GNU_FORMAT) as tar:
        made = set()

        def add(info):
            info.uid = info.gid = 0
            info.uname = info.gname = "root"
            info.mtime = 0
            return info

        for path, (data, executable) in sorted(entries.items()):
            parts = (prefix + path).strip("/").split("/")
            for i in range(1, len(parts)):
                folder = "/".join(parts[:i])
                if folder not in made:
                    made.add(folder)
                    info = tarfile.TarInfo(folder)
                    info.type = tarfile.DIRTYPE
                    info.mode = 0o755
                    tar.addfile(add(info))
            info = tarfile.TarInfo("/".join(parts))
            info.size = len(data)
            info.mode = 0o755 if executable else 0o644
            tar.addfile(add(info), io.BytesIO(data))
    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", mtime=0) as gz:
        gz.write(raw.getvalue())
    return out.getvalue()


def zip_of(entries, prefix):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for path, (data, executable) in sorted(entries.items()):
            info = zipfile.ZipInfo(prefix + path, date_time=(1980, 1, 1, 0, 0, 0))
            info.external_attr = (0o755 if executable else 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return out.getvalue()


def ar(members):
    """An `ar` archive, which is what a .deb is, of [(name, bytes)]."""
    out = b"!<arch>\n"
    for name, data in members:
        out += f"{name:<16}{0:<12}{0:<6}{0:<6}{'100644':<8}{len(data):<10}`\n".encode()
        out += data + (b"\n" if len(data) % 2 else b"")
    return out


def deb(version, arch, files):
    """A .deb that installs under /usr/lib/endlessmind with a command at /usr/bin/endlessmind."""
    entries = {f"usr/lib/endlessmind/{path}": item for path, item in files.items()}
    entries["usr/bin/endlessmind"] = (DEB_WRAPPER.encode(), True)
    size = sum(len(data) for data, _ in entries.values()) // 1024 + 1
    control = (
        f"Package: endlessmind\nVersion: {version}\nArchitecture: {arch}\nMaintainer: Endless Mind\n"
        f"Installed-Size: {size}\nSection: games\nPriority: optional\nHomepage: {HOMEPAGE}\n"
        "Description: Run and host Endless Mind games\n"
        " The host program of Endless Mind, with the Deno it needs. Run a game on this computer,\n"
        " or turn a server into a host with `sudo endlessmind setup`.\n"
    )
    md5sums = "".join(f"{hashlib.md5(data).hexdigest()}  {path}\n" for path, (data, _) in sorted(entries.items()))
    control_tar = tar_gz({"control": (control.encode(), False), "md5sums": (md5sums.encode(), False)})
    return ar([("debian-binary", b"2.0\n"), ("control.tar.gz", control_tar), ("data.tar.gz", tar_gz(entries, "./"))])


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def formula(version, archives):
    def block(target):
        name = archives[target].name
        return f'url "{RELEASES % (version, name)}"\n      sha256 "{sha256(archives[target])}"'

    return f'''class Endlessmind < Formula
  desc "Run and host Endless Mind games"
  homepage "{HOMEPAGE}"
  version "{version}"
  license any_of: ["MIT", "Apache-2.0"]

  on_macos do
    on_arm do
      {block("macos-arm64")}
    end
    on_intel do
      {block("macos-x64")}
    end
  end

  on_linux do
    on_arm do
      {block("linux-arm64")}
    end
    on_intel do
      {block("linux-x64")}
    end
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"endlessmind"
  end

  test do
    assert_match "Usage", shell_output("#{{bin}}/endlessmind 2>&1", 2)
  end
end
'''


def pkgbuild(version, archives):
    def source(target):
        return f'"{RELEASES % (version, archives[target].name)}"'

    return f"""# Maintainer: Endless Mind
pkgname=endlessmind
pkgver={version}
pkgrel=1
pkgdesc="Run and host Endless Mind games"
arch=('x86_64' 'aarch64')
url="{HOMEPAGE}"
license=('MIT' 'Apache-2.0')
options=('!strip')
source_x86_64=({source("linux-x64")})
sha256sums_x86_64=('{sha256(archives["linux-x64"])}')
source_aarch64=({source("linux-arm64")})
sha256sums_aarch64=('{sha256(archives["linux-arm64"])}')

package() {{
  case "$CARCH" in
    x86_64) dir=endlessmind-$pkgver-linux-x64 ;;
    aarch64) dir=endlessmind-$pkgver-linux-arm64 ;;
  esac
  install -d "$pkgdir/usr/lib" "$pkgdir/usr/bin"
  cp -r "$srcdir/$dir" "$pkgdir/usr/lib/endlessmind"
  printf '#!/bin/sh\\nexec /usr/lib/endlessmind/endlessmind "$@"\\n' > "$pkgdir/usr/bin/endlessmind"
  chmod 755 "$pkgdir/usr/bin/endlessmind"
}}
"""


def winget(version, archive):
    base = "FreeIdeas.EndlessMind"
    schema = "https://aka.ms/winget-manifest.%s.1.6.0.schema.json"
    head = f"PackageIdentifier: {base}\nPackageVersion: {version}\n"
    foot = "ManifestVersion: 1.6.0\n"
    return {
        f"{base}.yaml": f"# yaml-language-server: $schema={schema % 'version'}\n{head}DefaultLocale: en-US\nManifestType: version\n{foot}",
        f"{base}.installer.yaml": (
            f"# yaml-language-server: $schema={schema % 'installer'}\n{head}"
            "InstallerType: zip\nNestedInstallerType: portable\nNestedInstallerFiles:\n"
            f"  - RelativeFilePath: endlessmind-{version}-windows-x64\\endlessmind.exe\n    PortableCommandAlias: endlessmind\n"
            "Installers:\n  - Architecture: x64\n"
            f"    InstallerUrl: {RELEASES % (version, archive.name)}\n    InstallerSha256: {sha256(archive).upper()}\n"
            f"ManifestType: installer\n{foot}"
        ),
        f"{base}.locale.en-US.yaml": (
            f"# yaml-language-server: $schema={schema % 'defaultLocale'}\n{head}PackageLocale: en-US\n"
            "Publisher: Endless Mind\nPackageName: Endless Mind\nLicense: MIT OR Apache-2.0\n"
            f"ShortDescription: Run and host Endless Mind games\nPackageUrl: {HOMEPAGE}\n"
            f"ManifestType: defaultLocale\n{foot}"
        ),
    }


def main():
    version, flags = config()
    targets = sys.argv[1:] or list(TARGETS)
    for target in targets:
        if target not in TARGETS:
            raise SystemExit(f"Unknown target {target}; the targets are {' '.join(TARGETS)}")
    DIST.mkdir(exist_ok=True)
    archives = {}
    for target in targets:
        print(target)
        files = files_of_package(target, flags)
        prefix = f"endlessmind-{version}-{target}/"
        if target.startswith("windows"):
            path = DIST / f"endlessmind-{version}-{target}.zip"
            path.write_bytes(zip_of(files, prefix))
        else:
            path = DIST / f"endlessmind-{version}-{target}.tar.gz"
            path.write_bytes(tar_gz(files, prefix))
        archives[target] = path
        print(f"  {path.relative_to(ROOT)}  {sha256(path)}")
        arch = TARGETS[target][1]
        if arch:
            path = DIST / f"endlessmind_{version}_{arch}.deb"
            path.write_bytes(deb(version, arch, files))
            print(f"  {path.relative_to(ROOT)}")
    if len(archives) == len(TARGETS):
        (DIST / "endlessmind.rb").write_text(formula(version, archives))
        (DIST / "PKGBUILD").write_text(pkgbuild(version, archives))
        manifest = DIST / "winget"
        shutil.rmtree(manifest, ignore_errors=True)
        manifest.mkdir()
        for name, text in winget(version, archives["windows-x64"]).items():
            (manifest / name).write_text(text)
        print("  dist/endlessmind.rb, dist/PKGBUILD, dist/winget/")
    else:
        print("  (the Homebrew, Arch and winget files are written when all five targets are built)")


if __name__ == "__main__":
    main()
