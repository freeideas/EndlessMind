# Endless Mind: design

What Endless Mind is, the decisions behind it, and why. The protocol outline is in [PROTOCOL.md](PROTOCOL.md), a step-by-step story in [WALKTHROUGH.md](WALKTHROUGH.md), and worked examples in [examples/](examples/).

## The idea in one paragraph

A new web: a worldwide network of living, AI-made places and programs, where both the code and the running of that code are spread across the people using it. People describe realms (a game, a garden, a shop, a tool) and their own AI coding agents write the code. Code that runs on actors' devices is public and sandboxed. A realm's rules run with whoever holds its private key, who alone can referee it or speak for it; the rules are usually public too, but may be kept private. Each realm's own code decides who may enter and what happens inside. There is no central server: helper servers are small programs anyone can run, and none is in charge. Anyone can make anything, and anyone can use it from a link. Games come first because they show the idea best.

## Words used here

- **Object:** anything with its own key: a character or a realm. The key is its identity, and whoever holds it speaks for it.
- **Realm:** an object with rules: a place, game or tool that visitors enter. Its referee runs the rules, which decide what happens inside. The design and protocol word.
- **Game:** an everyday word for something people play, usually with rules and goals. Not every realm is a game (a calm garden, a chat room).
- **World:** a friendly word, used only in plain-language and pitch text, for a realm you can walk around in.
- **Actor:** whoever plays: a person, or an AI. An actor is its key: whoever holds the key is the actor, and its address is the same in every realm.
- **Portal:** the software that gets an actor into a realm, as a browser gets a reader onto the web. It holds the actor's key, opens links and runs renderers. The reference portal runs in the browser; anyone may write another, in any language or engine.
- **Character:** how an actor presents itself: its key plus a description (name, look). The public half of the key is the one address it is known by everywhere. Its **in-realm form** is what the realm turns it into while inside.
- **Renderer:** code that draws a realm's views on an actor's device and turns the actor's input into moves. A file, found by its hash. The portal gets the actor in; the renderer decides how the realm looks and sounds. One program may do both.
- **Referee:** whoever holds a realm's key and runs its rules, signing its official state.
- **Agent:** an AI coding agent that writes realms for a person.
- **Server:** an optional helper program anyone can run (finding realms, relaying messages, serving files and the portal). Never in charge.

## Decisions

**What it is**

- **Not just games: a new web.** Games are the first and clearest use, but the network is for anything AI can make. AI-generated programs take the place of HTML pages.
- **Name: Endless Mind.** The project, the reference portal and the protocol are all "Endless Mind". Links start with `emind:`, a technical prefix only, never a product name ("eMind" is crowded in AI software). It is presented as a platform, never as "a game", which also keeps it clear of an existing small game called *Endless mind*. The main address is endlessmind.com. The name is claimed through public use (Endless Mind™) and protected only against impostors, never against compatible software; see [TRADEMARK.md](../TRADEMARK.md).
- **The protocol is the network.** The Endless Mind protocol is a set of conventions (keys, signed messages, code found by hash), not a portal or a server. Any program that follows them is a full peer. See [PROTOCOL.md](PROTOCOL.md).
- **The browser is the front door, not a requirement.** A realm with a browser renderer opens in a browser with one click, with no install, no account and no AI agent. Other portals, including ones built with game engines, may join the same realms by speaking the protocol (see "Portals beyond the browser"). Renderers are plain JavaScript so that any portal can run them in a sandbox.
- **Freedom almost always wins over safety.** Anything should be possible. The sandbox is the safety floor: foreign code only ever runs sandboxed on an actor's device, where it cannot do much harm, so the project adds few protections of its own.
- **Growth over control.** The goal is for Endless Mind to spread as fast as possible, even at the cost of the founder's control. Once it is popular, no one, including the founder, should be able to shut it down. The project's code and the protocol are fully open.

**Objects and keys**

