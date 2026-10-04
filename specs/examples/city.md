# Example: a large shared city

A technical example of how the Endless Mind model described in [DESIGN.md](../DESIGN.md) handles a large, busy world with vehicles, many visitors and fast movement. All names here are invented for this example. Anything built with Endless Mind should be the builder's own original work (see "Original work only" in the design).

## Splitting a big world across many hosts

- The city ("Harborlight" in this example) is one realm object. Its code holds the map, traffic signals, time of day and the city's own rules.
- The city contains districts, and each district can be hosted on a different device. This spreads the load, since one home connection can host only tens of visitors.
- Buildings are realms inside districts. A shop, a hall or a workshop can each be built by a different player, and each decides who may enter, as long as its district admits it.

## Vehicles: fast physics on the driver's device

- A vehicle is an object. Its public code draws it and runs the steering physics on the driver's own device, so driving responds instantly. What the owner controls (fuel, upgrades, a location beacon) is signed by the owner's key, and any secret parts are encrypted.
- **Borrowing and taking over vehicles.** Private keys never move, so control of a vehicle can change hands only by rules. An owner can lend a vehicle to the city, and the city's referee records who is driving it at each moment. If the city's rules let one visitor take over a parked vehicle, the city simply records the new driver. The owner's own code decides what it allows beyond that, such as a beacon that reports where the vehicle is, or refusing to run outside the city.
- **Limits on tools.** The city admits only tool code it has approved (by code hash), and it keeps its own record of every visitor's health or energy. A modified tool cannot do more than the city's rules allow.

## City-run characters and tasks

- Traffic and passers-by are simple objects the city creates. They are cheap public code, so each player's device can draw and move them locally.
- Rule keepers (guards, referees, officials) are objects run by the city's referee (its key holder or authorized host), so visitors cannot tamper with them.
- Tasks are objects anyone can write. A task giver hands a visitor a package, and the task's referee checks delivery against position records signed by the city.

## Money and records between realms

- Currency is a balance signed by the city. Another realm can trust it, accept it at a discount, or ignore it. Players could run exchanges between realms.
- A visitor's record in the city (good standing, bans) is also a signed statement. Other realms decide for themselves whether to trust it.

## Joining other worlds

- A player's AI agent can add a new vehicle, a race track or a whole island in one conversation, and the city's agent decides whether to admit it.
- Two separate worlds can connect when both sit inside a shared realm, such as a "highway" realm that referees crossings between them.

## Hard technical problems this example exposes

- **Fast collisions between players.** Two vehicles driven from two devices collide and need one quick shared answer. The district must referee in real time, or each driver's device predicts locally and the district corrects it afterward, as fast-paced online games commonly do.
- **Hosting.** A busy city needs always-on machines for its districts, so a popular city depends on someone volunteering, or charging, for hosting.
- **A district going offline.** Its streets freeze or become walled off. That fits the "ruins and sealed doors" idea, but it is awkward in the middle of a chase.
- **Safety among strangers.** Moderation is per person, so a city full of strangers depends on shared allow lists and block lists.
