import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWalletClient, usePublicClient, useConnect, useChainId, useChains, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useLNC } from './hooks/useLNC';
import { useTaprootAssets } from './hooks/useTaprootAssets';
import { parseEther } from 'viem';
import { hexToBytes } from 'ethereum-cryptography/utils';
import { Buffer } from 'buffer';

import AtomicSwapBNBArtifact from '../artifacts/contracts/AtomicSwapBNB.sol/AtomicSwapBNB.json';
import ConnectScreen from './components/ConnectScreen';

import { NostrProvider, useNostr } from './contexts/NostrContext';
import NostrIdentityDisplay from './components/NostrIdentityDisplay';
import NodeInfo from './components/NodeInfo';
import TaprootAssetSelector from './components/TaprootAssetSelector';
import CreateSwapIntention from './components/CreateSwapIntention';
import SwapIntentionsList from './components/SwapIntentionsList';
import ClaimableIntentionsList from './components/ClaimableIntentionsList';
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
  const { disconnect: disconnectWeb3 } = useDisconnect();

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
    nostrPrivkey,
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
  const [claimedSwapDTags, setClaimedSwapDTags] = useState([]);

  // Modal states
  const [isNostrModalOpen, setIsNostrModalOpen] = useState(false);
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(!lncIsConnected || !isConnected);

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
  const [invoiceMethod, setInvoiceMethod] = useState('manual');

  // Set default method to LNC if it becomes available
  useEffect(() => {
    if (lncIsConnected) {
      setInvoiceMethod('lnc');
    } else {
      setInvoiceMethod('manual');
    }
  }, [lncIsConnected]);

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

  // Auto move between tabs removed to prevent conflicts with Claim tab.
  // Tab switching is now handled explicitly in onSelect handlers.

  const tabClass = (key) => `px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === key
    ? 'bg-indigo-600 text-white shadow'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

  // ...



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

  const verifyBNBLock = async () => {
    if (!selectedSwapIntention || !selectedSwapIntention.paymentHash) {
      setErrorMessage('No payment hash to verify.');
      return;
    }
    setBnbLockVerified(false);
    setErrorMessage('');
    setSwapStatus('Verifying BNB Lock on BSC...');

    try {
      let hash = selectedSwapIntention.paymentHash;
      // Handle Base64 hash (44 chars) which might come from Nostr/LNC
      // 32 bytes = 44 chars in Base64, 64 chars in Hex.
      const raw = hash.startsWith('0x') ? hash.slice(2) : hash;

      if (raw.length === 44) {
        hash = `0x${Buffer.from(raw, 'base64').toString('hex')}`;
      } else if (raw.length === 88) {
        // Handle Hex-encoded ASCII of Base64 (Double encoded)
        const ascii = Buffer.from(raw, 'hex').toString('utf8');
        hash = `0x${Buffer.from(ascii, 'base64').toString('hex')}`;
      } else if (!hash.startsWith('0x')) {
        hash = `0x${hash}`;
      }

      const swapData = await publicClient.readContract({
        address: contractAddress,
        abi: AtomicSwapBNBArtifact.abi,
        functionName: 'swaps',
        args: [hash],
      });

      // Swap struct: value, sender, hashlock, timelock, claimed, refunded
      // Returns an array-like result
      const amount = swapData[0];
      const timelock = swapData[3];
      const isClaimed = swapData[4];
      const isRefunded = swapData[5];

      if (amount > 0n && !isClaimed && !isRefunded) {
        setBnbLockVerified(true);
        setSwapStatus('BNB Lock Verified! Contract holds funds. You can safely pay the invoice now.');
      } else {
        if (amount === 0n) setErrorMessage('BNB not locked yet (amount is 0).');
        else if (isClaimed) setErrorMessage('BNB already claimed.');
        else if (isRefunded) setErrorMessage('BNB already refunded.');
        setSwapStatus('BNB Lock Verification Failed.');
      }

    } catch (err) {
      console.error('Error verifying BNB lock:', err);
      setErrorMessage(err.message || 'Failed to verify BNB lock.');
      setSwapStatus('Verification Error');
    }
  };

  const handlePayInvoice = async () => {
    if (!effectiveInvoicePaymentRequest) return;
    if (!isLncApiReady()) {
      setErrorMessage('LNC not ready. Please pay manually and enter preimage.');
      return;
    }

    setIsPayingInvoice(true);
    setErrorMessage('');
    setSwapStatus('Paying invoice via LNC...');

    try {
      const response = await lncClient.lnd.lightning.sendPaymentSync({
        payment_request: effectiveInvoicePaymentRequest
      });

      if (response.paymentError) {
        throw new Error(response.paymentError);
      }

      let preimageHex = '';
      if (typeof response.paymentPreimage === 'string') {
        const preimageStr = response.paymentPreimage;
        // Check if base64 or hex. Base64 32 bytes = 44 chars. Hex = 64 chars.
        if (preimageStr.length === 64 && /^[0-9a-fA-F]+$/.test(preimageStr)) {
          preimageHex = preimageStr;
        } else {
          preimageHex = Buffer.from(preimageStr, 'base64').toString('hex');
        }
      } else if (response.paymentPreimage) {
        preimageHex = Buffer.from(response.paymentPreimage).toString('hex');
      }

      if (!preimageHex) {
        throw new Error('No preimage received in payment response.');
      }

      setClaimerPreimage(preimageHex);
      setSwapStatus('Invoice paid! Preimage received. You can now claim BNB.');
    } catch (err) {
      console.error('LNC Payment failed:', err);
      setErrorMessage(`LNC Payment failed: ${err.message || String(err)}`);
      setSwapStatus('Payment Failed');
    } finally {
      setIsPayingInvoice(false);
    }
  };

  const handleClaimBNB = async () => {
    if (!claimerPreimage) {
      setErrorMessage('Preimage required to claim BNB.');
      return;
    }
    setIsClaimingBnb(true);
    setErrorMessage('');
    setSwapStatus('Claiming BNB on BSC...');

    try {
      const secret = claimerPreimage.startsWith('0x') ? claimerPreimage : `0x${claimerPreimage}`;

      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: AtomicSwapBNBArtifact.abi,
        functionName: 'claimSwap',
        args: [secret],
        account: address,
      });

      setClaimTxHash(hash);
      setSwapStatus('Claim transaction sent! Waiting for confirmation...');

      await publicClient.waitForTransactionReceipt({ hash });

      setSwapStatus('BNB Claimed Successfully! Swap Completed.');
      setClaimedSwapDTags(prev => [...prev, selectedSwapIntention.dTag]);
    } catch (err) {
      console.error('Error claiming BNB:', err);
      setErrorMessage(`Failed to claim BNB: ${err.message || String(err)}`);
      setSwapStatus('Claim Error');
    } finally {
      setIsClaimingBnb(false);
    }
  };

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

  const handleClaimerGenerateInvoice = async () => {
    if (!canGenerateInvoice) {
      setErrorMessage('Role mismatch: You cannot generate invoice for this swap.');
      return;
    }
    setSwapStatus('Generating Lightning Invoice via LNC...');
    const invoice = await createInvoice();
    if (!invoice) return;

    setSwapStatus('Publishing Invoice to Nostr...');
    try {
      await publishInvoiceForIntention(selectedSwapIntention, invoice, address);
      setInvoicePaymentRequest(invoice.paymentRequest);
      setInvoicePaymentHash(invoice.paymentHash);
      setSwapStatus('Invoice Published! Now wait for Counterparty to lock BNB.');
      // Refresh list to update status? We might need to manually trigger fetch or wait for subscription.
    } catch (err) {
      setErrorMessage(`Failed to publish invoice: ${err.message}`);
    }
  };

  const handleClaimerSubmitInvoice = async () => {
    if (!manualInvoice || !effectiveInvoicePaymentHash) {
      setErrorMessage('Invalid invoice provided.');
      return;
    }
    setSwapStatus('Publishing Manual Invoice to Nostr...');
    try {
      const invoiceData = {
        paymentRequest: manualInvoice,
        paymentHash: effectiveInvoicePaymentHash
      };
      await publishInvoiceForIntention(selectedSwapIntention, invoiceData, address);
      setSwapStatus('Invoice Published! Now wait for Counterparty to lock BNB.');
      setManualInvoice(''); // Clear input
    } catch (err) {
      setErrorMessage(`Failed to publish invoice: ${err.message}`);
    }
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
      setManualInvoice('');
      setInvoiceMethod(lncIsConnected ? 'lnc' : 'manual');
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

  const handleGlobalLogout = useCallback(() => {
    disconnectLNC();
    disconnectWeb3();
    setIsConnectModalOpen(true);
  }, [disconnectLNC, disconnectWeb3]);



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
        onOpenConnectModal={lncIsConnected && isConnected ? handleGlobalLogout : () => setIsConnectModalOpen(true)}
      />

      {/* Modals */}
      <Modal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        title="Welcome to Atomic Swap"
      >
        <ConnectScreen
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
          lncIsConnected={lncIsConnected}
          onExploreAsGuest={() => setIsConnectModalOpen(false)}
        />
      </Modal>

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
        <NodeInfo
          lncClient={lncClient}
          isConnected={lncIsConnected}
        />
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
              <button className={tabClass('execute')} onClick={() => setActiveTab('execute')}>3. Lock (Execute)</button>
              <button className={tabClass('claim')} onClick={() => setActiveTab('claim')}>4. Claim</button>
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
              setSelectedSwapIntention={(intention) => {
                setSelectedSwapIntention(intention);
                setActiveTab('execute');
              }}
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

                    {/* Close Shared Next Step Card */}
                  </div>

                  {/* LOCKER ROLE UI */}
                  {isLockerRoleMatch && (
                    <>
                      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-2">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                          <span>⚡</span> Choose Invoice Method
                        </h3>

                        <div className="flex p-1 bg-gray-100 rounded-lg mb-6">
                          <button
                            onClick={() => setInvoiceMethod('lnc')}
                            disabled={!lncIsConnected}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${invoiceMethod === 'lnc'
                              ? 'bg-white text-indigo-600 shadow-sm'
                              : 'text-gray-500 hover:text-gray-700'
                              } ${!lncIsConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            LNC (Auto)
                          </button>
                          <button
                            onClick={() => setInvoiceMethod('manual')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${invoiceMethod === 'manual'
                              ? 'bg-white text-indigo-600 shadow-sm'
                              : 'text-gray-500 hover:text-gray-700'
                              }`}
                          >
                            Manual (Polar/External)
                          </button>
                        </div>

                        {invoiceMethod === 'lnc' ? (
                          <div className="space-y-4">
                            <button
                              onClick={handleGenerateInvoice}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                              disabled={!canGenerateInvoice}
                            >
                              Generate Lightning/Taproot Invoice
                            </button>
                            {!!generateInvoiceDisabledReason && (
                              <p className="text-xs text-gray-600 text-center">{generateInvoiceDisabledReason}</p>
                            )}

                            {!selectedAsset && isTapdAvailable && (
                              <p className="text-xs text-amber-600 text-center">Please select a Taproot Asset above before generating invoice.</p>
                            )}

                            {!isTapdChannelsAvailable && isTapdAvailable && (
                              <div className="p-3 bg-blue-50 border border-blue-300 rounded-md">
                                <p className="text-xs text-blue-800">
                                  <span className="font-semibold">ℹ️ LNC Limitation:</span> Taproot Asset Channels are not yet supported via LNC.
                                  Regular Lightning (BTC) invoices will be used instead.
                                </p>
                              </div>
                            )}

                            {!isTapdAvailable && (
                              <p className="text-xs text-red-600 text-center">Taproot Assets daemon not available.</p>
                            )}

                            {pendingInvoiceForSelected && (
                              <p className="text-xs text-amber-700 text-center italic">
                                Invoice is local. It will be published after BNB lock.
                              </p>
                            )}

                            {effectiveInvoicePaymentRequest && !manualInvoice && (
                              <div className="mt-4 p-4 bg-green-50 rounded-md border border-green-100">
                                <p className="font-semibold text-green-800 text-sm mb-1 text-center">✅ Invoice Ready</p>
                                <InvoiceDecoder
                                  invoice={effectiveInvoicePaymentRequest}
                                  title="LNC Invoice Details"
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <p className="text-sm text-gray-600">
                              Paste an invoice from Polar or another wallet to continue.
                            </p>
                            <textarea
                              value={manualInvoice}
                              onChange={(e) => setManualInvoice(e.target.value)}
                              placeholder="lnbc... or lnbcrt..."
                              className="w-full p-4 border border-gray-300 rounded-lg font-mono text-sm resize-none min-h-[120px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                            {manualInvoice && (
                              <div className="flex justify-between items-center">
                                <button
                                  onClick={() => setManualInvoice('')}
                                  className="text-sm text-red-600 hover:text-red-800 underline transition"
                                >
                                  Clear Invoice
                                </button>
                                <span className="text-xs text-gray-500">Invoice detected ({manualInvoice.length} chars)</span>
                              </div>
                            )}

                            {manualInvoice && (
                              <div className="mt-4">
                                <InvoiceDecoder
                                  invoice={manualInvoice}
                                  title="Pasted Invoice Details"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* BNB Lock Step - Always visible if an invoice hash is available */}
                      <div className={`bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-6 border-2 transition ${effectiveInvoicePaymentHash ? 'border-orange-100 opacity-100' : 'border-gray-100 opacity-50'}`}>
                        <h2 className="text-2xl font-semibold text-gray-700 mb-4 flex items-center gap-2">
                          <span>🔒</span> Final Step: Lock BNB
                        </h2>
                        <p className="text-sm text-gray-600 mb-6">
                          Once you have an invoice (via LNC or Manual paste), lock the BNB on-chain to continue the swap.
                        </p>
                        <button
                          onClick={initiateBNBSwap}
                          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-6 rounded-xl transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                          disabled={!isConnected || !canLockBnb}
                        >
                          Send Transaction: Lock BNB on BSC
                        </button>
                        {!!lockBnbDisabledReason && (
                          <p className="text-xs text-amber-700 mt-3 text-center bg-amber-50 p-2 rounded">{lockBnbDisabledReason}</p>
                        )}

                        {invoicePreimage && (
                          <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                            <p className="font-bold text-green-800 flex items-center gap-1">✨ Preimage Revealed:</p>
                            <p className="break-all text-xs text-green-700 font-mono mt-1">{invoicePreimage}</p>
                            <p className="text-[10px] text-green-600 mt-2 italic">Locker: Use this preimage to claim the wanted asset (Taproot/BTC) on Lightning.</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}


                </>
              ) : (
                <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-2">
                  <p className="text-gray-700">No intention selected yet. Go to Market tab and select one.</p>
                </div>
              )}
            </>
          )}

          {activeTab === 'claim' && (
            <>
              <ClaimableIntentionsList
                setSelectedSwapIntention={setSelectedSwapIntention}
                selectedSwapIntention={selectedSwapIntention}
                setErrorMessage={setErrorMessage}
                setSwapStatus={setSwapStatus}
                nostrPubkey={nostrPubkey}
                claimedSwapDTags={claimedSwapDTags}
              />

              {selectedSwapIntention && (
                <>
                  {isClaimerRoleMatch ? (
                    <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-8 border-l-4 border-purple-500">
                      <h2 className="text-2xl font-semibold text-gray-800 mb-4">Counterparty Actions</h2>

                      {/* Step 0: Provide Payment Invoice */}
                      {selectedSwapIntention.status === 'accepted' && (
                        <div className="mb-8 p-6 rounded-xl border border-indigo-100 bg-indigo-50/50 shadow-sm">
                          <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                            <span>0️⃣</span> Provide Payment Invoice
                          </h3>
                          <p className="text-sm text-gray-600 mb-6">
                            Provide a Lightning invoice for <strong className="text-indigo-700">{selectedSwapIntention.amountSats} sats</strong> to continue.
                          </p>

                          <div className="flex p-1 bg-white/50 backdrop-blur-sm rounded-lg mb-6 border border-indigo-100">
                            <button
                              onClick={() => setInvoiceMethod('lnc')}
                              disabled={!lncIsConnected}
                              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${invoiceMethod === 'lnc'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                } ${!lncIsConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              LNC (Auto)
                            </button>
                            <button
                              onClick={() => setInvoiceMethod('manual')}
                              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${invoiceMethod === 'manual'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                              Manual Paste
                            </button>
                          </div>

                          {invoiceMethod === 'lnc' ? (
                            <div className="space-y-4">
                              <p className="text-xs text-indigo-600 mb-2">Generate and publish an invoice automatically using your connected LNC node.</p>
                              <button
                                onClick={handleClaimerGenerateInvoice}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-md"
                              >
                                Generate & Publish (LNC)
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Manual Invoice (lnbc...)</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={manualInvoice}
                                  onChange={(e) => setManualInvoice(e.target.value)}
                                  placeholder="lnbc..."
                                  className="flex-1 p-3 border border-indigo-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                />
                                <button
                                  onClick={handleClaimerSubmitInvoice}
                                  disabled={!manualInvoice || !effectiveInvoicePaymentHash}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50 transition duration-200 shadow-md"
                                >
                                  Submit
                                </button>
                              </div>
                              {manualInvoice && effectiveInvoicePaymentHash && (
                                <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                                  <span>✅</span> Valid invoice: {effectiveInvoicePaymentHash.substring(0, 10)}...
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Step 1: Verify BNB Lock */}
                      <div className="mb-6">
                        <h3 className="text-lg font-medium text-gray-700 mb-2">1. Verify BNB Lock</h3>
                        <p className="text-sm text-gray-600 mb-2">Check if the BNB has been locked on the contract.</p>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={verifyBNBLock}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition duration-200"
                          >
                            Verify Lock
                          </button>
                          {bnbLockVerified && <span className="text-green-600 font-bold flex items-center gap-1">✅ Verified</span>}
                        </div>
                      </div>

                      {/* Step 2: Pay Invoice */}
                      <div className={`mb-6 p-4 rounded-lg border transition duration-200 ${bnbLockVerified ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-50'}`}>
                        <h3 className="text-lg font-medium text-gray-700 mb-2">2. Pay Invoice</h3>
                        {!bnbLockVerified && <p className="text-xs text-amber-600 mb-2">Please verify lock first.</p>}

                        {effectiveInvoicePaymentRequest ? (
                          <div className="space-y-4">
                            <InvoiceDecoder invoice={effectiveInvoicePaymentRequest} title="Invoice to Pay" />

                            <div className="flex flex-col gap-2">
                              <button
                                onClick={handlePayInvoice}
                                disabled={!bnbLockVerified || !isLncApiReady() || isPayingInvoice}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md disabled:opacity-50 transition duration-200"
                              >
                                {isPayingInvoice ? 'Paying...' : 'Pay with LNC (Auto Claim)'}
                              </button>
                              {!isLncApiReady() && <p className="text-xs text-red-500">LNC not connected.</p>}

                              <div className="mt-2 border-t pt-2">
                                <p className="text-xs text-gray-500 mb-1">Or enter preimage manually (if paid externally):</p>
                                <input
                                  type="text"
                                  value={claimerPreimage}
                                  onChange={(e) => setClaimerPreimage(e.target.value)}
                                  placeholder="Preimage Hex (32 bytes)"
                                  className="w-full p-2 border rounded text-sm font-mono focus:ring-2 focus:ring-purple-500 outline-none"
                                  disabled={!bnbLockVerified}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-gray-100 rounded text-center">
                            <p className="text-sm text-gray-500">Waiting for invoice...</p>
                          </div>
                        )}
                      </div>

                      {/* Step 3: Claim BNB */}
                      <div className={`mb-6 p-4 rounded-lg border transition duration-200 ${claimerPreimage ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 opacity-50'}`}>
                        <h3 className="text-lg font-medium text-gray-700 mb-2">3. Claim BNB</h3>
                        <p className="text-sm text-gray-600 mb-2">Use the preimage to claim the locked BNB.</p>

                        <button
                          onClick={handleClaimBNB}
                          disabled={!claimerPreimage || isClaimingBnb}
                          className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-md font-bold disabled:opacity-50 transition duration-200 w-full"
                        >
                          {isClaimingBnb ? 'Claiming...' : 'Claim BNB'}
                        </button>

                        {claimTxHash && (
                          <div className="mt-2 p-2 bg-white rounded border border-green-200">
                            <p className="text-xs text-green-700 break-all">Tx: {claimTxHash}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-2">
                      <p className="text-gray-700">Argument mismatch: Selected intention is not claimable by you (role mismatch).</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}

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
