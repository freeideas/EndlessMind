# Example: a small 2D maze chase

Written 2026-09-27. A technical example of how a player could make their own small game on the EveryGame model described in [DESIGN.md](../DESIGN.md), and go from an idea to a game others can join. All names here are invented for this example. Anything built with EveryGame should be the builder's own original work (see "Original work only" in the design).

## Making it

1. **The player describes an original game to their agent**, for example: "Make a top-down maze where my friends collect glowing seeds while lantern spirits chase them." The agent reads the project's [agent guide](../AGENT-GUIDE.md) and writes one realm object.
2. **The maze is the realm.** Walls and seeds are data inside it, like blocks in the [block world example](block-world.md). The chasers are objects the realm's referee runs, so no player can tamper with them. (For a single-player version, the whole game runs in the player's browser with no referee at all.)
3. **Bodies are lent, not required.** Instead of making visitors bring a compatible body, the realm lends each one a runner body on entry and takes it back on exit, so anyone can play at once. A realm wanting more variety could also admit visitors' own bodies if they have `move` and `caught`.
4. **Multiplayer comes almost free.** Other visitors can enter as chasers, or as rival runners after the same seeds. The realm referees who collected what.
5. **2D is just a viewpoint.** The realm's default renderer uses a flat top-down camera, and the looks are flat boxes and circles. No separate 2D system is needed, and anyone can write a 3D renderer for the same maze.
6. **Scores are signed by the realm,** so a high-score table can be trusted by anyone who trusts that realm.

## Putting it online

- The player marks the realm "wants to be found" and gives it a few tags ("maze", "2D", "multiplayer"). The device then announces it to its servers.
- While the player's browser tab is open, the realm is online. To keep it up all the time, the same code runs on an always-on machine with the headless runner, which runs object code without a browser.
- The simplest way in is a link: the realm's public key plus the servers where it announces itself. The key, not the server, names the realm, so the link works from any mirror and in any app. Anyone who opens it can join.

A working version of this example is the first demo; its source files are in this repository under `examples/maze-chase/`.
