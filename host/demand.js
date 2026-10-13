// Loading by demand: the games a host runs without being asked. Each round it counts the wishes on
// its board that come from players it has reason to believe, shares each game's wishes among the hosts
// that run it, and runs the best few it can fetch. A game leaves when another has more wishes per
// host. See "Loading by demand" in specs/PROTOCOL.md.
//
//   const demand = await openDemand({ store, auto, trust, board, hosts, fixed, taken, open, close });
//
//   demand.round()    choose again; resolves to whether anything was loaded or dropped
//   demand.loaded()   the IDs of the releases loaded this way

import { join } from "node:path";
import { checkRelease, findRelease, removeRelease } from "./release.js";

/**
 * @typedef {import("./release.js").Release} Release
 * @param {{
 *   store: string,
 *   auto: number,
 *   trust: Iterable<string>,
 *   board: Pick<import("./board.js").Board, "refresh" | "games" | "wishes">,
 *   hosts: import("./hosts.js").Hosts,
 *   fixed: () => string[],
 *   taken: (realm: string) => boolean,
 *   open: (release: Release) => Promise<void>,
 *   close: (release: Release) => Promise<void>,
 *   log?: (text: string) => void,
 * }} options
 * `auto` is how many games to load; `trust` holds the IDs whose records make a player's wish count.
 * `fixed` gives the IDs of the releases the host runs whatever is wished, which are never chosen here.
 * `taken` says whether a realm's name on this host is in use. `open` and `close` start and stop a game.
 */
export async function openDemand(options) {
  const { store, auto, board, hosts, open, close } = options;
  const log = options.log ?? ((text) => console.log(text));
  const file = join(store, "auto.json");
  /** The releases loaded this way, by ID. @type {Map<string, Release>} */
  const mine = new Map();
  /** Releases already said to be out of reach, so that the log says it once. @type {Set<string>} */
  const missed = new Set();
  /** @type {Promise<boolean> | null} */
  let choosing = null;

  /** @param {unknown} error */
  const said = (error) => (error instanceof Error ? error.message : String(error));
  /** Whether a realm's name here is used by a game that was not loaded this way. @param {string} realm */
  const busy = (realm) => options.taken(realm) && ![...mine.values()].some((release) => release.realm === realm);
  const save = () => Deno.writeTextFile(file, JSON.stringify({ v: 1, type: "auto", releases: [...mine.keys()] }));

  // What was loaded before the host last stopped runs again from the store; the next round decides.
  /** @type {string[]} */
  let kept = [];
  try {
    kept = JSON.parse(await Deno.readTextFile(file)).releases;
  } catch {
    kept = [];
  }
  for (const id of kept) {
    try {
      const release = await checkRelease(store, id);
      if (options.fixed().includes(id) || options.taken(release.realm)) continue;
      await open(release);
      mine.set(id, release);
    } catch (error) {
      log(`Release ${id}, loaded by itself before, does not run now. ${said(error)}`);
      await removeRelease(store, id);
    }
  }

  async function choose() {
    await board.refresh();
    const wishes = await board.wishes(options.trust);
    const fixed = new Set(options.fixed());
    // A game's wishes are shared among the hosts that run it, this one included if it runs it or would.
    const ranked = (await board.games()).filter((game) => !fixed.has(game.release)).map(({ release, realm, name, hosts: running }) => {
      const count = wishes.get(release) ?? 0;
      const others = running.filter((host) => host.id !== hosts.id).length;
      return { release, realm, name, count, others, share: count / (others + 1) };
    }).filter((game) => game.count > 0 || mine.has(game.release));
    for (const [id, release] of mine) {
      if (!ranked.some((game) => game.release === id)) ranked.push({ release: id, realm: release.realm, name: release.note.card.name, count: 0, others: 0, share: 0 });
    }
    // Between equals, the one already running stays.
    ranked.sort((a, b) => b.share - a.share || Number(mine.has(b.release)) - Number(mine.has(a.release)) || (a.release < b.release ? -1 : 1));

    /** The releases to run from now on, with what earned each its place. @type {Map<string, { release: Release, why: string }>} */
    const keep = new Map();
    /** @type {Set<string>} */
    const names = new Set();
    for (const game of ranked) {
      if (keep.size >= auto) break;
      let release = mine.get(game.release);
      if (!release) {
        if (names.has(game.realm)) continue;
        if (busy(game.realm)) {
          if (!missed.has(game.release)) log(`${game.name} (release ${game.release}) is wished for, and was not loaded: another game is at its realm's name on this host.`);
          missed.add(game.release);
          continue;
        }
        try {
          release = await findRelease({ store, id: game.release, hosts });
          missed.delete(game.release);
        } catch (error) {
          if (!missed.has(game.release)) log(`${game.name} (release ${game.release}) is wished for, and could not be fetched. ${said(error)}`);
          missed.add(game.release);
          continue;
        }
        // The cards only said whose game it is; the release itself proves it.
        if (names.has(release.realm) || busy(release.realm)) {
          await removeRelease(store, release.id);
          continue;
        }
      }
      // One game to a name: of two releases of one realm, the more wished for.
      if (names.has(release.realm)) continue;
      names.add(release.realm);
      const wished = game.count === 1 ? "1 wish" : `${game.count} wishes`;
      keep.set(release.id, { release, why: `${wished} from players with play this host trusts, and ${game.others} other ${game.others === 1 ? "host runs" : "hosts run"} it` });
    }

    const first = [...keep.values()].find(({ release }) => !mine.has(release.id));
    let changed = false;
    for (const [id, release] of [...mine]) {
      if (keep.has(id)) continue;
      await close(release);
      mine.delete(id);
      await removeRelease(store, id);
      changed = true;
      const why = first ? `${first.release.note.card.name} has more wishes per host` : `this host loads ${auto} by itself`;
      log(`Dropped ${release.note.card.name} (release ${id}): ${why}. What its players saved is kept.`);
    }
    for (const [id, { release, why }] of keep) {
      if (mine.has(id)) continue;
      try {
        await open(release);
        mine.set(id, release);
        changed = true;
        log(`Loaded ${release.note.card.name} (release ${id}) by itself: ${why}.`);
      } catch (error) {
        log(`${release.note.card.name} (release ${id}) is wished for, and did not start. ${said(error)}`);
        await removeRelease(store, id);
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
