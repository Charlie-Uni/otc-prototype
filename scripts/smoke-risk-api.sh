#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3001}"
RPC_URL="${RPC_URL:-http://localhost:8545}"
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
API_KEY_INVESTOR="${API_KEY_INVESTOR:-dev-investor-api-key-change-me}"
API_KEY_REGISTRAR="${API_KEY_REGISTRAR:-dev-registrar-api-key-change-me}"
API_KEY_NAV_ORACLE="${API_KEY_NAV_ORACLE:-dev-nav-oracle-api-key-change-me}"
API_KEY_LIQUIDITY_ORACLE="${API_KEY_LIQUIDITY_ORACLE:-dev-liquidity-oracle-api-key-change-me}"
API_KEY_RISK_ORACLE="${API_KEY_RISK_ORACLE:-dev-risk-oracle-api-key-change-me}"
API_KEY_REGULATOR="${API_KEY_REGULATOR:-dev-regulator-api-key-change-me}"
API_KEY_AUDITOR="${API_KEY_AUDITOR:-dev-auditor-api-key-change-me}"
FUND_ID="${FUND_ID:-0xac4a93645b61f4f102884f40e6a589263b542e97cda3dd28d1de825f80f90169}"
REDEEM_AMOUNT="${REDEEM_AMOUNT:-1}"
QUEUE_AMOUNT="${QUEUE_AMOUNT:-1800}"
GATE_RELEASE_REASON_HASH="${GATE_RELEASE_REASON_HASH:-0x0000000000000000000000000000000000000000000000000000000000000a11}"
SETTLEMENT_DELAY_REASON_HASH="${SETTLEMENT_DELAY_REASON_HASH:-0x0000000000000000000000000000000000000000000000000000000000000d11}"
ZERO_HASH="0x0000000000000000000000000000000000000000000000000000000000000000"
SWING_RULE_ID="${SWING_RULE_ID:-0x0000000000000000000000000000000000000000000000000000000000000051}"
SIDE_POCKET_RULE_ID="${SIDE_POCKET_RULE_ID:-0x0000000000000000000000000000000000000000000000000000000000000052}"
SIDE_POCKET_ASSET_COMMITMENT="${SIDE_POCKET_ASSET_COMMITMENT:-0x0000000000000000000000000000000000000000000000000000000000000a55}"
GAS_REPORT_PATH="${GAS_REPORT_PATH:-}"

if [[ -n "$GAS_REPORT_PATH" ]]; then
  mkdir -p "$(dirname "$GAS_REPORT_PATH")"
  printf 'operation,context,transactionHash,gasUsed,blockNumber\n' > "$GAS_REPORT_PATH"
fi

record_transaction_gas() {
  local operation="$1"
  local context="$2"
  local response="$3"
  local transaction_hash gas_used block_number

  if [[ -z "$GAS_REPORT_PATH" ]]; then
    return
  fi
  transaction_hash="$(printf '%s' "$response" | sed -n 's/.*"tx":"\(0x[0-9A-Fa-f]\{64\}\)".*/\1/p')"
  if [[ -z "$transaction_hash" ]]; then
    printf 'Unable to extract transaction hash for gas evidence: %s (%s).\n' "$operation" "$context" >&2
    exit 1
  fi
  gas_used="$(cast receipt "$transaction_hash" gasUsed --rpc-url "$RPC_URL")"
  block_number="$(cast receipt "$transaction_hash" blockNumber --rpc-url "$RPC_URL")"
  gas_used="$(cast to-dec "$gas_used")"
  block_number="$(cast to-dec "$block_number")"
  if [[ ! "$gas_used" =~ ^[1-9][0-9]*$ || ! "$block_number" =~ ^[0-9]+$ ]]; then
    printf 'Invalid receipt gas evidence for %s (%s).\n' "$operation" "$context" >&2
    exit 1
  fi
  printf '%s,%s,%s,%s,%s\n' \
    "$operation" "$context" "$transaction_hash" "$gas_used" "$block_number" >> "$GAS_REPORT_PATH"
}

request_and_accept_subscription() {
  local investor="$1"
  local amount="$2"
  local expected_minted_shares="${3:-$amount}"
  local expected_nav="${4:-1000000000000000000}"
  local context="${5:-seed_holders}"
  local request_response request_id accept_response read_response

  request_response="$(
    curl -sS -X POST "$API_URL/token/request-subscription" \
      -H "x-api-key: $API_KEY_MANAGER" \
      -H 'content-type: application/json' \
      -d "{\"to\":\"$investor\",\"subscriptionAmount\":\"$amount\"}"
  )"
  printf '%s\n' "$request_response"
  request_id="$(printf '%s' "$request_response" | sed -n 's/.*"requestId":"\([0-9][0-9]*\)".*/\1/p')"
  if [[ -z "$request_id" || "$request_response" != *'"status":"pending"'* ]]; then
    printf 'Expected subscription request to enter pending state.\n' >&2
    exit 1
  fi
  record_transaction_gas "subscription_request" "$context" "$request_response"

  accept_response="$(
    curl -sS -X POST "$API_URL/token/accept-subscription" \
      -H "x-api-key: $API_KEY_MANAGER" \
      -H 'content-type: application/json' \
      -d "{\"requestId\":\"$request_id\"}"
  )"
  printf '%s\n' "$accept_response"
  if [[ "$accept_response" != *"\"requestId\":\"$request_id\""* || "$accept_response" != *'"status":"accepted"'* || "$accept_response" != *"\"mintedShares\":\"$expected_minted_shares\""* || "$accept_response" != *"\"navUsed\":\"$expected_nav\""* ]]; then
    printf 'Expected pending subscription to be accepted before shares are registered.\n' >&2
    exit 1
  fi
  record_transaction_gas "subscription_accept" "$context" "$accept_response"

  read_response="$(
    curl -sS "$API_URL/token/subscription-request/$request_id" \
      -H "x-api-key: $API_KEY_REGULATOR"
  )"
  if [[ "$read_response" != *"\"investor\":\"$investor\""* || "$read_response" != *'"status":"accepted"'* ]]; then
    printf 'Expected regulator read access to the accepted subscription state.\n' >&2
    exit 1
  fi
}

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

