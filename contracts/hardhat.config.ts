// hardhat.config.ts (Note: using .ts as you're importing 'defineConfig')
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";
import dotenv from "dotenv";
dotenv.config();
export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28", // Adjusted to match your contract's pragma
      },
      production: {
        version: "0.8.28", // Adjusted to match your contract's pragma
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    // --- BNB Chain Networks ---
    bnbt: { // BNB Smart Chain Testnet
      type: "http",
      chainType: "l1", // BNB Chain is a Layer 1 blockchain
      url: configVariable("BNB_TESTNET_RPC_URL"),
      accounts: [configVariable("BNB_PRIVATE_KEY")], // Use a general key for BNB networks
      chainId: 97,
    },
    bnbm: { // BNB Smart Chain Mainnet
      type: "http",
      chainType: "l1",
      url: configVariable("BNB_MAINNET_RPC_URL"),
      accounts: [configVariable("BNB_PRIVATE_KEY")],
      chainId: 56,
    },
  },
  // Etherscan verification settings for BNB Chain
  etherscan: {
    apiKey: {
      bscTestnet: configVariable("BSCSCAN_API_KEY"),
      bsc: configVariable("BSCSCAN_API_KEY"), // For Mainnet
    },
    customChains: [ // Define custom chains if not natively supported by @nomicfoundation/hardhat-verify
      {
        network: "bnbt",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com"
        }
      },
      {
        network: "bnbm",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com"
        }
      }
    ]
  }
});