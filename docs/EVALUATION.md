# Evaluation — Labelled-dataset harness results

## Methodology

`npm run eval` runs the labelled-dataset harness (`src/server/eval-harness/index.ts`) **in-process** against the orchestrator. For each of the 12 labelled cases it:

1. Resets the demo store (`db.resetToDemo()`).
2. Creates a workflow with the case's `userRequest` and `opportunityId`.
3. Executes the full pipeline: `PLANNER → RETRIEVER → EVALUATOR → ACTION_COORDINATOR`.
4. Compares each ground-truth criterion against the returned criterion result. The rubric store uses the verification vocabulary (`MEETS` / `FAILED` / `INSUFFICIENT`) while the labels use the decision vocabulary (`MEETS` / `DOES_NOT_MEET` / `INSUFFICIENT_EVIDENCE`); the harness normalizes these before comparison.
5. Compares each expected citation against the retrieved evidence reference for the same document **and page**, then checks the verbatim quote.
6. Compares the recommendation tier, the overall eligibility status, and records latency.
7. Writes a JSON metrics file and a console report to `src/lib/api/eval/dataset/v1/metrics/`.

## Measured output (2026-11-15, dataset v1.0.0)

```
Criterion Precision: 1.000 (17/17 correct)
Criterion Recall:    1.000
Criterion F1:        1.000

False MEETS rate:         0.000 (0 false positives)
False DOES_NOT_MEET rate: 0.000 (0 false negatives)
INSUFFICIENT_EVIDENCE rate: 0.118 (2 abstentions)

SOURCE VERIFICATION:
  Quotation validity:  1.000 (10/10)
  Page correctness:    1.000

RECOMMENDATION RELEVANCE: 1.000 (12/12)

PERFORMANCE:
  Average latency: 7ms
  P95 latency:     12ms
  Max latency:     12ms
  Failure rate:    0.000 (0 failures)
  Completion rate: 1.000 (12/12 cases)

COVERAGE:
  Criteria coverage (definitive answers): 0.882 (15/17)
  Test case coverage (completed):         1.000
```

All 12 labelled test cases completed, all 17 ground-truth criteria matched, all 10 expected citations were found with the correct document, page and quote, and all 12 recommendation tiers matched.

### The two abstentions

`INSUFFICIENT_EVIDENCE` was returned for two criteria — the Bio-X faculty-sponsorship criterion (`crit-05`) in TC-005 and TC-011. This is the labelled expectation, not a miss: the demo rubric records that criterion as `INSUFFICIENT` because the recommendation letter has no explicit hosting pledge. Both cases therefore pass (expected `INSUFFICIENT_EVIDENCE`) and the overall Bio-X verdict is `ACTION_REQUIRED`, which the labels also expect.

## What these numbers do and do not prove

- ✅ They show the full path works end to end for this labelled set: document → evidence reference → criterion verdict → overall status → recommendation, with page-level citations preserved in the workflow state.
- ✅ They show the citation path is wired: each expected citation resolves to a verbatim quote on the expected page of the expected document.
- ❌ They are **not** a claim of general accuracy. The dataset is 12 cases, one candidate profile, two opportunities, and a deterministic rules engine whose evidence is pre-extracted in the demo fixtures.
- ❌ The baseline LLM comparison is simulated; no LLM API calls are made.
- ❌ Coverage is 88.2%, not 100%: the system abstains on the two sponsorship criteria by design. Accuracy must be read together with coverage.

## Comparison to the previous run

An earlier run of the same harness failed every citation check (`12/12` cases, `No citation found`) because `executeFullWorkflow` skipped the RETRIEVER step and the harness matched citations by document only. Both defects are fixed:

- `executeFullWorkflow` now skips only steps recorded as successfully completed.
- RETRIEVER seeds evidence from each criterion's extracted citation and deduplicates references.
- The harness matches on document **and** page before falling back to the document's first citation.
- Visa evidence is pinned to the I-20 document instead of whichever transcript was uploaded most recently.

No historical failure numbers should be quoted as current results.

## Reproduction

```bash
cd newi-main
npm run eval            # console + JSON report
npm run eval:json       # JSON only
npm run eval:baseline   # adds the simulated baseline comparison
```

The JSON report is written to `src/lib/api/eval/dataset/v1/metrics/`.

## Limitations of the labelled set

- Single candidate profile (Elena Rostova).
- Two opportunities with detailed criteria (Bio-X, NSF GRFP); the other three demo opportunities are not covered.
- No multi-turn conversations, OCR errors, partial uploads, or adversarial inputs beyond basic prompt injection.
- LLM baseline is simulated.