UNAUTHENTICATED_AUDIT="$(curl -sS -w '|%{http_code}' -X POST "$API_URL/audit/sync")"
if [[ "$UNAUTHENTICATED_AUDIT" != *'"error":"AUTHENTICATION_REQUIRED"'* || "$UNAUTHENTICATED_AUDIT" != *'|401' ]]; then
  printf 'Expected lifecycle audit sync without an API key to return 401.\n' >&2
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

ELIGIBILITY_RESPONSE="$(curl -sS "$API_URL/kyc/$HOLDER_A" -H "x-api-key: $API_KEY_REGULATOR")"
if [[ "$ELIGIBILITY_RESPONSE" != *'"eligible":true'* || "$ELIGIBILITY_RESPONSE" != *'"source":"chain'* ]]; then
  printf 'Expected eligibility reads to use the on-chain whitelist as the source of truth.\n' >&2
  exit 1
fi

printf '%s\n' '--- initialize the offering NAV before subscriptions ---'
INITIAL_NAV_AS_OF="$(date +%s)"
INITIAL_NAV_RESPONSE="$(curl -sS -X POST "$API_URL/nav/initial" \
  -H "x-api-key: $API_KEY_NAV_ORACLE" \
  -H 'content-type: application/json' \
  -d "{\"initialNav\":\"1000000000000000000\",\"asOf\":$INITIAL_NAV_AS_OF}")"
printf '%s\n' "$INITIAL_NAV_RESPONSE"
if [[ "$INITIAL_NAV_RESPONSE" != *'"nav":"1000000000000000000"'* || "$INITIAL_NAV_RESPONSE" != *'"isInitial":true'* || "$INITIAL_NAV_RESPONSE" != *'"payloadHash":'* ]]; then
  printf 'Expected a committed initial offering NAV before cash-to-share conversion.\n' >&2
  exit 1
fi
record_transaction_gas "nav_initial" "offering_price" "$INITIAL_NAV_RESPONSE"

printf '%s\n' '--- request, accept, and register subscriptions ---'
request_and_accept_subscription "$HOLDER_A" 4000
request_and_accept_subscription "$HOLDER_B" 3000
request_and_accept_subscription "$HOLDER_C" 2000
request_and_accept_subscription "$HOLDER_D" 1000

printf '%s\n' '--- investor balance reads are identity-bound ---'
OWN_BALANCE="$(curl -sS -w '|%{http_code}' "$API_URL/token/balance/$HOLDER_A" -H "x-api-key: $API_KEY_INVESTOR")"
if [[ "$OWN_BALANCE" != *'"balance":"4000"'* || "$OWN_BALANCE" != *'|200' ]]; then
  printf 'Expected investor credentials to read the bound holder balance.\n' >&2
  exit 1
fi
OTHER_BALANCE="$(curl -sS -w '|%{http_code}' "$API_URL/token/balance/$HOLDER_B" -H "x-api-key: $API_KEY_INVESTOR")"
if [[ "$OTHER_BALANCE" != *'"error":"HOLDER_ADDRESS_FORBIDDEN"'* || "$OTHER_BALANCE" != *'|403' ]]; then
  printf 'Expected investor credentials to be forbidden from reading another holder balance.\n' >&2
  exit 1
fi

printf '%s\n' '--- request redemption into queue ---'
QUEUE_RESPONSE="$(curl -sS -X POST "$API_URL/token/redeem" \
  -H "x-api-key: $API_KEY_MANAGER" \
  -H 'content-type: application/json' \
  -d "{\"from\":\"$HOLDER_A\",\"redeemedShares\":\"$QUEUE_AMOUNT\"}")"
printf '%s' "$QUEUE_RESPONSE"
record_transaction_gas "redemption_request" "baseline_queue" "$QUEUE_RESPONSE"
printf '\n'
curl -sS "$API_URL/token/redemption-queue" -H "x-api-key: $API_KEY_MANAGER"
printf '\n'

printf '%s\n' '--- compute NAV from net assets and the fixed total-supply snapshot ---'
NAV_AS_OF="$(date +%s)"
ADJUSTED_NAV_RESPONSE="$(curl -sS -X POST "$API_URL/nav/post" \
  -H "x-api-key: $API_KEY_NAV_ORACLE" \
  -H 'content-type: application/json' \
  -d "{\"netAssetValue\":\"11000\",\"asOf\":$NAV_AS_OF}")"
printf '%s\n' "$ADJUSTED_NAV_RESPONSE"
if [[ "$ADJUSTED_NAV_RESPONSE" != *'"nav":"1100000000000000000"'* || "$ADJUSTED_NAV_RESPONSE" != *'"netAssetValue":"11000"'* || "$ADJUSTED_NAV_RESPONSE" != *'"totalSharesSnapshot":"10000"'* || "$ADJUSTED_NAV_RESPONSE" != *'"navAdjustmentBps":"1000"'* || "$ADJUSTED_NAV_RESPONSE" != *'"isInitial":false'* || "$ADJUSTED_NAV_RESPONSE" != *'"payloadHash":'* ]]; then
  printf 'Expected NAV = NetAssetValue / TotalShares and a positive 1000 bps adjustment on chain.\n' >&2
  exit 1
fi
record_transaction_gas "nav_update" "formula_pricing" "$ADJUSTED_NAV_RESPONSE"

