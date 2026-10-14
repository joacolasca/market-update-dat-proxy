# Market Update DAT proxy

Small server used by the Market Update Builder (Tungsten / Matson Logistics) to read DAT's weekly
national load-to-truck ratio, which DAT only exposes to its own site (CORS).

- `GET /lt-weekly/VAN` (also `REEFER`, `FLATBED`) → last 8 weeks `{ weekEnding, ratio }`
- `GET /health`
- Only that route is proxied. 1-hour in-memory cache; if DAT fails it serves the last good data.
- No dependencies. Runs on Render's free plan (sleeps when idle, wakes on the first request).

## Weekly data snapshot (primary source)

A GitHub Actions workflow (`.github/workflows/update-data.yml`) runs every 6 hours, downloads the weekly
load-to-truck ratio from DAT and commits it to `data/lt-weekly-{VAN,REEFER,FLATBED}.json` only when it changes.
The Builder reads those files from `raw.githubusercontent.com` (instant, open CORS, nothing to wake up) and falls
back to the Render server, then to manual entry.
