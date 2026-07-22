#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3001}"
INVESTOR_ADDRESS="${INVESTOR_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"
HOLDER_A="${HOLDER_A:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"
HOLDER_B="${HOLDER_B:-0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC}"
HOLDER_C="${HOLDER_C:-0x90F79bf6EB2c4f870365E785982E1f101E93b906}"
HOLDER_D="${HOLDER_D:-0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65}"
VC_HASH_A="${VC_HASH_A:-0x00000000000000000000000000000000000000000000000000000000000000a1}"
VC_HASH_B="${VC_HASH_B:-0x00000000000000000000000000000000000000000000000000000000000000b2}"
VC_HASH_C="${VC_HASH_C:-0x00000000000000000000000000000000000000000000000000000000000000c3}"
VC_HASH_D="${VC_HASH_D:-0x00000000000000000000000000000000000000000000000000000000000000d4}"
API_KEY_MANAGER="${API_KEY_MANAGER:-dev-manager-api-key-change-me}"
API_KEY_REGISTRAR="${API_KEY_REGISTRAR:-dev-registrar-api-key-change-me}"
API_KEY_NAV_ORACLE="${API_KEY_NAV_ORACLE:-dev-nav-oracle-api-key-change-me}"
API_KEY_RISK_ORACLE="${API_KEY_RISK_ORACLE:-dev-risk-oracle-api-key-change-me}"
API_KEY_REGULATOR="${API_KEY_REGULATOR:-dev-regulator-api-key-change-me}"
REDEEM_AMOUNT="${REDEEM_AMOUNT:-1}"
QUEUE_AMOUNT="${QUEUE_AMOUNT:-1800}"

printf '%s\n' '--- privileged views reject missing and wrong-role credentials ---'
UNAUTHENTICATED_REGULATOR="$(curl -sS -w '|%{http_code}' "$API_URL/risk/regulator")"
if [[ "$UNAUTHENTICATED_REGULATOR" != *'"error":"AUTHENTICATION_REQUIRED"'* || "$UNAUTHENTICATED_REGULATOR" != *'|401' ]]; then
  printf 'Expected regulator endpoint without an API key to return 401.\n' >&2
  exit 1
fi

FORBIDDEN_REGULATOR="$(curl -sS -w '|%{http_code}' "$API_URL/risk/regulator" -H "x-api-key: $API_KEY_MANAGER")"
if [[ "$FORBIDDEN_REGULATOR" != *'"error":"FORBIDDEN"'* || "$FORBIDDEN_REGULATOR" != *'|403' ]]; then
  printf 'Expected manager credentials on the regulator endpoint to return 403.\n' >&2
  exit 1
fi

UNAUTHENTICATED_QUEUE="$(curl -sS -w '|%{http_code}' "$API_URL/token/redemption-queue")"
if [[ "$UNAUTHENTICATED_QUEUE" != *'"error":"AUTHENTICATION_REQUIRED"'* || "$UNAUTHENTICATED_QUEUE" != *'|401' ]]; then
  printf 'Expected direct redemption queue access without an API key to return 401.\n' >&2
  exit 1
fi

printf '%s\n' '--- mark investor eligibility on chain ---'
curl -sS -X POST "$API_URL/kyc/mark-eligible" \
  -H "x-api-key: $API_KEY_REGISTRAR" \
  -H 'content-type: application/json' \
  -d "{\"address\":\"$HOLDER_A\",\"vcHash\":\"$VC_HASH_A\"}"
printf '\n'
curl -sS -X POST "$API_URL/kyc/mark-eligible" \
  -H "x-api-key: $API_KEY_REGISTRAR" \
  -H 'content-type: application/json' \
  -d "{\"address\":\"$HOLDER_B\",\"vcHash\":\"$VC_HASH_B\"}"
printf '\n'
curl -sS -X POST "$API_URL/kyc/mark-eligible" \
  -H "x-api-key: $API_KEY_REGISTRAR" \
  -H 'content-type: application/json' \
  -d "{\"address\":\"$HOLDER_C\",\"vcHash\":\"$VC_HASH_C\"}"
printf '\n'
curl -sS -X POST "$API_URL/kyc/mark-eligible" \
  -H "x-api-key: $API_KEY_REGISTRAR" \
  -H 'content-type: application/json' \
  -d "{\"address\":\"$HOLDER_D\",\"vcHash\":\"$VC_HASH_D\"}"
printf '\n'

