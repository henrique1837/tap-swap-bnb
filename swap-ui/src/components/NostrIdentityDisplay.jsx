import React from 'react';
import { useNostr } from '../contexts/NostrContext';
import { nip19 } from 'nostr-tools';

function NostrIdentityDisplay() {
  const { nostrPubkey, isLoadingNostr } = useNostr();

  return (
    <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl mb-8">
      <h2 className="text-2xl font-semibold text-gray-700 mb-4">Nostr Identity</h2>
      {isLoadingNostr ? (
        <p className="text-blue-500 font-semibold">Deriving Nostr keys from LNC...</p>
      ) : nostrPubkey ? (
        <div className="flex flex-col gap-2">
          <p className="text-green-600 font-semibold">Nostr Connected!</p>
          <p className="text-sm text-gray-600">Pubkey: <span className="break-all">{nostrPubkey}</span></p>
          <p className="text-sm text-gray-600">Npub: <span className="break-all">{nip19.npubEncode(nostrPubkey)}</span></p>
          <p className="text-xs text-gray-500 mt-1">
            Nostr identity follows your LNC session automatically.
          </p>
        </div>
      ) : (
        <p className="text-red-600 font-semibold">Nostr Disconnected. It will reconnect automatically when LNC is ready.</p>
      )}
    </div>
  );
}

export default NostrIdentityDisplay;
