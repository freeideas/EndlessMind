# Pac-Man: example

Written 2026-09-27. A thought experiment: how a player could make their own small game, a 2D maze game in the style of Pac-Man, on the EveryGame model described in [BRAINSTORM.md](BRAINSTORM.md). It tests how easy it is to go from an idea to a game others can join.

## Making it

1. **The player asks their agent**, for example: "Make me a Pac-Man-style maze game that friends can join." The agent reads the project's agent guide and writes one realm object.
2. **The maze is the realm.** Walls and pellets are data inside it, like blocks in the [Minecraft example](MINECRAFT-EXAMPLE.md). The ghosts are objects the realm runs in its server-side code, so no player can cheat them.
3. **Bodies are lent, not required.** Instead of making visitors bring a compatible body, the realm lends each one a Pac-Man body on entry and takes it back on exit, so anyone can play at once. A realm wanting more variety could also admit visitors' own bodies if they have `move` and `beEaten`.
4. **Multiplayer comes almost free.** Other visitors can enter as ghosts, or as rival Pac-Men racing for the same pellets. The realm referees who ate what.
5. **2D is just a viewpoint.** The realm tells viewers to use a flat top-down camera, and the looks are flat boxes and circles. No separate 2D system is needed.
6. **Scores are signed by the realm,** so a high-score table can be trusted by anyone who trusts that realm.

## Putting it online

- The player marks the realm "wants to be found" and gives it a few tags ("arcade", "2D", "multiplayer"). The device then announces it to its servers.
- While the player's browser tab is open, the realm is online. To keep it up all the time, the same code runs on an always-on machine with the headless runner, which runs object code without a browser.
- The simplest way in is a link: the realm's public key plus the servers where it announces itself. Anyone who opens the link can join.
