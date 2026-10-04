# EveryGame

A worldwide network for games that anyone can make and anyone can play.

AI coding agents now let anyone make their own game just by describing it. EveryGame connects all those games into one open network, the way the web connects websites. There is no company in the middle and no central server to depend on. Anyone can make any game, in any language or engine, and anyone can play it from a link.

**Status: early.** The first working version runs: a helper server and a browser app in which one person publishes a game and others join it from a link on their own devices. Expect rough edges and frequent changes.

## Playing

Open a game's link. That is all: it runs in your web browser, with nothing to install and no account to make.

- The first time, the app makes you a **character** (a name and a look you can change). Your character is yours: it lives on your device, and you take it from game to game.
- Inside a game, the app's menu always offers a way to find more games, so no game can trap you.
- Some games may also offer a richer version in an installed app, for example one built with a game engine. The browser link always comes first.

## Creating

You do not need to be a programmer. You need an AI coding agent (a program such as Claude Code that writes code for you).

1. Open your agent in an empty folder.
2. Tell it: "Read the EveryGame agent guide at `specs/AGENT-GUIDE.md` in the EveryGame repository, then make me a game." Then describe your game, for example: "A top-down maze where lantern spirits chase players who collect glowing seeds."
3. Your agent writes the game's files. Open a helper server's page (see below), choose **Publish from files**, and pick those files. You get a link to share. Keep that browser tab open: it is the game's referee while others play.

To see how it works first, choose **Publish the maze chase example** instead.

Everything people make is public and remixable: anyone can copy a game and ask their own agent to change it. Make your own original work; do not copy other people's games, characters, names, art or music.

## Running a helper server

Helper servers let players find each other, pass messages along when devices cannot connect directly, and keep copies of game files. Anyone can run one, none is in charge, and a group of friends needs only one. To run one on your own computer:

1. Install Deno (a program that runs JavaScript): `brew install deno` on macOS or Linux, or `winget install DenoLand.Deno` on Windows.
2. Get this repository: `git clone https://github.com/freeideas/EveryGame.git`, then `cd EveryGame`.
3. Start it: `deno task start`. It prints the address to open in your browser.

To play from phones and other devices, browsers need a secure (https) address. [specs/RUNNING.md](specs/RUNNING.md) explains the easy ways to get one.

## How it works, in short

- **Everything is an object:** a character, a sword, a game world. Each one has its own digital key, which proves who controls it.
- **All game code is public** and is shared from person to person, like files on BitTorrent. Anyone can run it, but only the key holder can control the object.
- **Each game makes its own rules** and acts as the referee inside itself.
- **The network is just a shared way to connect** (a protocol), not an app or a company. Any program that follows it can join.

## Learn more

The technical documents are in [specs/](specs/):

| Document                               | What it covers                                          |
| -------------------------------------- | ------------------------------------------------------- |
| [DESIGN.md](specs/DESIGN.md)           | The full design: decisions so far and why               |
| [PROTOCOL.md](specs/PROTOCOL.md)       | The shared way to connect, and how it grows in versions |
| [WALKTHROUGH.md](specs/WALKTHROUGH.md) | Step by step, from making a game to a friend playing it |
| [AGENT-GUIDE.md](specs/AGENT-GUIDE.md) | Instructions for AI agents that build games             |
| [RUNTIME.md](specs/RUNTIME.md)         | What game code can call from inside its sandbox         |
| [RUNNING.md](specs/RUNNING.md)         | Running the server and app, including on many devices   |
| [examples/](specs/examples/)           | Worked examples: a city, a block world, a maze chase    |

## License

The code is yours to use under your choice of the MIT license ([LICENSE-MIT](LICENSE-MIT)) or the Apache License 2.0 ([LICENSE-APACHE](LICENSE-APACHE)). The Apache option includes a patent grant from contributors. The documents in [specs/](specs/) are dedicated to the public domain under CC0 1.0 ([specs/LICENSE](specs/LICENSE)), so anyone can copy, change and republish the protocol. To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md).