NOW_SEC="$(date +%s)"
VALUATION_HAIRCUT_RESPONSE="$(curl -sS -X POST "$API_URL/nav/valuation-haircut" \
  -H "x-api-key: $API_KEY_NAV_ORACLE" \
  -H 'content-type: application/json' \
  -d "{\"valuationHaircutBps\":1200,\"occurredAt\":$NOW_SEC}")"
printf '%s\n' "$VALUATION_HAIRCUT_RESPONSE"
if [[ "$VALUATION_HAIRCUT_RESPONSE" != *'"valuationHaircutBps":1200'* || "$VALUATION_HAIRCUT_RESPONSE" != *'"payloadHash":'* ]]; then
  printf 'Expected valuation Oracle to record haircut state and commitment before risk scoring.\n' >&2
  exit 1
fi
record_transaction_gas "valuation_haircut_update" "baseline" "$VALUATION_HAIRCUT_RESPONSE"

printf '%s\n' '--- liquidity oracle records the scoring input on chain ---'
FORBIDDEN_LIQUIDITY_UPDATE="$(
  curl -sS -w '|%{http_code}' -X POST "$API_URL/liquidity/update" \
    -H "x-api-key: $API_KEY_MANAGER" \
    -H 'content-type: application/json' \
    -d "{\"liquidityBufferRatioBps\":6500,\"occurredAt\":$NOW_SEC}"
)"
if [[ "$FORBIDDEN_LIQUIDITY_UPDATE" != *'"error":"FORBIDDEN"'* || "$FORBIDDEN_LIQUIDITY_UPDATE" != *'|403' ]]; then
  printf 'Expected non-liquidity role to be forbidden from updating the buffer.\n' >&2
  exit 1
fi

LIQUIDITY_RESPONSE="$(curl -sS -X POST "$API_URL/liquidity/update" \
  -H "x-api-key: $API_KEY_LIQUIDITY_ORACLE" \
  -H 'content-type: application/json' \
  -d "{\"liquidityBufferRatioBps\":6500,\"occurredAt\":$NOW_SEC}")"
printf '%s\n' "$LIQUIDITY_RESPONSE"
if [[ "$LIQUIDITY_RESPONSE" != *'"liquidityBufferRatioBps":6500'* || "$LIQUIDITY_RESPONSE" != *'"payloadHash":'* ]]; then
  printf 'Expected liquidity Oracle update with a state commitment.\n' >&2
  exit 1
fi
record_transaction_gas "liquidity_buffer_update" "baseline" "$LIQUIDITY_RESPONSE"

STALE_RISK_INPUT="$(curl -sS -w '|%{http_code}' -X POST "$API_URL/risk/submit" \
  -H "x-api-key: $API_KEY_RISK_ORACLE" \
  -H 'content-type: application/json' \
  -d '{"occurredAt":1}')"
if [[ "$STALE_RISK_INPUT" != *'"error":"RISK_INPUT_TOO_OLD"'* || "$STALE_RISK_INPUT" != *'|400' ]]; then
  printf 'Expected the real-time risk endpoint to reject an observation outside its age window.\n' >&2
  exit 1
fi

FUTURE_RISK_AT="$((NOW_SEC + 600))"
FUTURE_RISK_INPUT="$(curl -sS -w '|%{http_code}' -X POST "$API_URL/risk/submit" \
  -H "x-api-key: $API_KEY_RISK_ORACLE" \
  -H 'content-type: application/json' \
  -d "{\"occurredAt\":$FUTURE_RISK_AT}")"
if [[ "$FUTURE_RISK_INPUT" != *'"error":"RISK_OCCURRED_AT_AFTER_SNAPSHOT"'* || "$FUTURE_RISK_INPUT" != *'|400' ]]; then
  printf 'Expected the risk endpoint to reject an observation after its fixed snapshot block.\n' >&2
  exit 1
fi

RISK_RESPONSE="$(
  curl -sS -X POST "$API_URL/risk/submit" \
    -H "x-api-key: $API_KEY_RISK_ORACLE" \
    -H 'content-type: application/json' \
    -d "{
    \"occurredAt\": $NOW_SEC
  }"
)"
printf '%s\n' "$RISK_RESPONSE"

if [[ "$RISK_RESPONSE" != *'"holderSource":"chain"'* ]]; then
  printf 'Expected risk submission to derive holder concentration from chain events.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"valuationHaircutSource":"chain"'* || "$RISK_RESPONSE" != *'"valuationHaircutBps":1200'* ]]; then
  printf 'Expected risk submission to derive valuation haircut from the authorized chain update.\n' >&2
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

if [[ "$RISK_RESPONSE" != *'"liquidityBufferSource":"chain"'* || "$RISK_RESPONSE" != *'"liquidityBufferRatioBps":6500'* ]]; then
  printf 'Expected risk submission to derive liquidity buffer state from the authorized chain update.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"payloadSchemaVersion":3'* || "$RISK_RESPONSE" != *'"chainId":31337'* || "$RISK_RESPONSE" != *'"riskRegistryAddress":'* || "$RISK_RESPONSE" != *'"snapshotBlockNumber":'* || "$RISK_RESPONSE" != *'"snapshotBlockTimestamp":'* ]]; then
  printf 'Expected risk submission to disclose its fixed chain snapshot context.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"valuationHaircutFreshness":{"ageSec":'* || "$RISK_RESPONSE" != *'"status":"trusted_latest_unbounded"'* || "$RISK_RESPONSE" != *'"liquidityBufferFreshness":{"ageSec":'* ]]; then
  printf 'Expected source ages and the explicit trusted-latest freshness boundary.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"redemptionRequestPressureBps":1800'* || "$RISK_RESPONSE" != *'"redemptionRequestedAmount":"1800"'* || "$RISK_RESPONSE" != *'"redemptionSettledAmount":"0"'* ]]; then
  printf 'Expected request pressure and realized settlement flow to be exported separately.\n' >&2
  exit 1
