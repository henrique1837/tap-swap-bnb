import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { network } from "hardhat";
import { parseEther, getAddress, Hex, bytesToHex } from "viem";
import { sha256 } from 'ethereum-cryptography/sha256';
import { hexToBytes } from 'ethereum-cryptography/utils';

import * as AtomicSwapBNBArtifact from "../artifacts/contracts/AtomicSwapBNB.sol/AtomicSwapBNB.json";
const AtomicSwapBNB_ABI = AtomicSwapBNBArtifact.abi;
const AtomicSwapBNB_BYTECODE = AtomicSwapBNBArtifact.bytecode;


describe("AtomicSwapBNB", async function () {
  let hardhatViem: any;
  let publicClient: any;
  let walletClient: any;

  let atomicSwapBNB: any;
  let deployer: any;
  let sender: any;
  let receiver: any;
  let anotherUser: any;

  const swapAmount = parseEther("1");
  const secret = "0x" + "a".repeat(64) as Hex; // 32-byte secret
  const secretBytes = hexToBytes(secret);
  const contractCompatibleHashlock = bytesToHex(sha256(secretBytes)) as Hex;

  // A truly incorrect secret (different bytes)
  const incorrectSecret = "0x" + "b".repeat(64) as Hex;
  const incorrectSecretBytes = hexToBytes(incorrectSecret);
  const incorrectHashlock = bytesToHex(sha256(incorrectSecretBytes)) as Hex;

  const initialTimelockOffset = 3600; // 1 hour in seconds
  const smallTimelockOffset = 10; // 10 seconds for quick timeout tests

  beforeEach(async function () {
    const { viem } = await network.connect();
    hardhatViem = viem;

    publicClient = await hardhatViem.getPublicClient();
    walletClient = await hardhatViem.getWalletClient();

    const accounts = await walletClient.getAddresses();
    deployer = accounts[0];
    sender = accounts[1];
    receiver = accounts[2];
    anotherUser = accounts[3];

    atomicSwapBNB = await hardhatViem.deployContract(
      "AtomicSwapBNB",
      [],
      {
        abi: AtomicSwapBNB_ABI,
        bytecode: AtomicSwapBNB_BYTECODE,
        account: deployer,
      }
    );

    console.log(`Deployed AtomicSwapBNB at: ${atomicSwapBNB.address}`);
  });

  it("Should initiate a swap successfully and emit SwapInitiated event", async function () {
    const currentBlock = await publicClient.getBlock({ blockTag: "latest" });
    const timelock = BigInt(currentBlock.timestamp) + BigInt(initialTimelockOffset);

    await hardhatViem.assertions.emitWithArgs(
      atomicSwapBNB.write.initiateSwap(
        [contractCompatibleHashlock, timelock],
        {
          value: swapAmount,
          account: sender,
        }
      ),
      atomicSwapBNB,
      "SwapInitiated",
      [contractCompatibleHashlock, getAddress(sender), swapAmount, timelock],
    );

    const swapDetails = await atomicSwapBNB.read.swaps([contractCompatibleHashlock]);
    assert.equal(swapDetails[0], swapAmount);
    assert.equal(swapDetails[1], getAddress(sender));
    assert.equal(swapDetails[2], contractCompatibleHashlock);
    assert.equal(swapDetails[3], timelock);
    assert.equal(swapDetails[4], false);
    assert.equal(swapDetails[5], false);
  });

  it("Should allow the receiver to claim the swap with the correct secret", async function () {
    const currentBlock = await publicClient.getBlock({ blockTag: "latest" });
    const timelock = BigInt(currentBlock.timestamp) + BigInt(initialTimelockOffset);

    await atomicSwapBNB.write.initiateSwap(
      [contractCompatibleHashlock, timelock],
      {
        value: swapAmount,
        account: sender,
      }
    );

    const receiverInitialBalance = await publicClient.getBalance({ address: receiver });

    await hardhatViem.assertions.emitWithArgs(
      atomicSwapBNB.write.claimSwap([secret], { account: receiver }),
      atomicSwapBNB,
      "SwapClaimed",
      [contractCompatibleHashlock, getAddress(receiver), secret],
    );

    const receiverFinalBalance = await publicClient.getBalance({ address: receiver });
    assert.ok(receiverFinalBalance > receiverInitialBalance);
    assert.equal(await publicClient.getBalance({ address: atomicSwapBNB.address }), 0n);

    const swapDetails = await atomicSwapBNB.read.swaps([contractCompatibleHashlock]);
    assert.equal(swapDetails[4], true);
  });

  it("Should prevent claiming with an incorrect secret", async function () {
    const currentBlock = await publicClient.getBlock({ blockTag: "latest" });
    const timelock = BigInt(currentBlock.timestamp) + BigInt(initialTimelockOffset);

    await atomicSwapBNB.write.initiateSwap(
      [contractCompatibleHashlock, timelock],
      {
        value: swapAmount,
        account: sender,
      }
    );

    await assert.rejects(
        atomicSwapBNB.write.claimSwap([incorrectSecret], { account: receiver }),
        (err: any) => {
          // Updated error message assertion to expect "Swap: No swap for this hashlock"
          // because providing an incorrect secret will result in a hashlock for which no swap exists.
          assert.ok(
            err.message.includes("Swap: No swap for this hashlock") ||
            err.message.includes("revert with reason 'Swap: No swap for this hashlock'")
            , `Expected "Swap: No swap for this hashlock" but got: ${err.message}`
          );
          return true;
        },
        "Claiming with incorrect secret should revert with 'No swap for this hashlock'"
      );
  });

  it("Should allow the sender to refund the swap after timelock has passed", async function () {
    const currentBlock = await publicClient.getBlock({ blockTag: "latest" });
    const timelock = BigInt(currentBlock.timestamp) + BigInt(smallTimelockOffset);

    await atomicSwapBNB.write.initiateSwap(
      [contractCompatibleHashlock, timelock],
      {
        value: swapAmount,
        account: sender,
      }
    );

    const senderInitialBalance = await publicClient.getBalance({ address: sender });

    // --- FIX FOR TYPEERROR: Cannot read properties of undefined (reading 'send') ---
    await publicClient.request({
      method: "evm_increaseTime",
      params: [initialTimelockOffset + 10] // Use initialTimelockOffset as an example value for increasing time
    });
    await publicClient.request({ method: "evm_mine" });

    await hardhatViem.assertions.emitWithArgs(
      atomicSwapBNB.write.refundSwap([contractCompatibleHashlock], { account: sender }),
      atomicSwapBNB,
      "SwapRefunded",
      [contractCompatibleHashlock, getAddress(sender)],
    );

    const senderFinalBalance = await publicClient.getBalance({ address: sender });
    assert.ok(senderFinalBalance > senderInitialBalance);
    assert.equal(await publicClient.getBalance({ address: atomicSwapBNB.address }), 0n);

    const swapDetails = await atomicSwapBNB.read.swaps([contractCompatibleHashlock]);
    assert.equal(swapDetails[5], true);
  });

  it("Should prevent refunding before timelock has passed", async function () {
    const currentBlock = await publicClient.getBlock({ blockTag: "latest" });
    const timelock = BigInt(currentBlock.timestamp) + BigInt(initialTimelockOffset);

    await atomicSwapBNB.write.initiateSwap(
      [contractCompatibleHashlock, timelock],
      {
        value: swapAmount,
        account: sender,
      }
    );

    await assert.rejects(
      atomicSwapBNB.write.refundSwap([contractCompatibleHashlock], { account: sender }),
      (err: any) => {
        assert.ok(err.message.includes("Swap: Timelock has not yet passed"));
        return true;
      },
      "Refunding before timelock should revert"
    );
  });

  it("Should prevent a non-sender from refunding the swap", async function () {
    const currentBlock = await publicClient.getBlock({ blockTag: "latest" });
    const timelock = BigInt(currentBlock.timestamp) + BigInt(smallTimelockOffset);

    await atomicSwapBNB.write.initiateSwap(
      [contractCompatibleHashlock, timelock],
      {
        value: swapAmount,
        account: sender,
      }
    );

    // --- FIX FOR TYPEERROR: Cannot read properties of undefined (reading 'send') ---
    await publicClient.request({
      method: "evm_increaseTime",
      params: [initialTimelockOffset + 10]
    });
    await publicClient.request({ method: "evm_mine" });

    await assert.rejects(
      atomicSwapBNB.write.refundSwap([contractCompatibleHashlock], { account: anotherUser }),
      (err: any) => {
        assert.ok(
          err.message.includes("Swap: Only sender can refund") ||
          err.message.includes("revert with reason 'Swap: Only sender can refund'")
          , `Expected "Swap: Only sender can refund" but got: ${err.message}`
        );
        return true;
      },
      "Non-sender should not be able to refund"
    );
  });

  it("Should prevent claiming an already refunded swap", async function () {
    const currentBlock = await publicClient.getBlock({ blockTag: "latest" });
    const timelock = BigInt(currentBlock.timestamp) + BigInt(smallTimelockOffset);

    await atomicSwapBNB.write.initiateSwap(
      [contractCompatibleHashlock, timelock],
      {
        value: swapAmount,
        account: sender,
      }
    );

    // --- FIX FOR TYPEERROR: Cannot read properties of undefined (reading 'send') ---
    await publicClient.request({
      method: "evm_increaseTime",
      params: [initialTimelockOffset + 10]
    });
    await publicClient.request({ method: "evm_mine" });
    await atomicSwapBNB.write.refundSwap([contractCompatibleHashlock], { account: sender });

    await assert.rejects(
      atomicSwapBNB.write.claimSwap([secret], { account: receiver }),
      (err: any) => {
        assert.ok(
          err.message.includes("Swap: Already refunded") ||
          err.message.includes("revert with reason 'Swap: Already refunded'")
          , `Expected "Swap: Already refunded" but got: ${err.message}`
        );
        return true;
      },
      "Claiming a refunded swap should revert"
    );
  });

  it("Should prevent refunding an already claimed swap", async function () {
    const currentBlock = await publicClient.getBlock({ blockTag: "latest" });
    const timelock = BigInt(currentBlock.timestamp) + BigInt(initialTimelockOffset);

    await atomicSwapBNB.write.initiateSwap(
      [contractCompatibleHashlock, timelock],
      {
        value: swapAmount,
        account: sender,
      }
    );

    await atomicSwapBNB.write.claimSwap([secret], { account: receiver });

    await assert.rejects(
      atomicSwapBNB.write.refundSwap([contractCompatibleHashlock], { account: sender }),
      (err: any) => {
        assert.ok(
          err.message.includes("Swap: Already claimed") ||
          err.message.includes("revert with reason 'Swap: Already claimed'")
          , `Expected "Swap: Already claimed" but got: ${err.message}`
        );
        return true;
      },
      "Refunding a claimed swap should revert"
    );
  });
});