printf '%s\n' '--- seed share registry from ShareBalanceUpdated events ---'
curl -sS -X POST "$API_URL/token/subscribe" \
  -H "x-api-key: $API_KEY_MANAGER" \
  -H 'content-type: application/json' \
  -d "{\"to\":\"$HOLDER_A\",\"amount\":\"4000\"}"
printf '\n'
curl -sS -X POST "$API_URL/token/subscribe" \
  -H "x-api-key: $API_KEY_MANAGER" \
  -H 'content-type: application/json' \
  -d "{\"to\":\"$HOLDER_B\",\"amount\":\"3000\"}"
printf '\n'
curl -sS -X POST "$API_URL/token/subscribe" \
  -H "x-api-key: $API_KEY_MANAGER" \
  -H 'content-type: application/json' \
  -d "{\"to\":\"$HOLDER_C\",\"amount\":\"2000\"}"
printf '\n'
curl -sS -X POST "$API_URL/token/subscribe" \
  -H "x-api-key: $API_KEY_MANAGER" \
  -H 'content-type: application/json' \
  -d "{\"to\":\"$HOLDER_D\",\"amount\":\"1000\"}"
printf '\n'

printf '%s\n' '--- request redemption into queue ---'
curl -sS -X POST "$API_URL/token/redeem" \
  -H "x-api-key: $API_KEY_MANAGER" \
  -H 'content-type: application/json' \
  -d "{\"from\":\"$HOLDER_A\",\"amount\":\"$QUEUE_AMOUNT\"}"
printf '\n'
curl -sS "$API_URL/token/redemption-queue" -H "x-api-key: $API_KEY_MANAGER"
printf '\n'

printf '%s\n' '--- post NAV for chain-derived stale pricing timestamp ---'
NAV_AS_OF="$(date +%s)"
curl -sS -X POST "$API_URL/nav/post" \
  -H "x-api-key: $API_KEY_NAV_ORACLE" \
  -H 'content-type: application/json' \
  -d "{\"nav\":\"1000000\",\"asOf\":$NAV_AS_OF}"
printf '\n'

NOW_SEC="$(date +%s)"
RISK_RESPONSE="$(
  curl -sS -X POST "$API_URL/risk/submit" \
    -H "x-api-key: $API_KEY_RISK_ORACLE" \
    -H 'content-type: application/json' \
    -d "{
    \"occurredAt\": $NOW_SEC,
    \"valuationHaircutBps\": 1200,
    \"liquidityBufferRatioBps\": 6500
  }"
)"
printf '%s\n' "$RISK_RESPONSE"

if [[ "$RISK_RESPONSE" != *'"holderSource":"chain"'* ]]; then
  printf 'Expected risk submission to derive holder concentration from chain events.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"investorConcentrationBps":3000'* ]]; then
  printf 'Expected InvestorConcentration HHI to be 3000 bps from seeded holders.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"redemptionQueueRatioBps":1800'* ]]; then
  printf 'Expected RedemptionQueueRatio to be 1800 bps from queued redemption state.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"redemptionQueueSource":"chain"'* ]]; then
  printf 'Expected risk submission to derive redemption queue ratio from chain state.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"redemptionPressureBps":1800'* ]]; then
  printf 'Expected RedemptionPressure to be 1800 bps from redemption request events.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"redemptionPressureSource":"chain"'* ]]; then
  printf 'Expected risk submission to derive redemption pressure from chain events.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"stalePricingSource":"chain"'* ]]; then
  printf 'Expected risk submission to derive stale pricing timestamp from NAVRegistry.\n' >&2
  exit 1
fi

printf '\n--- regulator view ---\n'
curl -sS "$API_URL/risk/regulator" -H "x-api-key: $API_KEY_REGULATOR"

printf '\n--- regulator R0 low-frequency view before reporting boundary ---\n'
REGULATOR_R0="$(curl -sS "$API_URL/risk/regulator?regime=R0" -H "x-api-key: $API_KEY_REGULATOR")"
printf '%s\n' "$REGULATOR_R0"

if [[ "$REGULATOR_R0" != *'"regime":"R0"'* || "$REGULATOR_R0" != *'"riskLevel":"unknown"'* || "$REGULATOR_R0" != *'"notYetDisclosed":true'* || "$REGULATOR_R0" == *'"snapshot"'* ]]; then
  printf 'Expected R0 regulator view to stay low-frequency and hide the newly submitted snapshot before the reporting boundary.\n' >&2
  exit 1
