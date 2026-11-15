# Plan

What is left to do. Everything in [specs/DESIGN.md](specs/DESIGN.md) is built. Steps 1 to 3 need the owner: an account, a server, or a decision; the later ones are work still to plan and build. A step is deleted from this file once it is done. When no steps are left, delete this file and the mentions of it in `README.md` and `AGENTS.md`.

## Working rules

- **Nobody uses this yet but us.** Nothing needs to stay compatible with what came before: change formats, names and commands freely, and say what is so now in the documents.
- **Simplify and delete as you go.** One way to do each thing. A file, command, option or document that a step makes unnecessary is removed in that step.
- **Every step ends the same way.** `deno task check`, `deno task test` and `deno task browser` pass, the documents describe only what is so now, and the step is deleted from this file.

## Steps

### 1. Publish the package

`uv run deploy/package.py` builds every download and nothing is published yet, so the install commands in `README.md` do not work. Follow "To publish a version" in [deploy/README.md](deploy/README.md): a GitHub release, the Homebrew tap, the AUR package and the winget pull request. Only the macOS arm64 and Windows archives have been run; install each of the others once.

### 2. Try it from nothing

On a freshly rented Linux server, install the package and run `sudo endlessmind setup`. It has never run on a real server: only the files it writes are tested. Fix what it gets wrong.

### 3. Decide

- **`realm-py/`.** A second copy of the realm library for tied realms in Python. Does it earn its upkeep? Every change to `realm/realm.js` is made twice.
- **A name for the host on ordinarydata.** It lives at `relay.endlessmind.com`, a name chosen when it only relayed, and that name is the starting address in every host program (`host/starting-hosts.json`). Renaming it means new DNS records and a new certificate (see `deploy/README.md`), and is cheapest before the package is published.

### 4. Fat clients (not to be built yet)

Let programs that are not browsers play on the network. Today the play connection is accepted only from the game's own pages, and the host knows the player from a browser session. Plan: the program shows the same sign-in code, the phone's EntryPortal approves it as for any screen, and the program gets a token it presents when it opens the play connection. The messages stay the same JSON, so one game server serves browsers and programs alike. A faster connection only once a real game needs it. The docs must say plainly that a fat client is an installed program, which the player trusts like any other program they install.

### 5. Read only what is new

A public list is one file, read whole every time, and the board stops reading at 2 MB, so a busy realm's list will outgrow it. Add a way to ask a list for only what is new since a given time or place, in the realm library (both copies), the host and the board, and write it into PROTOCOL.md.

### 6. Certificates for free names

A free name made from a server's number (such as `203-0-113-7.sslip.io`) shares one certificate allowance with everyone who uses that naming service, and every game a host runs or relays needs a certificate of its own. Find out the real limits (the certificate authority's per-domain limits, and whether the naming service is on the Public Suffix List, which gives each server its own allowance), and decide what to do before there are many hosts: for example a naming service of our own, one certificate for all of a host's names, or advice to use a domain.
