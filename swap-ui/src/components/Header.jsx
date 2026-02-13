import React, { useState } from 'react';

function Header({
    lncIsConnected,
    nostrConnected,
    walletConnected,
    onOpenNostrModal,
    onOpenNodeModal,
    onOpenConnectModal,
    walletAddress
}) {
    const [showWalletTooltip, setShowWalletTooltip] = useState(false);

    const StatusDot = ({ connected, label }) => (
        <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
    );

    return (
        <header className="sticky top-0 z-40 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo/Title */}
                    <div className="flex items-center gap-3">
                        <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-lg p-2">
                            <span className="text-3xl">⚡</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Atomic Swap</h1>
                            <p className="text-xs text-indigo-100">BNB ⟷ Taproot Assets</p>
                        </div>
                    </div>

                    {/* Status Indicators & Actions */}
                    <div className="flex items-center gap-6">
                        {/* Connection Status */}
                        <div className="hidden md:flex items-center gap-4 bg-white bg-opacity-20 backdrop-blur-sm rounded-lg px-4 py-2">
                            <button
                                onClick={onOpenNodeModal}
                                className="hover:bg-white hover:bg-opacity-20 rounded-md px-2 py-1 transition duration-200"
                                title="View Lightning Node Info"
                            >
                                <StatusDot connected={lncIsConnected} label="LNC" />
                            </button>

                            <button
                                onClick={onOpenNostrModal}
                                className="hover:bg-white hover:bg-opacity-20 rounded-md px-2 py-1 transition duration-200"
                                title="View Nostr Identity"
                            >
                                <StatusDot connected={nostrConnected} label="Nostr" />
                            </button>

                            <div className="relative">
                                <button
                                    onMouseEnter={() => setShowWalletTooltip(true)}
                                    onMouseLeave={() => setShowWalletTooltip(false)}
                                    className="hover:bg-white hover:bg-opacity-20 rounded-md px-2 py-1 transition duration-200"
                                    title="Wallet Status"
                                >
                                    <StatusDot connected={walletConnected} label="Wallet" />
                                </button>

                                {showWalletTooltip && walletAddress && (
                                    <div className="absolute top-full right-0 mt-2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-xl">
                                        {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={onOpenNodeModal}
                                className="bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm text-white px-3 py-2 rounded-lg font-medium transition duration-200 flex items-center gap-2 shadow-sm"
                                title="Lightning Node Info"
                            >
                                <span className="text-lg">⚡</span>
                                <span className="hidden sm:inline">Node</span>
                            </button>

                            <button
                                onClick={onOpenNostrModal}
                                className="bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm text-white px-3 py-2 rounded-lg font-medium transition duration-200 flex items-center gap-2 shadow-sm"
                                title="Nostr Identity"
                            >
                                <span className="text-lg">🔑</span>
                                <span className="hidden sm:inline">Nostr</span>
                            </button>

                            <div className="h-8 w-[1px] bg-white bg-opacity-30 mx-1"></div>

                            <button
                                onClick={onOpenConnectModal}
                                className={`px-4 py-2 rounded-lg font-bold transition duration-200 shadow-lg flex items-center gap-2 ${lncIsConnected && walletConnected
                                    ? 'bg-red-500 hover:bg-red-600 text-white'
                                    : 'bg-white text-indigo-600 hover:bg-indigo-50'
                                    }`}
                            >
                                {lncIsConnected && walletConnected ? (
                                    <>
                                        <span>🚪</span> Logout
                                    </>
                                ) : (
                                    <>
                                        <span>🚀</span> Login
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}

export default Header;
