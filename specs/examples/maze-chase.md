# Example: a small 2D maze chase

How an actor makes a small game on the model in [DESIGN.md](../DESIGN.md), from an idea to a game others can join. Names are invented, and anything built should be the builder's own original work.

## Making it

1. **The actor describes an original game to their agent**, for example: "Make a top-down maze where my friends collect glowing seeds while lantern spirits chase them." The agent reads the project's [agent guide](../AGENT-GUIDE.md) and writes one realm: a `realm.json`, a rules module and a renderer module.
2. **The maze is the realm.** Walls, seeds and the chasers are data in its state, run by its rules on the referee, so no actor can tamper with them.
3. **Forms are lent, not required.** The realm gives each visitor a runner in their character's color on entry and removes it on exit, so anyone can play at once.
4. **Multiactor comes almost free.** Every visitor is a rival runner after the same seeds. The realm referees who collected what.
5. **2D is just a viewpoint.** The realm's default renderer draws a flat top-down view of plain data. Anyone could write a 3D renderer for the same views.
6. **Scores are realm state.** They live in the maze while its referee runs. Through a door to another maze (the `DOORS` list in its rules), a runner's seeds go along in a travel note.

## Putting it online

- The realm's `realm.json` gives it a few tags ("maze", "chase", "multiplayer"). Publishing announces it on the server under those tags, so it shows up in "Find realms".
- Choose **Start hosting** to run its referee in this tab, or run the host program. Opening its link only visits. A full backup carries its key and files elsewhere; starting hosting there on the same helper server replaces the previous host.
- The way in is a link, `https://<server>/#emind:<realm address>?via=<server>`. The key names the realm and the `via` hint says where it is announced. Anyone who opens it can join.

A working version of this example is in this repository under `examples/maze-chase/`.

The example ships two renderers for the same views: the drawn maze, and a text-only one offered under `renderers` in its `realm.json`. In the portal, the **Look** menu switches between them while playing.
