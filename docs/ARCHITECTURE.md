# Architecture — Quali Intelligence

## High-level diagram

```mermaid
flowchart LR
  %% Browser / client
  B[Browser]:::browser

  %% Edge / reverse proxy
  N[nginx:::edge]:::prod

  %% API tier
  A[Express API:::api]:::prod

  %% Data store
  D[(JSON Store:::data)]:::prod

  %% Services sub-modules
  subgraph API "Express API (Node, port 8000)"
    DB[routes]:::mod
    OE[orchestrator]:::mod
    RE[rulesEngine]:::mod
    DE[documentPipeline]:::mod
    EE[evalHarness]:::mod
  end

  %% Connections
  B -- HTTPS --> N
  N -- HTTP proxied --> A
  A -- JSON reads/writes --> D
  style B fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
  style N fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
  style A fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
  style D fill:#fffde7,stroke:#f57f17,stroke-width:2px
  style DB fill:#e3f2fd,stroke:#1565c0,stroke-width:1px,stroke-dasharray: 5 5
  style OE fill:#e3f2fd,stroke:#1565c0,stroke-width:1px,stroke-dasharray: 5 5
  style RE fill:#e3f2fd,stroke:#1565c0,stroke-width:1px,stroke-dasharray: 5 5
  style DE fill:#e3f2fd,stroke:#1565c0,stroke-width:1px,stroke-dasharray: 5 5
  style EE fill:#e3f2fd,stroke:#1565c0,stroke-width:1px,stroke-dasharray: 5 5
```

**Key**

- `B` — Browser, served the React SPA
- `N` — nginx 1.27-alpine, TLS termination, static SPA hosting, `/api/` reverse proxy
- `A` — Express API (Node.js Alpine), non-root user, read-only rootfs, internal-only (no public ports except via nginx)
- `D` — `data/quali_store.json`, single-writer atomic JSON persistence; deleted on `docker compose down -v`
- Module boundaries inside the API are logical; the codebase is a single process.

## Module responsibilities

| Module / File | Primary responsibility | Key exports |
| --- | --- | --- |
| `src/server/app.ts` | App bootstrap; calls `createApp()`; mounts CORS, body parsing, routes, error handler, health endpoints; graceful shutdown | `createApp()` → `Promise<express.Application>` |
| `src/server/routes/` | Route registrations; each file maps a surface API surface | `opportunities.ts`, `documents.ts`, `criteria.ts`, `reports.ts`, `workflow/`, `profile/`, `recommendations/` |
| `src/server/engine/rulesEngine.ts` | Deterministic eligibility evaluation: hard gates (degree, conferral window, GPA, citizenship) + soft domain criteria; returns per-criterion verdict + evidence citations | `evaluateOpportunity(profile, criteriaRubric, ingestedDocs)` |
| `src/server/engine/documentPipeline.ts` | Document intake: MIME/magic-byte validation, 25 MiB / 1 KiB caps, SHA-256 dedupe, page counting, per-type extraction fixtures | `processDocument(file, documentType)` |
| `src/server/engine/checklistGenerator.ts` | Generates per-opportunity application task checklists from a seeded rubric | `generateChecklistTasks(opportunity, criteriaRubrics)` |
| `src/server/orchestrator/` | Composition root; wires routes → engine → document pipeline → checklist; manages profile / document / eligibility / checklist state transitions | `index.ts` (bootstraps orchestrator), `evaluator.ts` |
| `src/server/middleware/secureCors.ts` | CORS with allow-list; rejects unlisted origins; supports no-`Origin` for health/probes | `createSecureCORS()`, `createStrictAPICORS()` |
| `src/server/middleware/errorHandler.ts` | Structured JSON logs; correlation IDs; maps AppError → 4xx/5xx | `errorHandler` |
| `src/server/middleware/rateLimit.ts` | Per-client rate limiting (1 minute window, configurable max) | `createRateLimiter()`, `createScopedRateLimiter()` |
| `src/lib/api/client.ts` | Client-side API calls from the React SPA; `API_BASE_URL`, `isMockModeEnabled()` | `API_BASE_URL`, `isMockModeEnabled()` |
| `src/lib/api/reports.ts` | Report-page data loading; hardcodes case `AUDIT-STANFORD-BIOX-8821` for demo | `loadReport(caseId)` |
| `src/lib/api/eval/` | Evaluation harness: labelled-dataset runner, metrics reporter, CSV/JSON output | `index.ts`, `runner.ts`, `metricsReporter.ts` |
| `src/server/eval-harness/index.ts` | Entry point `npm run eval`; iterates 12 cases over the API; writes console + JSON report | `main()` |
| `data/quali_store.json` | One-file JSON store: profile, opportunities, documents, ingested docs, eligibility reports, tasks, criteria rubrics | N/A (runtime only) |

