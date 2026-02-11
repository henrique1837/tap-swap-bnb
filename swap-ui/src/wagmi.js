// config.ts
import { http, createConfig } from 'wagmi';
import { mainnet, base, bscTestnet } from 'wagmi/chains'; // Added bscTestnet if you are using it
import { injected, metaMask, safe, walletConnect } from 'wagmi/connectors';

// Get your WalletConnect Project ID from https://cloud.walletconnect.com
const projectId = 'test atomic swap'; // Replace with your actual Project ID

export const config = createConfig({
  chains: [mainnet, base, bscTestnet], // Add bscTestnet here if needed
  connectors: [
    injected(), // This is the correct way to use the injected connector in Wagmi v2+
    walletConnect({ projectId }),
    metaMask(),
    safe(),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [bscTestnet.id]: http(), // Add transport for bscTestnet if needed
  },
});