- **Anything with a key is an object.** A character is a secret plus a description, with a key for each realm it enters; a realm is a key plus rules and files. The protocol treats both alike: an address and signed messages. All limits are set by realms' rules, never by the platform.
- **Keys, not code, decide who operates an object.** Anyone can run a copy of an object's public code, but only messages and results signed by its key are official. Running a copy without the key makes a different object (a fork).
- **The key is the object, wherever it is.** A private key is a 32-byte secret. Its holder can save it and carry it to any device, or to any server's copy of the portal, at any time. Domain names and servers come and go, and people who dislike a realm can attack them; if the key alone can move an object anywhere, there is much less to attack.
- **Whoever holds a copy of the key is the object.** A copied key cannot be un-copied or revoked, so a key is guarded like a password. Backing up is saving the key; hosting on an always-on machine is putting the key there, with the host program.
- **One lasting address, known everywhere.** A character is its key. It enters every realm under the same address, so it is recognized wherever it goes, and what is said of it in one realm is plainly about the same character in another. That is what lets a good name travel. The cost is that realms can compare notes about a character, which for reputation is the point.
- **Private entry, by choice.** An actor who does not want a realm to know them can enter it under a key made from the character's secret and that realm's address. That realm always sees the same address for them, and no other realm can connect it to the character. Known limits: a realm still sees whatever name and description the actor sends, and a server can tell which addresses share one connection.
- **Ownership that matters is recorded by realms.** With no shared ledger, nothing can be handed over for everyone (a giver who copies a key still has it). Who has which sword, coin or score is state kept by one realm, and it stays there: nothing carries a record from one realm to another. In-realm forms are realm state the same way, lent to visitors while they are inside.

**Realms and rules**

- **Realms enforce their own rules.** A realm's rules have the final say about what happens inside it. Worst case, a realm decides a visitor is no longer inside (`remove` in [RUNTIME.md](RUNTIME.md)).
- **The referee runs all code that matters.** A remote device ca claim to run any code, so code proves something only where the one who relies on it runs it. A realm's rules run on its referee; a renderer runs on an actor's own device for that actor alone. Visitors send only moves and receive views, so they never need the rules' code. A referee is a peer behind the message protocol: what it runs, and where, is its own business.
- **Code on an actor's device is public; rules may be private.** Renderers are public, found by hash and sandboxed, so anyone can open any realm without trusting its author. With public rules (named as `main` in the manifest), anyone, in practice their agent, can read them before entering, and a browser tab holding the key can explicitly start hosting. With private rules the rules file is never uploaded, only the maker's host program referees, and visitors trust the realm the way they trust a website's server; the portal tells a visitor when a realm's rules are private. Public rules are a statement, not a proof, unless they are repeatable: then every visitor's portal runs its own copy and checks the referee move by move (see "Checking the referee" in [RUNTIME.md](RUNTIME.md)). Private rules are a deliberate exception to openness, needed so a realm can use things that cannot be public or sandboxed, the main example being an AI model answering actors.
- **A move can be a call.** A visitor's move (`emind.act`) can ask the rules for anything, and the answer comes back in the views. Rules run by the host program are not sandboxed, so they may take their time and use the network, files or an AI model, as [the listening well](examples/listening-well.md) does. Sandboxed rules may await realm-local storage but have no general network access.
- **A referee of repeatable rules can be checked by everyone.** When the same moves always give the same state and nothing in the state is secret, the referee sends each actor the moves it applied, and the actor's portal replays them on its own copy of the public rules and compares the result with what it was shown. The referee still orders the moves and decides who enters, but a bent rule is caught at once. The one thing a copy must take on the referee's word is the state it starts from, at the start of each session; the portal tells the actor whenever that happens again after the first time. This is as far as a game can go without a referee and without the machinery of a shared ledger: one party keeps order, and every party checks it. It cannot cover hidden information, which by its nature only the referee sees.
- **There is no cheating, only rules.** Actors may do anything their own software can do. Whatever a realm's rules allow is fair play; a realm that wants something prevented must design it so (see "Hidden information").
- **Every realm leads to more realms.** The portal's own menu, outside any realm's control, always offers a way to find other realms, so no realm can trap a visitor.

**The project**

