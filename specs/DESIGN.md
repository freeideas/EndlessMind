# Endless Mind: design

What Endless Mind is, the decisions behind it, and why. The exact formats are in [PROTOCOL.md](PROTOCOL.md), which grows as each part is built.

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
- **Maker:** whoever makes a realm, usually by describing it to an AI coding agent.
- **Game server:** the part of a realm that all its players connect to. The **display** is the part each player sees: ordinary web pages.
- **Open realm:** a realm whose game server is one sealed file, so anyone can run it.
- **Tied realm:** a realm run only by whoever controls its server, because its server code is private or its world is too valuable to lose.
- **Release:** one exact version of an open realm, packed so that anyone can fetch it and run it.
- **Host:** whoever runs releases so that others can play. A host is a key pair too.
- **Relay:** a go-between that passes messages to a game server that players cannot reach directly. Anyone can run one.

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
- **Names for people, IDs for programs.** People see a name, never an ID. An EntryPortal starts each player with a friendly name made from their ID, such as "Witty Clover", so the same phrase gives the same name on every device; the player can change it there, and it reaches each realm with their next sign-in. Names are not unique and prove nothing: records and trust rest on the ID, which stays available under "technical details" for anyone who wants to check.
- **A screenshot is a fine place to keep the phrase.** Typing 24 words is hard, so the setup screen shows the phrase as a QR code too, and players are told to take a screenshot. For money this would be reckless; for game reputation, which has little market value, it is a fair trade. Scanning the code with another device, or giving that device the picture, sets it up without typing; the EntryPortal reads the picture itself, so a photo taken with one device works on any other. Because anyone could make such a code, an EntryPortal accepts one only while empty and only after the player recognizes the name it holds.
- **The secret never leaves the player's device.** An EntryPortal turns the phrase into a key stored inside the browser so that it can sign but can never be read out, not even by the page's own code, and then forgets the phrase. It cannot show the phrase again, so setup is the player's only chance to write it down, and the EntryPortal checks that they did.
- **A stolen or lost phrase cannot be fixed.** Anyone with the phrase is that player forever, and nobody can recover a lost one. The only remedy is to start over with a new phrase and no history. The stakes are game reputation, not money, which is what makes this acceptable.
- **Revealing the secret burns the identity.** Whoever holds a key, player or realm, can burn its identity by publishing the secret phrase or the private key; either has the same effect. Anyone can check it, so it proves the publisher had it, and from then on anyone can sign as that ID. This is the answer to a stolen key, and also a way to retire an identity on purpose. It is permanent, so an EntryPortal makes it hard to do by accident.
- **Any use of a burned identity is a ghost.** Everyone treats a burned ID as gone, history included, along with what others earned through it. A ghost's signatures are still mathematically valid, so boards keep a searchable list of burned IDs, and realms check it before letting anyone in. There is no successor: "my new ID is X" signed by a burned ID is a ghost too, so the owner starts over and earns trust again.
- **Guests are always possible.** A realm may let anyone play without a player ID. Most casual players will stay guests, and that is fine.

**EntryPortals**

