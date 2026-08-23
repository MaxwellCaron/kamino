#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SQLC_VERSION="v1.30.0"

run_api() {
  echo "==> API: gofmt"
  (
    cd apps/api
    test -z "$(gofmt -l .)"
  )

  echo "==> API: build"
  (cd apps/api && go build ./cmd/api)

  echo "==> API: test (race)"
  (cd apps/api && go test -race ./...)

  echo "==> API: sqlc drift check"
  (
    cd apps/api
    go install "github.com/sqlc-dev/sqlc/cmd/sqlc@${SQLC_VERSION}"
    sqlc generate
    git diff --exit-code -- database/
  )

  echo "==> API: govulncheck"
  (cd apps/api && go run golang.org/x/vuln/cmd/govulncheck@latest ./...)
}

run_web() {
  echo "==> Web: typecheck"
  bun run typecheck

  echo "==> Web: lint"
  bun run lint

  echo "==> Web: test"
  bun --filter web test

  echo "==> Web: react-doctor"
  bun run doctor:web
}

api_status=0
web_status=0

run_api & api_pid=$!
run_web & web_pid=$!

if ! wait "$api_pid"; then
  api_status=$?
fi

if ! wait "$web_pid"; then
  web_status=$?
fi

if [[ "$api_status" -ne 0 || "$web_status" -ne 0 ]]; then
  echo ""
  echo "CI failed (api: ${api_status}, web: ${web_status})"
  exit 1
fi

echo ""
echo "CI passed"
