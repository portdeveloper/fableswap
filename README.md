# FableSwap

A minimal constant-product DEX (Uniswap-V2-style, written from scratch) targeting
Monad testnet, built as a benchmark of AI dapp generation.

## Layout

- `contracts/` — Foundry project: `Factory`, `Pair` (x·y=k, 0.3% fee, LP shares),
  `Router` (slippage/deadline protection), `MockERC20` demo tokens with a public faucet.
- `web/` — Next.js + wagmi/viem frontend: swap with live quotes + price impact,
  add/remove liquidity, token faucet, tx lifecycle states.
- `web/e2e/swap.mjs` — headless Playwright flow: connect → faucet → approve →
  swap → verify balances and reserves.

## Local development

```bash
# 1. chain
anvil

# 2. contracts (deterministic addresses already wired into web/lib/deployments.ts)
cd contracts
forge test
forge script script/Deploy.s.sol --rpc-url local --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 3. app
cd ../web
pnpm install
NEXT_PUBLIC_ENABLE_MOCK_WALLET=1 pnpm dev   # mock wallet enables headless e2e
node e2e/swap.mjs                            # E2E_URL=... to override port
```

`NEXT_PUBLIC_ENABLE_MOCK_WALLET=1` adds a "Connect (Mock)" button bound to Anvil
account #1 — only for local testing, omit it otherwise.

## Monad testnet deployment

```bash
cd contracts
# fund the deployer in .env (or use your own key), then:
source .env
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast \
  --private-key "$MONAD_TESTNET_PRIVATE_KEY"
```

Then paste the printed addresses into the `10143` entry of
`web/lib/deployments.ts`.

## Security properties covered by tests (21 passing)

- fee-adjusted k-invariant can never decrease (unit + fuzz)
- first-depositor share-inflation attack blocked via MINIMUM_LIQUIDITY burn
- LP share math rounds in the pool's favor (fuzzed add/remove round-trip)
- slippage (`amountOutMin`/`amountMin`) and deadline enforcement
- reentrancy lock on mint/burn/swap, k-check on underpaid input
