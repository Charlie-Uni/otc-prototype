#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RESULTS_ROOT="${CHAPTER3_RESULTS_DIR:-$ROOT_DIR/test-results/chapter3}"
RESULTS_DIR="$RESULTS_ROOT/$RUN_ID"
ANVIL_PORT="${CHAPTER3_ANVIL_PORT:-18545}"
API_PORT="${CHAPTER3_API_PORT:-13001}"
RPC_URL="http://127.0.0.1:$ANVIL_PORT"
API_URL="http://127.0.0.1:$API_PORT"
DATABASE_URL="${CHAPTER3_DATABASE_URL:-}"

PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ORACLE_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
REGULATOR_PRIVATE_KEY="0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"
LIQUIDITY_ORACLE_PRIVATE_KEY="0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"
FUND_ID_LABEL="OTC_FUND_1"
KAPPA_BPS="7000"
MAX_STALE_AGE_SEC="2592000"
RISK_WEIGHT_1_BPS="1667"
RISK_WEIGHT_2_BPS="1667"
RISK_WEIGHT_3_BPS="1667"
RISK_WEIGHT_4_BPS="1667"
RISK_WEIGHT_5_BPS="1666"
RISK_WEIGHT_6_BPS="1666"
API_KEY_INVESTOR="chapter3-investor-api-key"
API_KEY_MANAGER="chapter3-manager-api-key"
API_KEY_REGISTRAR="chapter3-registrar-api-key"
API_KEY_NAV_ORACLE="chapter3-nav-oracle-api-key"
API_KEY_LIQUIDITY_ORACLE="chapter3-liquidity-oracle-api-key"
API_KEY_RISK_ORACLE="chapter3-risk-oracle-api-key"
API_KEY_REGULATOR="chapter3-regulator-api-key"
API_KEY_AUDITOR="chapter3-auditor-api-key"

CONTRACT_STATUS="pending"
CONTRACT_COVERAGE_STATUS="pending"
TYPECHECK_STATUS="pending"
API_TEST_STATUS="pending"
SMOKE_STATUS="pending"
POSTGRES_STATUS="not_run"
CURRENT_STEP="initialization"
ANVIL_PID=""
API_PID=""

mkdir -p "$RESULTS_DIR"

json_status() {
  local value="$1"
  printf '"%s"' "$value"
}

write_summary() {
  local exit_code="$1"
  local overall_status="passed"
  local failed_at="null"
  if [[ "$exit_code" -ne 0 ]]; then
    overall_status="failed"
    failed_at="\"$CURRENT_STEP\""
  fi

  cat > "$RESULTS_DIR/summary.json" <<JSON
{
  "runId": "$RUN_ID",
  "status": "$overall_status",
  "failedAt": $failed_at,
  "environment": {
    "rpcUrl": "$RPC_URL",
    "apiUrl": "$API_URL",
    "postgresqlEnabled": $([[ -n "$DATABASE_URL" ]] && printf 'true' || printf 'false')
  },
  "checks": {
    "contractTests": $(json_status "$CONTRACT_STATUS"),
    "contractCoverage": $(json_status "$CONTRACT_COVERAGE_STATUS"),
    "typecheck": $(json_status "$TYPECHECK_STATUS"),
    "apiTests": $(json_status "$API_TEST_STATUS"),
    "endToEndSmoke": $(json_status "$SMOKE_STATUS"),
    "postgresRestartPersistence": $(json_status "$POSTGRES_STATUS")
  },
  "evidence": {
    "contractTests": "contracts.log",
    "contractCoverage": "coverage.log",
    "typecheck": "typecheck.log",
    "apiTests": "api-tests.tap",
    "deployment": "deploy.log",
    "endToEndSmoke": "smoke.log",
    "apiServer": "api.log",
    "anvil": "anvil.log",
    "postgresRestartServer": "api-restart.log",
    "postgresRestartRead": "postgres-persistence.json"
  }
}
JSON
}

