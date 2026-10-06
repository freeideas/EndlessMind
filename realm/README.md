# The realm library

What a realm on Deno includes to join Endless Mind: sign-in by QR code, claiming records, its realm card, its public list and refusing burned IDs. The formats are in [specs/PROTOCOL.md](../specs/PROTOCOL.md); [examples/lantern-garden/](../examples/lantern-garden/) uses all of it.

| File                  | What it is                                                                  |
| --------------------- | --------------------------------------------------------------------------- |
| `realm.js`            | The server side: `openRealm`, then `realm.handle(request)` in `Deno.serve`  |
| `signin.js`           | The browser side: the sign-in and claim box, served at `<base>endlessmind/signin.js` |
| `vendor/qrcodegen.js` | Project Nayuki's QR Code generator v1.8.0 (MIT), types removed, otherwise unchanged |

## Use

```js
import { openRealm } from "./realm/realm.js";

const realm = await openRealm({
  base: "https://garden.example.org/", // the public address; the realm answers under it
  card: { name: "My Realm", description: "What it is, in a sentence." },
});
Deno.serve(async (request) => (await realm.handle(request)) ?? myGame(request));

// In the game:
const player = await realm.player(request); // the player ID, or null for a guest
realm.playerName(player); // the name to show for them, such as "Witty Clover"
realm.records(player); // every record signed with them, public and private (only public ones are listed)
await realm.offer(player, [{ text: "Finished the Glass Maze." }]); // a record for the player to claim
```

On the page: `import { mountSignIn } from "./endlessmind/signin.js"; mountSignIn(element, { onChange })`.

A game keeps its data in `.data/` inside its own folder, which Git ignores and which a web server that refuses names starting with a dot (as endlessmind.com's does) never serves. The realm's secret phrase is made on first run in `.data/realm-secret.txt` (option `secretFile`); keep a copy, since it is the realm's identity. What it must remember (sessions, records waiting to be claimed, the public list, burned IDs) goes in `.data/realm-data.json` (option `dataFile`). Keep the game's own data there too. Other options: `portal` (the EntryPortal its codes name), `isBurned` (check a board's list of burned IDs too) and `onRecord` (called with each completed record).

## What it answers

| Address under `base`         | What                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| `endlessmind-card.json`      | The realm card, signed at start-up                                    |
| `endlessmind-list.json`      | The public list                                                       |
| `join/<code>`                | Sign-in notes and burn notices (POST); a visit goes on to the EntryPortal |
| `claim/<code>`               | A visit goes on to the player's EntryPortal; records come back (POST) |
| `endlessmind/start`, `claim` | Make a join or claim code for the page (POST); `start?rename` for a name change |
| `endlessmind/wait/<code>`    | The page waits here; a finished sign-in gets its session cookie here  |
| `endlessmind/me`, `signout`  | Who is signed in, and how many records wait to be claimed             |
| `endlessmind/restore`        | Hand a signed-in player every record kept for them (POST)              |

Join codes work once, for two minutes. Only the page that asked for a code (it holds a secret token) can collect the session, so seeing someone's code on screen is not enough to take their sign-in.
