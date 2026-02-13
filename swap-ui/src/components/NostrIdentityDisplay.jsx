import React, { useState } from 'react';
import { useNostr } from '../contexts/NostrContext';
import { nip19 } from 'nostr-tools';

function NostrIdentityDisplay() {
  const { nostrPubkey, nostrPrivkey, isLoadingNostr } = useNostr();
  const [copiedField, setCopiedField] = useState(null);
  const [showPrivKey, setShowPrivKey] = useState(false);

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const privKeyHex = nostrPrivkey ? Buffer.from(nostrPrivkey).toString('hex') : '';
  const nsec = nostrPrivkey ? nip19.nsecEncode(nostrPrivkey) : '';

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
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg shadow-sm">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <p className="text-green-700 font-semibold">Nostr Identity Ready</p>
          </div>

          {/* Public Key Info */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Public Key (Hex)</label>
              <CopyButton text={nostrPubkey} field="pubkey" label="Public Key" />
            </div>
            <p className="text-xs text-gray-800 font-mono break-all bg-white p-3 rounded border border-gray-300">
              {nostrPubkey}
            </p>

            <div className="flex items-center justify-between mt-4 mb-2">
              <label className="text-sm font-semibold text-gray-700">Npub (Bech32)</label>
              <CopyButton text={nip19.npubEncode(nostrPubkey)} field="npub" label="Npub" />
            </div>
            <p className="text-xs text-gray-800 font-mono break-all bg-white p-3 rounded border border-gray-300">
              {nip19.npubEncode(nostrPubkey)}
            </p>
          </div>

          {/* Private Key Info - High Security */}
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-amber-800 flex items-center gap-2">
                <span>🔐</span> Private Key (Secret)
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPrivKey(!showPrivKey)}
                  className="text-xs bg-amber-200 hover:bg-amber-300 text-amber-800 px-2 py-1 rounded transition"
                >
                  {showPrivKey ? 'Hide' : 'Reveal'}
                </button>
                {showPrivKey && <CopyButton text={nsec} field="nsec" label="Nsec" />}
              </div>
            </div>
            {showPrivKey ? (
              <div className="space-y-3">
                <p className="text-[10px] text-amber-700 uppercase font-bold">Nsec format:</p>
                <p className="text-xs text-red-600 font-mono break-all bg-white p-2 rounded border border-amber-300">
                  {nsec}
                </p>
                <p className="text-[10px] text-amber-700 uppercase font-bold">Hex format:</p>
                <p className="text-xs text-red-600 font-mono break-all bg-white p-2 rounded border border-amber-300">
                  {privKeyHex}
                </p>
              </div>
            ) : (
              <div className="h-10 bg-amber-100/50 rounded border border-dashed border-amber-300 flex items-center justify-center">
                <p className="text-xs text-amber-600 italic">Click reveal to see your private key</p>
              </div>
            )}
            <p className="text-[10px] text-amber-600 mt-3 leading-tight">
              <strong>WARNING:</strong> Never share your private key. Anyone with this key can control your Nostr identity and swap history.
            </p>
          </div>

          {/* Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800 leading-relaxed">
              <span className="font-semibold">ℹ️ Deterministic Identity:</span> Your keys are derived from your LNC session signature.
              This means as long as you use the same Lightning wallet to sign, you'll have the same identity.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
          <p className="text-red-700 font-bold text-lg mb-2">⚠️ Identity Not Found</p>
          <p className="text-sm text-red-600">
            Please connect your Lightning Node (LNC) first. Your identity will be derived automatically.
          </p>
        </div>
      )}
    </div>
  );
}

export default NostrIdentityDisplay;
