// scripts/deploy.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { run } from "hardhat"; // Import run for verification

async function main(hre: HardhatRuntimeEnvironment) {
  const { ethers, network } = hre;
  console.log("Deploying AtomicSwapBNB contract...");

  // Get the ContractFactory for AtomicSwapBNB
  const AtomicSwapBNB = await ethers.getContractFactory("AtomicSwapBNB");

  // Deploy the contract.
  // Our contract constructor doesn't take any arguments, so we just call deploy().
  const atomicSwapBNB = await AtomicSwapBNB.deploy();

  // Wait for the deployment transaction to be mined
  await atomicSwapBNB.waitForDeployment();

  const contractAddress = await atomicSwapBNB.getAddress();

  console.log(`AtomicSwapBNB deployed to: ${contractAddress}`);
  console.log(`Transaction hash: ${atomicSwapBNB.deploymentTransaction()?.hash}`);

  // Optional: Verify the contract on BscScan
  // This step is important for users to see the source code on block explorers.
  const networksToVerify = ["bnbt", "bnbm"];
  if (networksToVerify.includes(network.name)) {
    console.log("Waiting for a few block confirmations before verification...");
    // Give BscScan some time to index the transaction
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

    console.log("Verifying contract on BscScan...");
    try {
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [], // Our constructor takes no arguments
      });
      console.log("Contract verified successfully!");
    } catch (error: any) { // Use 'any' for error type if you prefer, or a more specific type if known
      if (error.message.toLowerCase().includes("already verified")) {
        console.log("Contract is already verified!");
      } else {
        console.error("Error verifying contract:", error);
      }
    }
  } else {
    console.log(`Contract not deployed to a public network (${network.name}), skipping verification.`);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main(require("hardhat")).catch((error) => { // Pass hardhat runtime environment
  console.error(error);
  process.exitCode = 1;
});