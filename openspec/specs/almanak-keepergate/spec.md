# Almanak KeeperGate

## Purpose

Admit Almanak DeFi intents through a Cubiczan CHP policy gate and, only when LOCKED, simulate then execute on KeeperHub.

## Requirements

### Almanak adapter
- The sample strategy SHALL implement `decide(market) -> Intent | null` using Almanak vocabulary (`Intent.swap`, `Intent.hold`).
- Serialized intents SHALL use Almanak field names (`intent_type`, `from_token`, `amount_usd`, `chain`, `protocol`).
- Almanak chain name `base` SHALL remap to Base Sepolia (`84532`) when the configured KeeperHub chain is a testnet.

### CHP gate
- The gate SHALL walk `EXPLORING → PROVISIONAL → LOCKED | HITL_REQUIRED | BLOCKED`.
- Missing notional, missing confidence, unknown chain, or unknown venue SHALL BLOCK (fail-closed).
- Notional above `max_notional_usd` or projected daily spend above `daily_cap_usd` SHALL BLOCK.
- Notional at or above `hitl_notional_usd` and at or below max SHALL be `HITL_REQUIRED`.
- Only `LOCKED` decisions MAY call KeeperHub execute.

### KeeperHub
- When `KEEPERHUB_API_KEY` is unset, the client SHALL use the MOCK adapter, label the record MOCK, and SHALL NOT invent a transaction hash.
- When the key is present, the client SHALL `simulate: true` first and execute only if `success` and not `wouldRevert`.
- Live execute SHALL send `Idempotency-Key` derived from `taskId|chainId|recipientAddress|amount|tokenAddress`.

### Audit
- Every gated cycle SHALL append an HMAC-chained ledger entry covering the decision, serialized intent, and execution record.
- Ledger verification SHALL detect payload or HMAC tampering.
- Policy, ledger, and other in-process filesystem reads SHALL resolve under the process working directory (or an explicit allowed base) and SHALL reject paths that traverse out of that tree.
