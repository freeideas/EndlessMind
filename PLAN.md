# Plan

What is left to do. Everything in [specs/DESIGN.md](specs/DESIGN.md) is built; these steps need the owner: an account, a server, or a decision. A step is deleted from this file once it is done. When no steps are left, delete this file and the mentions of it in `README.md` and `AGENTS.md`.

## Working rules

- **Nobody uses this yet but us.** Nothing needs to stay compatible with what came before: change formats, names and commands freely, and say what is so now in the documents.
- **Simplify and delete as you go.** One way to do each thing. A file, command, option or document that a step makes unnecessary is removed in that step.
- **Every step ends the same way.** `deno task check`, `deno task test` and `deno task browser` pass, the documents describe only what is so now, and the step is deleted from this file.

## Steps

### 1. Update the host on ordinarydata

Every host program starts looking for other hosts at `https://relay.endlessmind.com/`, so nobody finds anybody until that host runs the current code. Publish the sites and restart it as [deploy/README.md](deploy/README.md) says, then check that `https://relay.endlessmind.com/endlessmind/hosts.json` and `https://relay.endlessmind.com/endlessmind/board` answer.

### 2. Publish the package

`uv run deploy/package.py` builds every download and nothing is published yet, so the install commands in `README.md` do not work. Follow "To publish a version" in [deploy/README.md](deploy/README.md): a GitHub release, the Homebrew tap, the AUR package and the winget pull request. Only the macOS arm64 archive has been run; install each of the others once.

### 3. Try it from nothing

On a freshly rented Linux server, install the package and run `sudo endlessmind setup`. It has never run on a real server: only the files it writes are tested. Fix what it gets wrong.

### 4. Decide

- **`realm-py/`.** A second copy of the realm library for tied realms in Python. Does it earn its upkeep? Every change to `realm/realm.js` is made twice.
- **A name for the host on ordinarydata.** It lives at `relay.endlessmind.com`, a name chosen when it only relayed, and that name is now built into every host program (`STARTING_HOSTS` in `host/hosts.js`). Renaming it means new DNS records and a new certificate (see `deploy/README.md`), and is cheapest before the package is published.
