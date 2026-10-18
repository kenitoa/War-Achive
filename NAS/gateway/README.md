# Public account gateway

Node.js 22 standard-library HTTP gateway. It exposes only account registration/session/shelf/password-reset/account-deletion, public submissions and a minimal upstream health check. Administrator routes never pass this boundary. No runtime or development packages are required.

The deployment contract is **browser `/api/v1/...` on Vercel → Vercel rewrite → NAS `/war-archive-api/api/v1/...` → gateway → internal `api:4310`**. Both prefixed and already-stripped ingress paths are supported. Member `Set-Cookie` attributes, including `Path=/api/v1`, remain unchanged because the browser sees the Vercel path. Only `wa_member` cookies pass either direction.

| Environment | Default | Purpose |
|---|---|---|
| `API_ORIGIN` | `http://api:4310` | Fixed internal upstream; only HTTP hosts `api`, `localhost`, `127.0.0.1`, `::1` are accepted |
| `PUBLIC_PATH_PREFIX` | `/war-archive-api` | Exact single ingress path segment to strip |
| `PORT` | `8080` | Gateway listening port on `0.0.0.0`; publish only to host loopback in Compose |

All requests and responses use `Cache-Control: no-store`. Request bodies are limited to 1 MiB, JSON only; upstream responses to 2 MiB. Compressed request bodies, encoded paths, traversal, query strings, redirects, private headers and administrator cookies are rejected or removed. Upstream calls have a 30 second timeout and client disconnect cancellation. Upstream server failures return a generic error. Logs contain only the startup event; tokens, cookies, bodies and contact addresses are never logged.

Preflight is allowed only for an explicit public path and one of that path's allowed methods. The backend still validates `Origin` and CSRF tokens. Set backend `PUBLIC_ACCOUNT_API_ENABLED=true` and allow the actual Vercel origin before enabling the rewrite.

Run `npm run lint` (JavaScript syntax validation) and `npm test` (real local HTTP integration tests). JavaScript has no TypeScript compilation step. `docker build -t war-archive-public-gateway .` runs both checks in the verification stage and creates a non-root runtime image containing only the application source.
