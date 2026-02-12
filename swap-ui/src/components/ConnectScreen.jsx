import React from 'react';

function ConnectScreen({
  darkMode,
  toggleDarkMode,
  pairingPhrase,
  setPairingPhrase,
  lncPassword,
  setLncPassword,
  isConnectingLNC, // This will be `lncStatus === 'Connecting'`
  handleConnectLNCWithPairing, // Renamed prop
  handleLoginLNCWithPassword,  // New prop
  handleDisconnectLNC,         // New prop for 'Forget Session'
  connectionErrorLNC,
  isWeb3Connected,
  web3Address,
  web3ChainName,
  handleConnectWeb3,
  isWeb3Connecting,
  lncIsPaired, // Updated prop name
}) {
  const themeClass = darkMode ? 'dark bg-gray-900 text-white' : 'light bg-gray-100 text-gray-800';

  const onLncConnect = () => {
    if (lncIsPaired) {
      handleLoginLNCWithPassword(lncPassword);
    } else {
      handleConnectLNCWithPairing(pairingPhrase, lncPassword);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${themeClass}`}>
      <div className={`bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md`}>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Connect to Atomic Swap App</h1>
        </div>

        {/* LNC Connection Section */}
        <div className="mb-8 p-6 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-4">Lightning Node Connect (LNC)</h2>
          {isConnectingLNC ? (
            <p className="text-blue-600 dark:text-blue-400">Connecting to LNC...</p>
          ) : (
            <>
              {lncIsPaired ? (
                <>
                  <p className="text-gray-700 dark:text-gray-300 mb-2">
                    A saved LNC session was found. Enter your password to reconnect:
                  </p>
                  <input
                    type="password"
                    value={lncPassword}
                    onChange={setLncPassword}
                    placeholder="Enter LNC Password"
                    className="w-full p-3 mb-4 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    disabled={isConnectingLNC}
                  />
                  <button
                    onClick={onLncConnect}
                    className={`w-full py-3 px-4 rounded-md text-white font-medium transition duration-300 ${
                      lncPassword && !isConnectingLNC
                        ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                        : 'bg-blue-400 dark:bg-blue-600 opacity-70 cursor-not-allowed'
                    }`}
                    disabled={!lncPassword || isConnectingLNC}
                  >
                    {isConnectingLNC ? 'Logging In...' : 'Login to LNC Node'}
                  </button>
                  <button
                    onClick={handleDisconnectLNC}
                    className="mt-3 w-full py-2 px-4 rounded-md text-gray-700 dark:text-gray-300 font-medium transition duration-300 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    Forget Session & Pair New Node
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={pairingPhrase}
                    onChange={setPairingPhrase}
                    placeholder="Enter LNC Pairing Phrase"
                    className="w-full p-3 mb-4 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    disabled={isConnectingLNC}
                  />
                  <input
                    type="password"
                    value={lncPassword}
                    onChange={setLncPassword}
                    placeholder="Choose a password for this LNC session"
                    className="w-full p-3 mb-4 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    disabled={isConnectingLNC}
                  />
                  <button
                    onClick={onLncConnect}
                    className={`w-full py-3 px-4 rounded-md text-white font-medium transition duration-300 ${
                      pairingPhrase && lncPassword && !isConnectingLNC
                        ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                        : 'bg-blue-400 dark:bg-blue-600 opacity-70 cursor-not-allowed'
                    }`}
                    disabled={!pairingPhrase || !lncPassword || isConnectingLNC}
                  >
                    {isConnectingLNC ? 'Connecting...' : 'Connect LNC Node'}
                  </button>
                </>
              )}
            </>
          )}
          {connectionErrorLNC && (
            <div className="text-red-500 text-sm mt-3">{connectionErrorLNC}</div>
          )}
        </div>

        {/* Web3 Wallet Connection Section */}
        <div className="mb-8 p-6 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-4">Web3 Wallet (EVM)</h2>
          {isWeb3Connected ? (
            <div className="text-green-600 dark:text-green-400">
              Connected: {web3Address} ({web3ChainName || 'Unknown Chain'})
            </div>
          ) : (
            <button
              onClick={handleConnectWeb3}
              className={`w-full py-3 px-4 rounded-md text-white font-medium transition duration-300 ${
                isWeb3Connecting
                  ? 'bg-gray-500 opacity-70 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600'
              }`}
              disabled={isWeb3Connecting}
            >
              {isWeb3Connecting ? 'Connecting...' : 'Connect Web3 Wallet (MetaMask, etc.)'}
            </button>
          )}
        </div>

        {/* Overall Status */}
        <div className="mt-6 text-center text-lg font-medium text-gray-700 dark:text-gray-300">
          {(!isConnectingLNC && !isWeb3Connecting && !isWeb3Connected && !lncIsPaired) && (
            <p>Please connect both your Lightning Node and Web3 Wallet to continue.</p>
          )}
          {isWeb3Connected && (!lncIsPaired && !pairingPhrase) && <p>Web3 Wallet Connected. Now connect LNC.</p>}
          {!isWeb3Connected && (lncIsPaired || pairingPhrase) && <p>LNC connection ready. Now connect Web3 Wallet.</p>}
          {isWeb3Connected && (lncIsPaired || pairingPhrase) && isConnectingLNC && <p>Connecting LNC...</p>}
          {web3Address && (lncIsPaired || pairingPhrase) && !isConnectingLNC && <p>All set! You can proceed.</p>}
        </div>
      </div>
    </div>
  );
}

export default ConnectScreen;