fi

if [[ "$RISK_RESPONSE" != *'"staleReferenceUsed":"storedAt"'* || "$RISK_RESPONSE" != *'"staleAgeFromAsOfSec":'* || "$RISK_RESPONSE" != *'"staleAgeFromStoredAtSec":'* ]]; then
  printf 'Expected both raw stale-age definitions and the scoring reference to be exported.\n' >&2
  exit 1
fi
record_transaction_gas "risk_submit" "baseline_non_gated" "$RISK_RESPONSE"

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

if [[ "$PUBLIC_R1" != *'"regime":"R1"'* || "$PUBLIC_R1" != *'"riskScoreBps":1883'* || "$PUBLIC_R1" != *'"metrics"'* ]]; then
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
printf '%s\n' '--- increase concentration, redemption pressure, and queue state through lifecycle actions ---'
request_and_accept_subscription "$HOLDER_A" 99000 90000 1100000000000000000 "concentration_shift"
HIGH_QUEUE_RESPONSE="$(curl -sS -X POST "$API_URL/token/redeem" \
  -H "x-api-key: $API_KEY_MANAGER" \
  -H 'content-type: application/json' \
  -d "{\"from\":\"$HOLDER_A\",\"redeemedShares\":\"90000\"}")"
printf '%s' "$HIGH_QUEUE_RESPONSE"
record_transaction_gas "redemption_request" "gate_pressure_queue" "$HIGH_QUEUE_RESPONSE"
printf '\n'

GATE_NOW_SEC="$(date +%s)"
GATE_HAIRCUT_RESPONSE="$(curl -sS -X POST "$API_URL/nav/valuation-haircut" \
  -H "x-api-key: $API_KEY_NAV_ORACLE" \
  -H 'content-type: application/json' \
  -d "{\"valuationHaircutBps\":9000,\"occurredAt\":$GATE_NOW_SEC}")"
printf '%s' "$GATE_HAIRCUT_RESPONSE"
record_transaction_gas "valuation_haircut_update" "gate_scenario" "$GATE_HAIRCUT_RESPONSE"
printf '\n'
GATE_LIQUIDITY_RESPONSE="$(curl -sS -X POST "$API_URL/liquidity/update" \
  -H "x-api-key: $API_KEY_LIQUIDITY_ORACLE" \
  -H 'content-type: application/json' \
  -d "{\"liquidityBufferRatioBps\":0,\"occurredAt\":$GATE_NOW_SEC}")"
printf '%s' "$GATE_LIQUIDITY_RESPONSE"
record_transaction_gas "liquidity_buffer_update" "gate_scenario" "$GATE_LIQUIDITY_RESPONSE"
printf '\n'

FORBIDDEN_RISK_OVERRIDE="$(
  curl -sS -w '|%{http_code}' -X POST "$API_URL/risk/submit" \
    -H "x-api-key: $API_KEY_RISK_ORACLE" \
    -H 'content-type: application/json' \
    -d "{\"occurredAt\":$GATE_NOW_SEC,\"redemptionPressureBps\":9000}"
)"
if [[ "$FORBIDDEN_RISK_OVERRIDE" != *'"error":"INVALID_REQUEST"'* || "$FORBIDDEN_RISK_OVERRIDE" != *'|400' ]]; then
  printf 'Expected risk submission to reject request-level overrides of chain-derived metrics.\n' >&2
  exit 1
fi

HIGH_RISK_RESPONSE="$(curl -sS -X POST "$API_URL/risk/submit" \
  -H "x-api-key: $API_KEY_RISK_ORACLE" \
  -H 'content-type: application/json' \
  -d "{\"occurredAt\":$GATE_NOW_SEC}")"
printf '%s\n' "$HIGH_RISK_RESPONSE"
if [[ "$HIGH_RISK_RESPONSE" != *'"holderSource":"chain"'* || "$HIGH_RISK_RESPONSE" != *'"redemptionPressureSource":"chain"'* || "$HIGH_RISK_RESPONSE" != *'"redemptionQueueSource":"chain"'* || "$HIGH_RISK_RESPONSE" != *'"stalePricingSource":"chain"'* ]]; then
  printf 'Expected every lifecycle-derived metric to remain bound to chain state during the gate scenario.\n' >&2
  exit 1
fi
if [[ "$HIGH_RISK_RESPONSE" != *'"riskScoreBps":7702'* ]]; then
  printf 'Expected equal-weight chain-derived high-risk score to be 7702 bps.\n' >&2
  exit 1
fi
record_transaction_gas "risk_submit_gate_trigger" "high_risk_control" "$HIGH_RISK_RESPONSE"

printf '\n--- record extended control evidence without simulating full fund accounting ---\n'
INVALID_SWING_RULE="$(
  curl -sS -w '|%{http_code}' -X POST "$API_URL/controls/swing-pricing" \
    -H "x-api-key: $API_KEY_MANAGER" \
    -H 'content-type: application/json' \
    -d "{\"adjustmentBps\":350,\"ruleId\":\"$ZERO_HASH\",\"occurredAt\":$GATE_NOW_SEC}"
)"
if [[ "$INVALID_SWING_RULE" != *'"error":"INVALID_REQUEST"'* || "$INVALID_SWING_RULE" != *'|400' ]]; then
  printf 'Expected the API to reject a zero control rule commitment before contract submission.\n' >&2
  exit 1
fi

