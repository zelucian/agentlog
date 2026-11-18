// Deploy AgentLog.
//   node scripts/deploy.js testnet   -> BSC testnet, deploys MockAgentID too,
//                                       then runs a smoke test (mint, check-in,
//                                       note) from the deployer wallet.
//   node scripts/deploy.js mainnet   -> BSC mainnet, gates on the REAL Agent ID
//                                       contract. Key from env
//                                       AGENTLOG_DEPLOYER_KEY (never logged).
// Testnet key is read from ~/.config/testnet-wallet/credentials.json
// (the Muse-managed TESTNET-ONLY wallet). Keys are never printed.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const AGENT_ID_MAINNET = "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";
const root = path.join(__dirname, "..");

function artifact(name) {
  return JSON.parse(fs.readFileSync(path.join(root, "build", name + ".json"), "utf8"));
}

async function deployContract(signer, name, args = []) {
  const a = artifact(name);
  const c = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await c.waitForDeployment();
  return c;
}

async function main() {
  const mode = process.argv[2];
  if (!["testnet", "mainnet"].includes(mode)) {
    console.error("usage: node scripts/deploy.js <testnet|mainnet>");
    process.exit(1);
  }

  let rpc, key, chainId;
  if (mode === "testnet") {
    rpc = "https://data-seed-prebsc-1-s1.binance.org:8545";
    chainId = 97;
    const creds = JSON.parse(
      fs.readFileSync(path.join(process.env.HOME, ".config/testnet-wallet/credentials.json"), "utf8")
    );
    key = creds.privateKey;
  } else {
    rpc = "https://bsc-dataseed.binance.org";
    chainId = 56;
    key = process.env.AGENTLOG_DEPLOYER_KEY;
    if (!key) {
      console.error("AGENTLOG_DEPLOYER_KEY not set");
      process.exit(1);
    }
  }

  const provider = new ethers.JsonRpcProvider(rpc, chainId);
  const wallet = new ethers.Wallet(key, provider);
  const bal = await provider.getBalance(wallet.address);
  console.log(`deployer: ${wallet.address}`);
  console.log(`balance:  ${ethers.formatEther(bal)} ${mode === "testnet" ? "tBNB" : "BNB"}`);
  if (bal === 0n) {
    console.error("zero balance — cannot deploy");
    process.exit(1);
  }

  let agentIdAddr = AGENT_ID_MAINNET;
  if (mode === "testnet") {
    const mock = await deployContract(wallet, "MockAgentID");
    agentIdAddr = await mock.getAddress();
    console.log(`MockAgentID deployed: ${agentIdAddr}`);
    fs.writeFileSync(
      path.join(root, "deployments.json"),
      JSON.stringify({ testnetMockAgentID: agentIdAddr }, null, 2)
    );
    // smoke-test holder
    await (await mock.mint(wallet.address)).wait();
    console.log("minted MockAgentID to deployer");
  }

  const log = await deployContract(wallet, "AgentLog", [agentIdAddr]);
  const logAddr = await log.getAddress();
  console.log(`AgentLog deployed: ${logAddr} (gate: ${agentIdAddr})`);

  const deployments = fs.existsSync(path.join(root, "deployments.json"))
    ? JSON.parse(fs.readFileSync(path.join(root, "deployments.json"), "utf8"))
    : {};
  deployments[mode] = logAddr;
  fs.writeFileSync(path.join(root, "deployments.json"), JSON.stringify(deployments, null, 2));

  if (mode === "testnet") {
    await (await log.checkIn()).wait();
    await (await log.postNote("AgentLog testnet smoke test — gm from the deployer agent")).wait();
    const s = await log.statsOf(wallet.address);
    console.log(
      `smoke test ok: checkIns=${s.totalCheckIns} streak=${s.currentStreak} notes=${await log.noteCount()} totalAgents=${await log.totalAgents()}`
    );
  }
  console.log("done");
}

main().catch((e) => {
  console.error("deploy failed:", e.message);
  process.exit(1);
});
