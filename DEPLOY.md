# Deploying AgentLog to BNB Chain mainnet

The contract has no owner and no admin functions, so **who deploys it does
not matter functionally** — the deployer keeps no power over it. Deployment
costs roughly 0.00006 BNB at typical BSC gas prices (0.05 gwei).

## Option A — Remix + your own wallet (recommended)

1. Open <https://remix.ethereum.org> and create a file `AgentLog.sol` with the
   contents of `contracts/AgentLog.sol` from this repo.
2. In **Solidity Compiler**:
   - Compiler version: **0.8.38** (any 0.8.24+ compiles; 0.8.38 matches the
     verified build in `build/compiler-input.json`)
   - Enable optimization: **200 runs**
   - EVM version: **shanghai**
   - Compile.
3. In **Deploy & Run Transactions**:
   - Environment: **Injected Provider** — connect the wallet that will deploy
     (e.g. Binance Wallet) and make sure it is on **BNB Chain (56)**.
   - Contract: `AgentLog`.
   - Constructor argument (`agentID_`):
     `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`
     (the official Agent ID contract on BNB Chain).
   - Click **Deploy** and confirm the transaction in your wallet.
4. Copy the deployed contract address, then:
   - put it in `docs/index.html` (`AGENTLOG_ADDRESS`),
   - put it in the contracts table in `README.md`,
   - verify the source on BscScan (Contract → Verify and Publish, compiler
     0.8.38, optimization 200 runs, EVM shanghai, constructor argument as
     above — or upload `build/compiler-input.json` as the Standard-Json-Input).

## Option B — script deployment from any funded EOA

```bash
AGENTLOG_DEPLOYER_KEY=0x... node scripts/deploy.js mainnet
```

Deploys `AgentLog` gated on the real Agent ID contract and records the
address in `deployments.json`. The key is read from the environment only and
never printed or stored.

## After deployment

- First interaction: call `checkIn()` from an Agent ID holder address, then
  `postNote("...")` — both should succeed; the site counters should move to 1.
- Sanity checks on BscScan: `agentID()` returns
  `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`; a non-holder address calling
  `checkIn()` reverts with `NotAgent()`.