fi

printf '\n--- regulator R3 delayed view before disclosure time ---\n'
REGULATOR_R3="$(curl -sS "$API_URL/risk/regulator?regime=R3" -H "x-api-key: $API_KEY_REGULATOR")"
printf '%s\n' "$REGULATOR_R3"

if [[ "$REGULATOR_R3" != *'"regime":"R3"'* || "$REGULATOR_R3" != *'"riskLevel":"unknown"'* || "$REGULATOR_R3" != *'"notYetDisclosed":true'* || "$REGULATOR_R3" == *'"snapshot"'* ]]; then
  printf 'Expected R3 regulator view to follow the public disclosure delay and hide the newly submitted snapshot before disclosure time.\n' >&2
  exit 1
fi

printf '\n--- public R1 real-time detailed view ---\n'
PUBLIC_R1="$(curl -sS "$API_URL/risk/public?regime=R1")"
printf '%s\n' "$PUBLIC_R1"

if [[ "$PUBLIC_R1" != *'"regime":"R1"'* || "$PUBLIC_R1" != *'"riskScoreBps":1960'* || "$PUBLIC_R1" != *'"metrics"'* ]]; then
  printf 'Expected R1 to disclose detailed real-time risk data. Set ALLOW_REGIME_QUERY_OVERRIDE=true for local regime experiments.\n' >&2
  exit 1
fi

printf '\n--- public R2 aggregate investor view ---\n'
PUBLIC_R2="$(curl -sS "$API_URL/risk/public?regime=R2")"
printf '%s\n' "$PUBLIC_R2"

if [[ "$PUBLIC_R2" != *'"regime":"R2"'* || "$PUBLIC_R2" == *'"riskScoreBps"'* || "$PUBLIC_R2" == *'"metrics"'* || "$PUBLIC_R2" == *'"gated"'* ]]; then
  printf 'Expected R2 to hide exact metrics, exact score, and private control status from investors.\n' >&2
  exit 1
fi

printf '\n--- public R3 delayed view before disclosure time ---\n'
PUBLIC_R3="$(curl -sS "$API_URL/risk/public?regime=R3")"
printf '%s\n' "$PUBLIC_R3"

if [[ "$PUBLIC_R3" != *'"regime":"R3"'* || "$PUBLIC_R3" != *'"notYetDisclosed":true'* ]]; then
  printf 'Expected R3 to withhold newly submitted data until the disclosure delay elapses.\n' >&2
  exit 1
fi

printf '\n--- trigger gate ---\n'
GATE_NOW_SEC="$(date +%s)"
GATE_LAST_VALUATION_SEC="$((GATE_NOW_SEC - 5184000))"
curl -sS -X POST "$API_URL/risk/submit" \
  -H "x-api-key: $API_KEY_RISK_ORACLE" \
  -H 'content-type: application/json' \
  -d "{
    \"occurredAt\": $GATE_NOW_SEC,
    \"valuationHaircutBps\": 9000,
    \"redemptionPressureBps\": 9000,
    \"liquidityBufferRatioBps\": 0,
    \"lastValuationUpdateAt\": $GATE_LAST_VALUATION_SEC
  }"

printf '\n--- redemption must be gated ---\n'
REDEEM_RESPONSE="$(
  curl -sS -X POST "$API_URL/token/redeem" \
    -H "x-api-key: $API_KEY_MANAGER" \
    -H 'content-type: application/json' \
    -d "{\"from\":\"$INVESTOR_ADDRESS\",\"amount\":\"$REDEEM_AMOUNT\"}" || true
)"
printf '%s\n' "$REDEEM_RESPONSE"

if [[ "$REDEEM_RESPONSE" != *"REDEMPTION_GATED"* ]]; then
  printf 'Expected redemption to revert with REDEMPTION_GATED.\n' >&2
  exit 1
fi

printf '\n--- public policy-delayed view ---\n'
PUBLIC_DEFAULT="$(curl -sS "$API_URL/risk/public")"
printf '%s\n' "$PUBLIC_DEFAULT"

if [[ "$PUBLIC_DEFAULT" != *'"regime":"R4"'* || "$PUBLIC_DEFAULT" != *'"riskLevel":"red"'* || "$PUBLIC_DEFAULT" != *'"gated":true'* ]]; then
  printf 'Expected default R4 view to disclose tiered red status and active control after gate.\n' >&2
  exit 1
fi
printf '\n'