- **No single trusted EntryPortal.** Anyone may write and host one. Players trust an EntryPortal because they, or their AI helper, checked its code, not because of who runs it. The project provides one small reference page; others may make better ones. A realm's QR code names a default EntryPortal, and every EntryPortal tells the player how to use a different one instead.
- **Built to be checked.** [PROTOCOL.md](PROTOCOL.md) lists rules an EntryPortal follows, chosen so any AI coder can confirm in minutes that "your secret phrase is used only to prove you have it, and it never leaves this device." The question for players: "Someone asked me to type my secret phrase into [address]. Is it safe?"
- **Improved by anyone, in new versions.** Anyone may improve an EntryPortal and ask their AI helper whether the result is trustworthy. A version is never edited in place once published: a check is about exact contents, and a page that could change at the same address could be swapped the day after it was checked. So each improvement becomes a new version at a new address, with its fingerprint. Realms usually name an address that forwards to the newest version, so their links never go stale; the player still lands on a versioned address that can be checked, and keeps their key and records, since every version on one site shares them.
- **A site of its own.** An EntryPortal is served from a site that serves nothing else, such as `portal.endlessmind.com`. The browser key cannot be read out, but any script on the same site can use it to sign, so sharing a site with a home page, docs or another app would let any of them, or anyone who broke into one, sign as every player.
- **Whoever controls the forwarding address controls the signing.** Every version on one site shares the player's key, so the address that forwards to the newest version is a point of trust: if it forwarded to a bad version, that version could sign as every player who follows a link to it. It may forward only to versions published with their fingerprints, anyone can check where it points, and a realm that wants to vouch for one exact version names that version instead.
- **The page signs, not the server.** The server only hands out the page. It never has the key, so it cannot pretend to be anyone, and it never sees which realms a player visits. If it disappears, the player types their phrase into another EntryPortal and carries on.
- **The phone is the usual EntryPortal.** The player's phone scans a QR code shown by the realm, on any screen, and does the signing. A computer can be its own EntryPortal for players without a phone.
- **Pick one and stay with it.** A browser keeps a key for one site only, so a player who used a different EntryPortal at every realm would give their phrase to each, and typing a phrase into a new site is the one risky moment in the whole design. Many EntryPortals exist as spares; a player moves only if theirs disappears.
- **Being asked for the phrase is rare.** It happens only when the player chooses to set up a device or to burn an identity. A page that asks at any other time is a trick. Setup is where players learn this, since it is the one moment they are known to be on a real EntryPortal.
- **A page cannot vouch for itself.** The screen that takes a phrase reminds the player to ask their AI helper about the page first, and the helper fetches the page and checks it. Nothing a page says about itself proves anything, since a thief's page can say the same words.
- **Reviews are records too.** Anyone may sign a record saying "I checked the EntryPortal with fingerprint X and found it safe." Such reviews carry the reviewer's own reputation.

**Signing in**

- **The realm shows a code; the player's EntryPortal answers it.** The realm shows a QR code with a one-time join address. The player scans it with their phone, confirms "Play at game-server.com?", and the EntryPortal sends a sign-in note to that address. The realm lets in whichever screen is waiting on that code. Nothing is typed.
- **Every sign-in screen offers three ways:** the QR code, a "sign in on this computer" link that opens an EntryPortal in the same browser, and a short address to type if scanning fails. All three lead to the same note, so a realm handles one kind of sign-in.
- **The address in the note stops replay.** A realm accepts a note only if it names one of the realm's own addresses, recently, with a random number it has not seen before. HTTPS guarantees that nobody else receives traffic for that address, so a note made for one realm is useless at any other.
- **An address from a link needs one tap of confirmation;** an address the player typed or pasted needs none. Any web page can make a link, so a link alone must never sign anyone in.
- **Stolen QR codes are the main risk.** Someone could show a realm's sign-in code to a victim elsewhere ("scan for a free sword") and be signed in as the victim on their own screen. They cannot take the phrase or sign records, but inside that realm they act as the victim. Defenses for now: codes expire within two minutes and work once, which makes the attack hard but not impossible; the EntryPortal asks "Did you just press Sign in on game-server.com yourself?"; and players are told to scan a code only right after they asked to sign in, never one someone sends or shows them. (Telling them to scan only codes "on their own screen" would mean nothing: the lure usually is on their own screen, in a web page, video or message.) A realm may also warn when the phone and the waiting screen seem to be in different places. A stronger defense is still to be found.

**Records and reputation**

