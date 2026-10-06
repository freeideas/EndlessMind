# Lantern Garden

A tiny example realm: plant glowing seeds in a night garden, and ten seeds earn a record. It shows guest play, sign-in by QR code, "sign in on this computer", claiming a record and the public list, using [the realm library](../../realm/README.md).

Run it with `deno task garden` and open `http://localhost:8000/`. Its files (the realm's secret phrase, its data and the gardens) go in `data/` here, which Git ignores.

| Setting           | Default                                        |
| ----------------- | ---------------------------------------------- |
| `GARDEN_PORT`     | `8000`                                         |
| `GARDEN_HOSTNAME` | `127.0.0.1`: only this computer can reach it   |
| `GARDEN_BASE`     | `http://localhost:<port>/`                     |
| `GARDEN_PORTAL`   | `https://portal.endlessmind.com/`              |
| `GARDEN_DATA`     | `data/` in this folder                         |

To try it with a local EntryPortal, serve `portal/` (for example `deno run -A jsr:@std/http/file-server --port 8001 portal`) and set `GARDEN_PORTAL=http://127.0.0.1:8001/`. The EntryPortal accepts plain `http` only for `localhost` and `127.0.0.1`.
On endlessmind.com it runs as [deploy/lantern-garden.service](../../deploy/lantern-garden.service) at `https://garden.endlessmind.com/`.
