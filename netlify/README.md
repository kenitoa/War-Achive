# Netlify deploy package

Use this folder as the Netlify project root.

Netlify settings:

- Base directory: `netlify`
- Build command: empty
- Publish directory: `front`

The site URL should be:

```text
https://knowtowars.netlify.app
```

`netlify.toml` keeps the frontend static and proxies `/api/auth/*` plus
`/data/*` to the public NAS backend origin. The proxy target must be the NAS
backend URL, not `knowtowars.netlify.app`, or the request will loop back into
Netlify.