- **Reputation only grows.** A record is signed by everyone it needs, and a realm can never sign for a player. Players keep the records they like and drop the rest, so there is no such thing as a bad reputation: only reputation earned, or none. Realms that need caution give newcomers less until they earn more.
- **A record says only "these IDs agreed to this text, back then."** Whoever holds it can show it to anyone, who checks every signature without contacting anyone. Whether it is still true is for the reader to judge.
- **A realm's own statements need only its signature,** for example "this player is in good standing as of 2026-12-01."
- **Agreements need every party's signature.** A trade is one record ("P gives the helmet to Q, and Q gives 95 diamonds to P") signed by P, Q and the realm. Nothing is final until all have signed, and the realm moves items only after the last signature.
- **Claiming works like signing in.** The realm shows a QR code ("scan to claim your achievement"), and the player's EntryPortal shows the full text before signing. Realms may ask during play for things of value, such as trades, and gather achievements until the player leaves, since each scan is a small chore.
- **Records travel with the player.** An EntryPortal keeps the records its player signed or received and can save them as a file, which any other EntryPortal can load. Since every record is signed, nobody can slip a fake into the file.
- **Realms keep private records too, and cannot leak them unnoticed.** A realm keeps every record it signed so a player who loses theirs can get them back, but lists only public ones. Since the `public` mark is part of the signed text, a realm that published a private record would be caught at once: the record itself proves the player marked it private. A realm could still tell someone the facts in plain words, as any website could, but plain words prove nothing.
- **In an open realm, the host signs where the realm would.** The realm's secret is not on the host, so the record says "host H ran release X of realm R, and player P earned Y", signed by the host and the player. See "Hosts" below.
- **A player may add words of their own.** When approving a record, a player can attach a note: a review, a boast, anything. Only the player's proof covers the note, so nobody can change it or refuse a record over it, and it sits on proof that its writer really played.
- **A record is worth what its signers are worth.** A realm that signs false records loses the trust of other realms, which then ignore its records. An AI could make a thousand realms that vouch for a thousand fake players, so a signer is worth only the trust it has earned; see "Trust flows outward" below.

**Making realms**

- **Anyone with an AI coding agent can make one.** The maker describes the game, and the agent writes the display and the game server. The maker never rents a server and never has to read code.
- **A game server is one sealed file.** It can do nothing except through a small fixed set of calls: a player joined, a player left, a message came in, send a message, a timer went off, save, load. It is JavaScript, or another language compiled to WebAssembly (a compact program format that every browser runs). It can reach nothing else, which is what makes a stranger's game safe to run, and the same file runs unchanged in a browser tab and on any host.
- **Making happens in the browser.** One tab runs the game server and shows how it is doing, with a link that opens the game in another tab, so the maker plays exactly as everyone else will. Friends anywhere join by the same link, through a relay. This lasts while the maker's computer is on; for that time the maker is the host, and the realm signs its own records.
- **Phones play anything; making and hosting need a computer.** A phone pauses a page as soon as its owner looks away, so a game server in a phone's tab would stop. For the same reason every game lets a player whose connection dropped rejoin smoothly.
- **A release is a torrent.** It holds the game server, the display and the realm card, and any BitTorrent program can fetch and share it. The realm signs the release's fingerprint once, and its secret can then stay on paper. A change to the game is a new release.
- **Open or tied.** An open realm can be run by anyone, so it lives on while its maker sleeps with every device switched off. A tied realm is run by its maker alone and signs its own records with the realm's secret. Both are realms like any other to players and boards.
- **What lasts is what players carry.** An open realm that keeps lasting progress in its players' records moves between hosts freely: a player shows their records and carries on. An open realm with a world of its own has a separate world on each host, each starting from the beginning. A realm that cannot accept that is a tied realm.

**Hosts**

- **A host runs releases for anyone.** It fetches a release, checks the fingerprint and the realm's proof, and runs the game server with no network, no files, and capped memory and time. It shares the torrent onward, so the maker's computer is no longer needed.
- **Each game gets a site of its own on the host,** so no game can touch another or its players. Signing in works as at any realm, since a sign-in note names a web address.
- **A host signs under its own ID.** Its records name the release and the realm. A host runs the code, so it could cheat, as any realm could; the answer is the same: its records are worth what the host is worth. Naming both the host and the realm leaves room for a maker to permit a trusted host to sign as the realm itself.
- **A reason to host.** The host program is installed in minutes and keeps one resident game of the admin's own at the main address, which the admin can advertise. In return it loads other people's games. The resident game earns the host its reputation, and that reputation gives weight to the records it signs for everyone else's games.
- **The admin sets the rules once.** The host program then loads and removes games without asking. The admin can remove or block anything.
- **The seal protects the machine, not its owner.** A host is responsible for what it serves, like anyone who runs a website, and the host program says so plainly before it loads strangers' games.
- **One program does every job.** A host is also a relay for games still running in their makers' tabs, and carries a spare EntryPortal on a site of its own: an exact published version, so checking it means comparing a fingerprint. Games on the host keep naming a widely used EntryPortal on their sign-in screens.

