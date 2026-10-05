# Example: big worlds

How the model in [DESIGN.md](../DESIGN.md) handles a large, busy world: a city with vehicles, or a world built of blocks that actors keep changing. No realm like this has been built; this is how the present model would be used, and where it runs out. Names are invented, and anything built should be the builder's own original work.

## Bulk content is data

- Giving every block, car or passer-by its own key would mean billions of objects. Instead the world is one realm, and they are data in its state, run by its rules. Who drives which car, or who may change which blocks, is just rules.
- Terrain can come from a seed (a number the terrain is calculated from) plus a list of changes. Each view carries the seed and the nearby changes, and the renderer calculates the rest, so views stay small. The rules check what an actor gathers against the seed, so nobody can invent rare materials.
- Each visitor's view holds only their share: the nearby streets, not the whole map.
- Money, materials and standing are numbers in the world's state. They stay there; another realm learns of them only from claims the world signs, and decides for itself what they are worth.

## Where it runs out

- **One referee carries everything.** A home connection serves tens of visitors, not a city's worth. A big world can instead be split into districts, each its own realm with its own referee, joined by doors that carry a travel note (see "Doors between realms" in [RUNTIME.md](../RUNTIME.md)).
- **Fast movement waits on the referee.** Every move goes to the referee and back through a relay, so steering feels as fast as that round trip.
- **The referee must stay up,** on an always-on machine running the host program, and save its state with `storage`.
