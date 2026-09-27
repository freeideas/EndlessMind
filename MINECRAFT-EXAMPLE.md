# Minecraft: example

Written 2026-09-27. A thought experiment: how someone could build a peer-to-peer game in the style of Minecraft on the EveryGame model described in [BRAINSTORM.md](BRAINSTORM.md). It tests the design against a world made of millions of blocks that players keep changing.

## Blocks are data, not objects

- Giving every block its own key pair would mean billions of objects per world. Instead, a chunk (a 16×16 column of the world) is the object, and its blocks are just data kept by the chunk's code.
- Blocks that do something can be full objects: a chest, a furnace, a redstone machine, a pet. Each keeps its own contents and rules.
- The design already allows this, since what counts as an object is decided by code. The agent guide should say so plainly, so agents do not make every block an object.

## The world is a realm made of chunks

- A world object holds the generation seed and the rules (survival, creative, hardcore). Untouched terrain is generated from the seed on each player's own device, so it costs no hosting and no storage.
- Only changes are saved: which blocks were mined or placed, signed by whoever referees that chunk. The storage role of the servers fits well: changes are encrypted and kept on several storage nodes, so a chunk's changes survive while its host is offline.
- Land claims come naturally. Your house is a chunk realm you host inside the world, and your code decides who may break blocks there. Protection from griefing (wrecking other people's builds) is built in, not a plugin.

## Mining, crafting, and scarcity

- Anyone can make anything, so a diamond is worth something only because a world says so. The world's server side records what you mined and signs your inventory. Diamonds from a strict survival world are trusted elsewhere; diamonds from a creative world are not.
- Carrying items between worlds works like money in the [GTA 6 example](GTA6-EXAMPLE.md): each world decides which other worlds' signed items it accepts.

## Mods are just objects

- In Minecraft, mods are a big part of the appeal and hard to install. Here, a new block, creature or machine is an object an agent writes, and a world admits it by its code hash.
- Modpacks become shared allow lists: "this world runs these 200 approved pieces of code." Players subscribe to one the way they would pick a modpack.

## Hard parts this example exposes

- **Machines that cross chunk borders.** A redstone circuit or water flow spanning two chunks hosted on two devices needs the world to referee the border (locality: they meet only in a shared container). That is slow for fast circuits.
- **Two players editing the same block.** Whoever referees the chunk must pick one order, and the other player's device must undo what it predicted.
- **Who referees unclaimed land.** Busy wild areas need someone to host them, or the rules fall back to the honor system while no host is online.
- **Trusting the terrain.** A player could generate fake ore on their own device, so ore found in untouched terrain should be checked against the seed by the world's server side before it counts.