stop_process() {
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  local exit_code="$?"
  stop_process "$API_PID"
  stop_process "$ANVIL_PID"
  write_summary "$exit_code"
  printf 'Chapter 3 test evidence: %s\n' "$RESULTS_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for_rpc() {
  for _ in $(seq 1 60); do
    if curl -fsS -X POST "$RPC_URL" \
      -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

wait_for_api() {
  for _ in $(seq 1 80); do
    if curl -fsS "$API_URL/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

start_api() {
  local log_file="$1"
  (
    cd "$ROOT_DIR/apps/api"
    exec env \
      RPC_URL="$RPC_URL" \
      PRIVATE_KEY="$PRIVATE_KEY" \
      ORACLE_PRIVATE_KEY="$ORACLE_PRIVATE_KEY" \
      REGULATOR_PRIVATE_KEY="$REGULATOR_PRIVATE_KEY" \
      LIQUIDITY_ORACLE_PRIVATE_KEY="$LIQUIDITY_ORACLE_PRIVATE_KEY" \
      FUND_TOKEN_ADDRESS="$FUND_TOKEN_ADDRESS" \
      NAV_REGISTRY_ADDRESS="$NAV_REGISTRY_ADDRESS" \
      RISK_REGISTRY_ADDRESS="$RISK_REGISTRY_ADDRESS" \
      FUND_ID_LABEL="$FUND_ID_LABEL" \
      DEFAULT_TRANSPARENCY_REGIME="R4" \
      ALLOW_REGIME_QUERY_OVERRIDE="true" \
      API_KEY_INVESTOR="$API_KEY_INVESTOR" \
      API_KEY_MANAGER="$API_KEY_MANAGER" \
      API_KEY_REGISTRAR="$API_KEY_REGISTRAR" \
      API_KEY_NAV_ORACLE="$API_KEY_NAV_ORACLE" \
      API_KEY_LIQUIDITY_ORACLE="$API_KEY_LIQUIDITY_ORACLE" \
      API_KEY_RISK_ORACLE="$API_KEY_RISK_ORACLE" \
      API_KEY_REGULATOR="$API_KEY_REGULATOR" \
      API_KEY_AUDITOR="$API_KEY_AUDITOR" \
      REDEMPTION_PRESSURE_WINDOW_SEC="86400" \
      PORT="$API_PORT" \
      DATABASE_URL="$DATABASE_URL" \
      node --import tsx src/index.ts
  ) > "$log_file" 2>&1 &
  API_PID="$!"
  wait_for_api
}

CURRENT_STEP="contract_tests"
(
  cd "$ROOT_DIR/contracts"
  forge test
) > "$RESULTS_DIR/contracts.log" 2>&1
CONTRACT_STATUS="passed"

CURRENT_STEP="contract_coverage"
(
  cd "$ROOT_DIR/contracts"
  forge coverage --report summary --skip script
) > "$RESULTS_DIR/coverage.log" 2>&1
CONTRACT_COVERAGE_STATUS="passed"

CURRENT_STEP="typescript_typecheck"
(
  cd "$ROOT_DIR/apps/api"
  ./node_modules/.bin/tsc --noEmit --pretty false
) > "$RESULTS_DIR/typecheck.log" 2>&1
TYPECHECK_STATUS="passed"

CURRENT_STEP="api_unit_tests"
(
  cd "$ROOT_DIR/apps/api"
  node --import tsx --test src/risk/*.test.ts src/auth/*.test.ts src/audit/*.test.ts src/simulation/*.test.ts
) > "$RESULTS_DIR/api-tests.tap" 2>&1
API_TEST_STATUS="passed"

CURRENT_STEP="anvil_start"
anvil --silent -p "$ANVIL_PORT" > "$RESULTS_DIR/anvil.log" 2>&1 &
ANVIL_PID="$!"
wait_for_rpc

CURRENT_STEP="contract_deployment"
(
  cd "$ROOT_DIR/contracts"
  env \
    PRIVATE_KEY="$PRIVATE_KEY" \
    ORACLE_PRIVATE_KEY="$ORACLE_PRIVATE_KEY" \
    REGULATOR_PRIVATE_KEY="$REGULATOR_PRIVATE_KEY" \
    LIQUIDITY_ORACLE_PRIVATE_KEY="$LIQUIDITY_ORACLE_PRIVATE_KEY" \
    FUND_ID_LABEL="$FUND_ID_LABEL" \
    KAPPA_BPS="$KAPPA_BPS" \
    MAX_STALE_AGE_SEC="$MAX_STALE_AGE_SEC" \
    RISK_WEIGHT_1_BPS="$RISK_WEIGHT_1_BPS" \
    RISK_WEIGHT_2_BPS="$RISK_WEIGHT_2_BPS" \
    RISK_WEIGHT_3_BPS="$RISK_WEIGHT_3_BPS" \
    RISK_WEIGHT_4_BPS="$RISK_WEIGHT_4_BPS" \
    RISK_WEIGHT_5_BPS="$RISK_WEIGHT_5_BPS" \
    RISK_WEIGHT_6_BPS="$RISK_WEIGHT_6_BPS" \
    forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast
) > "$RESULTS_DIR/deploy.log" 2>&1

FUND_TOKEN_ADDRESS="$(sed -n 's/.*FundToken: \(0x[0-9A-Fa-f]*\).*/\1/p' "$RESULTS_DIR/deploy.log" | tail -n 1)"
NAV_REGISTRY_ADDRESS="$(sed -n 's/.*NAVRegistry: \(0x[0-9A-Fa-f]*\).*/\1/p' "$RESULTS_DIR/deploy.log" | tail -n 1)"
RISK_REGISTRY_ADDRESS="$(sed -n 's/.*RiskRegistry: \(0x[0-9A-Fa-f]*\).*/\1/p' "$RESULTS_DIR/deploy.log" | tail -n 1)"
if [[ -z "$FUND_TOKEN_ADDRESS" || -z "$NAV_REGISTRY_ADDRESS" || -z "$RISK_REGISTRY_ADDRESS" ]]; then
  printf 'Unable to parse deployed contract addresses.\n' >&2
  exit 1
fi

CURRENT_STEP="api_start"
start_api "$RESULTS_DIR/api.log"

CURRENT_STEP="end_to_end_smoke"
env \
  API_URL="$API_URL" \
  API_KEY_MANAGER="$API_KEY_MANAGER" \
  API_KEY_REGISTRAR="$API_KEY_REGISTRAR" \
  API_KEY_NAV_ORACLE="$API_KEY_NAV_ORACLE" \
  API_KEY_LIQUIDITY_ORACLE="$API_KEY_LIQUIDITY_ORACLE" \
  API_KEY_RISK_ORACLE="$API_KEY_RISK_ORACLE" \
  API_KEY_REGULATOR="$API_KEY_REGULATOR" \
  API_KEY_AUDITOR="$API_KEY_AUDITOR" \
  bash "$ROOT_DIR/scripts/smoke-risk-api.sh" > "$RESULTS_DIR/smoke.log" 2>&1
SMOKE_STATUS="passed"

if [[ -n "$DATABASE_URL" ]]; then
  CURRENT_STEP="postgres_restart_persistence"
  stop_process "$API_PID"
  API_PID=""
  start_api "$RESULTS_DIR/api-restart.log"
  curl -fsS "$API_URL/audit/events?eventName=GateTriggered" \
    -H "x-api-key: $API_KEY_AUDITOR" > "$RESULTS_DIR/postgres-persistence.json"
  if ! grep -q '"eventName":"GateTriggered"' "$RESULTS_DIR/postgres-persistence.json"; then
    printf 'GateTriggered was not available after the API restart.\n' >&2
    exit 1
  fi
  POSTGRES_STATUS="passed"
fi

CURRENT_STEP="complete"
printf 'Chapter 3 test suite passed.\n'
