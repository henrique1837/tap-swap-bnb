import React, { useState, useEffect, useCallback } from 'react';

function NodeInfo({ lncClient, isConnected }) {
    const [nodeInfo, setNodeInfo] = useState(null);
    const [channelInfo, setChannelInfo] = useState(null);
    const [balanceInfo, setBalanceInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isExpanded, setIsExpanded] = useState(true);

    const fetchNodeInfo = useCallback(async () => {
        if (!lncClient?.lnd?.lightning || !isConnected) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Fetch node information
            const info = await lncClient.lnd.lightning.getInfo();
            setNodeInfo(info);

            // Fetch channel information
            const channels = await lncClient.lnd.lightning.listChannels();
            setChannelInfo(channels);

            // Fetch balance information
            const onChainBalance = await lncClient.lnd.lightning.walletBalance();
            const channelBalance = await lncClient.lnd.lightning.channelBalance();
            setBalanceInfo({
                onChain: onChainBalance,
                channel: channelBalance,
            });
        } catch (err) {
            console.error('Error fetching node info:', err);
            setError(err.message || 'Failed to fetch node information');
        } finally {
            setIsLoading(false);
        }
    }, [lncClient, isConnected]);

    useEffect(() => {
        if (isConnected) {
            fetchNodeInfo();
        } else {
            setNodeInfo(null);
            setChannelInfo(null);
            setBalanceInfo(null);
            setError(null);
        }
    }, [isConnected, fetchNodeInfo]);

    const formatSats = (sats) => {
        if (!sats) return '0';
        const num = parseInt(sats);
        return num.toLocaleString();
    };

    const formatBTC = (sats) => {
        if (!sats) return '0.00000000';
        const btc = parseInt(sats) / 100000000;
        return btc.toFixed(8);
    };

    if (!isConnected) {
        return null;
    }

    return (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-8 rounded-lg shadow-lg w-full max-w-2xl mb-8 border border-purple-100">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
                    <span className="text-2xl">⚡</span>
                    Lightning Node Info
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchNodeInfo}
                        disabled={isLoading}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                        <span className={isLoading ? 'animate-spin' : ''}>↻</span>
                        Refresh
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-md transition duration-200"
                    >
                        {isExpanded ? '▼' : '▶'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-md mb-4 text-sm">
                    {error}
                </div>
            )}

            {isLoading && !nodeInfo ? (
                <div className="space-y-3">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
                </div>
            ) : nodeInfo && isExpanded ? (
                <div className="space-y-4">
                    {/* Node Identity */}
                    <div className="bg-white bg-opacity-60 backdrop-blur-sm p-4 rounded-md border border-purple-100">
                        <h3 className="text-sm font-semibold text-purple-700 mb-2 uppercase tracking-wide">Node Identity</h3>
                        <div className="space-y-2">
                            <div>
                                <span className="text-xs text-gray-500 block">Alias</span>
                                <span className="text-lg font-bold text-gray-800">{nodeInfo.alias || 'Unknown'}</span>
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block">Public Key</span>
                                <span className="text-xs font-mono text-gray-700 break-all">{nodeInfo.identityPubkey}</span>
                            </div>
                            <div className="flex gap-4">
                                <div>
                                    <span className="text-xs text-gray-500 block">Version</span>
                                    <span className="text-sm font-semibold text-gray-700">{nodeInfo.version}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 block">Network</span>
                                    <span className="text-sm font-semibold text-gray-700 capitalize">
                                        {nodeInfo.chains?.[0]?.network || 'Unknown'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sync Status */}
                    <div className="bg-white bg-opacity-60 backdrop-blur-sm p-4 rounded-md border border-purple-100">
                        <h3 className="text-sm font-semibold text-purple-700 mb-2 uppercase tracking-wide">Sync Status</h3>
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${nodeInfo.syncedToChain ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                            <span className="text-sm font-semibold text-gray-700">
                                {nodeInfo.syncedToChain ? 'Fully Synced' : 'Syncing...'}
                            </span>
                            {nodeInfo.syncedToGraph && (
                                <span className="text-xs text-gray-500 ml-2">(Graph Synced)</span>
                            )}
                        </div>
                        <div className="mt-2 text-xs text-gray-600">
                            Block Height: <span className="font-mono font-semibold">{nodeInfo.blockHeight?.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Channel Information */}
                    {channelInfo && (
                        <div className="bg-white bg-opacity-60 backdrop-blur-sm p-4 rounded-md border border-purple-100">
                            <h3 className="text-sm font-semibold text-purple-700 mb-2 uppercase tracking-wide">Channels</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-gray-500 block">Active Channels</span>
                                    <span className="text-2xl font-bold text-indigo-600">{channelInfo.channels?.length || 0}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 block">Total Capacity</span>
                                    <span className="text-lg font-semibold text-gray-700">
                                        {formatSats(channelInfo.channels?.reduce((sum, ch) => sum + parseInt(ch.capacity || 0), 0))} sats
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Balance Information */}
                    {balanceInfo && (
                        <div className="bg-white bg-opacity-60 backdrop-blur-sm p-4 rounded-md border border-purple-100">
                            <h3 className="text-sm font-semibold text-purple-700 mb-2 uppercase tracking-wide">Balances</h3>
                            <div className="space-y-3">
                                <div>
                                    <span className="text-xs text-gray-500 block">Lightning Balance</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xl font-bold text-yellow-600">
                                            {formatSats(balanceInfo.channel?.balance)}
                                        </span>
                                        <span className="text-sm text-gray-600">sats</span>
                                        <span className="text-xs text-gray-500 ml-2">
                                            ({formatBTC(balanceInfo.channel?.balance)} BTC)
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 block">On-Chain Balance</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xl font-bold text-orange-600">
                                            {formatSats(balanceInfo.onChain?.confirmedBalance)}
                                        </span>
                                        <span className="text-sm text-gray-600">sats</span>
                                        <span className="text-xs text-gray-500 ml-2">
                                            ({formatBTC(balanceInfo.onChain?.confirmedBalance)} BTC)
                                        </span>
                                    </div>
                                    {balanceInfo.onChain?.unconfirmedBalance && parseInt(balanceInfo.onChain.unconfirmedBalance) > 0 && (
                                        <div className="text-xs text-gray-500 mt-1">
                                            Unconfirmed: {formatSats(balanceInfo.onChain.unconfirmedBalance)} sats
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Quick Stats */}
                    <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 rounded-md text-white">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-2xl font-bold">{nodeInfo.numActiveChannels || 0}</div>
                                <div className="text-xs opacity-90">Active</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold">{nodeInfo.numPendingChannels || 0}</div>
                                <div className="text-xs opacity-90">Pending</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold">{nodeInfo.numPeers || 0}</div>
                                <div className="text-xs opacity-90">Peers</div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : !isExpanded ? (
                <div className="text-sm text-gray-600">
                    <span className="font-semibold">{nodeInfo?.alias || 'Node'}</span> - {nodeInfo?.numActiveChannels || 0} channels
                </div>
            ) : null}
        </div>
    );
}

export default NodeInfo;
