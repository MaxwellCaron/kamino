#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQLC_VERSION="v1.30.0"

run_api() (
  cd "$repo_root/apps/api"
  echo "==> API: ${1:-all}"
  case "${1:-all}" in
    gofmt)
      unformatted=$(gofmt -l .)
      test -z "$unformatted"
      ;;
    build) go build ./cmd/api ;;
    test) go test -race ./... ;;
    sqlc)
      go install "github.com/sqlc-dev/sqlc/cmd/sqlc@${SQLC_VERSION}"
      sqlc generate
      git diff --exit-code -- database/
      ;;
    vuln) go run golang.org/x/vuln/cmd/govulncheck@latest ./... ;;
    all)
      for check in gofmt build test sqlc vuln; do
        run_api "$check"
      done
      ;;
    *) echo "Unknown API check: $1" >&2; exit 2 ;;
  esac
)

run_web() (
  cd "$repo_root"
  echo "==> Web: ${1:-all}"
  case "${1:-all}" in
    typecheck) bun run typecheck ;;
    lint) bun run lint ;;
    test) bun --filter web --filter @workspace/ui test ;;
    doctor) bun run doctor:web ;;
    all)
      for check in typecheck lint test doctor; do
        run_web "$check"
      done
      ;;
    *) echo "Unknown web check: $1" >&2; exit 2 ;;
  esac
)

case "${1:-all}" in
  api) run_api "${2:-all}" ;;
  web) run_web "${2:-all}" ;;
  all)
    run_api & api_pid=$!
    run_web & web_pid=$!
    api_status=0
    web_status=0
    wait "$api_pid" || api_status=$?
    wait "$web_pid" || web_status=$?

    if [[ "$api_status" -ne 0 || "$web_status" -ne 0 ]]; then
      echo "CI failed (api: ${api_status}, web: ${web_status})" >&2
      exit 1
    fi
    echo "CI passed"
    ;;
  *) echo "Usage: $0 [all | api [gofmt|build|test|sqlc|vuln] | web [typecheck|lint|test|doctor]]" >&2; exit 2 ;;
esac