## Request flow (real example: upload → evaluate → checklist)

```
1. Client uploads PDF → nginx buffers → POST /api/v1/workflow/documents/process
   └─ Express: multer 25 MiB cap → documentPipeline.processDocument()
   └─ Returns: { requestId, sha256, pageCount, citations per type }
2. Client POST /api/v1/workflow/eligibility/evaluate { opportunityId }
   └─ Express: validates opportunity exists → rulesEngine.evaluateOpportunity()
   └─ Returns: { caseId, gates {education-tier, conferral-window, gpa-threshold, citizenship-standing}, score, criteria[] }
3. Client POST /api/v1/workflow/checklist/generate { opportunityId, eligibilityResultId }
   └─ Express: generates dated task list → prepends to db.tasks
   └─ Returns: { tasks: [{title,priority,deadline}, ...], generatedAt, linkedOpportunityId }
4. Client GET / → dashboard aggregates live data from steps 1-3
```

## Technologies & dependencies

| Layer | Technology | Version | Notes |
| --- | --- | --- | --- |
| UI | React 19 + TypeScript | 19.0.1 / 7.0.2 | Vite 8.3.0 dev server |
| Styling | Tailwind CSS (`@tailwindcss/vite`) | 4.3.3 | JIT, framework-aware |
| Routing / icons | react-router-dom / lucide-react | 7.18.4 / 0.546 | Client-side routing |
| Motion | motion (Framer Motion) | 12.23 | Page/transition animations |
| API | Express 4 | 4.21.2 | One process, single-writer JSON |
| HTTP body parsing | multer | 2.5.0 | 25 MiB cap, file validation |
| CORS | cors | 2.8.6 | Secure allow-list |
| Structured logs | pino-like custom | — | correlation ID, JSON only |
| Rate limiter | custom sliding-window | 60 s window, config maxRequests | `src/server/middleware/rateLimit.ts` |
| Tests | Vitest + supertest | 5.1.0 / 7.3.2 | 60 tests, 2 test files |
| Eval harness | tsx + own runner/metrics | 4.23+ | `npm run eval` |
| Containers | Docker + Compose | 29.3.1 / v5.1.1 | Verified locally |
| Edge | nginx 1.27-alpine | — | TLS, static SPA, `/api/` proxy |
| Certificates | certbot (webroot) | latest | 12 h renewal loop (demo only) |
| Runtime | Node.js 22 (Alpine) | 22 | Non-root user, read-only rootfs |

## Deployment architecture (local Docker; design target: single Vultr CC instance)

```
+----------------------+       +----------------------+
|  Browser (HTTPS)     |<----->|  nginx:8443 (TLS)    |
+----------------------+       +----------------------+
               | proxy      |
               v          v
          +----------+   +----------+
          | api:8000 |   | certbot    |
          +----------+   +----------+
               |            |
               +------------+
```

- **nginx** terminates TLS (self-signed cert for local; Let's Encrypt on real host), serves the React SPA from `/`, proxies `/api/` to the Express API.
- **Express API** (`quali-api:local`) is internal-only (port 8000 mapped only within the compose network). It binds `0.0.0.0:8000` but is only reachable through nginx.
- **certbot** runs a webroot renewal loop every 12 h; in the local demo it creates a self-signed cert into volume `quali_letsencrypt` at `live/localhost/`.
- **Data**: `quali_quali_data` volume mounts `/app/data` read-write into the API container; the JSON store is the only persistent state.
- **Network**: `quali_default` bridge; containers discover each other by service name.

## Security posture (as verified, not audited)

- No authentication on any route (including destructive ones); this is a known blocker for public exposure.
- CORS allow-list is configured per environment; production uses `ALLOWED_ORIGINS` from `.env`.
- Rate limiting is active (1 min window, configurable max).
- Request bodies capped at 50 MiB (Express) / 25 MiB (API); nginx also rejects >26 MiB.
- Structured JSON logs only; no PII in log output.
- Graceful shutdown with `SHUTDOWN_TIMEOUT_MS` (default 10 s).
- Containers run as non-root; API rootfs is read-only except `/app/data`.