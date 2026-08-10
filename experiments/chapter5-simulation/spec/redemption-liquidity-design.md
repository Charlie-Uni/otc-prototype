# Redemption and Liquidity Design

## Scope and source

This stage implements the Chapter 5 redemption-pressure, first-mover, liquidity-buffer, and forced-sale mechanisms. It consumes the binary investor decisions produced by T11. It does not trigger or release Gate controls and does not transmit sale effects to other funds; those are T13 and T14 responsibilities.

The thesis defines a binary individual redemption decision but does not specify what fraction of a holding is requested. The implementation therefore exposes `redemptionRequestFractionBps` as a pilot parameter. The pilot value is 10000 bps, meaning the investor requests all currently available shares. This value is a model-development input, not an empirical estimate or preregistered result.

## Pressure measures

Two measures are retained because they answer different questions:

- `redemptionDecisionPressureBps` is the thesis investor-level rate: redeeming eligible investors divided by eligible investors.
- `redemptionRequestPressureBps` is the Chapter 3 forward-looking share-flow rate: newly requested shares divided by pre-request total shares.

The first measure cannot exceed 10000 bps and rejects an impossible numerator. The request-flow measure is capped at 10000 bps because windowed or repeated request flow can exceed the reference supply.

## Queue and share locking

Each fund receives exactly one binary intent for every active holder in a decision tick. An admitted positive intent creates one deterministic request ID, and requested shares are locked by the invariant that a holder's pending shares cannot exceed the holder's current balance. Repeated queueing can only use the still-available balance. An active Gate applies the T13 whole-request control rule before admission; blocked decisions remain visible as latent demand in the queue summary but do not inflate the on-state redemption queue.

Requests are processed FIFO by `(requestedAt, requestId)`. Settlement is whole-request only. No partial settlement rule is introduced because neither the thesis nor the Chapter 3 artifact defines one.

## Liquidity buffer and first-mover advantage

Runtime liquidity buffer is:

```text
LiquidityBufferRatioBps = LiquidAssetValue / ExpectedRedemptionClaims
```

The mentor-confirmed first-mover operationalization is:

```text
FirstMoverAdvantageBps = max(0, 10000 - LiquidityBufferRatioBps)
```

The ratio may exceed 10000 bps; in that case first-mover advantage is zero.

## Settlement and forced sales

Settlement amount uses the reported NAV available at settlement time and integer floor rounding:

```text
SettlementAmount = floor(RequestedShares * SettlementNavPerShareBps / 10000)
```

Liquidity is consumed in this order:

1. liquid asset positions, sorted deterministically by asset identifier;
2. illiquid asset sales, also sorted by asset identifier.

Price impact follows the mentor-confirmed form:

```text
PriceImpactBps = floor(lambdaBps * (SaleAmount / MarketDepth)^gamma)
SaleProceeds = floor(SaleAmount * (10000 - PriceImpactBps) / 10000)
```

The pilot uses `gamma = 1`; nonlinear gamma is a robustness dimension. Configuration validation restricts the sale-to-depth region so proceeds remain monotone and the minimum gross sale can be found deterministically by binary search.

If a whole request cannot be covered, no asset position is mutated and the request remains `pending`. A successful settlement decreases reported AUM by the investor payment and economic AUM by the payment plus fire-sale discount loss. These two loss components remain separate in later reporting.

## Explicit boundaries

- A settlement amount that rounds to zero remains pending with `settlement_amount_rounds_to_zero`.
- A request that would redeem all remaining fund shares remains pending with `fund_closure_out_of_scope`. Fund liquidation and terminal NAV accounting are not defined in the thesis model and are not invented here.
- Gate state is honored as an input. Trigger, attenuation strength, and rule-based simulation release are implemented in T13.
- Asset sales are recorded for T14 network propagation, but this stage does not yet revalue other funds.
- End-of-horizon pending requests are reported rather than converted into artificial settlements.

## Invariants and tests

The state validator enforces holder totals equal total shares, pending shares do not exceed holdings, queue totals equal pending requests, cumulative counters equal request history, economic AUM equals asset positions, settlement amounts reproduce from recorded NAV, and sale losses reconcile to request and fund totals. Tests cover cash-only settlement, cash-then-sale settlement, FIFO accounting, insufficient liquidity, settlement delay, Gate, zero-rounding, terminal-fund, and tampering paths.
