# Endless Mind: design

What Endless Mind is, the decisions behind it, and why. The exact formats are in [PROTOCOL.md](PROTOCOL.md).

## The idea

AI coding agents let anyone make a game, or any other program, just by describing it. Endless Mind is meant to connect everything people make this way into one free, open network, the way the web connects websites. There is no company in the middle and no central server. The project starts the framework; it should be able to keep growing without us.

What makes it one network rather than many separate games is identity: a player is the same player everywhere, and what they earn in one realm can be shown in another, with proof.

## Words used here

- **Realm:** anything people enter: a game, a place, a shop, a tool, or many games at once. A realm is a key pair, and its ID is its identity. Where it runs (one web address, many, none, a new one every day) does not change who it is.
- **Game:** an everyday word with no technical meaning here. One realm may hold many games, and one game may span several realms.
- **Player:** whoever enters a realm, a person or an AI. A player is a key pair too.
- **ID:** the public half of a key pair, written as 52 letters and digits. Player IDs and realm IDs look alike. Players read it as **player ID**.
- **Secret phrase:** 24 words that make a key pair. The same words make the same key on any device, in any program that follows [PROTOCOL.md](PROTOCOL.md).
- **Proof:** a signature: what a key pair makes to show "the holder of this ID agreed to this exact text." Anyone can check it; nobody can make one without the secret.
- **EntryPortal:** a small web page that holds a player's key inside their browser, usually on their phone, and makes proofs for them. Anyone can write or host one.
- **Sign-in note:** a proof that a player wants to enter a realm at a particular web address, now.
- **Record:** a short text signed by one or more IDs, such as a realm and its players. Anyone holding it can show it to anyone.
- **Realm card:** what a realm says about itself (name, description, picture, where to play), signed by the realm.
- **Board:** an everyday word, like game, for a realm that lists other realms. It has no technical meaning of its own.

## Decisions

**What it is**

- **Not just games.** Games come first because they show the idea best, but a realm can be anything.
- **The protocol is the network.** Endless Mind is a few rules for keys, proofs and records, not a product. Any program that follows them takes part.
- **Easy login first, reputation later.** Within a single realm, a player ID is already worth having: no accounts, passwords, email or password resets for the realm's maker, and progress that follows the player to any device. Realms can adopt it for that alone. Reputation that travels between realms grows as more realms share players.
- **Growth over control.** The aim is to spread as widely as possible, even at the cost of the founder's control. Once it is popular, nobody, including the founder, should be able to shut it down.
- **Freedom almost always wins over safety.** Each person decides what to trust; the project adds few protections of its own.

**Identity**

- **A key pair is an identity.** A player is a key pair, and so is a realm. Whoever holds the secret is that player or realm, on any device.
- **24 words are the secret.** The phrase follows published standards (BIP39 and SLIP-0010), so every EntryPortal, app or program makes the same key from the same words. A player can write it on paper or keep it in a file, and can move to any other EntryPortal by typing it there.
- **One ID everywhere.** A player enters every realm under the same ID, so what they earn travels with them. The cost is that realms can compare notes about an ID; for reputation, that is the point.
- **The secret never leaves the player's device.** An EntryPortal turns the phrase into a key stored inside the browser so that it can sign but can never be read out, not even by the page's own code, and then forgets the phrase. It cannot show the phrase again, so setup is the player's only chance to write it down, and the EntryPortal checks that they did.
- **A stolen or lost phrase cannot be fixed.** Anyone with the phrase is that player forever, and nobody can recover a lost one. The only remedy is to start over with a new phrase and no history. The stakes are game reputation, not money, which is what makes this acceptable.
- **Revealing the secret burns the identity.** Whoever holds a key, player or realm, can burn its identity by publishing the secret phrase or the private key; either has the same effect. Anyone can check it, so it proves the publisher had it, and from then on anyone can sign as that ID. This is the answer to a stolen key, and also a way to retire an identity on purpose. It is permanent, so an EntryPortal makes it hard to do by accident.
- **Any use of a burned identity is a ghost.** Everyone treats a burned ID as gone, history included, along with what others earned through it. A ghost's signatures are still mathematically valid, so boards keep a searchable list of burned IDs, and realms check it before letting anyone in. There is no successor: "my new ID is X" signed by a burned ID is a ghost too, so the owner starts over and earns trust again.
- **Guests are always possible.** A realm may let anyone play without a player ID. Most casual players will stay guests, and that is fine.

**EntryPortals**

