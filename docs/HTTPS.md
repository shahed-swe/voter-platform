# HTTPS setup

The app runs behind a **Caddy** reverse proxy that terminates TLS and forwards to
the Express server on `:3000`. Geolocation (canvasser/voter GPS, issues #4/#6/#8)
requires an HTTPS "secure context" — this provides it.

One knob controls everything: **`SITE_ADDRESS`**.

| Environment | `SITE_ADDRESS` | Certificate |
|-------------|----------------|-------------|
| Local dev | `localhost` (default) | Caddy internal self-signed CA |
| Server, no domain yet | `https://153.75.230.154` | self-signed (browser warning, but valid HTTPS → geolocation works) |
| Server, real domain | `vote.example.com` | **automatic Let's Encrypt** (trusted, no warning) |

## Local (self-signed)

```bash
SITE_ADDRESS=localhost docker compose up -d
# → https://localhost  (accept the one-time browser warning)
```

`localhost` is already a "secure context" even on plain HTTP, so geolocation works
in local dev either way; the self-signed cert just mirrors production.

## Production

1. In `.env` set `SITE_ADDRESS` (domain preferred) and `ACME_EMAIL`.
2. Point the domain's DNS `A` record at the server IP, open ports 80 + 443.
3. `docker compose up -d` — Caddy provisions the cert automatically.
4. Switch `TENANT_PUBLIC_URL` and `ALLOWED_ORIGINS` to the `https://` URL.

**Getting a real domain later is just:** set `SITE_ADDRESS=your.domain`, re-run
`docker compose up -d caddy`. No app/code change — Caddy fetches a trusted cert and
HTTPS is live for you.

The plain HTTP port `:3000` stays published for now; once HTTPS is verified you can
drop that mapping so everything goes through 443.
