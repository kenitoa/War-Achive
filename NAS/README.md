# NAS deploy package

Use this folder as the Docker Compose project root on the NAS or VPS.

Run:

```bash
docker compose up -d --build
```

The Docker stack contains:

- `mysql`: auth/session database
- `war-archive`: Node backend and static mirror
- `history-crawler`: crawler that writes into `front/data`
- `discord-bot`: optional bot profile

`WAR_ARCHIVE_PUBLIC_URL` defaults to:

```text
https://knowtowars.netlify.app
```

That value is for public links and Discord messages. Netlify still needs a
separate public NAS backend origin in `../netlify/netlify.toml` for
`/api/auth/*` and `/data/*` proxying.
