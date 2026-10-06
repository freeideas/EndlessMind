# Monster maze: a fast-paced multiplayer game

A fast-paced multiplayer game. It needs a server; endlessmind.com is a cloud VM, so it can run there.

## How it plays

- It starts out looking just like the 2D maze game we already have (Endless Maze).
- As soon as the player makes one move, the screen vanishes and it says, "You just fell through a trap door!" Then the game becomes 3D.
- There are multiple players in each level, and a monster.
- When the monster eats a player, the player re-spawns in another part of the maze and has to start over, but with the clock still ticking.
- The monster can see through the walls and naively tries to move toward players, but it is not smart.