SWING_RESPONSE="$(curl -sS -X POST "$API_URL/controls/swing-pricing" \
  -H "x-api-key: $API_KEY_MANAGER" \
  -H 'content-type: application/json' \
  -d "{\"adjustmentBps\":350,\"ruleId\":\"$SWING_RULE_ID\",\"occurredAt\":$GATE_NOW_SEC}")"
printf '%s\n' "$SWING_RESPONSE"
if [[ "$SWING_RESPONSE" != *'"adjustmentBps":350'* || "$SWING_RESPONSE" != *'"payloadHash":'* ]]; then
  printf 'Expected swing pricing state, trigger rule, and commitment evidence.\n' >&2
  exit 1
fi
record_transaction_gas "swing_pricing_apply" "extended_control" "$SWING_RESPONSE"

SIDE_POCKET_RESPONSE="$(curl -sS -X POST "$API_URL/controls/side-pocket" \
  -H "x-api-key: $API_KEY_MANAGER" \
  -H 'content-type: application/json' \
  -d "{\"assetCommitmentHash\":\"$SIDE_POCKET_ASSET_COMMITMENT\",\"ruleId\":\"$SIDE_POCKET_RULE_ID\",\"occurredAt\":$GATE_NOW_SEC}")"
printf '%s\n' "$SIDE_POCKET_RESPONSE"
if [[ "$SIDE_POCKET_RESPONSE" != *"\"assetCommitmentHash\":\"$SIDE_POCKET_ASSET_COMMITMENT\""* || "$SIDE_POCKET_RESPONSE" != *'"payloadHash":'* ]]; then
  printf 'Expected side-pocket state, trigger rule, and asset commitment evidence.\n' >&2
  exit 1
fi
record_transaction_gas "side_pocket_create" "extended_control" "$SIDE_POCKET_RESPONSE"

CONTROL_STATE="$(curl -sS "$API_URL/controls/state" -H "x-api-key: $API_KEY_REGULATOR")"
if [[ "$CONTROL_STATE" != *'"swingPricingActive":true'* || "$CONTROL_STATE" != *'"sidePocketActive":true'* || "$CONTROL_STATE" != *'"swingPricingAdjustmentBps":350'* ]]; then
  printf 'Expected regulator to observe active extended control state.\n' >&2
  exit 1
fi

printf '\n--- redemption must be gated ---\n'
REDEEM_RESPONSE="$(
  curl -sS -w '|%{http_code}' -X POST "$API_URL/token/redeem" \
    -H "x-api-key: $API_KEY_MANAGER" \
    -H 'content-type: application/json' \
    -d "{\"from\":\"$INVESTOR_ADDRESS\",\"redeemedShares\":\"$REDEEM_AMOUNT\"}" || true
)"
printf '%s\n' "$REDEEM_RESPONSE"

if [[ "$REDEEM_RESPONSE" != *'"error":"REDEMPTION_GATED"'* || "$REDEEM_RESPONSE" != *'|409' ]]; then
  printf 'Expected gated redemption to return REDEMPTION_GATED with HTTP 409.\n' >&2
  exit 1
fi

printf '\n--- public policy-delayed view ---\n'
PUBLIC_DEFAULT="$(curl -sS "$API_URL/risk/public")"
printf '%s\n' "$PUBLIC_DEFAULT"

if [[ "$PUBLIC_DEFAULT" != *'"regime":"R4"'* || "$PUBLIC_DEFAULT" != *'"riskLevel":"red"'* || "$PUBLIC_DEFAULT" != *'"gated":true'* ]]; then
  printf 'Expected default R4 view to disclose tiered red status and active control after gate.\n' >&2
  exit 1
fi

printf '\n--- only regulator may release gate ---\n'
FORBIDDEN_GATE_RELEASE="$(
  curl -sS -w '|%{http_code}' -X POST "$API_URL/risk/release-gate" \
    -H "x-api-key: $API_KEY_MANAGER" \
    -H 'content-type: application/json' \
    -d "{\"reasonHash\":\"$GATE_RELEASE_REASON_HASH\"}"
)"
if [[ "$FORBIDDEN_GATE_RELEASE" != *'"error":"FORBIDDEN"'* || "$FORBIDDEN_GATE_RELEASE" != *'|403' ]]; then
  printf 'Expected manager credentials on gate release to return 403.\n' >&2
  exit 1
fi

INVALID_GATE_RELEASE="$(
  curl -sS -w '|%{http_code}' -X POST "$API_URL/risk/release-gate" \
    -H "x-api-key: $API_KEY_REGULATOR" \
    -H 'content-type: application/json' \
    -d '{"reasonHash":"not-a-bytes32-hash"}'
)"
if [[ "$INVALID_GATE_RELEASE" != *'"error":"INVALID_REASON_HASH"'* || "$INVALID_GATE_RELEASE" != *'|400' ]]; then
  printf 'Expected malformed gate release reason hash to return 400.\n' >&2
  exit 1
fi

GATE_RELEASE="$(
  curl -sS -X POST "$API_URL/risk/release-gate" \
    -H "x-api-key: $API_KEY_REGULATOR" \
    -H 'content-type: application/json' \
    -d "{\"reasonHash\":\"$GATE_RELEASE_REASON_HASH\"}"
)"
printf '%s\n' "$GATE_RELEASE"
if [[ "$GATE_RELEASE" != *'"gated":false'* || "$GATE_RELEASE" != *"\"reasonHash\":\"$GATE_RELEASE_REASON_HASH\""* ]]; then
  printf 'Expected regulator to release gate with an auditable reason hash.\n' >&2
  exit 1
fi
record_transaction_gas "gate_release" "regulator_reason" "$GATE_RELEASE"

