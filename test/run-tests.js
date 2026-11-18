// Local test suite for AgentLog against ganache (in-process EVM).
const assert = require("node:assert");
const ganache = require("ganache");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const DAY = 86400;
let passed = 0;
function ok(name) {
  passed++;
  console.log("  PASS", name);
}
async function expectRevert(name, fn, errName, iface) {
  try {
    await fn();
  } catch (e) {
    const selector = iface.getError(errName).selector;
    const hay = [
      e.message || "",
      e.revert?.name || "",
      e.data || "",
      e.info?.error?.data || "",
      e.error?.data || "",
    ].join(" ");
    if (hay.includes(errName) || hay.toLowerCase().includes(selector.slice(2).toLowerCase())) {
      return ok(name);
    }
    throw new Error(`${name}: reverted but without ${errName}: ${hay.slice(0, 240)}`);
  }
  throw new Error(`${name}: expected revert ${errName}, call succeeded`);
}

async function main() {
  const provider = new ethers.BrowserProvider(ganache.provider());
  const [deployer, agent1, agent2, stranger] = await Promise.all(
    [0, 1, 2, 3].map((i) => provider.getSigner(i))
  );

  const mockArt = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "MockAgentID.json"), "utf8"));
  const logArt = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "AgentLog.json"), "utf8"));

  const mock = await new ethers.ContractFactory(mockArt.abi, mockArt.bytecode, deployer).deploy();
  await mock.waitForDeployment();
  const log = await new ethers.ContractFactory(logArt.abi, logArt.bytecode, deployer).deploy(
    await mock.getAddress()
  );
  await log.waitForDeployment();
  console.log("MockAgentID:", await mock.getAddress());
  console.log("AgentLog:   ", await log.getAddress());

  await (await mock.mint(await agent1.getAddress())).wait();
  await (await mock.mint(await agent2.getAddress())).wait();

  const logA1 = log.connect(agent1);
  const logA2 = log.connect(agent2);
  const logStranger = log.connect(stranger);

  // --- gate ---
  await expectRevert("non-holder checkIn reverts NotAgent", () => logStranger.checkIn.staticCall(), "NotAgent", log.interface);
  await expectRevert("non-holder postNote reverts NotAgent", () => logStranger.postNote.staticCall("gm"), "NotAgent", log.interface);

  // --- check-in flow ---
  await (await logA1.checkIn()).wait();
  let s = await log.statsOf(await agent1.getAddress());
  assert.equal(s.totalCheckIns, 1n);
  assert.equal(s.currentStreak, 1n);
  assert.equal(await log.totalCheckIns(), 1n);
  assert.equal(await log.totalAgents(), 1n);
  ok("first check-in: stats + totals");

  await expectRevert("second check-in same day reverts", () => logA1.checkIn.staticCall(), "AlreadyCheckedInToday", log.interface);

  let st = await log.statusOf(await agent1.getAddress());
  assert.equal(st.checkedInToday, true);
  assert.equal(st.streak, 1n);
  ok("statusOf after check-in");

  // next day -> streak 2
  await provider.send("evm_increaseTime", [DAY]);
  await provider.send("evm_mine", []);
  await (await logA1.checkIn()).wait();
  s = await log.statsOf(await agent1.getAddress());
  assert.equal(s.currentStreak, 2n);
  assert.equal(s.bestStreak, 2n);
  ok("consecutive day: streak grows to 2");

  // skip a day -> streak resets, best kept
  await provider.send("evm_increaseTime", [2 * DAY]);
  await provider.send("evm_mine", []);
  await (await logA1.checkIn()).wait();
  s = await log.statsOf(await agent1.getAddress());
  assert.equal(s.currentStreak, 1n);
  assert.equal(s.bestStreak, 2n);
  assert.equal(s.totalCheckIns, 3n);
  ok("missed day: streak resets to 1, bestStreak kept");

  // --- notes ---
  await expectRevert("empty note reverts", () => logA1.postNote.staticCall(""), "EmptyNote", log.interface);
  await expectRevert("281-byte note reverts", () => logA1.postNote.staticCall("x".repeat(281)), "NoteTooLong", log.interface);
  await (await logA1.postNote("gm from agent one")).wait();
  assert.equal(await log.noteCount(), 1n);
  ok("valid note posted");

  await expectRevert("second note within 1h reverts", () => logA1.postNote.staticCall("too soon"), "NoteCooldownActive", log.interface);
  await provider.send("evm_increaseTime", [3600]);
  await provider.send("evm_mine", []);
  await (await logA1.postNote("second note after cooldown")).wait();
  assert.equal(await log.noteCount(), 2n);
  ok("note after cooldown posted");

  const page = await log.getNotes(0, 10);
  assert.equal(page.authors.length, 2);
  assert.equal(page.texts[0], "gm from agent one");
  assert.equal(page.texts[1], "second note after cooldown");
  const empty = await log.getNotes(5, 10);
  assert.equal(empty.authors.length, 0);
  ok("getNotes pagination + out-of-range page");

  // --- second agent counts as unique ---
  await (await logA2.checkIn()).wait();
  assert.equal(await log.totalAgents(), 2n);
  assert.equal(await log.totalCheckIns(), 4n);
  ok("second agent: totalAgents=2, totalCheckIns=4");

  console.log(`\nALL TESTS PASSED (${passed} checks)`);
}

main().catch((e) => {
  console.error("TEST FAILURE:", e.message);
  process.exit(1);
});
