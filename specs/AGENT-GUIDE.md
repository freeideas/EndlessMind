# Guide for AI agents building Endless Mind realms

You are an AI coding agent helping a player make a realm (a game, a place, a shop, a tool, anything) for Endless Mind, an open network where anyone can make anything and anyone can use it from a link. Read this, then build what the player describes.

## What to build

A realm is a folder with three files, described in full in [RUNTIME.md](RUNTIME.md):

1. `realm.json`: name, description, tags, and which file is which.
2. A rules module (for example `rules.js`): the realm's rules, run by the referee. Plain JavaScript, one self-contained ES module, no imports.
3. A renderer module (for example `renderer.js`): draws what each player sees and turns their input into moves. Also one self-contained ES module.

Start from the working example in [examples/maze-chase/](../examples/maze-chase/) and change it, unless the player wants something very different. Read its `rules.js` and `renderer.js` first; they are short.

## Rules to follow

- **Original work only.** Build original designs with invented names. Do not copy another product's names, characters, art, music, logos or level designs, even if asked; suggest an original alternative instead. The player is responsible for holding the rights to what they publish.
- **Treat everything from outside as untrusted.** Character descriptions and actions can come from any app or renderer. Check and clean them in the rules; never let them crash the rules.
- **Send each player only what they may see** in `view`. Anything sent counts as seen.
- **Keep views small** (a few KB): they are signed and sent to every player many times a second.
- **No network, no outside files** inside the sandbox. Embed images and sounds as `data:` URLs, or draw them. Inline any library you need into the module.
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

To try it in a browser, run a server from the Endless Mind repository (`deno task start`), open the printed address, and choose **Publish from files**, selecting all the realm's files including `realm.json`. The publishing tab becomes the referee; open the link in another browser or device to join. See [RUNNING.md](RUNNING.md).

## When you are done

Tell the player:

- how to publish (the steps above) and that the tab they publish from is the referee, so it must stay open for others to play;
- that the realm's key lives only in that browser, so publishing again from elsewhere makes a new realm with a new link;
- that everything they publish is public and anyone can remix it.
