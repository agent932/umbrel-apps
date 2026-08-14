# TeslaMate for Umbrel

A self-hosted data logger for your Tesla, packaged for the Agent932 Umbrel App Store.

TeslaMate polls your car through the Tesla API and records drives, charges, updates and
sleep cycles into Postgres, then visualises everything through a set of preconfigured
Grafana dashboards.

Upstream project: <https://github.com/teslamate-org/teslamate>

## What gets installed

| Service | Image | Purpose |
| :-- | :-- | :-- |
| `teslamate` | `teslamate/teslamate:4.1.1` | Web UI and Tesla API poller |
| `database` | `postgres:18-trixie` | Stores all logged data |
| `grafana` | `teslamate/grafana:4.1.1` | Dashboards |
| `mosquitto` | `eclipse-mosquitto:2` | MQTT broker for Home Assistant etc. |

## Ports

| Port | Service | Auth |
| :---: | :-- | :-- |
| 8841 | TeslaMate web UI | Umbrel login (via `app_proxy`) |
| 8842 | Grafana dashboards | Grafana login |
| 1884 | MQTT broker | Anonymous, LAN only |

Grafana needs its own port because Umbrel gives each app a single `app_proxy` route,
and that route is used by the TeslaMate UI.

Port 1884 is used for MQTT instead of the usual 1883 so this app can coexist with the
official Mosquitto Umbrel app.

## First run

1. Open **TeslaMate** from your Umbrel dashboard.
2. Sign in with a Tesla API **refresh token**. TeslaMate no longer accepts an email and
   password directly. Generate a token with a helper app — see
   [Generating tokens](https://docs.teslamate.org/docs/guides/tokens).
3. Once the car appears, open Grafana at `http://umbrel.local:8842`.
   - Username: `admin`
   - Password: shown on the TeslaMate tile in Umbrel (click the tile's ⋯ menu → credentials)

Grafana stores the admin password in its own database on first boot, so changing it in
Grafana sticks, and the value Umbrel displays will then be stale.

## Configuration

umbrelOS does not render a settings form for community app store apps, so options are
changed by editing the installed compose file over SSH:

```bash
sudo nano ~/umbrel/app-data/agent932-teslamate/docker-compose.yml
```

Then restart the app from the Umbrel UI, or:

```bash
sudo ~/umbrel/scripts/app restart agent932-teslamate
```

Useful settings:

- **Timezone** — set `TZ` on the `teslamate` service (e.g. `TZ=America/Edmonton`) so the
  TeslaMate UI shows local times. Grafana already uses your browser's timezone.
- **Default geofence** — add `DEFAULT_GEOFENCE=Home` to name locations that have no
  address match.
- **Polling intervals** — `POLLING_ASLEEP_INTERVAL`, `POLLING_DRIVING_INTERVAL`, etc.
- **External MQTT broker** — point `MQTT_HOST` at another broker, or add `DISABLE_MQTT=true`
  to turn MQTT off entirely.

The full list is in the
[TeslaMate environment variables reference](https://docs.teslamate.org/docs/configuration/environment_variables).

## Home Assistant

Point the Home Assistant MQTT integration at your Umbrel's IP on port **1884** with
anonymous auth, then follow the
[TeslaMate Home Assistant guide](https://docs.teslamate.org/docs/integrations/home_assistant).

## Data and backups

Everything lives under `~/umbrel/app-data/agent932-teslamate/data/`:

- `postgres/` — the database, i.e. all of your logged drives and charges
- `grafana/` — Grafana's own database (users, edited dashboards)
- `import/` — drop TeslaFi or other exports here to import historical data

The database password and the token encryption key are derived from your Umbrel device
seed, so they are stable across restarts and updates and never stored in the repo.

> [!IMPORTANT]
> The encryption key protects your Tesla API tokens and is tied to your Umbrel seed.
> Restoring `data/postgres/` onto a different Umbrel install will not decrypt the stored
> tokens — you will need to sign in again with a fresh token.

## Disclaimer

TeslaMate is not affiliated with, endorsed by, or sponsored by Tesla, Inc.
