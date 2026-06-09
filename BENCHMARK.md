# Benchmark run log — Fable 5 builds a DEX

Single autonomous pass, 2026-06-09. Methodology mirrors the Gemma 4 12B test
(generate → compile → security review → tests → frontend → Monad testnet deploy),
scored on fix iterations and human interventions per stage.

## Scorecard

| Stage | Result | Fix iterations | Human help |
|---|---|---|---|
| Contracts (Factory, Pair, Router, MockERC20 — from scratch, no OZ) | compiled first try | 0 | none |
| Foundry tests (21 tests incl. 3 fuzz) | 18/20 on first run → 21/21 | 1 (both failures were bugs in test code, contracts untouched) | none |
| Frontend (Next.js 16, wagmi 3, viem 2) | `tsc` clean, prod build clean | 2 (scaffold's ES2017 target broke BigInt literals; chainId type narrowing) | none |
| Local e2e (Playwright, headless, real txs via mock connector + Anvil) | passed first run | 0 | none |
| Monad testnet deploy + live swap + Sourcify verify (5/5 exact_match) | success | 0 | funded deployer with 5 MON |

Code-level human interventions: **0**. External interventions: **1** (testnet gas).

## Details worth reporting

- First test run: 18/20. Failure 1: attacker fixture donated more tokens than it
  had left after seeding the pool. Failure 2: expected `Pair: k` but the contract
  correctly reverts earlier with `Pair: insufficient input amount` when no input
  was paid. Both were expectation bugs; the diagnosis was done from the failure
  messages alone, no human hint.
- Security properties implemented unprompted: MINIMUM_LIQUIDITY burn against the
  first-depositor inflation attack (with a test demonstrating the attack fails),
  reentrancy lock, fee-adjusted k-check, rounding in the pool's favor (fuzzed),
  slippage + deadline enforcement, safe-transfer handling for non-standard ERC20s.
- No hallucinated APIs: library surfaces (wagmi v3 hooks/connectors, viem chains)
  were inspected from node_modules before writing imports.
- Quote accuracy: UI quote 197.431606 USDC for 100 WMON over 10k/20k reserves —
  matches the closed-form AMM output exactly. Testnet swap: 10 WMON → 19.920139…
  USDC, also exact.
- Environment friction handled autonomously: stale Anvil instances from earlier
  sessions occupying 8545 (dirty nonces → wrong addresses → restarted node),
  ports 3000–3002 occupied, pnpm 11 build-script approvals, stale TS incremental
  cache masking a tsconfig fix.

## Monad testnet deployment (chain 10143)

| Contract | Address |
|---|---|
| Factory | `0x514d4aD259143c4a6bE7C2399D46CBe8B1F9E2Db` |
| Router | `0xf2E7885d6566394550B0daeCF45d7E822dE41cc5` |
| WMON (demo) | `0x6d427a189325473725c89Ed13Cb734cFAcbD75A6` |
| USDC (demo) | `0x0AC0B00Cf3E7aB4B287a99c907C93f74bd73e737` |
| Pair | `0x9d237bf8fB87cdEa6a88fC08E0dAfc04335A7528` |

All verified (exact_match) on Sourcify via `sourcify-api-monad.blockvision.org`;
browsable on https://testnet.monadexplorer.com. Pool seeded 10,000 WMON /
20,000 USDC; one live swap executed (tx visible under the Router address).
Deployer: `0x591D267CD6d1cfb0f320b276F54415c32dc5d2A4` (3.64 MON remaining).