- **License: MIT or Apache 2.0, the user's choice; the specs in the public domain (CC0).** A copyleft license stops copying of the code but not rebuilding of the same features, so it protects little and slows growth. The Apache option adds an explicit patent grant from contributors, which matters for a protocol meant to be implemented everywhere. Contributions come in under the same terms (with a Developer Certificate of Origin sign-off), so no one, including the founder, holds extra rights.
- **Code: plain JavaScript, no build step.** The reference portal, server, host program and example realms are plain JavaScript with type notes in comments (JSDoc), checked and run by Deno. The same shared code (keys, hashes, signed messages) runs unchanged in browsers and in Deno, and the portal stays a few plain files anyone can copy or mirror.
- **Spending stays minimal.** The project earns nothing directly, so it relies on public, dated use to establish its name rather than paid registrations or lawyers. Realm creators can charge money separately, however they like; the platform takes no cut and plays no part.

## Three kinds of realm: only what one party holds can be attacked

Anything that exists in one place can be flooded, seized or switched off. Anything public and copied cannot. So a realm should depend on a single holder only when it needs something only one party can hold.

| Kind              | What names it         | Who referees                 | What can be attacked        |
| ----------------- | --------------------- | ---------------------------- | --------------------------- |
| Played alone      | The hash of its files | Each actor, for themselves  | Nothing, while a copy lasts |
| A room            | A key made on the spot| Whoever started the room     | That one room, at no loss   |
| A lasting realm   | A key that is kept    | Whoever holds the key        | Its referee and its key     |

