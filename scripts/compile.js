// Compile AgentLog.sol + MockAgentID.sol with solc-js (optimizer 200 runs).
// Writes build/<Name>.json {abi, bytecode, deployedBytecode} and the exact
// standard-JSON input used, so BscScan verification can reproduce it.
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const root = path.join(__dirname, "..");
const sources = {};
for (const f of ["AgentLog.sol", "MockAgentID.sol"]) {
  sources[f] = { content: fs.readFileSync(path.join(root, "contracts", f), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    // Shanghai target: avoids Cancun-only MCOPY in dynamic-return paths,
    // keeping the bytecode runnable on ganache's default fork and on BSC.
    evmVersion: "shanghai",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const e of out.errors || []) console.warn(e.formattedMessage);

fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.writeFileSync(path.join(root, "build", "compiler-input.json"), JSON.stringify(input, null, 2));
console.log("solc version:", solc.version());
for (const [file, contracts] of Object.entries(out.contracts)) {
  for (const [name, c] of Object.entries(contracts)) {
    const artifact = {
      contractName: name,
      sourceFile: file,
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
    };
    fs.writeFileSync(path.join(root, "build", name + ".json"), JSON.stringify(artifact, null, 2));
    console.log(
      `${name}: creation ${c.evm.bytecode.object.length / 2} bytes, runtime ${c.evm.deployedBytecode.object.length / 2} bytes`
    );
  }
}
