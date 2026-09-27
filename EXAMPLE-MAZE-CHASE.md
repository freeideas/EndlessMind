# Example: a small 2D maze chase

Written 2026-09-27. A technical example of how a player could make their own small game on the EveryGame model described in [BRAINSTORM.md](BRAINSTORM.md), and go from an idea to a game others can join. All names here are invented for this example. Anything built with EveryGame should be the builder's own original work (see "Original work only" in the brainstorm).

## Making it

1. **The player describes an original game to their agent**, for example: "Make a top-down maze where my friends collect glowing seeds while lantern spirits chase them." The agent reads the project's agent guide and writes one realm object.
2. **The maze is the realm.** Walls and seeds are data inside it, like blocks in the [block world example](EXAMPLE-BLOCK-WORLD.md). The chasers are objects the realm runs in its server-side code, so no player can tamper with them.
3. **Bodies are lent, not required.** Instead of making visitors bring a compatible body, the realm lends each one a runner body on entry and takes it back on exit, so anyone can play at once. A realm wanting more variety could also admit visitors' own bodies if they have `move` and `caught`.
4. **Multiplayer comes almost free.** Other visitors can enter as chasers, or as rival runners after the same seeds. The realm referees who collected what.
5. **2D is just a viewpoint.** The realm tells viewers to use a flat top-down camera, and the looks are flat boxes and circles. No separate 2D system is needed.
6. **Scores are signed by the realm,** so a high-score table can be trusted by anyone who trusts that realm.

## Putting it online

- The player marks the realm "wants to be found" and gives it a few tags ("maze", "2D", "multiplayer"). The device then announces it to its servers.
- While the player's browser tab is open, the realm is online. To keep it up all the time, the same code runs on an always-on machine with the headless runner, which runs object code without a browser.
- The simplest way in is a link: the realm's public key plus the servers where it announces itself. Anyone who opens the link can join.
