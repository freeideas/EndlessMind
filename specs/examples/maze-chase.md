# Example: a small 2D maze chase

A technical example of how a player could make their own small game on the Endless Mind model described in [DESIGN.md](../DESIGN.md), and go from an idea to a game others can join. All names here are invented for this example. Anything built with Endless Mind should be the builder's own original work (see "Original work only" in the design).

## Making it

1. **The player describes an original game to their agent**, for example: "Make a top-down maze where my friends collect glowing seeds while lantern spirits chase them." The agent reads the project's [agent guide](../AGENT-GUIDE.md) and writes one realm: a `realm.json`, a rules module and a renderer module.
2. **The maze is the realm.** Walls, seeds and the chasers are data in its state, run by its rules on the referee, so no player can tamper with them.
3. **Forms are lent, not required.** The realm gives each visitor a runner in their character's color on entry and removes it on exit, so anyone can play at once.
4. **Multiplayer comes almost free.** Every visitor is a rival runner after the same seeds. The realm referees who collected what.
5. **2D is just a viewpoint.** The realm's default renderer draws a flat top-down view of plain data. Anyone could write a 3D renderer for the same views.
6. **Scores are realm state,** sent in views signed by the realm, so they can be trusted by anyone who trusts that realm.

## Putting it online

- The realm's `realm.json` gives it a few tags ("maze", "chase", "multiplayer"). Publishing announces it on the server under those tags, so it shows up in "Find realms".
- While a browser tab holding the realm's key is open, the realm is online. Saving the key and loading it elsewhere moves the referee to another device or server.
- The way in is a link, `https://<server>/#emind:<realm address>?via=<server>`. The key names the realm and the `via` hint says where it is announced. Anyone who opens it can join.

A working version of this example is in this repository under `examples/maze-chase/`.
