import React from 'react';

function ConnectScreen({
  pairingPhrase,
  setPairingPhrase,
  lncPassword,
  setLncPassword,
  isConnectingLNC,
  handleConnectLNCWithPairing,
  handleLoginLNCWithPassword,
  handleDisconnectLNC,
  connectionErrorLNC,
  isWeb3Connected,
  web3Address,
  web3ChainName,
  handleConnectWeb3,
  isWeb3Connecting,
  lncIsPaired,
  lncIsConnected,
  onExploreAsGuest,
}) {
  const themeClass = 'light text-gray-800';

  const onLncConnect = () => {
    if (lncIsPaired) {
      handleLoginLNCWithPassword(lncPassword);
    } else {
      handleConnectLNCWithPairing(pairingPhrase, lncPassword);
    }
  };

  return (
    <div className={`p-1 ${themeClass}`}>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white text-center w-full">Connection Center</h1>
      </div>

      {/* LNC Connection Section */}
      <div className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/30">
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
          <span>⚡</span> Lightning Node (LNC)
        </h2>
        {isConnectingLNC ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="ml-3 text-blue-600 dark:text-blue-400">Connecting...</p>
          </div>
        ) : lncIsConnected ? (
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <p className="text-green-600 dark:text-green-400 font-semibold mb-3 flex items-center">
              Connected! <span className="ml-2 text-xl">✅</span>
            </p>
            <button
              onClick={handleDisconnectLNC}
              className="w-full py-2 px-4 rounded-md text-white font-medium transition duration-300 bg-red-500 hover:bg-red-600 shadow-sm"
            >
              Disconnect Node
            </button>
          </div>
        ) : lncIsPaired ? (
          <>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Enter password to reconnect to your paired Lightning Node:
            </p>
            <input
              type="password"
              value={lncPassword}
              onChange={setLncPassword}
              placeholder="LNC Password"
              className="w-full p-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={isConnectingLNC}
            />
            <button
              onClick={onLncConnect}
              className={`w-full py-2 px-4 rounded-md text-white font-medium transition duration-300 ${lncPassword && !isConnectingLNC
                ? 'bg-blue-600 hover:bg-blue-700 shadow-md'
                : 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed opacity-50'
                }`}
              disabled={!lncPassword || isConnectingLNC}
            >
              Login to Node
            </button>
            <button
              onClick={handleDisconnectLNC}
              className="mt-2 w-full py-1 px-4 text-xs text-gray-500 hover:text-red-500 transition duration-300"
            >
              Forget and Pair New Node
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-3 italic">Pair your node once using a phrase from Terminal/Polar.</p>
            <input
              type="text"
              value={pairingPhrase}
              onChange={setPairingPhrase}
              placeholder="Pairing Phrase"
              className="w-full p-2 mb-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={isConnectingLNC}
            />
            <input
              type="password"
              value={lncPassword}
              onChange={setLncPassword}
              placeholder="Set Session Password"
              className="w-full p-2 mb-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={isConnectingLNC}
            />
            <button
              onClick={onLncConnect}
              className={`w-full py-2 px-4 rounded-md text-white font-medium transition duration-300 ${pairingPhrase && lncPassword && !isConnectingLNC
                ? 'bg-blue-600 hover:bg-blue-700 shadow-md'
                : 'bg-gray-300 cursor-not-allowed opacity-50'
                }`}
              disabled={!pairingPhrase || !lncPassword || isConnectingLNC}
            >
              Pair & Connect
            </button>
          </>
        )}
        {connectionErrorLNC && (
          <div className="text-red-500 text-xs mt-2 bg-red-50 p-2 rounded border border-red-100">{connectionErrorLNC}</div>
        )}
      </div>

      {/* Web3 Wallet Section */}
      <div className="mb-8 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/30">
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
          <span>🦊</span> Web3 Wallet (EVM)
        </h2>
        {isWeb3Connected ? (
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100">
            <p className="text-green-700 dark:text-green-400 text-sm font-medium">
              Connected: <span className="font-mono">{web3Address.slice(0, 6)}...{web3Address.slice(-4)}</span>
            </p>
            <p className="text-xs text-green-600 mt-1">{web3ChainName || 'BSC Testnet'}</p>
          </div>
        ) : (
          <button
            onClick={handleConnectWeb3}
            className={`w-full py-3 px-4 rounded-md text-white font-bold transition duration-300 shadow-lg ${isWeb3Connecting
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600'
              }`}
            disabled={isWeb3Connecting}
          >
            {isWeb3Connecting ? 'Connecting...' : 'Connect MetaMask / Web3'}
          </button>
        )}
      </div>

      {/* Guest Option */}
      <div className="pt-4 border-t border-gray-100 flex flex-col items-center">
        <p className="text-xs text-gray-400 mb-4">You can browse the app without connecting first</p>
        <button
          onClick={onExploreAsGuest}
          className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm underline-offset-4 hover:underline transition"
        >
          Just see the app (Explore as Guest)
        </button>
      </div>
    </div>
  );
}

export default ConnectScreen;