# Example: a world made of blocks

A technical example of how the Endless Mind model described in [DESIGN.md](../DESIGN.md) handles a world built from many small pieces that players keep changing. No realm like this has been built: it is a sketch of how the present model would be used and where it runs out. All names here are invented for this example. Anything built with Endless Mind should be the builder's own original work (see "Original work only" in the design).

## Blocks are data, not objects

- Giving every block its own key would mean billions of objects. Instead the world is one realm, and its blocks are data in the realm's state. Storage boxes, machines and creatures are data too, run by the world's rules.
- The general rule for builders and agents: keep bulk content as data inside a realm.

## Terrain from a seed

- The world's state holds a generation seed (a number from which the terrain is calculated) plus a list of changes: blocks removed or placed. Untouched terrain is not stored or sent.
- Each player's view carries the seed and the changes near them, and the renderer calculates the terrain itself, so views stay small.
- The rules decide who may change which blocks, so land claims and protection against vandalism are just rules.

## Gathering and value

- Anyone can make anything, so a rare material is worth something only because a world says so. The world's rules record what each visitor gathered. They cannot be carried to another world: nothing crosses realms.
- Materials found in untouched terrain are checked against the seed by the rules on the referee, so a player cannot invent them.

## What limits it today

- **Saved state:** the reference app does not save realm state yet, so the world's changes last only while its referee runs.
- **One referee:** a home connection serves tens of players, and every change passes through it.
