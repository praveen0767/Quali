#!/usr/bin/env bash
# End-to-end verification against a running stack.
#
#   ./deploy/scripts/smoke.sh                     # https://$DOMAIN
#   BASE_URL=https://1.2.3.4 CURL_OPTS=-k ./deploy/scripts/smoke.sh
#   BASE_URL=http://localhost:8080 ./deploy/scripts/smoke.sh
#
# Exits non-zero if any check fails.
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

BASE_URL="${BASE_URL:-https://${DOMAIN:-localhost}}"
CURL_OPTS="${CURL_OPTS:-}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"
# Keep scratch files relative to the project: Git Bash does not translate POSIX
# paths embedded in curl's -F file=@... arguments, so /tmp paths would fail.
TMP=".smoke-tmp"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

FAILED=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1${2:+ -> $2}"; FAILED=1; }

code() { # url [extra curl args...]
  local url="$1"; shift
  local out
  out=$(curl -sS ${CURL_OPTS} -o "$TMP/body" -w '%{http_code}' "$@" "$url" 2>"$TMP/err") || true
  [ -n "$out" ] || out="000"
  printf '%s' "$out"
}

echo "==> Target: ${BASE_URL}"

# 1. Edge health endpoint (plain HTTP once TLS is active)
h=$(code "${BASE_URL}/healthz")
[ "$h" = "200" ] && pass "GET /healthz -> 200" || fail "GET /healthz" "$h $(cat "$TMP/err")"

# 2. API liveness and readiness through the proxy
h=$(code "${BASE_URL}/api/v1/health/live")
[ "$h" = "200" ] && pass "GET /api/v1/health/live -> 200" || fail "liveness" "$h $(head -c 200 "$TMP/body")"

h=$(code "${BASE_URL}/api/v1/ready")
if [ "$h" = "200" ] && grep -q '"ready":true' "$TMP/body"; then
  pass "GET /api/v1/ready -> ready"
else
  fail "readiness" "$h $(head -c 200 "$TMP/body")"
fi

# 3. Frontend bundle is served and the SPA shell is present
h=$(code "${BASE_URL}/")
if [ "$h" = "200" ] && grep -qi '<div id="root"' "$TMP/body"; then
  pass "GET / -> SPA shell"
else
  fail "SPA shell" "$h"
fi

# 4. Frontend -> backend data path
h=$(code "${BASE_URL}/api/v1/opportunities")
OPP_ID=$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$TMP/body" 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
if [ "$h" = "200" ] && [ -n "$OPP_ID" ]; then
  pass "GET /api/v1/opportunities -> 200 (${OPP_ID})"
else
  fail "opportunities" "$h"
fi

# 5. Upload a document through the multipart pipeline (must exceed the
# 1024-byte minimum enforced by the document pipeline)
{
  printf '%%PDF-1.4\n'
  printf '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  printf '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
  printf '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n'
  printf '4 0 obj\n<< /Length 1200 >>\nstream\n'
  head -c 1200 /dev/zero | tr '\0' ' '
  # Unique payload per run so SHA-256 duplicate detection does not reject it.
  printf '\n%% smoke-run: %s-%s\n' "$(date -u +%s)" "$$"
  printf '\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%%%EOF\n'
} > "$TMP/smoke.pdf"
h=$(code "${BASE_URL}/api/v1/workflow/documents/process" \
      -F "file=@${TMP}/smoke.pdf;type=application/pdf" \
      -F "document_type=TRANSCRIPT")
if [ "$h" = "202" ]; then
  pass "POST /api/v1/workflow/documents/process -> 202"
else
  fail "document upload" "$h $(head -c 300 "$TMP/body")"
fi

# 6. Eligibility evaluation
if [ -n "$OPP_ID" ]; then
  h=$(code "${BASE_URL}/api/v1/workflow/eligibility/evaluate" \
        -H 'Content-Type: application/json' \
        -d "{\"opportunityId\":\"${OPP_ID}\"}")
  if [ "$h" = "200" ] && grep -q '"report"' "$TMP/body"; then
    pass "POST /api/v1/workflow/eligibility/evaluate -> 200"
  else
    fail "eligibility evaluation" "$h $(head -c 300 "$TMP/body")"
  fi
fi

# 7. Oversized upload is rejected at the edge (nginx limit is 26 MiB)
head -c 30000000 /dev/zero > "$TMP/too-big.pdf"
h=$(code "${BASE_URL}/api/v1/workflow/documents/process" \
      -F "file=@${TMP}/too-big.pdf;type=application/pdf" \
      -F "document_type=TRANSCRIPT")
if [ "$h" = "413" ]; then
  pass "oversized upload rejected -> 413"
else
  fail "oversized upload" "expected 413, got $h"
fi

# 8. CORS: only the configured frontend origin is allowed
if [ -n "$ALLOWED_ORIGINS" ]; then
  FIRST_ORIGIN=$(printf '%s' "$ALLOWED_ORIGINS" | cut -d',' -f1 | tr -d ' ')
  ACAO=$(curl -sS ${CURL_OPTS} -o /dev/null -D - -X OPTIONS \
          -H "Origin: ${FIRST_ORIGIN}" \
          -H 'Access-Control-Request-Method: GET' \
          "${BASE_URL}/api/v1/opportunities" 2>/dev/null | tr -d '\r' | grep -i '^access-control-allow-origin:' || true)
  case "$ACAO" in
    *"${FIRST_ORIGIN}"*) pass "CORS allows ${FIRST_ORIGIN}" ;;
    *) fail "CORS allowed origin" "${ACAO:-no header}" ;;
  esac

  ACAO_EVIL=$(curl -sS ${CURL_OPTS} -o /dev/null -D - -X OPTIONS \
          -H "Origin: https://evil.example" \
          -H 'Access-Control-Request-Method: GET' \
          "${BASE_URL}/api/v1/opportunities" 2>/dev/null | tr -d '\r' | grep -i '^access-control-allow-origin:' || true)
  if [ -z "$ACAO_EVIL" ]; then
    pass "CORS rejects unlisted origin"
  else
    fail "CORS unlisted origin" "$ACAO_EVIL"
  fi
fi

echo
if [ "$FAILED" -ne 0 ]; then
  echo "SMOKE TEST FAILED"
  exit 1
fi
echo "SMOKE TEST PASSED"
