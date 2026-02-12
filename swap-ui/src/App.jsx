import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWalletClient, usePublicClient, useConnect, useChainId, useChains } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useLNC } from './hooks/useLNC';
import { useTaprootAssets } from './hooks/useTaprootAssets';
import { parseEther } from 'viem';
import { hexToBytes } from 'ethereum-cryptography/utils';
import { Buffer } from 'buffer';

import AtomicSwapBNBArtifact from '../../contracts/artifacts/contracts/AtomicSwapBNB.sol/AtomicSwapBNB.json';
import ConnectScreen from './components/ConnectScreen';

import { NostrProvider, useNostr } from './contexts/NostrContext';
import NostrIdentityDisplay from './components/NostrIdentityDisplay';
import NodeInfo from './components/NodeInfo';
import TaprootAssetSelector from './components/TaprootAssetSelector';
import CreateSwapIntention from './components/CreateSwapIntention';
import SwapIntentionsList from './components/SwapIntentionsList';
import Header from './components/Header';
import Modal from './components/Modal';
import { decode } from 'light-bolt11-decoder';
import InvoiceDecoder from './components/InvoiceDecoder';

const base64ToHex = (base64) => `0x${Buffer.from(base64, 'base64').toString('hex')}`;

const SWAP_AMOUNT_TAP_SATOSHIS = 500;
const SWAP_AMOUNT_BNB = parseEther('0.00015');
const BNB_TIMELOCK_OFFSET = 3600;

const ATOMIC_SWAP_BNB_CONTRACT_ADDRESS = '0x63189b272c97d148a609ed6c3b99075abf0c1693';