REPEATED_GATE_RELEASE="$(
  curl -sS -w '|%{http_code}' -X POST "$API_URL/risk/release-gate" \
    -H "x-api-key: $API_KEY_REGULATOR" \
    -H 'content-type: application/json' \
    -d "{\"reasonHash\":\"$GATE_RELEASE_REASON_HASH\"}"
)"
if [[ "$REPEATED_GATE_RELEASE" != *'"error":"FUND_NOT_GATED"'* || "$REPEATED_GATE_RELEASE" != *'|409' ]]; then
  printf 'Expected repeated gate release to return 409.\n' >&2
  exit 1
fi

printf '\n--- redemption resumes after gate release ---\n'
POST_RELEASE_REDEMPTION="$(
  curl -sS -X POST "$API_URL/token/redeem" \
    -H "x-api-key: $API_KEY_MANAGER" \
    -H 'content-type: application/json' \
    -d "{\"from\":\"$INVESTOR_ADDRESS\",\"redeemedShares\":\"$REDEEM_AMOUNT\"}"
)"
printf '%s\n' "$POST_RELEASE_REDEMPTION"
POST_RELEASE_REQUEST_ID="$(printf '%s' "$POST_RELEASE_REDEMPTION" | sed -n 's/.*"requestId":"\([0-9][0-9]*\)".*/\1/p')"
if [[ -z "$POST_RELEASE_REQUEST_ID" || "$POST_RELEASE_REDEMPTION" != *'"status":"queued"'* ]]; then
  printf 'Expected redemption requests to resume after regulator gate release.\n' >&2
  exit 1
fi
record_transaction_gas "redemption_request" "post_gate_release" "$POST_RELEASE_REDEMPTION"

printf '\n--- flag and settle the queued redemption lifecycle ---\n'
INVALID_DELAY_REASON="$(
  curl -sS -w '|%{http_code}' -X POST "$API_URL/token/flag-settlement-delayed" \
    -H "x-api-key: $API_KEY_MANAGER" \
    -H 'content-type: application/json' \
    -d "{\"requestId\":\"$POST_RELEASE_REQUEST_ID\",\"reasonHash\":\"$ZERO_HASH\"}"
)"
if [[ "$INVALID_DELAY_REASON" != *'"error":"INVALID_REQUEST"'* || "$INVALID_DELAY_REASON" != *'|400' ]]; then
  printf 'Expected the API to reject a zero settlement-delay reason commitment.\n' >&2
  exit 1
fi

DELAY_RESPONSE="$(
  curl -sS -X POST "$API_URL/token/flag-settlement-delayed" \
    -H "x-api-key: $API_KEY_MANAGER" \
    -H 'content-type: application/json' \
    -d "{\"requestId\":\"$POST_RELEASE_REQUEST_ID\",\"reasonHash\":\"$SETTLEMENT_DELAY_REASON_HASH\"}"
)"
printf '%s\n' "$DELAY_RESPONSE"
if [[ "$DELAY_RESPONSE" != *"\"requestId\":\"$POST_RELEASE_REQUEST_ID\""* || "$DELAY_RESPONSE" != *'"status":"delayed"'* ]]; then
  printf 'Expected a pending redemption to record an auditable settlement delay.\n' >&2
  exit 1
fi
record_transaction_gas "settlement_delay_flag" "post_gate_release" "$DELAY_RESPONSE"

DELAYED_REQUEST="$(
  curl -sS "$API_URL/token/redemption-request/$POST_RELEASE_REQUEST_ID" \
    -H "x-api-key: $API_KEY_REGULATOR"
)"
if [[ "$DELAYED_REQUEST" != *'"delayed":true'* || "$DELAYED_REQUEST" != *"\"delayReasonHash\":\"$SETTLEMENT_DELAY_REASON_HASH\""* ]]; then
  printf 'Expected redemption state to retain the delay flag and reason commitment.\n' >&2
  exit 1
fi

SETTLEMENT_RESPONSE="$(
  curl -sS -X POST "$API_URL/token/settle-redemption" \
    -H "x-api-key: $API_KEY_MANAGER" \
    -H 'content-type: application/json' \
    -d "{\"requestId\":\"$POST_RELEASE_REQUEST_ID\"}"
)"
printf '%s\n' "$SETTLEMENT_RESPONSE"
if [[ "$SETTLEMENT_RESPONSE" != *"\"requestId\":\"$POST_RELEASE_REQUEST_ID\""* || "$SETTLEMENT_RESPONSE" != *'"status":"settled"'* || "$SETTLEMENT_RESPONSE" != *'"redeemedShares":"1"'* || "$SETTLEMENT_RESPONSE" != *'"redemptionAmount":"1"'* || "$SETTLEMENT_RESPONSE" != *'"settlementNav":"1100000000000000000"'* ]]; then
  printf 'Expected the delayed redemption to remain eligible for final settlement after gate release.\n' >&2
  exit 1
fi
record_transaction_gas "redemption_settlement" "post_gate_release" "$SETTLEMENT_RESPONSE"

SETTLED_REQUEST="$(
  curl -sS "$API_URL/token/redemption-request/$POST_RELEASE_REQUEST_ID" \
    -H "x-api-key: $API_KEY_REGULATOR"
)"
if [[ "$SETTLED_REQUEST" != *'"settled":true'* || "$SETTLED_REQUEST" != *'"delayed":true'* || "$SETTLED_REQUEST" != *'"redemptionAmount":"1"'* || "$SETTLED_REQUEST" != *'"settlementNavAsOf":'* ]]; then
  printf 'Expected final redemption state to preserve both settlement and prior delay evidence.\n' >&2
  exit 1
fi

printf '\n--- synchronize lifecycle audit events ---\n'
AUDIT_SYNC="$(curl -sS -X POST "$API_URL/audit/sync" -H "x-api-key: $API_KEY_AUDITOR")"
printf '%s\n' "$AUDIT_SYNC"