- **No single trusted EntryPortal.** Anyone may write and host one. Players trust an EntryPortal because they, or their AI helper, checked its code, not because of who runs it. The project provides one small reference page; others may make better ones. A realm's QR code names a default EntryPortal, and every EntryPortal tells the player how to use a different one instead.
- **Built to be checked.** [PROTOCOL.md](PROTOCOL.md) lists rules an EntryPortal follows, chosen so any AI coder can confirm in minutes that "your secret phrase is used only to prove you have it, and it never leaves this device." The question for players: "Someone asked me to type my secret phrase into [address]. Is it safe?"
- **The page signs, not the server.** The server only hands out the page. It never has the key, so it cannot pretend to be anyone, and it never sees which realms a player visits. If it disappears, the player types their phrase into another EntryPortal and carries on.
- **The phone is the usual EntryPortal.** The player's phone scans a QR code shown by the realm, on any screen, and does the signing. A computer can be its own EntryPortal for players without a phone.
- **Reviews are records too.** Anyone may sign a record saying "I checked the EntryPortal with fingerprint X and found it safe." Such reviews carry the reviewer's own reputation.

**Signing in**

- **The realm shows a code; the player's EntryPortal answers it.** The realm shows a QR code with a one-time join address. The player scans it with their phone, confirms "Play at game-server.com?", and the EntryPortal sends a sign-in note to that address. The realm lets in whichever screen is waiting on that code. Nothing is typed.
- **Every sign-in screen offers three ways:** the QR code, a "sign in on this computer" link that opens an EntryPortal in the same browser, and a short address to type if scanning fails. All three lead to the same note, so a realm handles one kind of sign-in.
- **The address in the note stops replay.** A realm accepts a note only if it names one of the realm's own addresses, recently, with a random number it has not seen before. HTTPS guarantees that nobody else receives traffic for that address, so a note made for one realm is useless at any other.
- **An address from a link needs one tap of confirmation;** an address the player typed or pasted needs none. Any web page can make a link, so a link alone must never sign anyone in.
- **Stolen QR codes are the main risk.** Someone could show a realm's sign-in code to a victim elsewhere ("scan for a free sword") and be signed in as the victim on their own screen. They cannot take the phrase or sign records, but inside that realm they act as the victim. Defenses for now: codes expire within two minutes and work once, which makes the attack hard but not impossible; the EntryPortal asks "Sign in the screen in front of you at game-server.com?"; and players are told to scan only codes on their own screen. A realm may also warn when the phone and the waiting screen seem to be in different places. A stronger defense is still to be found.

**Records and reputation**

- **Reputation only grows.** A record is signed by everyone it needs, and a realm can never sign for a player. Players keep the records they like and drop the rest, so there is no such thing as a bad reputation: only reputation earned, or none. Realms that need caution give newcomers less until they earn more.
- **A record says only "these IDs agreed to this text, back then."** Whoever holds it can show it to anyone, who checks every signature without contacting anyone. Whether it is still true is for the reader to judge.
- **A realm's own statements need only its signature,** for example "this player is in good standing as of 2026-12-01."
- **Agreements need every party's signature.** A trade is one record ("P gives the helmet to Q, and Q gives 95 diamonds to P") signed by P, Q and the realm. Nothing is final until all have signed, and the realm moves items only after the last signature.
- **Claiming works like signing in.** The realm shows a QR code ("scan to claim your achievement"), and the player's EntryPortal shows the full text before signing. Realms may ask during play for things of value, such as trades, and gather achievements until the player leaves, since each scan is a small chore.
- **Records travel with the player.** An EntryPortal keeps the records its player signed or received and can save them as a file, which any other EntryPortal can load. Since every record is signed, nobody can slip a fake into the file.
- **A record is worth what its signers are worth.** A realm that signs false records loses the trust of other realms, which then ignore its records. An AI could make a thousand realms that vouch for a thousand fake players, so a signer is worth only the trust it has earned; see "Trust flows outward" below.

**Finding realms**

