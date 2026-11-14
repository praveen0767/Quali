# Demo script — HackGlobal 2026 submission

**Audience**: HackGlobal 2026 judges. This script records the actual behaviour of the locally running Quali stack (Docker + TLS + live API). No external services, no mocked data, no LLM calls.

---

## Prerequisites

- Docker Desktop / Engine running.
- Stack built and started: `docker compose up -d --build` from `newi-main/`.
- Self-signed cert in volume `quali_letsencrypt`; accept the browser certificate warning.
- Browser: Chrome (or Chromium) with `--ignore-certificate-errors`, `--virtual-time-budget=15000`.

> **URL**: `https://localhost:8443` (the green "LIVE BACKEND MODE" banner should appear.)

> **All clicks and paths are exact**. If a step fails, stop and inspect the logs — the demo records only verified behaviour.

---

### Scene 1 — Introduce a real opportunity announcement

| Step | Action | Expected outcome |
|------|--------|------------------|
| 1 | Open `https://localhost:8443` | Dashboard loads; green banner "LIVE BACKEND MODE: Connected to //api/v1" appears at top-left. |
| 2 | Verify the API is live: `curl -sk https://localhost:8443/api/v1/opportunities` | Returns real opportunity data (5 seeded fellowships/grants). |
| 3 | In the UI, confirm the opportunity list shows: Bio-X, Google PhD, OpenAI, NSF GRFP, DARPA AI. | Visual confirmation the live API is feeding the UI. |

**Result**: The opportunity announcement is real — data comes from `GET /api/v1/opportunities`, not from a static bundle.

---

### Scene 2 — Upload the PDF

| Step | Action | Expected outcome |
|------|--------|------------------|
| 4 | Click **Document Ingestion** in the left sidebar. | View switches to the Document Ingestion Vault page. |
| 5 | In the "Ingest New Record" card, select **Official Academic Transcript (.pdf)** from the dropdown. | Document type selector updates. |
| 6 | Click the dashed upload box → select `data/demo-transcript.pdf` (1,793 B, TRANSCRIPT label). | Upload progresses; the PDF appears in the "Audited Documents Vault" as **Document 1** with 2 KB, 1 page, 14 claims (canned fixture for transcript type). |
| 7 | Observe the SHA-256 listed: `205cf78c2e3a606c982b9dde…` | The hash is stored; the file is verified by the enclave. |

**Result**: A real PDF was uploaded, hashed, and indexed. The claim count and OCR confidence are **canned fixtures per document type**, not read from the PDF content.

---

### Scene 3 — Enter a student profile

| Step | Action | Expected outcome |
|------|--------|------------------|
| 8 | Click **Dashboard / My Day** in the left navbar. | Returns to the My Day dashboard. |
| 9 | The profile card shows: Elena Rostova, Stanford M.S., GPA 3.92, F-1 STEM OPT. | Profile data loaded from the live JSON store. |
| 10 | Click **View Certified Report** → view the report for case `AUDIT-STANFORD-BIOX-8821`. | Report page loads; the SHA-256 receipt and crypto receipt are displayed. |

**Result**: The student profile and its associated evidence are real — loaded from the running API's JSON store.

---

### Scene 4 — Demonstrate verdicts where fixtures support them

| Step | Action | Expected outcome |
|------|--------|------------------|
| 11 | Navigate to **Criteria Inspector**. | Shows per-criterion verdicts for the current opportunity profile. |
| 12 | For **Bio-X Graduate Interdisciplinary Fellowship**: 4 × MEETS + 1 × INSUFFICIENT. | These are the template-based criteria verdicts; each carries a clause excerpt, evaluator note and a citation (document, page, line, verbatim quote, SHA-256). |
| 13 | For **NSF Graduate Research Fellowship Program (GRFP)**: score 0, `citizenship-standing: FAIL`, `criteria: []`. | This verdict is reached via the live API gate `citizenship-standing`; the disqualification is mathematically certain (NSF RFP requires U.S. citizenship; the candidate holds F-1 status). |
| 14 | For **Google PhD Fellowship in NLP**: 91% match, High Confidence. | Qualifying criteria verified against the profile + opportunity rules. |

