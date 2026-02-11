import React from 'react';
import ReactDOM from 'react-dom/client';

import { Buffer } from 'buffer';

window.Buffer = Buffer;

if (typeof window !== 'undefined') {
  window.process = {
    ...window.process,
    env: { ...(window.process?.env || {}) },
    getuid: () => 0,
    getgid: () => 0,
    cwd: () => '/',
  };
}
import App from './App.jsx';
import './index.css';

// Wagmi V2+ Imports
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './wagmi.js'; // Import the new config

const queryClient = new QueryClient(); // Initialize QueryClient

ReactDOM.createRoot(document.getElementById('root')).render(
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
);