if [[ "$AUDIT_SYNC" != *'"scanned":'* || "$AUDIT_SYNC" != *'"skipped":'* || "$AUDIT_SYNC" != *'"inserted":'* ]]; then
  printf 'Expected audit sync to scan and index lifecycle events.\n' >&2
  exit 1
fi

printf '\n--- repeated audit sync must be idempotent ---\n'
AUDIT_RESYNC="$(curl -sS -X POST "$API_URL/audit/sync" -H "x-api-key: $API_KEY_AUDITOR")"
printf '%s\n' "$AUDIT_RESYNC"

if [[ "$AUDIT_RESYNC" != *'"inserted":0'* ]]; then
  printf 'Expected repeated lifecycle event sync to insert zero duplicate records.\n' >&2
  exit 1
fi

INVALID_AUDIT_QUERY="$(curl -sS -w '|%{http_code}' "$API_URL/audit/events?regime=INVALID" -H "x-api-key: $API_KEY_AUDITOR")"
if [[ "$INVALID_AUDIT_QUERY" != *'INVALID_AUDIT_QUERY'* || "$INVALID_AUDIT_QUERY" != *'|400' ]]; then
  printf 'Expected invalid audit timeline query to return 400.\n' >&2
  exit 1
fi

printf '\n--- simulation-ready four-timestamp export ---\n'
AUDIT_SIMULATION="$(curl -sS "$API_URL/audit/simulation?regime=R4&audience=regulator" -H "x-api-key: $API_KEY_AUDITOR")"
printf '%s\n' "$AUDIT_SIMULATION"

if [[ "$AUDIT_SIMULATION" != *'"eventName":"SubscriptionRequested"'* || "$AUDIT_SIMULATION" != *'"eventName":"SubscriptionAccepted"'* || "$AUDIT_SIMULATION" != *'"eventName":"RedemptionRequested"'* || "$AUDIT_SIMULATION" != *'"eventName":"SettlementDelayed"'* || "$AUDIT_SIMULATION" != *'"eventName":"RedemptionSettled"'* || "$AUDIT_SIMULATION" != *'"eventName":"NAVUpdatedEvent"'* || "$AUDIT_SIMULATION" != *'"eventName":"LiquidityBufferUpdated"'* || "$AUDIT_SIMULATION" != *'"eventName":"ValuationHaircutEvent"'* || "$AUDIT_SIMULATION" != *'"eventName":"RiskWarningEvent"'* || "$AUDIT_SIMULATION" != *'"eventName":"SwingPricingApplied"'* || "$AUDIT_SIMULATION" != *'"eventName":"SidePocketCreated"'* || "$AUDIT_SIMULATION" != *'"eventName":"GateTriggered"'* || "$AUDIT_SIMULATION" != *'"disclosedAt":'* || "$AUDIT_SIMULATION" != *'"observedAt":'* || "$AUDIT_SIMULATION" != *'"detectionLagDefinition":"three_measure_model"'* ]]; then
  printf 'Expected simulation export to contain all implemented lifecycle signals, controls, and timestamps.\n' >&2
  exit 1
fi

printf '\n--- three-measure DetectionLag analysis from chain-offline shockAt ---\n'
DETECTION_ANALYSIS="$(curl -sS -X POST "$API_URL/audit/detection-lags" \
  -H "x-api-key: $API_KEY_AUDITOR" \
  -H 'content-type: application/json' \
  -d "{
    \"scenarioId\":\"smoke-valuation-shock\",
    \"fundId\":\"$FUND_ID\",
    \"shockAt\":$GATE_NOW_SEC,
    \"detectionThresholdBps\":6000,
    \"observationStartAt\":$GATE_NOW_SEC,
    \"pollingIntervalSec\":60
  }")"
printf '%s\n' "$DETECTION_ANALYSIS"
if ! node -e '
  const analysis = JSON.parse(process.argv[1]);
  const row = (regime, audience) => analysis.rows.find(
    (candidate) => candidate.regime === regime && candidate.audience === audience,
  );
  const r1 = row("R1", "public");
  const r3 = row("R3", "public");
  const r0 = row("R0", "public");
  const systemLag = analysis.systemDetectionLagSec;
  const pollingInterval = analysis.scenario.pollingIntervalSec;
  const valid =
    analysis.anchor.eventName === "RiskMetricsSubmitted" &&
    analysis.anchor.riskScoreBps === 7702 &&
    systemLag === analysis.anchor.submittedAt - analysis.scenario.shockAt &&
    r1.disclosureDetectionLagSec === systemLag &&
    r3.disclosureDetectionLagSec === systemLag + 86400 &&
    r3.observationDetectionLagSec >= r3.disclosureDetectionLagSec &&
    r3.observationDetectionLagSec < r3.disclosureDetectionLagSec + pollingInterval &&
    r0.disclosedAt % 604800 === 0 &&
    r0.disclosureDetectionLagSec >= systemLag &&
    r0.disclosureDetectionLagSec < systemLag + 604800 &&
    r0.observationDetectionLagSec >= r0.disclosureDetectionLagSec &&
    r0.observationDetectionLagSec < r0.disclosureDetectionLagSec + pollingInterval;
  process.exit(valid ? 0 : 1);
' "$DETECTION_ANALYSIS"; then
  printf 'Expected independent system, R0-R4 disclosure, and scheduled observation DetectionLag outputs.\n' >&2
  exit 1
fi

