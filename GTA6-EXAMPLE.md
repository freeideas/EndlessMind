# GTA 6: example

Written 2026-09-27. A thought experiment: how someone could build a peer-to-peer game in the style of Grand Theft Auto on the EveryGame model described in [BRAINSTORM.md](BRAINSTORM.md). It tests the design against a fast, crowded, open-world game.

## The city is a realm, made of smaller realms

- One player (or a group) builds "Vice Harbor", a city object whose code runs the streets, traffic lights, time of day and the police.
- The city contains districts, and each district can be hosted by a different device: downtown on one person's always-on machine, the docks on another. That spreads the load, which matters because one home connection can host only tens of visitors.
- Buildings are realms too. A bank, a nightclub or a garage can each be built by a different player, and each decides who gets in, as long as its district admits it.

## Cars, weapons, and "stealing"

- A car is an object. Its client-side code draws it and runs the steering physics on the driver's own device, so driving feels fast. Its server-side code holds what the owner controls: fuel, upgrades, a tracker.
- Real theft is impossible, because no one can take a private key. So "stealing a car" is a rule the city keeps. The city's server side records who is driving each car, and jacking a car means the city says the driver is now you. The car's owner lent it to the city on those terms, and the owner's own code decides what happens next: a tracker that calls the police, or a car that will not start outside the city.
- Guns work like the sword in the planned demo. The city admits only gun code it has approved and keeps its own damage count for each visitor, so a modified gun cannot do more damage than the rules allow.

## Police, pedestrians, missions

- The police are ordinary objects run by the city's code: wanted level, chases, arrests. A player could run a police department as a realm inside the city.
- Pedestrians and traffic are simple objects the city creates. Because they are cheap client-side code, each viewer's device can draw and move them locally.
- Missions are objects anyone can write. A mission giver in a bar lends you a briefcase, and the mission's server-side code checks whether you delivered it, using position records signed by the city.

## Money and reputation

- Cash is a balance signed by the city. Another city can trust Vice Harbor's money, accept it at a discount, or ignore it. Players might run banks that exchange money between cities.
- A wanted level or criminal record is also a signed statement. A strict city might refuse entry to anyone with a Vice Harbor record.

## What makes it more than GTA

- A player's AI agent can add a helicopter, a racing league or a whole island in one conversation, and the city's agent decides whether to admit it.
- Other games can connect. Drive out of Vice Harbor into someone's zombie realm next door, as long as both sit inside a shared "highway" realm that referees the crossing.

## Hard parts this example exposes

- **Fast collisions between players.** Two cars driven from two devices crash and need one quick shared answer. The district must referee in real time, or each driver's device predicts locally and the district corrects it afterward, as online shooters already do.
- **Hosting.** A busy city needs always-on machines for its districts, so a popular city depends on someone volunteering, or charging, for hosting.
- **A district going offline.** Its streets freeze or become walled off. That fits the "ruins and sealed doors" idea, but it is awkward in the middle of a car chase.
- **Safety among strangers.** Moderation is per person, so a city full of strangers depends on the shared allow lists and block lists described in the brainstorm.
