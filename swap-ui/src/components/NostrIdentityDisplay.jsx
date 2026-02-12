import React, { useState } from 'react';
import { useNostr } from '../contexts/NostrContext';
import { nip19 } from 'nostr-tools';

function NostrIdentityDisplay() {
  const { nostrPubkey, isLoadingNostr } = useNostr();
  const [copiedField, setCopiedField] = useState(null);

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field, label }) => (
    <button
      onClick={() => copyToClipboard(text, field)}
      className="ml-2 px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-xs rounded-md transition duration-200 flex items-center gap-1"
      title={`Copy ${label}`}
    >
      {copiedField === field ? (
        <>
          <span>✓</span>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <span>📋</span>
          <span>Copy</span>
        </>
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      {isLoadingNostr ? (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-blue-700 font-semibold">Deriving Nostr keys from LNC...</p>
        </div>
      ) : nostrPubkey ? (
        <div className="space-y-4">
          {/* Status Banner */}
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <p className="text-green-700 font-semibold">Nostr Connected!</p>
          </div>

          {/* Public Key */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Public Key (Hex)</label>
              <CopyButton text={nostrPubkey} field="pubkey" label="Public Key" />
            </div>
            <p className="text-sm text-gray-800 font-mono break-all bg-white p-3 rounded border border-gray-300">
              {nostrPubkey}
            </p>
          </div>

          {/* Npub */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Npub (Bech32)</label>
              <CopyButton text={nip19.npubEncode(nostrPubkey)} field="npub" label="Npub" />
            </div>
            <p className="text-sm text-gray-800 font-mono break-all bg-white p-3 rounded border border-gray-300">
              {nip19.npubEncode(nostrPubkey)}
            </p>
          </div>

          {/* Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">ℹ️ Note:</span> Your Nostr identity is automatically derived from your LNC session.
              It will persist across sessions as long as you use the same LNC connection.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 font-semibold">⚠️ Nostr Disconnected</p>
          <p className="text-sm text-red-600 mt-2">
            Your Nostr identity will be automatically derived when LNC is connected and ready.
          </p>
        </div>
      )}
    </div>
  );
}

export default NostrIdentityDisplay;