// Taproot Assets Configuration
const DEMO_MODE = true; // Set to false in production
const PRODUCTION_ASSET_NAME = 'TAPROOT_BNB'; // The asset to use in production

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

  // Taproot Assets hook
  const {
    assets: taprootAssets,
    isLoading: isLoadingAssets,
    error: assetsError,
    selectedAsset,
    setSelectedAsset,
    fetchAssets,
    createAssetInvoice,
    isTapdAvailable,
    isTapdChannelsAvailable,
  } = useTaprootAssets(lncClient, lncIsConnected);

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

  const [activeTab, setActiveTab] = useState('create');

  // Modal states
  const [isNostrModalOpen, setIsNostrModalOpen] = useState(false);
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);

  // Locally generated invoice that is not yet published to Nostr.
  const [pendingInvoice, setPendingInvoice] = useState(null);

  // Manual invoice input
  const [manualInvoice, setManualInvoice] = useState('');

  // Claimer state (Counterparty)
  const [bnbLockVerified, setBnbLockVerified] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState('');
  const [claimerPreimage, setClaimerPreimage] = useState('');
  const [isPayingInvoice, setIsPayingInvoice] = useState(false);
  const [isClaimingBnb, setIsClaimingBnb] = useState(false);

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

  const claimerRole = selectedWantedAsset === 'BNB' ? 'poster' : 'accepter';
  const isClaimerRoleMatch =
    Boolean(selectedSwapIntention) &&
    ((claimerRole === 'poster' && isSelectedPoster) ||
      (claimerRole === 'accepter' && isSelectedAccepter));

  const pendingInvoiceForSelected = Boolean(
    pendingInvoice && selectedSwapIntention && pendingInvoice.dTag === selectedSwapIntention.dTag,
  );

  const manualInvoiceHash = useMemo(() => {
    if (!manualInvoice) return null;
    try {
      const decoded = decode(manualInvoice);
      const paymentHashSection = decoded.sections.find(s => s.name === 'payment_hash');
      const val = paymentHashSection?.value;
      return val ? (val.startsWith('0x') ? val : `0x${val}`) : null;
    } catch (e) {
      return null;
    }
  }, [manualInvoice]);

  const effectiveInvoicePaymentHash = manualInvoiceHash || (pendingInvoiceForSelected ? pendingInvoice.paymentHash : invoicePaymentHash);
  const effectiveInvoicePaymentRequest = manualInvoice || (pendingInvoiceForSelected ? pendingInvoice.paymentRequest : invoicePaymentRequest);

  const canGenerateInvoice = Boolean(selectedSwapIntention) && isSelectedAccepted && isPublisherRoleMatch;
  const canLockBnb = Boolean(selectedSwapIntention) && isSelectedAccepted && isLockerRoleMatch && Boolean(effectiveInvoicePaymentHash);

  const generateInvoiceDisabledReason = !selectedSwapIntention
    ? 'Select an intention first.'
    : !isSelectedAccepted
      ? 'This intention must be accepted first. Use Accept in Market.'
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

  // Auto move between tabs based on progress.
  useEffect(() => {
    if (!selectedSwapIntention) {
      setActiveTab('create');
      return;
    }

    if (!isSelectedAccepted) {
      setActiveTab('market');
      return;
    }

    setActiveTab('execute');
  }, [selectedSwapIntention, isSelectedAccepted]);

  const tabClass = (key) => `px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === key
    ? 'bg-indigo-600 text-white shadow'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

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

  const createInvoice = async () => {
    if (!isLncApiReady()) {
      setErrorMessage('Lightning Node not connected or not ready via LNC.');
      return null;
    }
    if (!lncClient?.lnd?.lightning) {
      setErrorMessage('Lightning RPC service (LND) not available on LNC client.');
      return null;
    }

    // Check if Taproot Asset Channels is available
    const useTaprootAssets = isTapdChannelsAvailable && selectedAsset;

    if (useTaprootAssets) {
      // Try to create Taproot Asset invoice
      setSwapStatus('Generating Taproot Asset invoice...');
      setErrorMessage('');

      try {
        const invoice = await createAssetInvoice(
          selectedAsset,
          SWAP_AMOUNT_TAP_SATOSHIS,
          `Swap for ${SWAP_AMOUNT_BNB.toString()} BNB (Taproot Asset: ${selectedAsset.name})`
        );

        return invoice;
      } catch (err) {
        console.error('Error creating Taproot Asset invoice:', err);
        setErrorMessage(`Failed to create Taproot Asset invoice: ${err.message || String(err)}. Falling back to regular Lightning invoice.`);
        // Fall through to regular Lightning invoice
      }
    }

    // Fallback to regular Lightning invoice
    setSwapStatus('Generating Lightning invoice (BTC)...');
    setErrorMessage('');

    try {
      const invoiceAmountMsat = SWAP_AMOUNT_TAP_SATOSHIS * 1000;
      const addInvoiceResponse = await lncClient.lnd.lightning.addInvoice({
        valueMsat: invoiceAmountMsat.toString(),
        memo: `Swap for ${SWAP_AMOUNT_BNB.toString()} BNB (via LNC-web)${selectedAsset ? ` - Demo: ${selectedAsset.name}` : ''}`,
        private: true,
      });

      const paymentRequest = addInvoiceResponse.paymentRequest;

      let rHashBase64;
      if (typeof addInvoiceResponse.rHash === 'string') {
        rHashBase64 = addInvoiceResponse.rHash;
      } else {
        rHashBase64 = Buffer.from(addInvoiceResponse.rHash).toString('base64');
      }

      const paymentHash = base64ToHex(rHashBase64);

      return {
        paymentRequest,
        paymentHash,
        assetName: selectedAsset?.name || 'BTC',
        isFallback: !useTaprootAssets,
      };
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

    const invoice = await createInvoice();
    if (!invoice) return;

    setPendingInvoice({ ...invoice, dTag: selectedSwapIntention.dTag });
    setInvoicePaymentRequest(invoice.paymentRequest);
    setInvoicePaymentHash(invoice.paymentHash);

    if (invoice.isFallback) {
      setSwapStatus(`Lightning invoice (BTC) generated. Using regular Lightning instead of Taproot Assets. Now lock BNB. Invoice will be published after lock.`);
    } else {
      setSwapStatus(`Taproot Asset invoice generated (${invoice.assetName}). Now lock BNB. Invoice will be published after lock.`);
    }

    setErrorMessage('');
    setActiveTab('execute');
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
        setSwapStatus('Intention published. Move to Market tab and wait for acceptance.');
        setErrorMessage('');
        setActiveTab('market');
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
      setActiveTab('create');
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
        toggleDarkMode={() => { }}
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
      {/* Header */}
      <Header
        lncIsConnected={lncIsConnected}
        nostrConnected={!!nostrPubkey}
        walletConnected={isConnected}
        walletAddress={address}
        onOpenNostrModal={() => setIsNostrModalOpen(true)}
        onOpenNodeModal={() => setIsNodeModalOpen(true)}
      />

      {/* Modals */}
      <Modal
        isOpen={isNostrModalOpen}
        onClose={() => setIsNostrModalOpen(false)}
        title="Nostr Identity"
      >
        <NostrIdentityDisplay />
      </Modal>

      <Modal
        isOpen={isNodeModalOpen}
        onClose={() => setIsNodeModalOpen(false)}
        title="Lightning Node Info"
      >
        <NodeInfo lncClient={lncClient} isConnected={lncIsConnected} />
      </Modal>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center gap-6">
          {errorMessage && (
            <div className="w-full max-w-4xl bg-red-50 border-l-4 border-red-500 p-4 rounded-lg shadow-md">
              <p className="text-red-700 font-semibold">⚠️ Error: {errorMessage}</p>
            </div>
          )}

          <div className="w-full max-w-2xl mb-4">
            <div className="flex gap-2 border-b pb-3">
              <button className={tabClass('create')} onClick={() => setActiveTab('create')}>1. Create</button>
              <button className={tabClass('market')} onClick={() => setActiveTab('market')}>2. Market</button>
              <button className={tabClass('execute')} onClick={() => setActiveTab('execute')}>3. Execute</button>
            </div>
          </div>

          {activeTab === 'create' && (
            <>
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
            </>
          )}

          {activeTab === 'market' && (
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
          )}

          {activeTab === 'execute' && (
            <>
              {selectedSwapIntention ? (
                <>
                  <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-2">
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
                        This intention is still open. Accept it first in Market tab.
                      </p>
                    )}

                    <button
                      onClick={handleGenerateInvoice}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!canGenerateInvoice}
                    >
                      Generate Taproot Asset Invoice
                    </button>
                    {!!generateInvoiceDisabledReason && (
                      <p className="text-xs text-gray-600 mt-2">{generateInvoiceDisabledReason}</p>
                    )}

                    {!selectedAsset && isTapdAvailable && (
                      <p className="text-xs text-amber-600 mt-2">Please select a Taproot Asset above before generating invoice.</p>
                    )}

                    {!isTapdChannelsAvailable && isTapdAvailable && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-300 rounded-md">
                        <p className="text-xs text-blue-800">
                          <span className="font-semibold">ℹ️ LNC Limitation:</span> Taproot Asset Channels are not yet supported via LNC.
                          Regular Lightning (BTC) invoices will be used instead.
                          In the future, this will be updated to use Taproot Assets Lightning transactions.
                          See tests in the contracts folder for Taproot Assets implementation.
                        </p>
                      </div>
                    )}

                    {!isTapdAvailable && (
                      <p className="text-xs text-red-600 mt-2">Taproot Assets daemon not available. Make sure tapd is running with your LND node.</p>
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

                  {/* Generated Invoice Decoder */}
                  {effectiveInvoicePaymentRequest && (
                    <div className="mt-6 w-full max-w-2xl">
                      <InvoiceDecoder
                        invoice={effectiveInvoicePaymentRequest}
                        title="Generated Invoice Details"
                      />
                    </div>
                  )}

                  {/* Manual Invoice Input */}
                  <div className="mt-8 bg-white p-6 rounded-lg shadow-md border border-gray-200 w-full max-w-2xl">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <span>📝</span> Or Paste Invoice Manually
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      If you have an invoice from another source, paste it here to decode and view details.
                    </p>
                    <textarea
                      value={manualInvoice}
                      onChange={(e) => setManualInvoice(e.target.value)}
                      placeholder="lnbc... or lnbcrt... (paste Lightning invoice here)"
                      className="w-full p-3 border border-gray-300 rounded-lg font-mono text-sm resize-vertical min-h-[100px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    {manualInvoice && (
                      <button
                        onClick={() => setManualInvoice('')}
                        className="mt-2 text-sm text-gray-600 hover:text-gray-800 underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Manual Invoice Decoder */}
                  {manualInvoice && (
                    <div className="mt-6 w-full max-w-2xl">
                      <InvoiceDecoder
                        invoice={manualInvoice}
                        title="Pasted Invoice Details"
                      />
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
                </>
              ) : (
                <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-2">
                  <p className="text-gray-700">No intention selected yet. Go to Market tab and select one.</p>
                </div>
              )}
            </>
          )
          }

          <div className="text-lg font-semibold mt-8 p-4 bg-indigo-100 rounded-md text-indigo-800 w-full max-w-2xl">
            Current Swap Status: <span className="font-bold">{swapStatus}</span>
          </div>
        </div >
      </div >
    </div >
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
