import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useConnect, useChainId, useChains } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useLNC } from './hooks/useLNC';
import { parseEther } from 'viem';
import { hexToBytes } from 'ethereum-cryptography/utils';
import { Buffer } from 'buffer';

import AtomicSwapBNBArtifact from '../../contracts/artifacts/contracts/AtomicSwapBNB.sol/AtomicSwapBNB.json';
import ConnectScreen from './components/ConnectScreen';

import { NostrProvider, useNostr } from './contexts/NostrContext';
import NostrIdentityDisplay from './components/NostrIdentityDisplay';
import CreateSwapIntention from './components/CreateSwapIntention';
import SwapIntentionsList from './components/SwapIntentionsList';

const base64ToHex = (base64) => `0x${Buffer.from(base64, 'base64').toString('hex')}`;

const SWAP_AMOUNT_TAP_SATOSHIS = 500;
const SWAP_AMOUNT_BNB = parseEther('0.00015');
const BNB_TIMELOCK_OFFSET = 3600;

const ATOMIC_SWAP_BNB_CONTRACT_ADDRESS = '0xYourDeployedContractAddressHere';

function AppContent() {
  const { address, isConnected } = useAccount();
  const { connect, isConnecting: wagmiIsConnecting } = useConnect();
  const currentChainId = useChainId();
  const configuredChains = useChains();
  const currentChain = configuredChains.find((c) => c.id === currentChainId);

  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const {
    lnc: lncClient,
    status: lncStatus,
    connectWithPairing,
    loginWithPassword,
    disconnect: disconnectLNC,
    error: lncError,
    isReady: lncIsConnected,
    isPaired: lncIsPaired,
  } = useLNC();

  const [lncPairingPhrase, setLncPairingPhrase] = useState('');
  const [lncPassword, setLncPassword] = useState('');

  const {
    nostrPubkey,
    publishSwapIntention,
    publishInvoiceForIntention,
    deriveNostrKeysFromLNC,
    isLoadingNostr,
  } = useNostr();

  const [errorMessage, setErrorMessage] = useState('');

  const [invoicePaymentRequest, setInvoicePaymentRequest] = useState('');
  const [invoicePaymentHash, setInvoicePaymentHash] = useState(null);
  const [invoicePreimage, setInvoicePreimage] = useState(null);
  const [swapStatus, setSwapStatus] = useState('Idle');
  const [contractAddress] = useState(ATOMIC_SWAP_BNB_CONTRACT_ADDRESS);

  const [selectedSwapIntention, setSelectedSwapIntention] = useState(null);
  const [wantedAsset, setWantedAsset] = useState('BNB');
  const [allowSelfAccept, setAllowSelfAccept] = useState(true);

  // Locally generated invoice that is not yet published to Nostr.
  const [pendingInvoice, setPendingInvoice] = useState(null);

  const selectedPosterPubkey = selectedSwapIntention ? (selectedSwapIntention.posterPubkey || selectedSwapIntention.pubkey) : '';
  const isSelectedPoster = Boolean(selectedSwapIntention && selectedPosterPubkey === nostrPubkey);
  const isSelectedAccepter = Boolean(selectedSwapIntention && selectedSwapIntention.acceptedByPubkey === nostrPubkey);
  const isSelectedAccepted = Boolean(selectedSwapIntention && ['accepted', 'invoice_ready'].includes(selectedSwapIntention.status));
  const selectedWantedAsset = selectedSwapIntention?.wantedAsset || null;

  const invoicePublisherRole = selectedWantedAsset === 'BNB' ? 'accepter' : 'poster';
  const lockerRole = selectedWantedAsset === 'BNB' ? 'accepter' : 'poster';

  const isPublisherRoleMatch =
    Boolean(selectedSwapIntention) &&
    ((invoicePublisherRole === 'poster' && isSelectedPoster) ||
      (invoicePublisherRole === 'accepter' && isSelectedAccepter));

  const isLockerRoleMatch =
    Boolean(selectedSwapIntention) &&
    ((lockerRole === 'poster' && isSelectedPoster) ||
      (lockerRole === 'accepter' && isSelectedAccepter));

  const pendingInvoiceForSelected = Boolean(
    pendingInvoice &&
      selectedSwapIntention &&
      pendingInvoice.dTag === selectedSwapIntention.dTag,
  );

  const effectiveInvoicePaymentHash = pendingInvoiceForSelected
    ? pendingInvoice.paymentHash
    : invoicePaymentHash;

  const effectiveInvoicePaymentRequest = pendingInvoiceForSelected
    ? pendingInvoice.paymentRequest
    : invoicePaymentRequest;

  const canGenerateInvoice = Boolean(selectedSwapIntention) && isSelectedAccepted && isPublisherRoleMatch;
  const canLockBnb = Boolean(selectedSwapIntention) && isSelectedAccepted && isLockerRoleMatch && Boolean(effectiveInvoicePaymentHash);

  const generateInvoiceDisabledReason = !selectedSwapIntention
    ? 'Select an intention first.'
    : !isSelectedAccepted
      ? 'This intention must be accepted first. Use Accept in the list.'
      : !isPublisherRoleMatch
        ? (selectedWantedAsset === 'BNB'
          ? 'For wants BNB, only accepter can generate invoice.'
          : 'For wants Taproot BNB, only poster can generate invoice.')
        : '';

  const lockBnbDisabledReason = !selectedSwapIntention
    ? 'Select an intention first.'
    : !isSelectedAccepted
      ? 'This intention must be accepted first.'
      : !effectiveInvoicePaymentHash
        ? 'Generate invoice first. It will be published only after lock.'
        : !isLockerRoleMatch
          ? (selectedWantedAsset === 'BNB'
            ? 'For wants BNB, only accepter locks BNB.'
            : 'For wants Taproot BNB, only poster locks BNB.')
          : '';

  const handleLncPairingPhraseChange = (e) => setLncPairingPhrase(e.target.value);
  const handleLncPasswordChange = (e) => setLncPassword(e.target.value);

  const handleConnectLNCWithPairing = async (pairingPhrase, password) => {
    setErrorMessage('');
    try {
      await connectWithPairing(pairingPhrase, password);
      setLncPairingPhrase('');
      setLncPassword('');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to connect to LNC node.');
    }
  };

  const handleLoginLNCWithPassword = async (password) => {
    setErrorMessage('');
    try {
      await loginWithPassword(password);
      setLncPassword('');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to login to LNC node.');
    }
  };

  const lncSignMessageForNostr = useCallback(async (message) => {
    if (!lncClient?.lnd?.lightning) {
      throw new Error('LNC client not ready to sign message.');
    }
    const messageBytes = new TextEncoder().encode(message);
    const messageBase64 = Buffer.from(messageBytes).toString('base64');
    const signResponse = await lncClient.lnd.lightning.signMessage({ msg: messageBase64 });
    return base64ToHex(signResponse.signature);
  }, [lncClient]);

  const isLncApiReady = useCallback(() => lncIsConnected, [lncIsConnected]);

  useEffect(() => {
    if (isLncApiReady() && !nostrPubkey && !isLoadingNostr) {
      deriveNostrKeysFromLNC(lncSignMessageForNostr);
    }
  }, [isLncApiReady, nostrPubkey, isLoadingNostr, deriveNostrKeysFromLNC, lncSignMessageForNostr]);

  const createLightningInvoice = async () => {
    if (!isLncApiReady()) {
      setErrorMessage('Lightning Node not connected or not ready via LNC.');
      return null;
    }
    if (!lncClient?.lnd?.lightning) {
      setErrorMessage('Lightning RPC service (LND) not available on LNC client.');
      return null;
    }

    setSwapStatus('Generating Lightning invoice...');
    setErrorMessage('');

    try {
      const invoiceAmountMsat = SWAP_AMOUNT_TAP_SATOSHIS * 1000;
      const addInvoiceResponse = await lncClient.lnd.lightning.addInvoice({
        valueMsat: invoiceAmountMsat.toString(),
        memo: `Swap for ${SWAP_AMOUNT_BNB.toString()} BNB (via LNC-web)`,
        private: true,
      });

      const paymentRequest = addInvoiceResponse.paymentRequest;
      const rHashBase64 = Buffer.from(addInvoiceResponse.rHash).toString('base64');
      const paymentHash = base64ToHex(rHashBase64);

      return { paymentRequest, paymentHash };
    } catch (err) {
      console.error('Error creating Lightning invoice:', err);
      setErrorMessage(`Failed to create Lightning invoice: ${err.message || String(err)}`);
      setSwapStatus('Error');
      return null;
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedSwapIntention) {
      setErrorMessage('Select an accepted intention first.');
      return;
    }
    if (!canGenerateInvoice) {
      setErrorMessage('You are not the invoice generator for this selected flow.');
      return;
    }

    const invoice = await createLightningInvoice();
    if (!invoice) return;

    setPendingInvoice({ ...invoice, dTag: selectedSwapIntention.dTag });
    setInvoicePaymentRequest(invoice.paymentRequest);
    setInvoicePaymentHash(invoice.paymentHash);
    setSwapStatus('Invoice generated locally. Now lock BNB. Invoice will be published after lock.');
    setErrorMessage('');
  };

  const handlePublishSwapIntention = async () => {
    if (!nostrPubkey) {
      setErrorMessage('Nostr identity not established. Please ensure LNC is connected.');
      return;
    }
    if (!address) {
      setErrorMessage('EVM wallet not connected.');
      return;
    }

    try {
      setSwapStatus('Publishing swap intention to Nostr...');
      const intentionId = await publishSwapIntention({
        amountBNB: SWAP_AMOUNT_BNB.toString(),
        amountSats: SWAP_AMOUNT_TAP_SATOSHIS.toString(),
        wantedAsset,
        contractAddress,
      }, address);

      if (intentionId) {
        setSwapStatus('Intention published. Wait for another user to accept.');
        setErrorMessage('');
      } else {
        setErrorMessage('Failed to publish swap intention to Nostr.');
      }
    } catch (err) {
      console.error('Error publishing swap intention:', err);
      setErrorMessage(`Failed to publish swap intention: ${err.message || String(err)}`);
    }
  };

  const initiateBNBSwap = async () => {
    if (!walletClient || !publicClient || !address || !effectiveInvoicePaymentHash) {
      setErrorMessage('Wallet not connected, or invoice not available yet.');
      return;
    }
    if (currentChainId !== 97) {
      setErrorMessage('Please connect your wallet to Binance Smart Chain Testnet (Chain ID: 97).');
      return;
    }
    if (!canLockBnb) {
      setErrorMessage('Based on the selected flow, you are not the BNB locker for this swap.');
      return;
    }

    setSwapStatus('Locking BNB on BSC...');
    setErrorMessage('');

    try {
      const bscCurrentBlock = await publicClient.getBlock({ blockTag: 'latest' });
      const bnbTimelock = BigInt(bscCurrentBlock.timestamp) + BigInt(BNB_TIMELOCK_OFFSET);

      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: AtomicSwapBNBArtifact.abi,
        functionName: 'initiateSwap',
        args: [effectiveInvoicePaymentHash, bnbTimelock],
        value: SWAP_AMOUNT_BNB,
        account: address,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      // Publish to Nostr only after lock succeeds.
      if (pendingInvoiceForSelected && pendingInvoice && selectedSwapIntention) {
        setSwapStatus('BNB locked. Publishing invoice to Nostr...');
        await publishInvoiceForIntention(selectedSwapIntention, pendingInvoice, address || '');

        setSelectedSwapIntention((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: 'invoice_ready',
            paymentRequest: pendingInvoice.paymentRequest,
            paymentHash: pendingInvoice.paymentHash,
          };
        });

        setSwapStatus('BNB locked and invoice published to Nostr. Counterparty can continue.');
        setPendingInvoice(null);
      } else {
        setSwapStatus('BNB locked on BSC.');
      }

      setErrorMessage('');
      startInvoicePolling();
    } catch (err) {
      console.error('Error initiating BNB swap:', err);
      setErrorMessage(`Failed to initiate BNB swap: ${err.message || String(err)}`);
      setSwapStatus('Error');
    }
  };

  const startInvoicePolling = useCallback(() => {
    if (!isLncApiReady() || !effectiveInvoicePaymentHash) {
      setErrorMessage('Cannot poll: LNC not connected or payment hash missing.');
      return;
    }
    if (!lncClient?.lnd?.lightning) {
      setErrorMessage('Lightning RPC service (LND) not available for polling.');
      return;
    }

    setSwapStatus('Polling for LN invoice settlement...');
    const intervalId = setInterval(async () => {
      try {
        if (!lncClient || !isLncApiReady()) {
          clearInterval(intervalId);
          return;
        }

        const rHashBytes = hexToBytes(effectiveInvoicePaymentHash);
        const invoiceStatus = await lncClient.lnd.lightning.lookupInvoice({ rHash: rHashBytes });

        if (invoiceStatus.state === 'SETTLED') {
          clearInterval(intervalId);
          const preimageHex = base64ToHex(Buffer.from(invoiceStatus.rPreimage).toString('base64'));
          setInvoicePreimage(preimageHex);
          setSwapStatus('LN invoice settled. Preimage obtained.');
          setErrorMessage('');
        }
      } catch (err) {
        console.error('Error polling invoice status:', err);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [lncClient, isLncApiReady, effectiveInvoicePaymentHash]);

  useEffect(() => {
    if (!isLncApiReady()) {
      setInvoicePaymentRequest('');
      setInvoicePaymentHash(null);
      setInvoicePreimage(null);
      setPendingInvoice(null);
      setSwapStatus('Idle');
    }
  }, [isLncApiReady]);

  useEffect(() => {
    if (lncError) setErrorMessage(lncError);
  }, [lncError]);

  useEffect(() => {
    if (!selectedSwapIntention) {
      setInvoicePaymentRequest('');
      setInvoicePaymentHash(null);
      setPendingInvoice(null);
      return;
    }

    const pendingForSelected = pendingInvoice && pendingInvoice.dTag === selectedSwapIntention.dTag;
    if (pendingForSelected) {
      setInvoicePaymentRequest(pendingInvoice.paymentRequest);
      setInvoicePaymentHash(pendingInvoice.paymentHash);
      return;
    }

    setInvoicePaymentRequest(selectedSwapIntention.paymentRequest || '');
    setInvoicePaymentHash(selectedSwapIntention.paymentHash || null);

    if (pendingInvoice && pendingInvoice.dTag !== selectedSwapIntention.dTag) {
      setPendingInvoice(null);
    }
  }, [selectedSwapIntention, pendingInvoice]);

  if (!isLncApiReady() || !isConnected) {
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
        handleDisconnectLNC={disconnectLNC}
        connectionErrorLNC={errorMessage || lncError}
        isWeb3Connected={isConnected}
        web3Address={address}
        web3ChainName={currentChain?.name}
        handleConnectWeb3={() => connect({ connector: injected() })}
        isWeb3Connecting={wagmiIsConnecting}
        lncIsPaired={lncIsPaired}
        lncIsConnected={isLncApiReady()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans flex flex-col items-center">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Atomic Swap UI</h1>

      {errorMessage && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative w-full max-w-2xl mb-4" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2">{errorMessage}</span>
        </div>
      )}

      <NostrIdentityDisplay />

      <CreateSwapIntention
        handlePublishSwapIntention={handlePublishSwapIntention}
        nostrPubkey={nostrPubkey}
        swapStatus={swapStatus}
        SWAP_AMOUNT_TAP_SATOSHIS={SWAP_AMOUNT_TAP_SATOSHIS}
        swapAmountBNB={SWAP_AMOUNT_BNB.toString()}
        wantedAsset={wantedAsset}
        setWantedAsset={setWantedAsset}
      />

      <div className="w-full max-w-2xl mt-4 flex items-center gap-2">
        <input
          id="self-accept"
          type="checkbox"
          checked={allowSelfAccept}
          onChange={(e) => setAllowSelfAccept(e.target.checked)}
        />
        <label htmlFor="self-accept" className="text-sm text-gray-700">
          Test mode: allow accepting my own intention
        </label>
      </div>

      <SwapIntentionsList
        setSelectedSwapIntention={setSelectedSwapIntention}
        selectedSwapIntention={selectedSwapIntention}
        setInvoicePaymentRequest={setInvoicePaymentRequest}
        setInvoicePaymentHash={setInvoicePaymentHash}
        setErrorMessage={setErrorMessage}
        setSwapStatus={setSwapStatus}
        evmAddress={address}
        allowSelfAccept={allowSelfAccept}
      />

      {selectedSwapIntention && (
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-8">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Next Step</h2>

          <p className="text-sm text-gray-700 mb-1">
            Selected intention wants: <strong>{selectedWantedAsset || 'BNB'}</strong>
          </p>
          <p className="text-sm text-gray-700 mb-2">
            Current status: <strong>{selectedSwapIntention.status}</strong>
          </p>

          {selectedWantedAsset === 'BNB' && (
            <p className="text-sm text-indigo-700 mb-3">
              Rule: accepter generates invoice, locks BNB, then publishes invoice. Poster pays invoice and claims BNB.
            </p>
          )}
          {selectedWantedAsset === 'TAPROOT_BNB' && (
            <p className="text-sm text-indigo-700 mb-3">
              Rule: poster generates invoice, locks BNB, then publishes invoice. Accepter continues after invoice appears.
            </p>
          )}

          {!isSelectedAccepted && (
            <p className="text-sm text-amber-700 mb-3">
              This intention is still open. Accept it first to unlock invoice and lock steps.
            </p>
          )}

          <button
            onClick={handleGenerateInvoice}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canGenerateInvoice}
          >
            Generate Lightning Invoice
          </button>
          {!!generateInvoiceDisabledReason && (
            <p className="text-xs text-gray-600 mt-2">{generateInvoiceDisabledReason}</p>
          )}

          {pendingInvoiceForSelected && (
            <p className="text-xs text-amber-700 mt-2">
              Invoice is local only. It will be published automatically after successful BNB lock.
            </p>
          )}

          {effectiveInvoicePaymentRequest && (
            <div className="mt-4 p-4 bg-green-50 rounded-md">
              <p className="font-semibold text-green-800">Current invoice:</p>
              <p className="break-all text-sm text-green-700">{effectiveInvoicePaymentRequest}</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">BNB Lock Step</h2>
        <p className="text-sm text-gray-700 mb-2">
          Lock BNB after invoice generation. Invoice is published to Nostr only after this step succeeds.
        </p>
        <button
          onClick={initiateBNBSwap}
          className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!isConnected || !canLockBnb}
        >
          Lock BNB on BSC
        </button>
        {!!lockBnbDisabledReason && (
          <p className="text-xs text-gray-600 mt-2">{lockBnbDisabledReason}</p>
        )}

        {invoicePreimage && (
          <div className="mt-4 p-4 bg-green-50 rounded-md">
            <p className="font-semibold">Preimage:</p>
            <p className="break-all text-sm text-green-800">{invoicePreimage}</p>
          </div>
        )}
      </div>

      <div className="text-lg font-semibold mt-8 p-4 bg-indigo-100 rounded-md text-indigo-800 w-full max-w-2xl">
        Current Swap Status: <span className="font-bold">{swapStatus}</span>
      </div>
    </div>
  );
}

function App() {
  return (
    <NostrProvider>
      <AppContent />
    </NostrProvider>
  );
}

export default App;
