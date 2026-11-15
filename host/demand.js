// Loading by demand: the games a host runs without being asked. Each round it takes the wishes on its
// board, which name realms and count only players it has reason to believe, shares each realm's wishes
// among the hosts that run it, and runs the best few it can fetch. A realm leaves when another has more
// wishes per host. See "Loading by demand" in specs/PROTOCOL.md.
//
//   const demand = await openDemand({ store, auto, board, hosts, fixed, taken, find, open, close });
//
//   demand.round()    choose again; resolves to whether anything was loaded or dropped
//   demand.loaded()   the IDs of the realms loaded this way

import { join } from "node:path";
import { isId } from "../shared/keys.js";
import { removeRelease } from "./release.js";

/**
 * @typedef {import("./release.js").Release} Release
 * @param {{
 *   store: string,
 *   auto: number,
 *   board: Pick<import("./board.js").Board, "refresh" | "games">,
 *   hosts: import("./hosts.js").Hosts,
 *   fixed: () => string[],
 *   taken: (realm: string) => boolean,
 *   find: (realm: string) => Promise<Release>,
 *   open: (release: Release) => Promise<void>,
 *   close: (realm: string) => Promise<void>,
 *   log?: (text: string) => void,
 * }} options
 * `auto` is how many realms to load. `fixed` gives the IDs of the realms the host runs whatever is
 * wished, which are never chosen here. `taken` says whether a realm's name on this host is in use.
 * `find` gives a realm's newest release, from the store or fetched. `open` starts a release, and `close`
 * stops a realm's game and removes its release from the store.
 */
export async function openDemand(options) {
  const { store, auto, board, hosts, open, close } = options;
  const log = options.log ?? ((text) => console.log(text));
  const file = join(store, "auto.json");
  /** The realms loaded this way, each with its game's name. @type {Map<string, string>} */
  const mine = new Map();
  /** Realms already said to be out of reach, so that the log says it once. @type {Set<string>} */
  const missed = new Set();
  /** @type {Promise<boolean> | null} */
  let choosing = null;

  /** @param {unknown} error */
  const said = (error) => (error instanceof Error ? error.message : String(error));
  /** Whether a realm's name here is used by a game that was not loaded this way. @param {string} realm */
  const busy = (realm) => options.taken(realm) && !mine.has(realm);
  const save = () => Deno.writeTextFile(file, JSON.stringify({ v: 1, type: "auto", realms: [...mine.keys()] }));

  // What was loaded before the host last stopped runs again, from the store if it is there; the next
  // round decides.
  /** @type {string[]} */
  let kept = [];
  try {
    kept = JSON.parse(await Deno.readTextFile(file)).realms.filter(isId);
  } catch {
    kept = [];
  }
  for (const realm of kept) {
    if (options.fixed().includes(realm) || options.taken(realm)) continue;
    try {
      const release = await options.find(realm);
      await open(release);
      mine.set(realm, release.note.card.name);
    } catch (error) {
      log(`Realm ${realm}, loaded by itself before, does not run now. ${said(error)}`);
    }
  }

  async function choose() {
    await board.refresh();
    const fixed = new Set(options.fixed());
    // A realm's wishes are shared among the hosts that run it, this one included if it runs it or would.
    const ranked = (await board.games()).filter((game) => !fixed.has(game.realm)).map(({ realm, name, releases, wishes }) => {
      const others = new Set(releases.flatMap((one) => one.hosts.map((host) => host.id)).filter((id) => id !== hosts.id)).size;
      return { realm, name, count: wishes, others, share: wishes / (others + 1) };
    }).filter((game) => game.count > 0 || mine.has(game.realm));
    for (const [realm, name] of mine) {
      if (!ranked.some((game) => game.realm === realm)) ranked.push({ realm, name, count: 0, others: 0, share: 0 });
    }
    // Between equals, the one already running stays.
    ranked.sort((a, b) => b.share - a.share || Number(mine.has(b.realm)) - Number(mine.has(a.realm)) || (a.realm < b.realm ? -1 : 1));

    /** The realms to run from now on: a release for each new one, and what earned each its place. @type {Map<string, { name: string, release: Release | null, why: string }>} */
    const keep = new Map();
    for (const game of ranked) {
      if (keep.size >= auto) break;
      /** @type {Release | null} */
      let release = null;
      if (!mine.has(game.realm)) {
        if (busy(game.realm)) {
          if (!missed.has(game.realm)) log(`${game.name} (realm ${game.realm}) is wished for, and was not loaded: another game is at its name on this host.`);
          missed.add(game.realm);
          continue;
        }
        try {
          release = await options.find(game.realm);
          missed.delete(game.realm);
        } catch (error) {
          if (!missed.has(game.realm)) log(`${game.name} (realm ${game.realm}) is wished for, and could not be fetched. ${said(error)}`);
          missed.add(game.realm);
          continue;
        }
      }
      const wished = game.count === 1 ? "1 wish" : `${game.count} wishes`;
      keep.set(game.realm, { name: release?.note.card.name ?? game.name, release, why: `${wished} from players this host counts, and ${game.others} other ${game.others === 1 ? "host runs" : "hosts run"} it` });
    }

    const first = [...keep.values()].find(({ release }) => release);
    let changed = false;
    for (const [realm, name] of [...mine]) {
      if (keep.has(realm)) continue;
      await close(realm);
      mine.delete(realm);
      changed = true;
      const why = first ? `${first.name} has more wishes per host` : `this host loads ${auto} by itself`;
      log(`Dropped ${name} (realm ${realm}): ${why}. What its players saved is kept.`);
    }
    for (const [realm, { name, release, why }] of keep) {
      if (!release) continue;
      try {
        await open(release);
        mine.set(realm, name);
        changed = true;
        log(`Loaded ${name} (realm ${realm}) by itself: ${why}.`);
      } catch (error) {
        log(`${name} (realm ${realm}) is wished for, and did not start. ${said(error)}`);
        await removeRelease(store, release.id);
      }
    }
    if (changed) await save();
    return changed;
  }

  return {
    round: () => (choosing ??= choose().finally(() => (choosing = null))),
    loaded: () => [...mine.keys()],
    /** Wait for any round under way. */
    async stop() {
      await choosing?.catch(() => {});
    },
  };
}
