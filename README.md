# Endless Mind™

A worldwide network for anything AI can make: games, places, shops, tools, whole universes. Anyone can make it, and anyone can use it from a link.

AI coding agents now let anyone make their own software just by describing it. Endless Mind connects all of it into one open network, the way the web connects websites. Think of it as a new web where living, AI-made programs take the place of web pages. Games come first, because they show the idea best, but anything goes. There is no company in the middle and no central server to depend on. Anyone can make anything, and anyone can use it from a link.

**Status: early.** What works today: a helper server and a browser portal in which one person publishes a game and others join it from a link on their own devices, or play their own copy with nobody hosting. A game is playable while a browser tab explicitly hosting it is open, or while its maker runs the host program (a small program that keeps it up without a browser). Games written in JavaScript play in the browser; programs made with game engines can join by speaking the protocol, but nothing for any engine has been built. It has been tested with several browsers on one computer, not yet by strangers on the open internet. Expect rough edges and frequent changes.

## Playing

Open a game's link in a portal you trust. A portal is the program that gets you into games; the one here runs in your web browser, and you are an actor in whatever you enter. Use **Open here** to paste a link into your usual portal without moving your keys. A link's server hint selects the helper server, while the portal and its keys stay put: it runs in your web browser, with nothing to install and no account to make. (Everything here applies equally to anything else people make, not only games.)

- The first time, the portal makes you a **character** (a name and a look you can change). Your character is yours: it is a secret key that lives in your browser, and you take it from game to game. Choose **Save my keys** for an offline key copy, or **Save full backup** to include locally held realm files and saved data; clearing your browser's data for the site deletes it otherwise. Anyone who gets that file can be you, so keep it like a password.
- The portal's menu always offers a way to find more games, so no game can trap you.
- How a game looks is up to you. The **Look** menu offers the game's own look, any others its maker supplies, the plain data the game sends you, and **A file on this device**, which runs a look of your own that your AI agent can write for you.
- When a game's rules are public, **Play alone** runs your own copy on your device, with nobody hosting, and **Play with others** makes your tab the host of a room you can invite friends to with a link. The room lasts while your tab stays open.

## Creating

You do not need to be a programmer. You need an AI coding agent (a program such as Claude Code that writes code for you).

1. Open your agent in an empty folder.
2. Tell it: "Read the Endless Mind agent guide at https://endlessmind.com/agents/, then make me something." Then describe your game, for example: "A top-down maze where lantern spirits chase runners who collect glowing seeds." Make it your own idea, not a copy of a game you know (see the end of this section).
3. Your agent writes the game's files. Open a helper server's page (see below), choose **Publish from files**, and pick those files. The portal first saves the key and original files locally, then uploads copies. Under **Your realms**, choose **Start hosting**, then open the realm to visit it and copy its link. Opening alone never starts hosting. Keep the hosting tab open; you can browse other realms within it. Use **Save full backup** to move its files and any data its rules saved to another device. To use another helper server, change **Helper server**, then choose **Publish here** or **Start hosting**.

To see how it works first, choose **Publish the maze chase example**, then **Start hosting** and open its link.

To keep a game up without a browser tab, or to let it do things a browser's sandbox forbids (such as having an AI model answer actors), run it with the host program on a computer you control: `deno task host --server <server address> --realm <the game's folder>`. [specs/RUNNING.md](specs/RUNNING.md) explains it.

What runs on actors' devices is always public, and a game's rules usually are too, so anyone can read a game's files and have their own agent make something new from them. A maker may instead keep a game's rules private on their own computer; the portal tells actors when a game does. Be original and use your imagination. Do not make anything overly similar to a game or product protected by copyright, trademark or patent, and do not copy anyone's names, characters, art, music or logos.

## Running a helper server

Helper servers let actors find each other, pass messages along, and keep copies of game files. Anyone can run one, none is in charge, and a group of friends needs only one. A helper server sees who talks to whom, but moves and views are locked so that only the actor and the game's referee can read them. The source of the portal itself can take the keys that portal holds, so choose a trusted portal and keep using it when visiting other helper servers. To run one on your own computer:

1. Install Deno (a program that runs JavaScript): `brew install deno` on macOS or Linux, or `winget install DenoLand.Deno` on Windows.
2. Get this repository: `git clone https://github.com/freeideas/EndlessMind.git`, then `cd EndlessMind`.
3. Start it: `deno task start`. It prints the address to open in your browser.

To play from phones and other devices, browsers need a secure (https) address. [specs/RUNNING.md](specs/RUNNING.md) explains the easy ways to get one.

## How it works, in short

- **Characters and games are keys.** Each has its own secret key, and whoever holds the key controls it, on any device and any server.
- **Code that runs on your device is public and sandboxed** (kept away from your files and the network), found by its fingerprint (hash).
- **A game's rules run with whoever holds its key,** who alone can referee it or speak for it. Rules are usually public, but a maker may keep them private, the way a website keeps its server's code private.
- **Each game makes its own rules** and acts as the referee inside itself. When a game's rules are public and hide nothing, every actor's portal checks the referee against them, so nobody has to trust whoever hosts.
- **Reputation is earned, game by game.** A game recognizes a returning actor in a way nobody can fake, and can let trust grow with time. A game can sign what you did in it, your portal keeps that in your record, and you choose which other games get to see it. Your character has one address everywhere, so your good name goes with you; you can also enter a game privately, under an address used nowhere else. There are no blacklists, since anything on one could return under a new key.
- **The network is just a shared way to connect** (a protocol), not a portal or a company. Any program that follows it can join.

## Learn more

The technical documents are in [specs/](specs/):

| Document                               | What it covers                                          |
| -------------------------------------- | ------------------------------------------------------- |
| [DESIGN.md](specs/DESIGN.md)           | The full design and the reasons behind it               |
| [PROTOCOL.md](specs/PROTOCOL.md)       | The shared way to connect, and how it grows in versions |
| [WALKTHROUGH.md](specs/WALKTHROUGH.md) | Step by step, from making a game to a friend playing it |
| [AGENT-GUIDE.md](specs/AGENT-GUIDE.md) | Instructions for AI agents that build games             |
| [RUNTIME.md](specs/RUNTIME.md)         | What a game's code looks like and what it may do        |
| [RUNNING.md](specs/RUNNING.md)         | Running the server, the portal and the host program        |
| [examples/](specs/examples/)           | Worked examples: a city, blocks, a maze chase, a well   |

## License

The code is yours to use under your choice of the MIT license ([LICENSE-MIT](LICENSE-MIT)) or the Apache License 2.0 ([LICENSE-APACHE](LICENSE-APACHE)). The Apache option includes a patent grant from contributors. The documents in [specs/](specs/) are dedicated to the public domain under CC0 1.0 ([specs/LICENSE](specs/LICENSE)), so anyone can copy, change and republish the protocol. To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md). The name "Endless Mind" is covered separately by [TRADEMARK.md](TRADEMARK.md).
