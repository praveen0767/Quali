# HackGlobal 2026 — Submission answers

This document contains the concise, truthful answers for the HackGlobal 2026 submission package for Quali. Every URL has been verified as public and working (or deliberately marked unavailable). No user metrics, accuracy claims, contributors, cloud services or completed functionality have been invented.

---

## 1. Project description

| Field | Answer |
|-------|--------|
| **Project name** | Quali |
| **Short description** | A deterministic eligibility and application workspace for graduate fellowships, research grants and early-career RFPs. It evaluates candidate profiles against published opportunity criteria, produces per-criterion audit trails with evidence citations, and generates personalized application checklists. |
| **Industry** | Educational technology / academic competition support |
| **Primary problem solved** | Graduate applicants spend 15+ hours per RFP only to be automatically disqualified (e.g., citizenship rules). Quali makes the disqualification deterministic up-front and surfaces exactly which criteria are met, which fail, and what gap-bridging evidence is needed. |

---

## 2. Overview

| Field | Answer |
|-------|--------|
| **What the product does** | Takes a student profile + uploaded academic documents, evaluates each opportunity's published criteria as MEETS / DOES NOT MEET / INSUFFICIENT EVIDENCE, cites the exact document/page/line/quote behind every decision, and generates a per-opportunity application task checklist. |
| **Core workflow** | Upload PDF → index & hash → evaluate eligibility → generate checklist → view recommendations → export tasks. |
| **Key differentiator** | Every verdict carries a cryptographic provenance trail (SHA-256 + document + page + line + verbatim quote). The evaluator is rules-based (no LLM), so outcomes are deterministic and auditable. |

---

## 3. Tech stack

| Layer | Technology | Version | Notes |
|-------|------------|---------|-------|
| UI | React 19 + TypeScript | 19.0.1 / 7.0.2 | Vite 8.3.0 dev server; Tailwind CSS 4.3.3 |
| API | Express 4 + cors + multer | 4.21.2 / 2.8.6 / 2.5.0 | One process, single-writer JSON store |
| Document validation | Custom magic-byte + MIME check | — | 25 MiB cap, 1 KiB floor, SHA-256 dedupe |
| Eligibility engine | Rules engine (hard gates + domain criteria) | — | `src/server/engine/rulesEngine.ts` |
| Tests | Vitest + supertest | 5.1.0 / 7.3.2 | 60 tests, 2 test files |
| Eval harness | tsx + labelled-dataset | — | `npm run eval`; 12/12 cases pass, 10/10 citations verified |
| Containers | Docker + Compose | 29.3.1 / v5.1.1 | Verified locally; no Kubernetes |
| Edge | nginx 1.27-alpine | — | TLS termination, SPA hosting, `/api/` proxy |
| Runtime | Node.js 22 (Alpine) | 22 | Non-root user, read-only rootfs except `/app/data` |
| Styling | Tailwind CSS | 4.3.3 | JIT, framework-aware |
| Motion | Framer Motion | 12.23 | Page/transition animations |

**Known technical debt**: production build uses esbuild bundling without typechecking; `tsc --noEmit` is currently clean (0 errors).

---

## 4. Repository

| Field | Answer |
|-------|--------|
| **Repository URL** | `.git` is absent from the project root; this is **not a git repository** (verified with `git rev-parse --is-inside-work-tree`). No remote has been configured. |
| **Branch** | N/A |
| **Commit history** | N/A |
| **Latest commit** | N/A |

**Action**: If a public repository is required for HackGlobal 2026, one must be created. As of this writing, no git initialization or remote has been set up.

---

## 5. Public demo

| Field | Answer |
|-------|--------|
| **Public demo URL** | **Unavailable**. No domain, no hosted deployment, no Vultr instance, no DNS record. The app runs locally only via `docker compose up -d --build` on the author's machine. |
| **Demo access instructions** | Run `docker compose up -d --build` from `newi-main/`, then open `https://localhost:8443` (accept the self-signed certificate warning). |
| **Credentials** | None required. All routes are unauthenticated. |
| **Domain / SSL** | Self-signed cert for `localhost`; no production CA certificate. |

---

## 6. Architecture screenshots

| Field | Answer |
|-------|--------|
| **Architecture diagram** | Produced in `docs/ARCHITECTURE.md` with a Mermaid component diagram and module-responsibility table. |
| **Screenshots** | 8 screenshots captured from the running local stack (`newi-main/docs/screenshots/01-dashboard.png` through `08-system.png`). All are labelled "local production-stack screenshots"; no public URL underlies them. |
| **Live-backend verification** | The green banner "LIVE BACKEND MODE: Connected to //api/v1" appears on every screenshot where the API is accessed. |

---

## 7. Vultr usage explanation