- **Played alone.** A realm with public rules is fully described by its manifest body, and the hash of that body (its release) names it. Anyone holding the link fetches the files by hash from any server that has them and runs rules and renderer on their own device, with no key, no referee and no relay. Like a file in a torrent, it cannot be shut down while one copy exists, and a server keeps it for as long as people keep opening it.
- **A room.** The same public release, refereed for friends by one actor's tab under a key made on the spot and never saved. The host sees everything, and the room ends when the host leaves, but nothing lasting is lost: anyone starts another. With repeatable rules every actor's portal checks the host, so the host cannot cheat unseen; with other rules the host is trusted the way a friend hosting a game is. The game cannot be destroyed, only one table.
- **A lasting realm.** A kept key gives one address across versions, hidden information, lasting records, and rules or secrets that stay private (an AI model's credentials). It needs one referee, and that referee is a target. No design removes this: a file has no "what happened", a live place does.
- **The kind is how a release is opened, not a property of the code.** The maze example can be played alone from its hash, in a room, or as a lasting realm. Publishing with public rules always posts the release too, so a lasting realm whose referee is offline, or whose key is lost, can still be played alone or in rooms. Private rules exist only as a lasting realm.
- **What a lasting realm can and cannot survive.** Knocked over (flooded, its server gone), it comes back wherever its key and its saved data are taken, from its last save. A stolen key cannot be taken back, and a stolen secret is gone. Normal play never sends keys, private rules or credentials anywhere; theft means someone reached the machine or the files that hold them, or the portal was loaded from a source that took them (see "How it fits together").

## Rules by consensus, not by platform

- **Rules hold by consensus.** A rule exists because the software people choose to run follows it, the way the web works because browsers and servers follow the same conventions. No one can force a rule on anyone else's device, and no global agreement is needed: two peers only need to agree with each other.
- **The unavoidable minimum** is also consensus: key pairs, the message format and files named by hash. Sessions and the JavaScript runtime are optional conventions used by the reference portal. [PROTOCOL.md](PROTOCOL.md) describes it, including how the protocol gets new versions.
- **Defaults instead of requirements.** Things like the character description layout ship as defaults in the reference software. Anyone may ignore or replace them.

## Who decides what happened

If my character swings a sword and the sword's code runs on my device, I can lie about what it did. So:

1. **The realm is the referee inside the realm.** Its rules run on the referee's device. A sword-fighting realm keeps its own damage count for each visitor; visitors send only moves, which the rules judge. The realm's authority ends at its border.
2. **What happens after leaving belongs to the actor.** A realm can throw you out, but it cannot reach your device or change your character.
3. **Records stay in the realm; a good name travels.** Each realm keeps its own records, including each actor's standing (see "Reputation is earned"). A character has the same address everywhere, so a realm can recognize it, but learns what happened elsewhere only from what other realms chose to sign (see "Signed claims").

**The official state wins.** The referee keeps the full state and sends each actor their view after each tick. The referee is wherever the realm's key is: a creator's browser tab, or the host program on any machine. Its connection carries everything, so a home connection handles tens of actors, not hundreds.

**Hidden information.** Anything sent to an actor's portal counts as seen by that actor, whatever renderer they use. The referee sends each actor only their share (no enemies behind walls, no other hands of cards), so no renderer can show it. Sessions are private: the visitor and the referee agree on a key that no relay can work out, and every move and view is locked with it, so a relay's operator carries hidden cards without being able to read them. The character description and any claims shown on the way in are locked the same way, to a key the referee publishes in its announcement. Known limits: the relay still sees who talks to whom and when, and a portal or referee that does not offer a key (another implementation, or a browser too old for it) gets a session in the clear.

## Reputation is earned

Anyone can make a new key in a moment, so a punishment that follows a key can be shed by dropping the key. A ban alone therefore costs a troublemaker nothing. What works is the other direction: a new key starts with less than an old one, so a ban costs whatever the actor had built up. Nothing can punish a fresh key, but a realm can withhold what a fresh key has not yet earned.

- **Recognition cannot be faked.** Every message is signed, and a signature can be made only with the private half of a key. A realm that sees an address again knows it is dealing with whoever held that key before. That is the foundation everything here stands on.
- **What recognition does not prove.** It shows the same key, not the same person: a key can be copied, shared, sold or stolen, and whoever holds it inherits its standing, good and bad. An actor can prove they have been seen before, but nobody can prove they are new, because anyone can hold many keys.
- **Standing is kept by each realm, against the address it sees.** An actor has the same address every time they return to a realm, so the realm's rules can record time played, things made, and trouble caused, and decide from that what the actor may do. This is ordinary realm state, like who has which sword, and the platform plays no part.
- **Newcomers start small.** A realm that cares can let a new address look before it may build, or move before it may speak, and widen that with time. Misbehaving then costs hours of earned standing, not the seconds it takes to make a key.
- **Vouching.** A realm can ask newcomers for an invitation from a member, and remember who invited whom. A member whose guests cause trouble puts their own standing at risk, and the realm can remove a whole branch.
- **Bans and leaving.** A realm's rules can refuse an address at the door or end its visit (`enter` and `remove` in [RUNTIME.md](RUNTIME.md)). An actor can leave a realm and never open it again. Both are final only as far as the other side values what it would lose by starting over, which is why standing comes first.
- **No blacklist worth having.** A list of things to avoid is worth little, for actors and realms alike, since whatever is on it can come back under a new key. The project keeps none, and a realm that shares one gains nothing against anyone willing to start over.
- **It works the same way for realms.** A realm has one address for everyone, and it cannot be faked either. A realm that people have played, liked and passed on has something a copy under a fresh key does not, so the useful thing to share is which realms are known to be good, never which are bad.
- **One key, many standings.** A character is one address everywhere, so its standing in many realms hangs on one key. The more it has earned, the more that key is worth keeping, and the less attractive it is to throw it away to dodge a ban in one realm.
- **What reputation cannot do.** It does not stop a determined person. It makes misbehaving cost more than it gains, which is all reputation has ever done anywhere.

**Signed claims: how a good name crosses realms.** Any key can sign a short statement about any address, and both sides may keep it, or not. It is up to them.

- **A claim proves who said it, never that it happened.** "Pulled the sword from the stone" signed by a realm shows only that the realm says so. That is why it is called a claim, and why its worth is the worth of whoever signed it.
- **Two signatures show an agreement of sorts.** When the one a claim is about signs it too, both parties demonstrably hold the same claim. It still does not make the claim true. An actor's portal signs in return each claim it keeps, so the realm ends up holding claims signed by both; a claim nobody would put their name beside, such as a removal, stays one-sided, and that says something too.
- **Any two parties.** Realm about actor is what the reference software issues today. The same signed claim serves a realm speaking of another realm ("I trust this realm"), an actor of a realm ("I play here"), or one actor of another inside a realm. Those need only a way to issue them, which is not built.

- **What one says is its issuer's business.** Something that happened ("pulled the sword from the stone", "entered", "won the spring award") lasts. How things stand ("in good standing") is given an end date and renewed while it holds, so it fades if the realm stops vouching.
- **The actor keeps a record and shows what they choose.** The portal keeps the claims a realm signs for its actor, with the keys, like a list of past work. A realm can say in its manifest whose claims it would like to see; the portal asks the actor once, and then shows the ones held from those realms.
- **A claim about you is yours to show.** A character enters every realm under the same address, so a claim about that address shown by that address needs nothing more: the one it is about is at the door, and nobody else can use it. Only a claim earned under a private address needs an extra signature from that address, naming the realm and the visitor it is shown for. Such a signature could be made for a friend, which is a kind of vouching; a realm that minds accepts each private address for one visitor only. The referee checks all this before the rules see anything.
- **Showing is still a choice.** A claim tells the receiving realm where the character has been and what was said of it there. The portal asks before showing anything from a realm for the first time, and the actor can make it forget those answers. A relay carrying the request cannot read it. In a realm with repeatable rules, what is shown reaches every actor, like every other entry.
- **A reference is only as good as its issuer.** Anyone can make a realm that signs glowing things, so each realm chooses whose word it accepts. Some realms will exist mainly to vouch (a guild, a tournament organizer, a circle of friends), which gives the network something like "verified" with nobody official granting it.
- **Being thrown out is a claim too, but the realm keeps that one.** A realm can sign "removed for griefing" and keep it; nobody would carry such a note about themselves. It still has teeth: the actor's standing there is not renewed, and they can no longer honestly show anything from that realm without revealing the address its note is about. To everyone else they are simply someone with nothing to show from there.
- **Only a lasting realm's word is worth anything.** A room's key is thrown away, so what it signs cannot be trusted later. A referee working under a pass can sign nothing that outlasts the pass; lasting claims come from the realm's own key.

Two uses it is meant to serve:

- **A kingdom that admits only those who pulled the sword from the stone,** where the stone is in another realm run by other people. The kingdom's maker needs nothing from them but their realm's address: the kingdom asks to see claims from it, and its rules let in a visitor who shows that one. The two groups never have to talk. This works today.
- **A maker opening a new realm without troublemakers.** The maker names a few realms they trust, because those have run well for a long time or the maker knows who made them, and the new realm lets in actors who can show claims from several of them. Newcomers with nothing to show can still be given the small start described above. This works today.
- **An actor choosing a realm to try** (not built). A realm's own word about its actors proves nothing, since a realm can sign anything about actors it invented. What counts is actors vouching for the realm with standing they earned elsewhere: an actor signs "I play here" with their key in a realm the reader already trusts, and shows that realm's claim about them. The reader's portal counts only vouchers rooted in realms the reader trusts, so there is no worldwide score to game, and each person's view starts from what they already know to be good. The same signed claims and proofs carry this; what is missing is a place to publish vouchers and a portal that counts them.

What all of this relies on, and what later changes to the protocol must keep true: an address never changes and cannot be faked, for a realm or a character; a character's keys, lasting and private, can always be made again from its one secret; any key can sign a new kind of statement; and software ignores fields it does not know.

## Keys in practice

- **Saving.** The portal keeps keys, manifests and original published file bytes locally before uploading copies. "Save my keys" exports identities without network access; "Save full backup" adds local files and committed realm storage. The backup is not locked with a passphrase. Files remain bytes, encoded as base64 only in JSON backups.
- **Moving a realm.** Import a full backup into another trusted portal, or give it to the host program, then explicitly publish or start hosting. To change helper servers, the same portal can connect to the new one without moving keys. Realm data moves only if the rules saved it and the backup includes it. Private rules still need their source folder.
- **Keeping the realm's key off the machine that referees.** A machine that is always on and reachable is the one most likely to be broken into. The realm's key can instead sign a referee pass: another key may referee until a date. Only the pass goes to the always-on machine. A stolen pass can be replaced by a newer one and runs out anyway, so theft of the online key is a setback, not the loss of the realm. Only the realm's own key, which can stay offline, is beyond recovery if copied. The host program makes and uses passes ([RUNNING.md](RUNNING.md)); a browser tab that hosts still uses the realm's own key.
- **One character in several realms at once.** Each visit has its own connection, and all of them hold the character's one address; a relay sends each realm's messages to the connection that wrote to that realm. Entering the same realm again from another tab or device ends the earlier visit there.
- **Two holders online at once.** A later holder proving the key on one helper server replaces the earlier connection, which loses both delivery and sending permission. A realm refereed on several servers at once is one holder with several connections. Different holders on different servers may still produce different histories. There is no worldwide election or guarantee of one official running copy. Session identifiers distinguish running copies; ownership remains whoever holds the key.
- **When no referee is online,** nothing official happens until a key holder returns. A realm with public rules can still be played alone or in a room, from its release.

## How it fits together

| Piece             | What it is                             | Who owns it                | Where it runs            |
| ----------------- | -------------------------------------- | -------------------------- | ------------------------ |
| **The portal**    | Opens links; runs everything else      | Its author                 | Browser or any device    |
| **Character**     | Your name, look and description        | Whoever holds its secret   | Wherever its secret is   |
| **Realm**         | A place or game: rules and referee     | Whoever holds its key      | Rules on the referee     |
| **In-realm form** | Your character as that realm shows it  | The realm, lent to you     | Realm state              |
| **Renderer**      | Turns the realm's state into a picture | The realm's maker          | Your portal, sandboxed   |

**The portal** holds your keys, runs foreign code in sandboxes, opens links and owns its menu. Use a copy of the portal you trust: its source can take any key it holds. Helper servers are separate connection targets. A link hint selects a server without loading its portal or moving your keys. HTTP API routes allow cross-origin requests for public files and announcements; relay connections prove keys without exporting them.

**State is separate from the picture.** A realm never draws anything itself; its rules produce each actor's view as plain data ("maze grid, walls here, runner at 4,7, score 120"). It ships a default renderer, and anything else could draw the same data its own way: another renderer (a dashboard, a text-only view, a version for screen readers), or a portal that is its own renderer, as one built with a game engine would be. An AI actor's portal needs no picture at all and reads the data directly. The realm cannot tell the difference. The reference portal lets the actor choose: the realm's own renderer, another the realm offers, or any renderer a link names by its hash. So anyone can make a new look for a realm they like and pass it on in a link, without its maker being involved. A look the maker did not supply is announced to the actor, since a renderer decides what is shown and which moves are sent, though it stays in the same sandbox and sees only what the actor is sent. A renderer is also a controller: it turns whatever the actor does into moves ("move left"), which the rules judge like any other move. A renderer sees only what its actor is sent, so no renderer can reveal hidden information.

## Joining with one click

Playing needs only a link; agents are for making things.

1. Open the link in a trusted portal. An actor can paste a shared link into "Open here" in their existing portal.
2. The portal finds the actor's character, or makes one in about a second (random name and look, editable later).
3. The portal contacts the link's server hints directly, in turn, then any servers it remembers for the realm. None of this moves the character secret.
4. The portal fetches the realm's files by hash, checks them, runs the renderer in a sandbox, and asks the referee to let the character in.
5. The realm's rules read the character's description (name, color, a sentence such as "a small fox knight who carries a lantern"), use what they understand, and make an in-realm form.
6. The actor acts, the referee updates the state, the renderer draws each new view.

No realm code is ever added to the character, so a hostile realm cannot damage it.

## Finding realms

- **Realms announce themselves on servers,** signed by the realm's key, with tags ("maze"). Each server keeps what it is sent. Servers do not talk to each other and there is no shared lookup table, so an address alone does not say where a realm is: links carry the servers where it is announced as hints.
- **The portal's "More realms" menu** searches the current server by tag and shows which realms are online. Releases with no key are listed too and always count as online.
- **No server is worth attacking.** A torrent survives because no tracker matters. The same holds here when a realm is on several servers: the host program referees on all of them at once, the realm's signed announcement lists them, and a visit moves to the next when one goes quiet. A server can then be crude, full, selfish (serving only keys its operator knows), dishonest or gone, and the realm carries on elsewhere: a server that says another holder took the realm over costs the referee that server only. A browser tab that hosts uses one server.
- **Anything else is built by others:** directories and lists of links. None is official. A realm cannot send an actor on to another realm; only the portal's menu and links do that.

## Running in the browser: limits to design around

A browser tab can explicitly start hosting realms whose keys it holds. Ownership, hosting and visiting are separate: opening a realm always visits through the same session path as any other actor. Hosting continues while the owner navigates within that tab, and stops on explicit Stop hosting, replacement, or tab closure. Browsers cannot accept incoming connections, so traffic goes through a helper relay.

- **Only alive while the tab is open.** Phones suspend background tabs almost at once; desktops slow down background timers. To stay up, a realm runs under the host program on an always-on machine instead (see [RUNNING.md](RUNNING.md)).
- **Storage can be wiped.** Clearing site data deletes the keys, and with them every object in that browser, unless they were saved with "Save my keys".
- **Known limit: private entry is not perfect.** A renderer has no network, but it can still measure the device it runs on (screen, fonts, timing) and report that to its referee as a move. A realm entered privately could use this to guess which character is behind the private address.
- **Isolation.** Code in ordinary workers shares the page's storage and could read its keys, so foreign code runs in sandboxed frames with their own blank origin (a browser security boundary). The portal page's content security policy forbids frames from loading web addresses (`frame-src 'none'`), so sandboxed code cannot navigate its own frame somewhere and gain the network. Known limit: browsers offer no dependable way to switch off WebRTC (direct connections) inside a frame, so sandboxed code may still be able to send data out that way.
- **Known limit: runaway code.** Rules run in a worker inside their sandbox, so a loop there cannot freeze the page and ends when hosting stops. A renderer stuck in an endless loop can still freeze the page in some browsers, which also pauses any realm hosted in that tab. Reloading would reopen the same realm, so the portal asks first when its last visit did not end cleanly. Metering renderer code is not built.

## Portals beyond the browser

The browser portal is one portal among any number. A realm's referee and its visitors are peers behind the message protocol, so any program, in any language or engine (Unreal, Godot and others), can take either part by speaking it.

- **What a peer must speak:** keys and addresses, canonical JSON, signed envelopes, the relay over WebSocket, the server's HTTP routes, and the enter, act and state messages ([PROTOCOL.md](PROTOCOL.md), [RUNTIME.md](RUNTIME.md)). [test-vectors.json](test-vectors.json) lets an implementation in any language check itself.
- **It works without a browser:** the host program is a working referee and `tests/host_test.js` a working visitor, neither using a browser. No game engine plugin exists in this repository.
- **What the manifest offers:** `renderer` is optional, and `portal` names the realm's own portal (a name and an https address where actors get it). Opening a realm with no browser renderer, the browser portal says it cannot be played in a browser and shows the portal's name and link, warning that an installed program runs outside any sandbox.
- **How an engine realm would work** (none has been built): a server built with the engine holds the realm's key and referees, its rules private and in the engine's own language, and the engine-built portal is the visitor.
- **Known limit: speed.** Every message passes through a relay and carries its own signature, which is too slow for fast action games. The message format allows an engine realm to use the enter and welcome messages for identity and entry, then carry its own fast traffic itself: the welcome message's body can hold whatever its portal needs, such as where to connect.

## The server: a small program anyone can run

Simple enough that anyone can clone this repository and run their own server with one command.

- **What it does:** keeps signed announcements and key-free releases and answers tag searches, says who is online, stores the files those list by hash, relays signed messages between connections that have proved their keys, and serves the portal page. One server is all a group of friends needs.
- **What it cannot do:** forge anything it stores or relays, since everything is signed by the key that wrote it or named by its hash. It holds no realm state and makes no rules. It can still refuse to serve, hand out an older announcement, or say a realm is offline. A bad or dead server is one you stop using.
- **What it can do:** see who talks to whom through its relay and read whatever is not locked (entry requests, and sessions with software that offers no key), and, if it serves the portal page, take the keys that page holds. The server that serves the portal is trusted like any software you run.
- **Every cost belongs to someone.** A file is kept only while an announced realm or a release lists it, and goes when none does, so the store cannot fill with files nobody answers for. A sender pays for its own traffic: over the limit, its messages are dropped. A receiver is never disconnected for being flooded.
- **Size target:** a few hundred lines. Growing past that is a sign realm rules are leaking in.

## Safety and law

- Safety has no central moderator, so it lives on each person's side: their agent can read a realm's public code and warn them, and their portal decides what it runs.
- Like the web, the protocol cannot enforce law centrally. Each person is responsible for what their own realms do, and each server operator for what their server stores and lists. "No single point of failure, like email", never "built to escape authorities".

## Original work only

Endless Mind is a tool for making original things. The project never suggests, shows or encourages copying anyone else's game, characters, names, art, music or other protected work, in its docs, examples, demos, code or promotion.

- **Examples are technical and original.** They use invented names and generic kinds of realm ([a large city](examples/city.md), [a world made of blocks](examples/block-world.md), [a maze chase](examples/maze-chase.md), [a well that answers](examples/listening-well.md)) to explain how the system works, not how to recreate an existing product.
- **The agent guide steers agents toward original work.** It tells agents to build original designs and to decline to copy another product's names, characters, art, music, logos or level designs, suggesting an original alternative instead.
- **Each builder is responsible for what they build** and must hold the rights to what they publish.
- **The project runs no official network.** It provides software; people who run servers are responsible for operating them.

## Current state

Several actors play the [maze chase](examples/maze-chase.md) through one small server, as a lasting realm, in a room, or each alone from its release hash; the automated test does this with separate browsers (Chrome, Firefox and WebKit) on one computer. The host program referees realms with no browser, including the [listening well](examples/listening-well.md), whose private rules ask an AI model. Code: `portal/` (the browser portal), `shared/` (keys, hashes, signed messages, the relay client and the referee loop), `server/` (the helper server), `host/` (the host program), `examples/` (realm files) and `tests/`. How to run it is in [RUNNING.md](RUNNING.md); the calls realm code can make are in [RUNTIME.md](RUNTIME.md); the guide agents read is [AGENT-GUIDE.md](AGENT-GUIDE.md).

**Further work:** publishing edited versions under the same key from the browser UI, an independent test of the agent guide, and tests by people on separate devices and networks. Not built yet from the ideas above: a browser tab hosting on several servers or under a referee pass (only the host program does both), a button for copying a realm's public files to another server (the protocol allows anyone to do it), a room carrying on under another actor when its host leaves, and direct connections between actors, which would make servers as light as a torrent tracker. Passphrase-protected backups and stronger execution isolation are possible additions, rather than guarantees about the correctness of realm code.

**Success test:** two people on two machines, each with their own AI agent, each build something the other did not foresee, and they see each other meet.

## Responsibility and platform guarantees

Realm authors own the consequences of their rules, including concurrency mistakes, bad saves, runaway loops, model spending and unfair gameplay. The platform does not schedule transactions or enforce a universal game policy. It must reliably preserve bytes it accepts, report startup failures, dispose completed sessions, check signatures and hashes, and keep realm code away from other realms' storage and identity keys. Helper operators may bound shared storage, connections, queues and traffic without interpreting game rules.

A published release is the hash of a stable manifest body. Its signed publication envelope can change without changing the content's identity. Each visit agrees on a release and running instance, receives a fresh session identifier, and discards older view numbers. These checks describe the session, not proof that the referee executes its published code.

Persistence is optional. Rules receive a realm-local asynchronous JSON key/value store in `init`; they decide what to restore, save and migrate. A successful individual write replaces a value atomically. This does not make a realm's own multi-step operation transactional or automatically save its live state. Browser and host storage share this interface, and the helper server stores no private realm data. Host state files use atomic replacement; browser writes finish only when their IndexedDB transaction commits. Backups carry committed values when requested.