printf '\n--- 7/14/30/45-day, two-weight-scheme, and four-kappa sensitivity matrix ---\n'
SENSITIVITY_ANALYSIS="$(curl -sS -X POST "$API_URL/audit/sensitivity" \
  -H "x-api-key: $API_KEY_AUDITOR" \
  -H 'content-type: application/json' \
  -d '{
    "valuationHaircutBps":9000,
    "redemptionPressureBps":9000,
    "redemptionQueueRatioBps":1800,
    "liquidityShortfallBps":10000,
    "investorConcentrationBps":3000,
    "staleAgeDaysRaw":14,
    "detectionThresholdBps":6000,
    "kappaBpsValues":[5000,6000,7000,8000]
  }')"
printf '%s\n' "$SENSITIVITY_ANALYSIS"
if [[ "$SENSITIVITY_ANALYSIS" != *'"maxStaleAgeDays":[7,14,30,45]'* || "$SENSITIVITY_ANALYSIS" != *'"kappaBpsValues":[5000,6000,7000,8000]'* || "$SENSITIVITY_ANALYSIS" != *'"weightSchemeId":"equal_weight_baseline"'* || "$SENSITIVITY_ANALYSIS" != *'"weightSchemeId":"legacy_weighted_robustness"'* || "$SENSITIVITY_ANALYSIS" != *'"maxStaleAgeDays":45'* || "$SENSITIVITY_ANALYSIS" != *'"kappaBps":8000'* ]]; then
  printf 'Expected all 32 stale-age, weight, and kappa sensitivity configurations.\n' >&2
  exit 1
fi

DUPLICATE_KAPPA="$(curl -sS -w '|%{http_code}' -X POST "$API_URL/audit/sensitivity" \
  -H "x-api-key: $API_KEY_AUDITOR" \
  -H 'content-type: application/json' \
  -d '{
    "valuationHaircutBps":9000,
    "redemptionPressureBps":9000,
    "redemptionQueueRatioBps":1800,
    "liquidityShortfallBps":10000,
    "investorConcentrationBps":3000,
    "staleAgeDaysRaw":14,
    "kappaBpsValues":[7000,7000]
  }')"
if [[ "$DUPLICATE_KAPPA" != *'"error":"INVALID_REQUEST"'* || "$DUPLICATE_KAPPA" != *'|400' ]]; then
  printf 'Expected duplicate kappa sensitivity inputs to be rejected.\n' >&2
  exit 1
fi

printf '\n--- lifecycle CSV export ---\n'
AUDIT_CSV="$(curl -sS "$API_URL/audit/lifecycle.csv?regime=R4&audience=regulator" -H "x-api-key: $API_KEY_AUDITOR")"
if [[ "$AUDIT_CSV" != eventId,contractName,eventName,category,* || "$AUDIT_CSV" != *'GateTriggered'* ]]; then
  printf 'Expected lifecycle CSV to contain the timestamp schema and GateTriggered event.\n' >&2
  exit 1
fi


printf '\n--- API access audit export ---\n'
API_AUDIT_CSV="$(curl -sS "$API_URL/audit/export" -H "x-api-key: $API_KEY_AUDITOR")"
if [[ "$API_AUDIT_CSV" != actor,action,occurredAt,submittedAt,disclosedAt,observedAt,* || "$API_AUDIT_CSV" != *'eligibility.mark'* || "$API_AUDIT_CSV" != *'risk.public.observe'* ]]; then
  printf 'Expected API audit CSV to contain the four-timestamp schema and lifecycle access actions.\n' >&2
  exit 1
fi

LIMITED_AUDIT="$(curl -sS "$API_URL/risk/audit?limit=2" -H "x-api-key: $API_KEY_AUDITOR")"
if [[ "$LIMITED_AUDIT" != *'"count":2'* || "$LIMITED_AUDIT" != *'"limit":2'* ]]; then
  printf 'Expected the risk audit endpoint to enforce its bounded query limit.\n' >&2
  exit 1
fi

printf '\n--- stale-pricing warning at the configured 30-day normalization boundary ---\n'
cast rpc evm_increaseTime 2592001 --rpc-url "$RPC_URL" >/dev/null
cast rpc evm_mine --rpc-url "$RPC_URL" >/dev/null
STALE_NOW_SEC="$(cast block latest --field timestamp --rpc-url "$RPC_URL")"
STALE_WARNING_RESPONSE="$(curl -sS -X POST "$API_URL/risk/submit" \
  -H "x-api-key: $API_KEY_RISK_ORACLE" \
  -H 'content-type: application/json' \
  -d "{\"occurredAt\":$STALE_NOW_SEC}")"
printf '%s\n' "$STALE_WARNING_RESPONSE"
if [[ "$STALE_WARNING_RESPONSE" != *'"stalePricingRiskBps":10000'* || "$STALE_WARNING_RESPONSE" != *'"maxStaleAgeSec":2592000'* ]]; then
  printf 'Expected stale-pricing risk to reach 10000 bps at the configured 30-day boundary.\n' >&2
  exit 1
fi
record_transaction_gas "risk_submit" "stale_pricing_boundary" "$STALE_WARNING_RESPONSE"

curl -sS -X POST "$API_URL/audit/sync" -H "x-api-key: $API_KEY_AUDITOR" >/dev/null
STALE_WARNING_AUDIT="$(curl -sS "$API_URL/audit/events?eventName=StalePricingWarning" \
  -H "x-api-key: $API_KEY_AUDITOR")"
if ! node -e '
  const result = JSON.parse(process.argv[1]);
  const warning = result.events?.find((event) => event.eventName === "StalePricingWarning");
  process.exit(
    warning
      && Number(warning.payload.stalePricingRiskBps) === 10_000
      && warning.observedAt >= warning.submittedAt
      && warning.observationLagSec >= 0
      ? 0
      : 1,
  );
' "$STALE_WARNING_AUDIT"; then
  printf 'Expected the audit index to retain the StalePricingWarning event with a causal observation time.\n' >&2
  exit 1
fi
printf '\n'
