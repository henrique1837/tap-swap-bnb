import React from 'react';
import { useNostr } from '../contexts/NostrContext';
import { nip19 } from 'nostr-tools';

function NostrIdentityDisplay() {
  const { nostrPubkey, isLoadingNostr, disconnectNostr } = useNostr();

  return (
    <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mb-8">
      <h2 className="text-2xl font-semibold text-gray-700 mb-4">Nostr Identity</h2>
      {isLoadingNostr ? (
        <p className="text-blue-500 font-semibold">Deriving Nostr keys from LNC...</p>
      ) : nostrPubkey ? (
        <div className="flex flex-col gap-4">
          <p className="text-green-600 font-semibold">Nostr Connected!</p>
          <p className="text-sm text-gray-600">Pubkey: <span className="break-all">{nostrPubkey}</span></p>
          <p className="text-sm text-gray-600">Npub: <span className="break-all">{nip19.npubEncode(nostrPubkey)}</span></p>
          <button
            onClick={disconnectNostr}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition duration-300"
          >
            Disconnect Nostr
          </button>
        </div>
      ) : (
        <p className="text-red-600 font-semibold">Nostr Disconnected. Will attempt to connect automatically when LNC is ready.</p>
      )}
    </div>
  );
}

export default NostrIdentityDisplay;