- **Playing is the recommendation.** There is no "like" button. Twenty-five achievements in a realm, each taking hours, say more than any vote, and are far harder to fake.
- **Players choose which records are public.** A record carries a `public` mark inside its signed text, so every signer agreed to it. EntryPortals show the choice plainly on the signing screen and default to public, since a record exists to be shown.
- **Realms publish their public records.** Each realm keeps a list of its complete public records, named in its realm card. Realms want to publish, because published play is what ranks them.
- **A board is just a realm that lists realms.** It reads cards and public lists, ranks realms by its own judgment, and has everything any realm has: an ID, a card, sign-in for players, records it signs as its judgments ("featured here"), and reputation earned the same way. Curating is play: a player who reviews realms on a board earns records there like any other. Players choose boards whose judgment they like. A realm should link to a board of its choice ("find more realms"), so a player who arrived from a random web page always has a next step. endlessmind.com lists boards, as one starting point among many.
- **Boards emerge on their own; nobody may become a gatekeeper.** Boards will appear once there are enough realms to make finding them hard, as search engines appeared on the web. The protocol keeps all the raw material (cards, public lists, burn notices) public and copyable, so a new board can start from the same data as the biggest one and can only win on better judgment. A board cannot change a record, hide one from others, or speak for anyone but itself. A board with poor or dishonest recommendations should lose reputation over time: its judgments are signed, so it cannot deny them later, and anyone can compare them with the public play data and show where they go wrong. Players can switch boards at no cost, since the same identity and records work everywhere. A common format for asking a board "what do you know about this ID?" may be worth defining once real boards show what they need.
- **Trust flows outward from realms a board already trusts.** A board starts from a few realms it trusts. Players count when trusted realms have public records of their play, and a realm becomes trusted when trusted players put real time into it. Trust weakens with each step. A new realm with a thousand AI players claiming thousands of hours gets nothing, because none of those players appears in any trusted realm's records. A patient attacker with bots that really play can still earn trust, slowly and expensively; trusted realms limit what newcomers earn.
- **Anyone can watch the clock.** A record's time is whatever its signers wrote, so boards, or anyone else, can watch realms' public lists and check that records appear at about the time they claim. A realm that suddenly publishes a year of backdated play gives itself away.
- **Realms read the same lists.** When a player signs in, a realm can look up their ID and see, for example, "40 hours in a realm we trust," without asking them for anything.
- **Ranking reflects what people are willing to be seen doing,** not what is good or legal. Embarrassing or risky realms collect few public records and rank low, which is mostly a good brake. It also hides sensitive realms of value, such as a support group; see "Safety and law".

**The project**

- **License: MIT or Apache 2.0, the user's choice; the specs in the public domain (CC0).** Anyone may build on any of it. Contributions come in under the same terms, so nobody, including the founder, holds extra rights.
- **Code: plain JavaScript, no build step.** Shared code runs unchanged in browsers and Deno, so anyone can read it, copy it and host it.

## Not decided yet

These are being worked out. The leanings below are not commitments.

- **Making and hosting.** Leaning: a game is made without knowledge of the network, then wrapped. A browser game with no server is uploaded and served as it is. A multiplayer server written as one sandboxed JavaScript file can be run by volunteer hosts. Anything else is run with a downloadable program, at home or on a server that takes HTTPS connections from players.
- **Relays.** Leaning: optional, for realms on home computers that cannot accept connections. Anyone can run one.
- **Distribution.** Leaning: releases are ordinary torrents with web seeds, so any BitTorrent client can fetch and share them.
- **iPhone storage.** Safari may erase a site's stored key after about a week without a visit. Asking the browser to keep storage permanently may prevent it; this needs testing on real iPhones.

## Safety and law

- Safety has no central moderator, so it lives with each person: their AI helper can check an EntryPortal or a realm's code, and they decide what to trust.
- Like the web, the protocol cannot enforce law centrally. Each person is responsible for what their own realms do, and each host for what they run and list. "No single point of failure, like email", never "built to escape authorities".
- **Pseudonymous, not anonymous.** A player ID hides a name, not tracks. Realms run at ordinary web addresses on ordinary servers, see connections the way any website does, and public records are signed evidence that cannot be denied later. The network is not built for hiding and is not suited to it.
- **Privacy where it matters, within the law.** A player may use more than one secret phrase, keeping a second identity apart from their main one. A sensitive realm, such as a support group, can keep all its records private and let members use second identities, so that other members and the public cannot tell who they are. That is real privacy from other people, not protection from a lawful investigation.

## Original work only

Endless Mind is a tool for making original things. The project never suggests, shows or encourages copying anyone else's game, characters, names, art, music or other protected work, in its docs, examples, demos, code or promotion. Examples use invented names. Every place that tells people how to make a realm asks them to be original, and each builder is responsible for holding the rights to what they publish. The project runs no official network; it provides software, and whoever runs it is responsible for operating it.
