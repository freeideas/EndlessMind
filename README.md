# Endless Mind™

A free, open network for anything AI can make: games, places, shops, tools, whole universes. Anyone can make it, and anyone can play it from a link.

AI coding agents now let anyone make a game just by describing it. Endless Mind connects all of them, the way the web connects websites, with no company in the middle. What ties it together is identity: you are the same player everywhere, and what you earn in one game you can show in another, with proof.

**Try it:** [Endless Maze](https://relay.endlessmind.com/) is a small example realm, and [portal.endlessmind.com](https://portal.endlessmind.com/) is an EntryPortal.

## Your secret phrase

You are your **secret phrase**: 24 ordinary words. They are your one identity in every realm (a game, a place, anything you can enter). There is no account, password or email address.

- **It never leaves your device.** An EntryPortal turns your phrase into a key kept inside your browser. The key can prove that you have your phrase, but nobody can read it out, not even the page itself.
- **Keep it.** You see a new phrase only once. The easiest way: take a screenshot or a photo of the setup screen. It also shows a code that sets up any other device: scan it with that device, or give that device the picture. You never have to type the words. Or write them on paper. Keep the screenshot to yourself, since anyone who has it can impersonate you.
- **You get a name.** Games show you by a friendly name, such as "Witty Clover", which you can change in your EntryPortal. Behind it is your **player ID**, a long code that you never need to read or type.
- **Anyone who has it can impersonate you, forever.** If it is lost, nobody can get it back for you, not even us. If it is stolen, you can burn that identity: type the phrase into your EntryPortal once more and it reveals your secret so anyone can use it, and from then on any use of it is a ghost that nobody takes seriously, so it is worthless to the thief. Either way you start over with a new phrase and no history. You can also burn an identity on purpose, to retire it. Burning is permanent.
- **Any EntryPortal works.** An EntryPortal is a small web page, usually on your phone, that proves who you are. Anyone can host one, and they all turn the same phrase into the same **player ID**. If yours disappears, type your phrase into another and carry on.
- **Ask your AI helper before trusting a page.** "Someone asked me to type my secret phrase into [address]. Is it safe?" EntryPortals are built so that this question has a clear answer.
- **You type your phrase only when you set up a device, or when you choose to burn it.** If a page asks for it while you are playing, it is a trick. Close it.

## Playing

1. Open a realm's link, on a computer or anywhere else. Many realms let you play right away as a guest.
2. To play as yourself, choose to sign in. The realm shows a QR code. Scan it with your phone, check that the site name is right, and tap once. Your EntryPortal proves who you are to that realm, without showing your phrase to anyone, and your screen starts the game.
3. The first time, your phone has no EntryPortal yet. It offers to make your secret phrase, or to take the one you already have.
4. No phone, or the code will not scan? Use the "sign in on this computer" link, or type the short address shown under the code into your EntryPortal.

Only scan a sign-in code right after you pressed "Sign in" in a game yourself. If someone sends or shows you a code, on a web page, in a video or in a message, do not scan it: it would sign them in as you.

## Your records

A realm can give you signed **records**: "in good standing as of 1 December", "finished the Glass Maze in 4 minutes 12 seconds", or a trade, "P gives the helmet to Q, and Q gives 95 diamonds to P".

- Your EntryPortal shows you every record before you sign it.
- When you sign a record you can add words of your own: a review, a boast. They travel with the record, and nobody else can change them.
- Records are signed by everyone involved, so anyone you show them to can check them, and nobody can fake them.
- You keep the records you want and drop the rest. Your reputation can only grow.
- Your EntryPortal can save your records as a file, which any other EntryPortal can load.
- Each record has a **public** switch, on unless you turn it off. Public records are how your reputation becomes visible, and how good realms get found. Turn it off for anything you would rather keep to yourself.
- Want a separate identity for something private? Use a second secret phrase. Your player ID hides your name, but like any website, realms can see your connection, so this is privacy from other people, not a place to hide from the law.

## Finding realms

You find realms on **boards**: realms whose purpose is listing other realms, run by anyone. There are no likes or votes. Boards rank realms by real play: public records from players who are themselves known to play in realms the board trusts. Playing a realm a lot is the strongest recommendation you can give. Most realms link to a board, and endlessmind.com lists boards to start from.

Every host has a board of its own at `endlessmind/board` under its address. It lists the games that the hosts it knows run, with where to play each one and how much play is on record for it. There you can also **wish** for a game: a record, signed like any other, that asks hosts to run it. Your newest wish counts, for a week.

## Getting the program

One download, the `endlessmind` command, runs and hosts games. Nobody needs Deno installed first.

| On              | Install with                                                                            |
| --------------- | --------------------------------------------------------------------------------------- |
| macOS           | `brew install freeideas/tap/endlessmind`                                                |
| Debian, Ubuntu  | the `.deb` from the releases page: `sudo apt install ./endlessmind_<version>_<arch>.deb` |
| Arch            | the `PKGBUILD` from the releases page: `makepkg -si`                                    |
| Windows         | `winget install FreeIdeas.EndlessMind`                                                  |
| Anything else   | the archive for your system from the releases page, unpacked anywhere                   |

The releases page is [github.com/freeideas/EndlessMind/releases](https://github.com/freeideas/EndlessMind/releases). Working from a checkout of this repository needs [Deno](https://deno.com/) instead, and `deno task` in place of `endlessmind`.

## Making realms

Describe your game to your AI coding agent and point it at this repository. The agent writes the game and starts it on your computer with [the host program](host/README.md) (`endlessmind run <folder>`), which gives you a link to play it; [Endless Maze](examples/maze/README.md) is a small example to start from, and [Monster Maze](examples/monster/README.md) a fast one for several players at once. A game server may also be written in another language, such as Rust, and compiled to WebAssembly: see [Shared Button](examples/counter/README.md). Friends anywhere can join while your computer is on, through a relay: a go-between on the web that anyone can run with the same program, and that the program finds by itself. From then on your game has an ID, and anyone who has that ID can host your game on their own server, or at home, with no address to give: hosts find each other. To put a game on the web for good, run the same program on a server of your own (`sudo endlessmind setup` does the whole job on Linux), which needs no domain name; there it is also a relay and an EntryPortal for others. A host whose admin allows it also loads the most wished-for games by itself, so a game people want finds a home without anyone asking a host's owner. A game with private server code can instead use the realm library for [Deno](realm/README.md) or [Python](realm-py/README.md).

Be original: do not make anything overly similar to someone else's game, and do not copy anyone's names, characters, art, music or logos.

## Learn more

| Document                         | What it covers                                          |
| -------------------------------- | ------------------------------------------------------- |
| [DESIGN.md](specs/DESIGN.md)     | The design, the reasons behind it, and what is not decided yet |
| [PROTOCOL.md](specs/PROTOCOL.md) | Exact formats: IDs, signing in, records, EntryPortal rules |
| [PLAN.md](PLAN.md)               | What is being built next                                |

## License

The code is yours to use under your choice of the MIT license ([LICENSE-MIT](LICENSE-MIT)) or the Apache License 2.0 ([LICENSE-APACHE](LICENSE-APACHE)). The Apache option includes a patent grant from contributors. The documents in [specs/](specs/) are dedicated to the public domain under CC0 1.0 ([specs/LICENSE](specs/LICENSE)), so anyone can copy, change and republish the protocol. To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md). The name "Endless Mind" is covered separately by [TRADEMARK.md](TRADEMARK.md).
