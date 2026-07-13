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
REDEEM_AMOUNT="${REDEEM_AMOUNT:-1}"
QUEUE_AMOUNT="${QUEUE_AMOUNT:-1800}"

printf '%s\n' '--- mark investor eligibility on chain ---'
curl -sS -X POST "$API_URL/kyc/mark-eligible" \
  -H 'content-type: application/json' \
  -d "{\"address\":\"$HOLDER_A\",\"vcHash\":\"$VC_HASH_A\"}"
printf '\n'
curl -sS -X POST "$API_URL/kyc/mark-eligible" \
  -H 'content-type: application/json' \
  -d "{\"address\":\"$HOLDER_B\",\"vcHash\":\"$VC_HASH_B\"}"
printf '\n'
curl -sS -X POST "$API_URL/kyc/mark-eligible" \
  -H 'content-type: application/json' \
  -d "{\"address\":\"$HOLDER_C\",\"vcHash\":\"$VC_HASH_C\"}"
printf '\n'
curl -sS -X POST "$API_URL/kyc/mark-eligible" \
  -H 'content-type: application/json' \
  -d "{\"address\":\"$HOLDER_D\",\"vcHash\":\"$VC_HASH_D\"}"
printf '\n'

printf '%s\n' '--- seed share registry from ShareBalanceUpdated events ---'
curl -sS -X POST "$API_URL/token/subscribe" \
  -H 'content-type: application/json' \
  -d "{\"to\":\"$HOLDER_A\",\"amount\":\"4000\"}"
printf '\n'
curl -sS -X POST "$API_URL/token/subscribe" \
  -H 'content-type: application/json' \
  -d "{\"to\":\"$HOLDER_B\",\"amount\":\"3000\"}"
printf '\n'
curl -sS -X POST "$API_URL/token/subscribe" \
  -H 'content-type: application/json' \
  -d "{\"to\":\"$HOLDER_C\",\"amount\":\"2000\"}"
printf '\n'
curl -sS -X POST "$API_URL/token/subscribe" \
  -H 'content-type: application/json' \
  -d "{\"to\":\"$HOLDER_D\",\"amount\":\"1000\"}"
printf '\n'

printf '%s\n' '--- request redemption into queue ---'
curl -sS -X POST "$API_URL/token/redeem" \
  -H 'content-type: application/json' \
  -d "{\"from\":\"$HOLDER_A\",\"amount\":\"$QUEUE_AMOUNT\"}"
printf '\n'
curl -sS "$API_URL/token/redemption-queue"
printf '\n'

printf '%s\n' '--- post NAV for chain-derived stale pricing timestamp ---'
NAV_AS_OF="$(date +%s)"
curl -sS -X POST "$API_URL/nav/post" \
  -H 'content-type: application/json' \
  -d "{\"nav\":\"1000000\",\"asOf\":$NAV_AS_OF}"
printf '\n'

NOW_SEC="$(date +%s)"
RISK_RESPONSE="$(
  curl -sS -X POST "$API_URL/risk/submit" \
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
curl -sS "$API_URL/risk/regulator"

printf '\n--- public real-time view ---\n'
curl -sS "$API_URL/risk/public"

printf '\n--- trigger gate ---\n'
GATE_NOW_SEC="$(date +%s)"
GATE_LAST_VALUATION_SEC="$((GATE_NOW_SEC - 5184000))"
curl -sS -X POST "$API_URL/risk/submit" \
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
    -H 'content-type: application/json' \
    -d "{\"from\":\"$INVESTOR_ADDRESS\",\"amount\":\"$REDEEM_AMOUNT\"}" || true
)"
printf '%s\n' "$REDEEM_RESPONSE"

if [[ "$REDEEM_RESPONSE" != *"REDEMPTION_GATED"* ]]; then
  printf 'Expected redemption to revert with REDEMPTION_GATED.\n' >&2
  exit 1
fi

printf '\n--- public policy-delayed view ---\n'
curl -sS "$API_URL/risk/public"
printf '\n'
