import React, { useState, useEffect, useCallback } from 'react';
import { useNostr } from '../contexts/NostrContext';
import { nip19 } from 'nostr-tools';

const statusClass = (status) => {
  if (status === 'invoice_ready') return 'text-emerald-600';
  if (status === 'accepted') return 'text-blue-600';
  if (status === 'open') return 'text-green-600';
  return 'text-gray-500';
};

const SimpleSwapIntentionCard = ({ intention, onSelect, isSelected, onAccept, canAccept }) => {
  const npub = nip19.npubEncode(intention.pubkey || intention.posterPubkey);

  return (
    <div
      className={`bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition duration-200 ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
        }`}
    >
      <div className="flex items-center mb-2 gap-3">
        <h4 className="font-semibold text-gray-800">
          {npub.substring(0, 10) + '...' + npub.substring(npub.length - 4)}
        </h4>
        <span className="ml-auto text-sm text-gray-500">
          {new Date(intention.created_at * 1000).toLocaleString()}
        </span>
      </div>

      <p className="text-gray-700">
        Wants: <strong className="text-indigo-600">{intention.wantedAsset || 'BNB'}</strong>
      </p>
      <p className="text-gray-700">
        Swap <strong className="text-green-600">{intention.amountBNB} BNB</strong>
        {' '}for <strong className="text-yellow-600">{intention.amountSats} sats</strong>
      </p>

      {intention.paymentHash && (
        <p className="text-sm text-gray-600 mt-1 break-all">
          Payment Hash:{' '}
          <code className="bg-gray-100 p-1 rounded text-xs">{intention.paymentHash.substring(0, 14)}...</code>
        </p>
      )}

      <p className="text-sm text-gray-600 mt-1">
        Status: <span className={`font-medium ${statusClass(intention.status)}`}>{intention.status || 'open'}</span>
      </p>

      {intention.status !== 'open' && intention.acceptedByPubkey && (
        <p className="text-sm text-blue-700 mt-1 break-all">
          Accepted by: {nip19.npubEncode(intention.acceptedByPubkey)}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onSelect(intention)}
          className="py-2 px-3 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium"
        >
          {isSelected ? 'Selected' : 'Select'}
        </button>

        {canAccept && intention.status === 'open' && (
          <button
            onClick={() => onAccept(intention)}
            className="py-2 px-3 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Accept
          </button>
        )}
      </div>

      {isSelected && (
        <p className="mt-2 text-blue-600 font-medium">Selected for next swap step</p>
      )}
    </div>
  );
};

function SwapIntentionsList({
  setSelectedSwapIntention,
  selectedSwapIntention,
  setInvoicePaymentRequest,
  setInvoicePaymentHash,
  setErrorMessage,
  setSwapStatus,
  evmAddress,
  allowSelfAccept,
}) {
  const { nostrPubkey, fetchSwapIntentions, acceptSwapIntention } = useNostr();
  const [swapIntentions, setSwapIntentions] = useState([]);
  const [isFetchingIntentions, setIsFetchingIntentions] = useState(false);

  const fetchAndSetSwapIntentions = useCallback(async () => {
    // Guests can fetch intentions too
    setIsFetchingIntentions(true);
    try {
      const fetchedIntentions = await fetchSwapIntentions();
      setSwapIntentions(fetchedIntentions);
    } catch (err) {
      console.error('Error fetching swap intentions:', err);
      setErrorMessage(`Failed to load swap intentions: ${err.message || String(err)}`);
    } finally {
      setIsFetchingIntentions(false);
    }
  }, [fetchSwapIntentions, nostrPubkey, setErrorMessage]);

  useEffect(() => {
    fetchAndSetSwapIntentions();
  }, [fetchAndSetSwapIntentions]);

  const handleSelectIntention = useCallback((intention) => {
    setSelectedSwapIntention(intention);
    setInvoicePaymentRequest(intention.paymentRequest || '');
    setInvoicePaymentHash(intention.paymentHash || null);
    setErrorMessage('');
    setSwapStatus(`Selected intention from ${nip19.npubEncode(intention.pubkey || intention.posterPubkey).substring(0, 10)}...`);
  }, [setSelectedSwapIntention, setInvoicePaymentRequest, setInvoicePaymentHash, setErrorMessage, setSwapStatus]);

  const handleAcceptIntention = useCallback(async (intention) => {
    try {
      setErrorMessage('');
      setSwapStatus('Publishing acceptance to Nostr...');
      await acceptSwapIntention(intention, evmAddress || '');
      setSwapStatus('Intention accepted. Swap can start.');
      await fetchAndSetSwapIntentions();
    } catch (err) {
      console.error('Error accepting intention:', err);
      setErrorMessage(`Failed to accept intention: ${err.message || String(err)}`);
    }
  }, [acceptSwapIntention, evmAddress, fetchAndSetSwapIntentions, setErrorMessage, setSwapStatus]);

  return (
    <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-8">
      <h2 className="text-2xl font-semibold text-gray-700 mb-4">Available Nostr Swap Intentions</h2>
      <p className="text-sm text-gray-600 mb-4">
        Select an intention, or accept one to start the swap flow with the poster.
      </p>

      {allowSelfAccept && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
          Test mode enabled: you can accept your own intentions.
        </p>
      )}

      {!nostrPubkey && (
        <div className="p-4 mb-6 bg-indigo-50 border-l-4 border-indigo-500 rounded-r-lg shadow-sm">
          <p className="text-indigo-800 font-bold flex items-center gap-2">
            <span>👋</span> Exploring as Guest
          </p>
          <p className="text-sm text-indigo-700 mt-1">
            Login to accept swap intentions, or select one to explore the app flow.
          </p>
        </div>
      )}

      <button
        onClick={fetchAndSetSwapIntentions}
        className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition duration-300 disabled:opacity-50"
        disabled={isFetchingIntentions}
      >
        {isFetchingIntentions ? 'Refreshing...' : 'Refresh Intentions'}
      </button>

      {isFetchingIntentions && <p className="mt-4 text-center">Loading swap intentions...</p>}

      <div className="mt-6 space-y-4">
        {swapIntentions.length === 0 && !isFetchingIntentions && (
          <p className="text-gray-700 text-center">No swap intentions found on Nostr.</p>
        )}

        {swapIntentions.map((intention) => {
          const isOwner = nostrPubkey === (intention.posterPubkey || intention.pubkey);
          const canAccept = Boolean(nostrPubkey) && intention.status === 'open' && (!isOwner || allowSelfAccept);

          return (
            <SimpleSwapIntentionCard
              key={intention.dTag || intention.id}
              intention={intention}
              onSelect={handleSelectIntention}
              isSelected={selectedSwapIntention?.dTag === intention.dTag}
              onAccept={handleAcceptIntention}
              canAccept={canAccept}
            />
          );
        })}
      </div>
    </div>
  );
}

export default SwapIntentionsList;
