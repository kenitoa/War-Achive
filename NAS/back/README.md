# War Archive Backend

Minimal Node.js backend for serving the `front` static site from Docker on a NAS.

## Local run

Run these commands from the `NAS/` folder:

```powershell
npm --prefix back run check
$env:PORT = "8080"
node back/server.js
```

Open `http://127.0.0.1:8080/`.

## NAS Docker run

Run from the `NAS/` folder:

```powershell
docker compose up -d --build
```

The compose file mounts `./front` into the container as read-only, so updating front files on the NAS does not require changing backend code.

Set `WAR_ARCHIVE_PORT` in `.env` if the NAS already uses port `8080`.
