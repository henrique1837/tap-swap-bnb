import React from 'react';

function CreateSwapIntention({
  handlePublishSwapIntention,
  nostrPubkey,
  swapStatus,
  SWAP_AMOUNT_TAP_SATOSHIS,
  swapAmountBNB,
  wantedAsset,
  setWantedAsset,
}) {
  return (
    <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mt-8">
      <h2 className="text-2xl font-semibold text-gray-700 mb-4">1. Publish Intention on Nostr</h2>
      <p className="text-sm text-gray-600 mb-2">
        First phase is Nostr-only communication. Post your intention and wait for another user to accept.
      </p>

      <div className="mb-4 p-4 bg-gray-50 rounded-md">
        <p className="text-sm text-gray-700"><strong>You offer:</strong> {swapAmountBNB} BNB</p>
        <p className="text-sm text-gray-700"><strong>You request:</strong> {SWAP_AMOUNT_TAP_SATOSHIS} sats equivalent</p>
      </div>

      <label className="block text-sm text-gray-700 mb-2 font-medium" htmlFor="wanted-asset">
        I want to receive
      </label>
      <select
        id="wanted-asset"
        value={wantedAsset}
        onChange={(e) => setWantedAsset(e.target.value)}
        className="w-full p-3 mb-4 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="BNB">BNB</option>
        <option value="TAPROOT_BNB">Taproot BNB</option>
      </select>

      <button
        onClick={handlePublishSwapIntention}
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!nostrPubkey || swapStatus.includes('Publishing')}
      >
        Publish My Swap Intention
      </button>
    </div>
  );
}

export default CreateSwapIntention;
