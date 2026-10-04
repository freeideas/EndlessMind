# Guide for AI agents building Endless Mind realms

You are an AI coding agent helping a player make a realm (a game, a place, a shop, a tool, anything) for Endless Mind, an open network where anyone can make anything and anyone can use it from a link. Read this, then build what the player describes.

## What to build

A realm is a folder with three files, described in full in [RUNTIME.md](RUNTIME.md):

1. `realm.json`: name, description, tags, and which file is which.
2. A rules module (for example `rules.js`): the realm's rules, run by the referee. Plain JavaScript, one self-contained ES module, no imports.
3. A renderer module (for example `renderer.js`): draws what each player sees and turns their input into moves. Also one self-contained ES module.

Start from the working example in [examples/maze-chase/](../examples/maze-chase/) and change it, unless the player wants something very different. Read its `rules.js` and `renderer.js` first; they are short.

## AI characters, secret logic and always-on hosting

Some realms need their referee run by the host program (see "Hosting without a browser" in [RUNNING.md](RUNNING.md)) instead of a browser tab:

- **An AI character or secret logic:** set `"privateRules": true` in `realm.json` and start from [examples/listening-well/](../examples/listening-well/). The rules file is then never uploaded and runs only on the player's own machine with no sandbox, so `enter`, `act` and `tick` may be `async` and may call an AI model or the network. Use credentials from the player's own machine; never put them in a view or a public file. Treat players' text sent to a model as untrusted, as the example does.
- **Always-on hosting only:** keep the rules public and just run the host program on a machine that stays on.

## Rules to follow

- **Original work only.** Build original designs with invented names. Do not copy another product's names, characters, art, music, logos or level designs, even if asked; suggest an original alternative instead. The player is responsible for holding the rights to what they publish.
- **Treat everything from outside as untrusted.** Character descriptions and actions can come from any app or renderer. Check and clean them in the rules; never let them crash the rules.
- **Send each player only what they may see** in `view`. Anything sent counts as seen.
- **Keep views small** (a few KB): they are signed and sent to every player many times a second.
- **No network, no outside files** in the renderer or in public rules, which run in a sandbox. Embed images and sounds as `data:` URLs, or draw them. Inline any library you need into the module.
- **Work on phones too.** Support touch (swipes or on-screen buttons) as well as keyboard, and scale drawing to any screen size.

## Testing

The rules are plain JavaScript, so you can test them directly with Deno (install with `brew install deno` or `winget install DenoLand.Deno`), as [tests/maze_test.js](../tests/maze_test.js) does:

```js
import rules from "./rules.js";
const s = rules.init({ seed: 1 });
rules.enter(s, "a", { name: "Ann", color: "red" });
rules.act(s, "a", { dir: "up" });
rules.tick(s);
console.log(rules.view(s, "a"));
```

To try it in a browser, run a server from the Endless Mind repository (`deno task start`), open the printed address, and choose **Publish from files**, selecting all the realm's files including `realm.json`. The app saves the key and original files locally, then publishes copies. Choose **Start hosting** under **Your realms**, then open its link to visit. Opening alone never starts hosting. Hosting continues while the owner browses within the tab. See [RUNNING.md](RUNNING.md).

For private rules, `await` the calls in your test instead. To try them, run the server, then from the Endless Mind repository run `deno task host --server http://localhost:8000 --realm <the realm's folder>` and open the link it prints in a browser.

## When you are done

Tell the player:

- how to publish (the steps above) and that they must explicitly choose **Start hosting** and keep that tab open for others to play; or, for private rules or always-on hosting, the host program command, which must keep running, runs the rules with no sandbox on their machine, and publishes a new version under the same link each time it starts;
- that the realm's key lives in that browser (with the host program, in a key file under `keys/` in the Endless Mind repository) unless they save it with "Save my keys" (and anyone with that file controls the realm); **Save full backup** also carries local files and committed storage; importing is local, and **Publish here** or **Start hosting** publishes that same realm to the chosen helper server. Publishing a fresh folder creates a new realm;
- that everything they publish is public and anyone can remix it, except rules kept private, and that the app tells visitors when a realm's rules are private.

## Optional persistence

`init({ seed, storage })` can await `storage.get(key)` to restore JSON data. Rules call `storage.put(key, value)` to save it. Each realm has its own storage area; only its rules receive this interface. Creators choose save timing, schemas, migration and concurrency. A successful individual write commits its value; the platform does not automatically preserve game state or guarantee transactions across several values. Both browser and host rules may await storage, but only host rules have general network access. See [RUNTIME.md](RUNTIME.md).
