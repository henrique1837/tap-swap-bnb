// scripts/deploy.ts (using viem)
import { network } from "hardhat";

async function main() {
  // This is the CRUCIAL line from Hardhat v3 docs:
  // It connects to the network and returns the `viem` client and `networkName`.
  const { viem, networkName } = await network.connect();
  const client = await viem.getPublicClient(); // Get a public client for waiting for transactions

  console.log(`Deploying AtomicSwapBNB to ${networkName}...`);

  // Deploy the contract using viem's deployContract helper
  const atomicSwapBNB = await viem.deployContract("AtomicSwapBNB");

  console.log("AtomicSwapBNB address:", atomicSwapBNB.address);

  // Optional: Verification step (adapted for viem's client)
  const networksToVerify = ["bnbt", "bnbm", "sepolia"];
  if (networksToVerify.includes(networkName)) {
    console.log("Waiting for a few block confirmations before verification...");
    // Wait for the transaction to be mined and indexed by the explorer
    await client.waitForTransactionReceipt({ hash: atomicSwapBNB.deploymentTransaction?.hash, confirmations: 5 }); // Wait 5 confirmations

    console.log("Verifying contract on the explorer...");
    try {
      // The `run` function still needs to be accessed from `hre` for verification tasks.
      // This is a slight deviation from the pure 'network.connect()' pattern for deployment,
      // but is how Hardhat's verify task is typically invoked.
      // We'll import `hre` for this specific case.
      const { run } = await import("hardhat"); // Dynamic import for `run`

      await run("verify:verify", {
        address: atomicSwapBNB.address,
        constructorArguments: [], // No constructor arguments for AtomicSwapBNB
        // contract: "contracts/AtomicSwapBNB.sol:AtomicSwapBNB", // Optional
      });
      console.log("Contract verified successfully!");
    } catch (error: any) {
      if (error.message.toLowerCase().includes("already verified") || error.message.toLowerCase().includes("contract source code already verified")) {
        console.log("Contract is already verified!");
      } else {
        console.error("Error verifying contract:", error);
      }
    }
  } else {
    console.log(`Contract not deployed to a public network (${networkName}), skipping verification.`);
  }

  console.log("Deployment successful!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});