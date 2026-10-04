# Example: a world made of blocks

Written 2026-09-27. A technical example of how the Endless Mind model described in [DESIGN.md](../DESIGN.md) handles a world built from millions of small pieces that players keep changing. All names here are invented for this example. Anything built with Endless Mind should be the builder's own original work (see "Original work only" in the design).

## Bulk content is data, not objects

- Giving every block its own key pair would mean billions of objects per world. Instead, a region of the world (a "chunk", for example 16 by 16 blocks wide and the full height of the world) is the object, and its blocks are just data kept by that region's code.
- Blocks that act on their own can be full objects: a storage box, a machine, a creature. Each keeps its own contents and rules.
- The design already allows this, since what counts as an object is decided by code. The agent guide should state the general rule: make something an object when it acts or matters on its own, and keep bulk content as data inside an object.

## The world is a realm made of regions

- A world object holds a generation seed (a number from which the terrain is calculated) and the world's rules, for example free building or gathering resources. Untouched terrain is calculated from the seed on each player's own device, so it costs no hosting and no storage.
- Only changes are saved: which blocks were removed or placed, signed by whoever referees that region. The servers' storage role fits well: changes are encrypted and kept on several storage nodes, so a region's changes survive while its host is offline.
- Land claims come naturally. A player's home is a region realm they host inside the world, and their code decides who may change blocks there. Protection against vandalism is part of the model, not an add-on.

## Gathering, crafting, and value

- Anyone can make anything, so a rare material is worth something only because a world says so. The world's referee records what each visitor gathered and signs their inventory. Materials from a strict gathering world are trusted elsewhere; materials from a free-building world are not.
- Carrying items between worlds works like currency in the [city example](city.md): each world decides which other worlds' signed items it accepts.

## Extensions are just objects

- A new kind of block, creature or machine is an object an agent writes, and a world admits it by its code hash.
- A curated collection of extensions becomes a shared allow list: "this world runs these 200 approved pieces of code." Players subscribe to one the way they would pick a collection.

## Hard technical problems this example exposes

- **Machines that cross region borders.** A circuit or a water flow spanning two regions hosted on two devices needs the world to referee the border (locality: they meet only in a shared container). That is slow for fast machines.
- **Two players changing the same block.** Whoever referees the region must pick one order, and the other player's device must undo what it predicted.
- **Who referees unclaimed land.** Busy wild areas need someone to host them, or the rules fall back to the honor system while no host is online.
- **Trusting the terrain.** A player could generate fake materials on their own device, so materials found in untouched terrain should be checked against the seed by the world's referee before they count.
