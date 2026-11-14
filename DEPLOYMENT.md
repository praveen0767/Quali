# Quali — Production Deployment (Vultr Cloud Compute)

Single-host Docker Compose deployment: an nginx container terminates TLS, serves the
built SPA and proxies `/api/` to a non-root Node API container backed by one
persisted data volume.

## Deployment status

**Not deployed. Nothing was provisioned on Vultr.**

No Vultr instance (ID/IP), region, plan, OS image, domain, SSH key or API token was
supplied in this session, so no cloud resources were created or modified and no
credentials were used. Every command below is prepared and locally verified; the
Vultr-specific values (`<INSTANCE_IP>`, `<DOMAIN>`, …) must be filled from the real
provisioned instance. Nothing in this document is a claim about live infrastructure.

What *was* verified, on this workstation with Docker 29.3.1 / Compose v5.1.1, is
listed in [Verified locally](#verified-locally).

## Architecture

```
             :80 / :443                    internal only
browser ──► web (nginx 1.27) ──/api/──► api (node:22, uid 1000) ──► /app/data (named volume)
                 │                         :8000 (not published)
                 ├── /            → /usr/share/nginx/html (Vite build of the SPA)
                 ├── /healthz     → 200 "ok"            (edge probe, no TLS required)
                 └── /assets/*    → immutable, 1y cache
certbot ── renews ──► letsencrypt volume ──► mounted read-only into web
```

The frontend calls relative `/api/v1/*` URLs (`src/lib/api/client.ts` falls back to
a relative base when `VITE_API_BASE_URL` is unset), so the browser stays same-origin
and no CORS preflight is needed in normal use. `ALLOWED_ORIGINS` still pins which
origins the API will answer with CORS headers.

## Service inventory

| Service | Image | Published ports | Runs as | Limits | Persistence |
|---|---|---|---|---|---|
| `api` | built from `Dockerfile.api` (`quali-api:<tag>`) | none (internal `8000`) | `node` uid 1000, read-only rootfs | 512 MB / 1.0 CPU | `quali_data` → `/app/data` |
| `web` | built from `Dockerfile.web` (`quali-web:<tag>`) | `80`, `443` (configurable) | nginx master root, workers `nginx` | 128 MB / 0.5 CPU | certs read-only |
| `certbot` | `certbot/certbot:latest` | none | image default | 128 MB / 0.25 CPU | `letsencrypt`, `certbot_webroot` |

All three use `restart: unless-stopped`, `no-new-privileges`, and json-file logging
capped at 10 MB × 3 files. `api` also uses `init: true` for zombie reaping and a
15 s stop grace period (SIGTERM → graceful close → force exit after 10 s).

Only the API's `/app/data` is persistent state. TLS material lives in the
`letsencrypt` volume; no other writes leave the containers.

### Application endpoints

| Path | Purpose |
|---|---|
| `GET /healthz` | Edge liveness, plain HTTP and HTTPS, never proxied |
| `GET /api/v1/health/live` | API liveness (used by container healthcheck) |
| `GET /api/v1/ready` | Readiness: store accessible, persistence writable |
| `GET /api/v1/health`, `GET /api/v1/metrics` | Legacy health/metrics — **unauthenticated**, see limitations |

## Environment variables

Copy `.env.production.example` to `.env` on the server (`chmod 600 .env`). `.env` is
git-ignored and excluded from the Docker build context; secrets are injected at
runtime only and never baked into an image.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DOMAIN` | yes | — | Public hostname; drives nginx `server_name` and the cert path |
| `ALLOWED_ORIGINS` | yes | — | Comma-separated browser origins allowed by CORS (e.g. `https://quali.example.com`) |
| `APP_URL` | no | empty | Canonical public URL used by the app |
| `ACME_EMAIL` | for issuance | — | Let's Encrypt contact address (bootstrap only) |
| `ACME_STAGING` | no | `0` | `1` uses the staging CA while testing |
| `HTTP_PORT` / `HTTPS_PORT` | no | `80` / `443` | Host port mapping. Keep 443 in production: the HTTP→HTTPS redirect targets `https://$host`, so a non-default HTTPS port is only useful for local testing |
| `IMAGE_TAG` | no | `local` | Image tag; `deploy.sh` sets a timestamp automatically |
| `GEMINI_API_KEY` | no | empty | Optional AI provider key (currently unused by the code) |
| `REQUEST_TIMEOUT_MS` | no | `30000` | Node request timeout |
| `HEADERS_TIMEOUT_MS` | no | `20000` | Node header timeout (must be ≤ request timeout) |
| `KEEP_ALIVE_TIMEOUT_MS` | no | `65000` | Node keep-alive (above nginx's 60 s upstream idle) |
| `SHUTDOWN_TIMEOUT_MS` | no | `10000` | Forced-exit deadline after SIGTERM |

Boundaries enforced in code/config, not by convention:

- Uploads: 25 MiB at the application (`MAX_DOCUMENT_SIZE_BYTES`), 26 MiB at nginx
  (`client_max_body_size`), 30 s body timeout.
- Proxy: 5 s connect, 60 s send/read; uploads buffered at the edge so the API's
  request timeout does not race a slow client.
- Storage: single JSON store behind one writer (see limitations).

## First deployment on the provisioned instance

Run on the instance itself; substitute the real values you were given.

```bash
# 0. DNS: point <DOMAIN> (A record) at <INSTANCE_IP> first.
dig +short <DOMAIN>

# 1. Docker Engine + Compose plugin (Ubuntu/Debian)
ssh root@<INSTANCE_IP>
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version

# 2. Get the code (rsync from your workstation, or git clone)
#    on workstation:
rsync -av --exclude node_modules --exclude dist --exclude data --exclude .env \
  ./newi-main/ root@<INSTANCE_IP>:/opt/quali/

# 3. Configure secrets/config
cd /opt/quali
cp .env.production.example .env
vi .env            # DOMAIN, ALLOWED_ORIGINS, APP_URL, ACME_EMAIL, IMAGE_TAG
chmod 600 .env

# 4. Firewall (Vultr Firewall group or ufw): allow 443 and 80 from anywhere,
#    SSH only from your admin address.
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable

# 5. Issue the first certificate (needs port 80 free; web is not running yet)
./deploy/scripts/bootstrap-tls.sh

# 6. Build and start, waiting for health
./deploy/scripts/deploy.sh

# 7. Verify end to end
./deploy/scripts/smoke.sh
```

If the scripts lost their executable bit during transfer from a Windows host, run
`chmod +x deploy/scripts/*.sh` once on the server (or prefix calls with `bash`).

`deploy.sh` builds tagged images (`quali-api:<timestamp>`, `quali-web:<timestamp>`),
starts the stack, waits up to 120 s for both services to report healthy, and records
the tag in `deploy/.last-good-tag`. Re-running it is the normal upgrade path.

Sizing guidance (not a provisioned fact): the stack fits a 1 vCPU / 1 GB instance
for pilot traffic; use 2 vCPU / 2 GB if document uploads or evaluation runs overlap.

## Verification

```bash
# Edge health over plain HTTP (no redirect for this path)
curl -fsS http://<DOMAIN>/healthz

# API health, readiness and SPA through TLS
curl -fsS https://<DOMAIN>/api/v1/health/live
curl -fsS https://<DOMAIN>/api/v1/ready
curl -fsSI https://<DOMAIN>/

# HTTP must redirect to HTTPS
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://<DOMAIN>/api/v1/health/live

# Full workflow: SPA, proxied API, upload, eligibility, 413 bound, CORS pinning
./deploy/scripts/smoke.sh
```

`smoke.sh` exits non-zero on any failure. Overrides: `BASE_URL=...` (default
`https://$DOMAIN`), `CURL_OPTS=-k` for a self-signed certificate during testing.

Container-level checks:

```bash
docker compose ps                       # both healthy, certbot up
docker compose logs --tail=50 api       # JSON request logs
docker compose logs --tail=20 web       # JSON access logs
docker compose exec -T api id           # uid=1000(node)
docker compose exec -T web nginx -t     # config syntax
```

## Rollback

Images are built locally and tagged per deploy, so rollback does not rebuild:

```bash
cd /opt/quali
./deploy/scripts/rollback.sh                  # reverts to deploy/.last-good-tag
./deploy/scripts/rollback.sh 20261115-101500  # or an explicit tag
docker image ls quali-api                     # tags present on the host
```

If a release is broken at the image level, roll back to the last tag, then fix
forward and redeploy. Restoring the data volume is only needed if the release
corrupted state:

```bash
# backup
docker run --rm -v quali_quali_data:/data -v "$PWD":/backup alpine \
  tar czf "/backup/quali-data-$(date -u +%Y%m%dT%H%M%SZ).tgz" -C /data .
# restore (stack stopped)
docker compose stop api
docker run --rm -v quali_quali_data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/<backup>.tgz -C /data'
docker compose start api
```

## Operations

- **Logs:** `docker compose logs -f api web`, rotation is capped by the json-file
  driver. API and nginx both emit one JSON object per line.
- **Certificates:** `certbot` renews every 12 h via the ACME webroot. After a
  renewal, reload nginx: `docker compose exec web nginx -s reload`.
- **Restart behaviour:** crash → automatic restart (`restart: unless-stopped`).
  `docker compose stop` / `kill` are deliberate stops and do not auto-restart;
  use `docker compose start` / `up -d`.
- **Secret rotation:** edit `.env`, then `docker compose up -d api` to recreate the
  container with the new value. No image rebuild required.
- **Data reset (destroys all state):** `docker compose down -v`.

## Security posture and limitations

- API container: non-root `node` user, read-only root filesystem, `no-new-privileges`,
  no published port, resources capped.
- nginx: TLS 1.2/1.3, HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `server_tokens off`. Its master process runs as root (needed to
  bind 80/443 and read the private key); workers run as `nginx`.
- CORS: only `ALLOWED_ORIGINS` is echoed; unlisted browser origins get no
  `Access-Control-Allow-Origin`. Requests without an `Origin` header are allowed —
  CORS is browser-enforced, and rejecting non-browser clients would only break
  health probes.
- **The application has no authentication.** Anyone who can reach the host can read
  the demo dataset and call state-changing endpoints, including
  `/api/v1/profile/shred` and `/api/v1/profile/reset-demo`, and `/api/v1/metrics` is
  public. Do not expose this to untrusted traffic without adding auth (e.g. nginx
  basic auth or an identity proxy) or an IP allowlist first.
- **Single instance only.** The store is one JSON file written by one process; it is
  not safe to scale `api` horizontally or share the volume between replicas.
- No rate limiting is configured at the edge; the app-level limits above are the
  only bounds.
- The repository's project-wide `tsc --noEmit` (`npm run lint`) reports pre-existing
  type errors in `src/server/orchestrator`, `src/server/eval-harness` and
  `src/lib/api/**`. Production images compile with esbuild without type-checking, so
  this does not block deploys, but it is not a green typecheck.
- `@google/genai` is declared but unused by the current code.

## Verified locally

Measured on this workstation, not on Vultr, using a self-signed certificate in place
of Let's Encrypt (DNS/ACME cannot be exercised without the real domain):

| Check | Result |
|---|---|
| `docker compose build` (api + web) | pass, after fixing a real `esbuild`/`vite` peer conflict |
| `docker compose config` | pass |
| Stack start, both services healthy | pass (api healthy before web starts) |
| `GET /healthz`, `/api/v1/health/live`, `/api/v1/ready` | 200 / 200 / `ready:true` |
| SPA shell + hashed JS asset over HTTPS | 200, `application/javascript` |
| Frontend→API via nginx proxy | 200, `opp-biox-2026` |
| Upload `POST /api/v1/workflow/documents/process` | 202 |
| Eligibility `POST /api/v1/workflow/eligibility/evaluate` | 200 with report |
| Oversized upload (30 MB) | 413 at nginx |
| CORS listed origin / unlisted origin | header returned / no header |
| HTTP→HTTPS redirect | 301 |
| HSTS + security headers | present on HTTPS responses |
| Non-root API | `uid=1000(node)`, `/app/data` owned by node |
| Read-only API rootfs | write to `/app` fails ("Read-only file system") |
| Persistence across restart | 23 documents before and after |
| Graceful SIGTERM | structured "Shutting down" → "Shutdown complete" |
| Crash recovery | `RestartCount=1`, healthy in 4 s, proxy 200 again |
| Structured logs | JSON per line from API and nginx |
| `deploy.sh` / `rollback.sh` / `smoke.sh` | deploy, full smoke, rollback all pass |
| Secrets in images | no `.env` in either image; `.env` git-ignored and dockerignored |

Not verified (impossible here): live Vultr provisioning, DNS resolution for the real
domain, real Let's Encrypt issuance/renewal, browser rendering with a trusted
certificate, and behaviour under real traffic.