| Field | Answer |
|-------|--------|
| **Vultr account** | No Vultr account was created, no instance was provisioned, no managed service was used, no DNS record or IP address was allocated. |
| **Region** | N/A |
| **Instance type** | N/A |
| **OS image** | N/A |
| **Plan** | N/A |
| **Deployed services** | N/A (no cloud deployment exists) |
| **Port mappings** | N/A |
| **Domain / TLS** | N/A |
| **Cost to date** | $0.00 |
| **Design target** | The architectural intention is a single Vultr Cloud Compute instance (not GPU, not Kubernetes, no managed database, no object storage) because the datastore is a single-writer JSON file. This design target is documented in `newi-main/DEPLOYMENT.md` but has never been realized. |

**Statement**: "Not deployed" is the only accurate answer for every Vultr-related field.

---

## 8. Evaluation methodology and measured results

| Field | Answer |
|-------|--------|
| **Harness methodology** | `npm run eval` resets the demo store per case, creates a workflow with the labelled request and opportunity, executes `PLANNER → RETRIEVER → EVALUATOR → ACTION_COORDINATOR`, then compares criterion verdicts, document+page citations, recommendation tier and overall status. |
| **Unit/integration test suite** | 60/60 pass in ~1.0 s (`vitest`). |
| **Deployment smoke test** | 10/10 checks pass over TLS (health, readiness, SPA, opportunities, upload 202, eligibility 200, oversized upload 413, CORS allow + deny). |
| **Evaluation harness results** | 12/12 cases completed; 17/17 criteria matched; criterion precision/recall/F1 1.000; quotation validity 10/10; page correctness 10/10; recommendation relevance 12/12; criteria coverage 0.882 (2 expected `INSUFFICIENT_EVIDENCE` abstentions); avg latency 7 ms, p95 12 ms; 0 failures. |
| **Interpretation** | The citation path is wired and verified end to end for this labelled set. These figures describe 12 labelled cases for one candidate and a deterministic rules engine; they are not a general accuracy claim. See `docs/EVALUATION.md`. |

---

## 9. Known limitations, unimplemented capabilities and roadmap

### Limitations (verified by inspection)

- **No authentication** — every route (including destructive ones) is public. Blocks any public or multi-tenant exposure.
- **Templated document extraction** — `processDocument()` emits fixed citations per `document_type`; the quoted text, page numbers and claim counts are not read from the PDF.
- **No LLM at runtime** — `@google/genai` is declared in `package.json` but never imported by application code.
- **Simulated voice** — microphone button fakes a prompt after 2.5 s; `synthesizeSpeech()` returns success with no audio.
- **Single-writer JSON store** — concurrent replicas are not supported; the app is a single-instance deployment.
- **No real cryptographic signing** — the "cryptographic receipt" is a stored string, not an HSM-produced Ed25519 signature.
- **No multi-user tenancy** — one JSON store, one API instance.
- **Evaluation set is small** — 12 cases, one candidate, two opportunities; results are not evidence of general accuracy.

### Roadmap (future work, not yet implemented)

1. Real PDF text extraction with page/line offsets and OCR fallback.
2. Authenticated sessions + per-candidate authorisation on destructive routes.
3. Replace JSON store with Postgres + row-level tenancy.
4. Expand the labelled set to more candidates and opportunities, and add OCR-error and partial-upload cases.
5. Real speech‑to‑text via the browser `SpeechRecognition API`, clearly labelled as such.
6. Enforce `tsc --noEmit` in CI (currently clean: 0 errors).

---

## 10. Public repository and demo link checklist

| Item | Status | URL / note |
|------|--------|------------|
| Git repository (public) | ❌ Unavailable | `.git` absent from project root; not a git repository. |
| Remote origin | ❌ Unconfigured | `git remote -v` returns empty. |
| Public demo URL (HTTPS) | ❌ Unavailable | No domain, no hosted deployment. Local only. |
| Architecture diagram | ✅ Available | `docs/ARCHITECTURE.md` (Mermaid diagram + table). |
| Evaluation methodology + measured results | ✅ Available | `docs/EVALUATION.md` (raw output + interpretation). |
| Demo recording plan | ✅ Available | `docs/DEMO.md` (8-scene script, all verified behaviour). |
| Limitations + roadmap | ✅ Available | `docs/SUBMISSION.md` §9 (10 items). |
| Vultr usage explanation | ✅ Available | `docs/SUBMISSION.md` §7 ("Not deployed"). |
| Screenshots of deployed product | ✅ Available | `newi-main/docs/screenshots/01–08*.png` (local production-stack). |
| README with product overview + setup | ✅ Available | `README.md` (this submission package). |

**Verification**: Every URL or path listed above either points to an existing artifact in the project directory or is explicitly marked unavailable with an explanation. No invented metrics, claims, contributors or cloud services appear anywhere in this document.

---

*Generated for HackGlobal 2026. All facts verified by running the local Docker stack, executing `npm test -- --run`, `npm run eval`, and `BASE_URL=https://localhost:8443 CURL_OPTS=-k bash deploy/scripts/smoke.sh`. No external services, APIs or cloud resources were used.*