**Finding realms**

- **Playing is the recommendation.** There is no "like" button. Twenty-five achievements in a realm, each taking hours, say more than any vote, and are far harder to fake.
- **Players choose which records are public.** A record carries a `public` mark inside its signed text, so every signer agreed to it. EntryPortals show the choice plainly on the signing screen and default to public, since a record exists to be shown.
- **Public records are published where the play happened.** A tied realm keeps a list of its complete public records, named in its realm card. A host keeps one for each open realm it runs, and boards add up a realm's play across every host. Realms and hosts want to publish, because published play is what ranks them.
- **Friends are a new realm's first evidence.** Records from play in the maker's browser are what let others find a new game and ask a host to load it.
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

- **Which games does a host load?** Suggested: the one with the most wishes per host already running it, so a wanted game with no host comes first. A wish is a record signed by a player ("I want to play release X"), one at a time per player, lasting a week. Hosts pass wishes to each other and count only those from players with play on record in realms they trust, so a crowd of made-up players counts for nothing. A game leaves when another has more wishes per host.
- **How do hosts and players find hosts?** A realm card travels in the torrent, so it cannot list hosts that load the game later. Suggested: a host running a release already shares its torrent, so the torrent network's own lookup answers "who has release X?". Each machine found that way is asked for its host card (its ID, web address and what it runs, signed by the host), since the lookup itself proves nothing. Hosts also announce themselves under one agreed fingerprint, so a new host finds the others, and each host publishes the list of hosts it knows. Browsers cannot use the torrent lookup, so a player asks any host or board.
- **What web address does a game in its maker's tab have, and where is the realm's secret kept meanwhile?** Friends need an HTTPS address to load the display from and to name in their sign-in notes, and the tab has none. If it is the relay's address, the relay could act as that game toward its players, so the answer decides how far a relay must be trusted.
- **Does a host need a domain name?** Free names made from a server's number need no setup. To be tested: whether certificates can be had reliably for such names when many hosts share one naming service, and whether games on one host stay fully apart.
- **iPhone storage.** iPhone browsers erase what a page's scripts stored, such as the EntryPortal's key, after seven days of browser use without a tap or click on that site. Every sign-in taps the EntryPortal, so only a player who goes that long without signing in anywhere is at risk, and their screenshot brings the identity back. Suggested: game sign-ins that last about five days, so regular play keeps tapping the EntryPortal.

## Safety and law

- Safety has no central moderator, so it lives with each person: their AI helper can check an EntryPortal or a realm's code, and they decide what to trust.
- Like the web, the protocol cannot enforce law centrally. Each person is responsible for what their own realms do, and each host for what it runs and lists. "No single point of failure, like email", never "built to escape authorities".
- **Pseudonymous, not anonymous.** A player ID hides a name, not tracks. Realms run at ordinary web addresses, see connections the way any website does, and public records are signed evidence that cannot be denied later. The network is not built for hiding and is not suited to it.
- **Privacy where it matters, within the law.** A player may use more than one secret phrase, keeping a second identity apart from their main one. A sensitive realm, such as a support group, can keep all its records private and let members use second identities, so that other members and the public cannot tell who they are. That is real privacy from other people, not protection from a lawful investigation.

## Original work only

Endless Mind is a tool for making original things. The project never suggests, shows or encourages copying anyone else's game, characters, names, art, music or other protected work, in its docs, examples, demos, code or promotion. Examples use invented names. Every place that tells people how to make a realm asks them to be original, and each builder is responsible for holding the rights to what they publish. The project runs no official network; it provides software, and whoever runs it is responsible for operating it.
