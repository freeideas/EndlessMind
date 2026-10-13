# portal.endlessmind.com

The reference EntryPortal's own site. Nothing else may ever be served here: the player's key cannot be read out of the browser, but any script on this site could use it to sign, so a single other page here could sign as every player. `uv run deploy/site.py` publishes this folder to `~/domains/portal.endlessmind.com/` on ordinarydata (this README is left out).

| Path                | What it is                                                                |
| ------------------- | ------------------------------------------------------------------------- |
| `index.html`        | Forwards to the newest version, keeping the part after "#"; realms use it |
| `v0.65/`            | The newest version: `index.html`, one whole page, and `SHA256SUMS`        |

Every file here is written or checked by `deno task portal` (see `deploy/entryportal.js`): it copies the shared code in from `shared/`, updates the security policy hashes and the fingerprint, and writes the forwarding page. Improvements are welcome as new versions: once a version is published it is never edited in place, so a check of it stays true. Versions are numbered v0.65, v0.66 and so on, to leave room before v1.0. To make one, copy the newest folder to the next version, set `VERSION` in `deploy/entryportal.js`, edit the copy and delete the older folder.
