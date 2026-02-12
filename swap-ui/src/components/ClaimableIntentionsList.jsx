import React, { useState, useEffect, useCallback } from 'react';
import { useNostr } from '../contexts/NostrContext';
import { nip19 } from 'nostr-tools';

const statusClass = (status) => {
    if (status === 'invoice_ready') return 'text-emerald-600';
    if (status === 'locked') return 'text-purple-600';
    if (status === 'claimed') return 'text-blue-600';
    return 'text-gray-500';
};

const ClaimableIntentionCard = ({ intention, onSelect, isSelected }) => {
    const npub = nip19.npubEncode(intention.pubkey || intention.posterPubkey);
    const acceptedByNpub = intention.acceptedByPubkey ? nip19.npubEncode(intention.acceptedByPubkey) : '';

    return (
        <div
            className={`bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition duration-200 ${isSelected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200'
                }`}
        >
            <div className="flex items-center mb-2 gap-3">
                <h4 className="font-semibold text-gray-800">
                    ID: {intention.dTag?.substring(0, 10)}...
                </h4>
                <span className="ml-auto text-sm text-gray-500">
                    {new Date(intention.created_at * 1000).toLocaleString()}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2 text-sm text-gray-600">
                <p>Poster: {npub.substring(0, 8)}...</p>
                <p>Accepter: {acceptedByNpub.substring(0, 8)}...</p>
            </div>

            <p className="text-gray-700">
                Wants: <strong className="text-indigo-600">{intention.wantedAsset || 'BNB'}</strong>
            </p>
            <p className="text-gray-700">
                Swap <strong className="text-green-600">{intention.amountBNB} BNB</strong>
                {' '}for <strong className="text-yellow-600">{intention.amountSats} sats</strong>
            </p>

            <p className="text-sm text-gray-600 mt-1">
                Status: <span className={`font-medium ${statusClass(intention.status)}`}>{intention.status}</span>
            </p>

            <div className="mt-3 flex gap-2">
                <button
                    onClick={() => onSelect(intention)}
                    className={`py-2 px-3 rounded text-sm font-medium w-full ${isSelected
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                        }`}
                >
                    {isSelected ? 'Processing This Swap' : 'Select to Claim'}
                </button>
            </div>
        </div>
    );
};

function ClaimableIntentionsList({
    setSelectedSwapIntention,
    selectedSwapIntention,
    setErrorMessage,
    setSwapStatus,
    nostrPubkey,
    claimedSwapDTags = []
}) {
    const { fetchSwapIntentions } = useNostr();
    const [swapIntentions, setSwapIntentions] = useState([]);
    const [isFetchingIntentions, setIsFetchingIntentions] = useState(false);

    const fetchAndSetSwapIntentions = useCallback(async () => {
        if (!nostrPubkey) {
            setSwapIntentions([]);
            return;
        }

        setIsFetchingIntentions(true);
        try {
            const fetchedIntentions = await fetchSwapIntentions();
            // Filter intentions where the user is involved as the Claimer/Counterparty
            const claimable = fetchedIntentions.filter(intention => {
                // Filter out if already claimed locally
                if (claimedSwapDTags.includes(intention.dTag)) return false;

                // Determine user role in this intention
                const isPoster = intention.posterPubkey === nostrPubkey || intention.pubkey === nostrPubkey;
                const isAccepter = intention.acceptedByPubkey === nostrPubkey;

                if (!isPoster && !isAccepter) return false; // Not involved

                const wantedAsset = intention.wantedAsset || 'BNB';
                const isClaimer = (wantedAsset === 'BNB' && isPoster) || (wantedAsset === 'TAPROOT_BNB' && isAccepter);

                if (!isClaimer) return false; // User is the Locker, not Claimer

                // Filter by status: must be ready for claiming steps
                // 'invoice_ready' means invoice is published, potentially BNB is locked (or about to be)
                // 'locked' (if we had specific status)
                return ['accepted', 'invoice_ready', 'locked'].includes(intention.status);
            });

            setSwapIntentions(claimable);
        } catch (err) {
            console.error('Error fetching claimable intentions:', err);
            setErrorMessage(`Failed to load intentions: ${err.message || String(err)}`);
        } finally {
            setIsFetchingIntentions(false);
        }
    }, [fetchSwapIntentions, nostrPubkey, setErrorMessage]);

    useEffect(() => {
        fetchAndSetSwapIntentions();
    }, [fetchAndSetSwapIntentions]);

    return (
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-4 mb-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-gray-700">My Claimable Swaps</h2>
                <button
                    onClick={fetchAndSetSwapIntentions}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                    disabled={isFetchingIntentions}
                >
                    {isFetchingIntentions ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {isFetchingIntentions && <p className="text-center text-gray-500">Loading...</p>}

            {!isFetchingIntentions && swapIntentions.length === 0 && (
                <div className="text-center p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p className="text-gray-600">No active swaps found where you need to claim.</p>
                    <p className="text-sm text-gray-500 mt-2">Create or accept a swap first, wait for the counterparty to lock funds.</p>
                </div>
            )}

            <div className="space-y-4">
                {swapIntentions.map((intention) => (
                    <ClaimableIntentionCard
                        key={intention.dTag || intention.id}
                        intention={intention}
                        onSelect={(intent) => {
                            setSelectedSwapIntention(intent);
                            setSwapStatus(`Selected swap ${intent.dTag.substring(0, 8)}... for claiming.`);
                        }}
                        isSelected={selectedSwapIntention?.dTag === intention.dTag}
                    />
                ))}
            </div>
        </div>
    );
}

export default ClaimableIntentionsList;
