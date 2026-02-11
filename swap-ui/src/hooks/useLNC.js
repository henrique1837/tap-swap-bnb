import { useState, useCallback } from 'react';
import LNC from '@lightninglabs/lnc-web';

export const useLNC = () => {
  const [lnc, setLnc] = useState(null);
  const [status, setStatus] = useState('Disconnected');

  const connect = useCallback(async (pairingPhrase) => {
    setStatus('Connecting');
    try {
      const lncInstance = new LNC({ pairingPhrase });
      await lncInstance.connect();
      
      setLnc(lncInstance);
      setStatus('Connected');
      return lncInstance;
    } catch (err) {
      console.error('LNC Error:', err);
      setStatus('Error');
      throw err;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (lnc) lnc.disconnect();
    setLnc(null);
    setStatus('Disconnected');
  }, [lnc]);

  return { lnc, status, connect, disconnect, isReady: lnc?.isReady };
};