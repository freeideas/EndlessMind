# Example: a large shared city

A technical example of how the Endless Mind model described in [DESIGN.md](../DESIGN.md) handles a large, busy world with vehicles, many visitors and fast movement. All names here are invented for this example. Anything built with Endless Mind should be the builder's own original work (see "Original work only" in the design).

## One realm, refereed in one place

- The city ("Harborlight" in this example) is one realm. Its rules hold the map, traffic signals, time of day, vehicles, traffic and passers-by, all as state, and run on its referee.
- Visitors send only moves ("steer left", "brake", "enter shop"). The rules decide what happens, so a modified app cannot drive faster or carry more than the rules allow.
- Vehicles are realm state. Who is driving which vehicle, who owns it, and whether a parked one may be taken are all the city's rules.
- Each visitor gets only their share of the city in their view: the nearby streets, not the whole map.

## Money and records

- Currency is a balance in the city's state, sent in views signed by the city. Another realm can trust it, accept it at a discount, or ignore it.
- A visitor's standing in the city (good standing, bans) is also city state. Other realms decide for themselves whether to trust what the city says.

## What limits it today

- **One referee carries everything.** A home connection can serve tens of visitors, not a whole city's worth. Splitting a city across several referees would need realms inside realms, which the reference app does not have.
- **Fast movement waits on the referee.** Every move goes to the referee and back through a relay, so steering feels as fast as that round trip.
- **The referee's tab must stay open.** A busy city needs an always-on machine holding its key (the headless runner, needed before a public launch).
