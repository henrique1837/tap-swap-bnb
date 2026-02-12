import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useConnect, useChainId, useChains } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useLNC } from './hooks/useLNC';
import { bytesToHex, parseEther } from 'viem';
import { sha256 } from 'ethereum-cryptography/sha256';
import { hexToBytes } from 'ethereum-cryptography/utils';
import { Buffer } from 'buffer';

import AtomicSwapBNBArtifact from '../../contracts/artifacts/contracts/AtomicSwapBNB.sol/AtomicSwapBNB.json';
import ConnectScreen from './components/ConnectScreen'; // Import the ConnectScreen component

// --- Helper Functions ---
const base64ToHex = (base64) => "0x" + Buffer.from(base64, 'base64').toString('hex');
const hexToBase64 = (hex) => Buffer.from(hexToBytes(hex.startsWith('0x') ? hex.slice(2) : hex)).toString('base64');
const toUrlSafeBase64 = (base64) => {
    return base64.replace(/\+/g, '-').replace(/\//g, '_');
};

// --- Configuration Constants ---
const SWAP_AMOUNT_TAP_SATOSHIS = 500;
const SWAP_AMOUNT_BNB = parseEther("0.00015");
const BNB_TIMELOCK_OFFSET = 3600;

const ATOMIC_SWAP_BNB_CONTRACT_ADDRESS = '0xYourDeployedContractAddressHere';
const TAPROOT_ASSET_ID = 'YOUR_TAPROOT_ASSET_ID_HEX';


function App() {
  // --- Wagmi Hooks for Wallet Interaction ---
  const { address, isConnected } = useAccount();
  const { connect, isConnecting: wagmiIsConnecting } = useConnect(); // Added isConnecting and renamed to avoid conflict
  const currentChainId = useChainId();
  const configuredChains = useChains();
  const currentChain = configuredChains.find(c => c.id === currentChainId);

  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // --- LNC State for Lightning Node Connection ---
  const { 
    lnc: lncClient, 
    status: lncStatus, 
    connectWithPairing, // Renamed from 'connect'
    loginWithPassword,  // New function from hook
    disconnect: disconnectLNC,
    error: lncError,
    isReady: lncIsConnected, // Using lnc.isConnected
    isPaired: lncIsPaired,   // Using lnc.credentials.isPaired
  } = useLNC();

  const [lncPairingPhrase, setLncPairingPhrase] = useState('');
  const [lncPassword, setLncPassword] = useState('');


  // --- Swap Specific State ---
  const [invoicePaymentRequest, setInvoicePaymentRequest] = useState('');
  const [invoicePaymentHash, setInvoicePaymentHash] = useState(null);
  const [invoicePreimage, setInvoicePreimage] = useState(null);
  const [swapStatus, setSwapStatus] = useState('Idle');
  const [errorMessage, setErrorMessage] = useState('');

  const contractAddress = ATOMIC_SWAP_BNB_CONTRACT_ADDRESS;

  // --- LNC Connection Handlers ---
  const handleLncPairingPhraseChange = (e) => {
    setLncPairingPhrase(e.target.value);
  };

  const handleLncPasswordChange = (e) => {
    setLncPassword(e.target.value);
  };

  const handleConnectLNCWithPairing = async (pairingPhrase, password) => {
    setErrorMessage('');
    try {
      await connectWithPairing(pairingPhrase, password);
      setLncPairingPhrase(''); // Clear after successful pairing
      setLncPassword('');     // Clear after successful pairing
    } catch (err) {
      // Error handled by hook, but display local message if needed
      setErrorMessage(err.message || "Failed to connect to LNC node.");
    }
  };

  const handleLoginLNCWithPassword = async (password) => {
    setErrorMessage('');
    try {
      await loginWithPassword(password);
      setLncPassword(''); // Clear password after successful login
    } catch (err) {
      setErrorMessage(err.message || "Failed to login to LNC node.");
    }
  };


  // --- Utility to check if LNC is ready ---
  const isLncApiReady = useCallback(() => {
    return lncIsConnected; // Directly use the isConnected from the hook
  }, [lncIsConnected]);


  // --- Swap Step 1: Create Lightning Invoice ---
  const createLightningInvoice = async () => {
    if (!isLncApiReady()) {
      setErrorMessage('Lightning Node not connected or not ready via LNC.');
      return;
    }
    if (!lncClient.lnd?.lightning) {
        setErrorMessage('Lightning RPC service (LND) not available on LNC client.');
        return;
    }

    setSwapStatus('Creating Lightning Invoice...');
    setErrorMessage('');

    try {
      const invoiceAmountMsat = SWAP_AMOUNT_TAP_SATOSHIS * 1000;
      const addInvoiceResponse = await lncClient.lnd.lightning.addInvoice({
          valueMsat: invoiceAmountMsat.toString(),
          memo: `Swap for ${SWAP_AMOUNT_BNB.toString()} BNB (via LNC-web)`,
          private: true,
      });

      const paymentRequest = addInvoiceResponse.paymentRequest;
      const r_hash_base64 = Buffer.from(addInvoiceResponse.rHash).toString('base64');
      const r_hash_hex = base64ToHex(r_hash_base64);

      setInvoicePaymentRequest(paymentRequest);
      setInvoicePaymentHash(r_hash_hex);
      setSwapStatus('Lightning Invoice Created. Awaiting BNB lock...');
      setErrorMessage('');

    } catch (err) {
      console.error('Error creating Lightning invoice:', err);
      setErrorMessage(`Failed to create Lightning invoice: ${err.message || String(err)}`);
      setSwapStatus('Error');
    }
  };

  // --- Swap Step 2: Initiate BNB Swap on BSC ---
  const initiateBNBSwap = async () => {
    if (!walletClient || !publicClient || !address || !invoicePaymentHash) {
      setErrorMessage('Wallet not connected, or Lightning Invoice not created.');
      return;
    }
    if (currentChainId !== 97) {
        setErrorMessage('Please connect your wallet to Binance Smart Chain Testnet (Chain ID: 97).');
        return;
    }

    setSwapStatus('Initiating BNB Swap on BSC...');
    setErrorMessage('');

    try {
      const bscCurrentBlock = await publicClient.getBlock({ blockTag: "latest" });
      const bnbTimelock = BigInt(bscCurrentBlock.timestamp) + BigInt(BNB_TIMELOCK_OFFSET);

      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: AtomicSwapBNBArtifact.abi,
        functionName: 'initiateSwap',
        args: [invoicePaymentHash, bnbTimelock],
        value: SWAP_AMOUNT_BNB,
        account: address,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      setSwapStatus('BNB Swap initiated on BSC. Waiting for Bob to pay LN invoice...');
      setErrorMessage('');

      startInvoicePolling();

    } catch (err) {
      console.error('Error initiating BNB swap:', err);
      setErrorMessage(`Failed to initiate BNB swap: ${err.message || String(err)}`);
      setSwapStatus('Error');
    }
  };

  // --- Swap Step 3: Poll for LN Invoice Settlement ---
  const startInvoicePolling = useCallback(() => {
    if (!isLncApiReady() || !invoicePaymentHash) {
        setErrorMessage('Cannot start polling: LNC not connected or payment hash missing.');
        return;
    }
    if (!lncClient.lnd?.lightning) {
        setErrorMessage('Lightning RPC service (LND) not available for polling.');
        return;
    }

    setSwapStatus('Polling for LN invoice settlement...');
    const intervalId = setInterval(async () => {
        try {
            if (!lncClient || !lncIsConnected) { // Use lncIsConnected from hook
                clearInterval(intervalId);
                console.warn("LNC client became null or not ready during polling, stopping interval.");
                return;
            }
            const r_hash_bytes = hexToBytes(invoicePaymentHash);
            const invoiceStatus = await lncClient.lnd.lightning.lookupInvoice({ rHash: r_hash_bytes });

            if (invoiceStatus.state === 'SETTLED') {
                clearInterval(intervalId);
                const preimageHex = base64ToHex(Buffer.from(invoiceStatus.rPreimage).toString('base64'));
                setInvoicePreimage(preimageHex);
                setSwapStatus('LN Invoice settled! Preimage obtained. Bob can now claim BNB.');
                setErrorMessage('');
            } else {
                console.log(`Invoice not yet settled. Current state: ${invoiceStatus.state}`);
            }
        } catch (err) {
            console.error('Error polling invoice status:', err);
        }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [lncClient, lncIsConnected, invoicePaymentHash]); // Dependency change


  // This useEffect will run when `lncIsConnected` changes
  useEffect(() => {
    if (lncIsConnected) {
      console.log('LNC API ready for use.');
    } else {
      console.log('LNC API not ready.');
      setInvoicePaymentRequest('');
      setInvoicePaymentHash(null);
      setInvoicePreimage(null);
      setSwapStatus('Idle');
    }
  }, [lncIsConnected]);

  useEffect(() => {
    if (lncError) {
        setErrorMessage(lncError);
    }
  }, [lncError]);


  // Render ConnectScreen if LNC is not connected OR Web3 wallet is not connected
  if (!lncIsConnected || !isConnected) {
    return (
      <ConnectScreen
        darkMode={false} 
        toggleDarkMode={() => {}} 
        pairingPhrase={lncPairingPhrase}
        setPairingPhrase={handleLncPairingPhraseChange}
        lncPassword={lncPassword}
        setLncPassword={handleLncPasswordChange}
        isConnectingLNC={lncStatus === 'Connecting'}
        handleConnectLNCWithPairing={handleConnectLNCWithPairing}
        handleLoginLNCWithPassword={handleLoginLNCWithPassword}
        handleDisconnectLNC={disconnectLNC} // Pass the disconnect function
        connectionErrorLNC={errorMessage || lncError}
        isWeb3Connected={isConnected}
        web3Address={address}
        web3ChainName={currentChain?.name}
        handleConnectWeb3={() => connect({ connector: injected() })}
        isWeb3Connecting={wagmiIsConnecting} // <--- CHANGED TO THIS
        lncIsPaired={lncIsPaired} // Pass the isPaired state
      />
    );
  }


  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans flex flex-col items-center">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Atomic Swap UI (Alice's Side - LNC-web JS)</h1>

      {/* Error Message Display */}
      {errorMessage && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative w-full max-w-2xl mb-4" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2">{errorMessage}</span>
        </div>
      )}

      {/* LNC Node Connection Section */}
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mb-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">LNC Node Connection</h2>
        <div className="flex flex-col gap-4 mb-4">
          <p className="text-green-600 font-semibold">LNC Connected!</p>
          <p className="text-sm text-gray-600 mt-2">Status: {lncStatus}</p>
          <button
            onClick={disconnectLNC}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition duration-300"
          >
            Disconnect LNC
          </button>
        </div>
      </div>

      {/* EVM Wallet Connection Section */}
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">EVM Wallet Connection</h2>
        <div className="mb-4">
            {isConnected ? (
                <p className="text-green-600 font-semibold">Connected: {address} ({currentChain?.name || 'Unknown Chain'})</p>
            ) : (
                <p className="text-red-600 font-semibold">Web3 Wallet Disconnected</p>
            )}
        </div>
      </div>

      {/* Atomic Swap Steps Section */}
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">Atomic Swap Steps (Alice: BNB Locker, LN Invoice Creator)</h2>

        {/* Step 1: Create Lightning Invoice */}
        <div className="mb-6 border-b pb-4">
          <h3 className="text-xl font-medium text-gray-800 mb-2">1. Create Lightning Invoice</h3>
          <p className="text-sm text-gray-600 mb-2">
            (Note: This creates a generic Lightning invoice for {SWAP_AMOUNT_TAP_SATOSHIS} sats.
            Direct Taproot Asset invoice creation through LNC-web would require a `tapd` client extension.)
          </p>
          <button
            onClick={createLightningInvoice}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!isLncApiReady() || invoicePaymentRequest !== ''}
          >
            Create Invoice for {SWAP_AMOUNT_TAP_SATOSHIS} Lightning Satoshis
          </button>
          {invoicePaymentRequest && (
            <div className="mt-4 p-4 bg-gray-50 rounded-md">
              <p className="font-semibold">Payment Request (Bolt11):</p>
              <p className="break-all text-sm text-gray-700">{invoicePaymentRequest}</p>
              <p className="font-semibold mt-2">Payment Hash (Hashlock for BSC):</p>
              <p className="break-all text-sm text-gray-700">{invoicePaymentHash}</p>
            </div>
          )}
        </div>

        {/* Step 2: Lock BNB on BSC */}
        <div className="mb-6 border-b pb-4">
          <h3 className="text-xl font-medium text-gray-800 mb-2">2. Lock {SWAP_AMOUNT_BNB.toString()} BNB on BSC</h3>
          <button
            onClick={initiateBNBSwap}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!isConnected || !invoicePaymentHash || swapStatus.includes('initiated')}
          >
            Initiate BNB Swap
          </button>
        </div>

        {/* Step 3: Wait for Bob to Pay LN Invoice */}
        <div className="mb-6 border-b pb-4">
          <h3 className="text-xl font-medium text-gray-800 mb-2">3. Wait for Bob to Pay Lightning Invoice</h3>
          <p className="text-gray-700">
            Bob will pay the generated Lightning invoice (e.g., via a separate LND wallet).
            Once settled, the secret (preimage) will be revealed.
            This UI automatically polls for settlement after BNB is locked.
          </p>
          {invoicePreimage && (
            <div className="mt-4 p-4 bg-green-50 rounded-md">
              <p className="font-semibold">LN Invoice Settled! Preimage:</p>
              <p className="break-all text-sm text-green-800">{invoicePreimage}</p>
            </div>
          )}
        </div>

        {/* Step 4: Bob Claims BNB on BSC (Off-chain for Alice) */}
        <div className="mb-6">
          <h3 className="text-xl font-medium text-gray-800 mb-2">4. Bob Claims BNB on BSC (Off-chain for Alice)</h3>
          <p className="text-gray-700">
            Once the Lightning invoice is settled and Alice obtains the preimage (which is also revealed to Bob upon payment),
            Bob can use this preimage to call the `claimSwap` function on the BSC smart contract, claiming the BNB Alice locked.
            This action is performed by Bob using his own wallet and UI, completing the atomic swap.
          </p>
        </div>

        {/* Overall Swap Status Display */}
        <div className="text-lg font-semibold mt-8 p-4 bg-indigo-100 rounded-md text-indigo-800">
          Current Swap Status: <span className="font-bold">{swapStatus}</span>
        </div>
      </div>
    </div>
  );
}

export default App;