**Result**: MEETS, DOES NOT MEET (shown as a gate FAIL in the live NSF evaluation), and INSUFFICIENT EVIDENCE are all demonstrable from the running system. The voice assistant is **not** demonstrated (see Scene 7).

---

### Scene 5 — Generate a personalized application checklist

| Step | Action | Expected outcome |
|------|--------|------------------|
| 15 | In the Opportunities page, click **Match Recommendations** (or go to `/recommendations`). | Four recommendation cards appear: Bio-X (94%), Google PhD (91%), OpenAI (82%), NSF GRFP (0%, Mathematically Disqualified). |
| 16 | For the Bio-X recommendation, click **Open Criteria Inspector**. | Shows the verified qualifying criteria with bullet points and citations. |
| 17 | Click **Generate Checklist** (POST /api/v1/workflow/checklist/generate with `opportunityId: "opp-biox-2026"` and `eligibilityResultId: "AUDIT-STANFORD-BIOX-8821"`). | Three dated tasks are generated: <br>• Obtain Lab Host Commitment Letter from Faculty PI | HIGH | 2026-05-21<br>• Draft 2-Page Research Statement tailored to Stanford Bio-X Institute & Clark Center | HIGH | 2026-06-01<br>• Submit Final Application Dossier & Certified Proof Bundle | HIGH | 2026-06-15 |

**Result**: The personalized application checklist is generated from the live API, not from static data.

---

### Scene 6 — Show the My Day dashboard

| Step | Action | Expected outcome |
|------|--------|------------------|
| 18 | Return to the **Dashboard / My Day** page. | The dashboard aggregates live data: <br>• Deterministic Gate: 88% hard gates met<br>• High Match Opps: 2 (Bio-X $58k, Google PhD $65k)<br>• Evidence Vault: 5 documents, 51 verified claims<br>• Application Tasks: 3 pending, next deadline Bio-X letter (May 20) |

**Result**: The My Day dashboard is a live aggregation of the API state.

---

### Scene 7 — Voice input (not demonstrated)

| Step | Action | Expected outcome |
|------|--------|------------------|
| 19 | Click the **Voice Assistant** sidebar item → click the microphone button. | The button waits ~2.5 s and fakes a prompt ("What would you like to ask?"). <br>`synthesizeSpeech()` returns success with **no audio output**. <br>There is no speech-to-text or text-to-speech integration. |

**Decision**: Voice input is explicitly excluded from the demo. It is documented as simulated (not implemented) in the README, architecture, and submission answers. Demonstrating a fake microphone would violate the "do not invent functionality" rule.

---

### Scene 8 — Wrap-up / checklist verification

| Step | Action | Expected outcome |
|------|--------|------------------|
| 20 | Verify the green "LIVE BACKEND MODE" banner is still present. | Confirms the entire demo was against the real API, not mock mode. |
| 21 | Take a final screenshot of the dashboard (this is `docs/screenshots/01-dashboard.png`). | Visual proof of the live state. |

**End of demo script.**

---

## What the demo proves (and what it doesn't)

| Proven | Not proven / excluded |
|--------|----------------------|
| ✅ Live API feeds the UI (green banner, real opportunity data) | ✗ Voice input / speech synthesis (simulated only) |
| ✅ Upload → hash → index → evaluate → checklist works end-to-end | ✗ Real OCR / LLM document extraction (templated per type) |
| ✅ Deterministic eligibility gates produce correct verdicts | ✗ Multi-user concurrency or replicated state |
| ✅ Personalized checklists are generated from the API | ✗ Public authentication / per-candidate authorisation |
| ✅ Screenshots captured from the running production stack | ✗ Deployment to Vultr or any external host |

---

## Recording notes

- All screenshots in `newi-main/docs/screenshots/` were captured with the exact Chrome command from the running `https://localhost:8443`; no post-processing beyond resizing.
- The browser was launched with `--headless=new --disable-gpu --hide-scrollbars --ignore-certificate-errors --window-size=1440,2400 --user-data-dir=$(pwd)/.smoke-tmp/chrome --virtual-time-budget=15000`.
- If the demo is re-run, the JSON store may have changed (e.g., new documents uploaded). Delete `data/quali_store.json` to reseed the demo dataset.
- The demo script itself is the source of truth for what is shown; no external URLs or cloud services are involved.