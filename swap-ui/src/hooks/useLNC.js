import { useState, useCallback, useEffect, useRef } from 'react';
import LNC from '@lightninglabs/lnc-web';

export const useLNC = () => {
  // Use useRef to hold the LNC instance so it persists across renders
  // without causing re-creations or issues with useEffect dependencies.
  // Initialize with an empty object as per the demo app's approach:
  // const lnc = new LNC({});
  const lncRef = useRef(new LNC({}));
  const [lncInstance] = useState(lncRef.current); // Use state to expose it, but it's stable

  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState(null);

  // Helper function to check and update connection status
  const checkConnectionStatus = useCallback(async () => {
    try {
      if (lncInstance.isConnected) {
        setStatus('Connected');
      } else if (lncInstance.credentials.isPaired) {
        setStatus('Ready to log in'); // Session stored, awaiting password
      } else {
        setStatus('Disconnected'); // No session, awaiting pairing phrase
      }
    } catch (e) {
      console.error("Error checking LNC connection status:", e);
      setStatus('Error checking status');
    }
  }, [lncInstance]);

  // Check status on initial load and whenever the LNC instance might change state
  useEffect(() => {
    checkConnectionStatus();
  }, [checkConnectionStatus]);


  // Helper function for initial connection with pairing phrase and password
  const connectWithPairing = useCallback(async (pairingPhrase, password) => {
    setError(null);
    setStatus('Connecting');
    try {
      // Set credentials on the existing LNC instance
      lncInstance.credentials.pairingPhrase = pairingPhrase;
      lncInstance.credentials.password = password;

      await lncInstance.connect();
      
      // Verify connection by calling a simple RPC, as per demo
      await lncInstance.lnd.lightning.listChannels(); // This will throw if not connected

      setStatus('Connected');
      setError(null);
      return lncInstance;
    } catch (err) {
      console.error('LNC Connect Error (Pairing):', err);
      setError(err.message || "Failed to connect with pairing phrase.");
      setStatus('Error');
      // If pairing fails, ensure credentials are cleared so UI can retry
      lncInstance.credentials.pairingPhrase = '';
      lncInstance.credentials.password = '';
      throw err;
    }
  }, [lncInstance]);

  // Helper function for logging in with only password (for stored sessions)
  const loginWithPassword = useCallback(async (password) => {
    setError(null);
    setStatus('Connecting');
    try {
      lncInstance.credentials.password = password;
      await lncInstance.connect();

      // Verify connection by calling a simple RPC
      await lncInstance.lnd.lightning.listChannels(); // This will throw if not connected

      setStatus('Connected');
      setError(null);
      return lncInstance;
    } catch (err) {
      console.error('LNC Login Error (Password):', err);
      setError(err.message || "Failed to login with password. Incorrect password or session expired.");
      setStatus('Error');
      // If login fails, clear password so user can re-enter or try pairing again
      lncInstance.credentials.password = '';
      throw err;
    }
  }, [lncInstance]);

  const disconnect = useCallback(() => {
    if (lncInstance.isConnected) {
      lncInstance.disconnect();
    }
    // Clear all credentials upon logout to force re-pairing or re-login
    lncInstance.credentials.pairingPhrase = '';
    lncInstance.credentials.password = '';
    setStatus('Disconnected');
    setError(null);
  }, [lncInstance]);

  return { 
    lnc: lncInstance, // Expose the stable LNC instance
    status, 
    connectWithPairing, 
    loginWithPassword,
    disconnect, 
    error,
    isReady: lncInstance.isConnected, // Use lncInstance.isConnected directly
    isPaired: lncInstance.credentials.isPaired, // Expose isPaired for conditional UI
  };
};