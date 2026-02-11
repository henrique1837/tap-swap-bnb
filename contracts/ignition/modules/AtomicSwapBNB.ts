// ignition/modules/AtomicSwapBNB.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const AtomicSwapBNBModule = buildModule("AtomicSwapBNBModule", (m) => {
  // Define the contract deployment.
  // Our contract's constructor doesn't take any arguments.
  const atomicSwapBNB = m.contract("AtomicSwapBNB");

  // You can optionally define calls or links here if your contract needed them post-deployment.
  // For AtomicSwapBNB, we don't have initial calls/links in the deployment phase.

  return { atomicSwapBNB }; // Return the deployed contract instance
});

export default AtomicSwapBNBModule;