# War Archive Backend

Minimal Node.js backend for auth APIs, health checks, and crawler-updated
`/data/*` JSON from Docker on a NAS. Frontend pages are served by Netlify.

## Local run

Run these commands from the `NAS/` folder:

```powershell
npm --prefix back run check
$env:PORT = "8080"
node back/server.js
```

Open `http://127.0.0.1:8080/health` or `http://127.0.0.1:8080/data/search/war%20overview%20search.json`.

## NAS Docker run

Run from the `NAS/` folder:

```powershell
docker compose up -d --build
```

The compose file mounts `./data` into the backend container as read-only.
The crawler container writes to the same `./data` folder.

Set `WAR_ARCHIVE_PORT` in `.env` if the NAS already uses port `8080`.
