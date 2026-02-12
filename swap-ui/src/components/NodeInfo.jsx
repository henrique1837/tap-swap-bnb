import React, { useState, useEffect, useCallback } from 'react';
import { useTaprootAssets } from '../hooks/useTaprootAssets';

function NodeInfo({ lncClient, isConnected }) {
    const [nodeInfo, setNodeInfo] = useState(null);
    const [channelInfo, setChannelInfo] = useState(null);
    const [balanceInfo, setBalanceInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const { assets: taprootAssets, isLoading: isLoadingAssets, isTapdAvailable } = useTaprootAssets(lncClient, isConnected);

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
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 font-semibold">⚠️ LNC Not Connected</p>
                <p className="text-sm text-red-600 mt-2">
                    Connect to your Lightning Node via LNC to view node information.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Refresh Button */}
            <div className="flex justify-end">
                <button
                    onClick={fetchNodeInfo}
                    disabled={isLoading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    <span className={isLoading ? 'animate-spin' : ''}>↻</span>
                    Refresh
                </button>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {isLoading && !nodeInfo ? (
                <div className="space-y-4">
                    <div className="h-24 bg-gray-200 rounded-lg animate-pulse"></div>
                    <div className="h-24 bg-gray-200 rounded-lg animate-pulse"></div>
                    <div className="h-24 bg-gray-200 rounded-lg animate-pulse"></div>
                </div>
            ) : nodeInfo ? (
                <div className="space-y-4">
                    {/* Node Identity */}
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-lg border border-indigo-200">
                        <h3 className="text-sm font-semibold text-indigo-700 mb-3 uppercase tracking-wide flex items-center gap-2">
                            <span>⚡</span> Node Identity
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <span className="text-xs text-gray-500 block mb-1">Alias</span>
                                <span className="text-xl font-bold text-gray-800">{nodeInfo.alias || 'Unknown'}</span>
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block mb-1">Public Key</span>
                                <span className="text-xs font-mono text-gray-700 break-all bg-white p-2 rounded border border-gray-300 block">
                                    {nodeInfo.identityPubkey}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-gray-500 block mb-1">Version</span>
                                    <span className="text-sm font-semibold text-gray-700">{nodeInfo.version}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 block mb-1">Network</span>
                                    <span className="text-sm font-semibold text-gray-700 capitalize">
                                        {nodeInfo.chains?.[0]?.network || 'Unknown'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sync Status */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-5 rounded-lg border border-green-200">
                        <h3 className="text-sm font-semibold text-green-700 mb-3 uppercase tracking-wide flex items-center gap-2">
                            <span>🔄</span> Sync Status
                        </h3>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`w-4 h-4 rounded-full ${nodeInfo.syncedToChain ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                            <span className="text-lg font-semibold text-gray-800">
                                {nodeInfo.syncedToChain ? 'Fully Synced' : 'Syncing...'}
                            </span>
                            {nodeInfo.syncedToGraph && (
                                <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">(Graph Synced)</span>
                            )}
                        </div>
                        <div className="text-sm text-gray-600 bg-white p-2 rounded">
                            Block Height: <span className="font-mono font-semibold">{nodeInfo.blockHeight?.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Balances */}
                    {balanceInfo && (
                        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 p-5 rounded-lg border border-yellow-200">
                            <h3 className="text-sm font-semibold text-orange-700 mb-3 uppercase tracking-wide flex items-center gap-2">
                                <span>💰</span> Balances
                            </h3>
                            <div className="space-y-4">
                                <div className="bg-white p-4 rounded-lg border border-yellow-300">
                                    <span className="text-xs text-gray-500 block mb-1">Lightning Balance</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-bold text-yellow-600">
                                            {formatSats(balanceInfo.channel?.balance)}
                                        </span>
                                        <span className="text-sm text-gray-600">sats</span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {formatBTC(balanceInfo.channel?.balance)} BTC
                                    </span>
                                </div>
                                <div className="bg-white p-4 rounded-lg border border-orange-300">
                                    <span className="text-xs text-gray-500 block mb-1">On-Chain Balance</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-bold text-orange-600">
                                            {formatSats(balanceInfo.onChain?.confirmedBalance)}
                                        </span>
                                        <span className="text-sm text-gray-600">sats</span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {formatBTC(balanceInfo.onChain?.confirmedBalance)} BTC
                                    </span>
                                    {balanceInfo.onChain?.unconfirmedBalance && parseInt(balanceInfo.onChain.unconfirmedBalance) > 0 && (
                                        <div className="text-xs text-gray-500 mt-2 bg-yellow-100 p-2 rounded">
                                            Unconfirmed: {formatSats(balanceInfo.onChain.unconfirmedBalance)} sats
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Taproot Assets (On-Chain) */}
                    {isTapdAvailable && (
                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-5 rounded-lg border border-amber-200">
                            <h3 className="text-sm font-semibold text-amber-700 mb-3 uppercase tracking-wide flex items-center gap-2">
                                <span>🪙</span> Taproot Assets (On-Chain)
                            </h3>

                            {isLoadingAssets ? (
                                <div className="space-y-2">
                                    <div className="h-12 bg-white rounded animate-pulse"></div>
                                    <div className="h-12 bg-white rounded animate-pulse"></div>
                                </div>
                            ) : taprootAssets.length === 0 ? (
                                <div className="bg-white p-4 rounded-lg border border-amber-300 text-center">
                                    <p className="text-sm text-gray-500">No Taproot Assets found</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {taprootAssets.map((asset) => (
                                        <div key={asset.assetId} className="bg-white p-3 rounded-lg border border-amber-200 shadow-sm flex items-center justify-between">
                                            <div>
                                                <p className="font-bold text-gray-800">{asset.name}</p>
                                                <p className="text-xs text-gray-500 font-mono break-all line-clamp-1" title={asset.assetId}>
                                                    ID: {asset.assetId.slice(0, 8)}...{asset.assetId.slice(-8)}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs text-gray-500 block">Balance</span>
                                                <span className="font-bold text-orange-600">{parseInt(asset.amount).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                <p className="text-xs text-blue-800">
                                    <span className="font-semibold">ℹ️ Channels Note:</span> Channels with Taproot Assets are not available via LNC at this time.
                                    In the future, we will update this to show asset channel balances.
                                    Currently showing on-chain asset balances.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Channels */}
                    {channelInfo && (
                        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-5 rounded-lg border border-blue-200">
                            <h3 className="text-sm font-semibold text-blue-700 mb-3 uppercase tracking-wide flex items-center gap-2">
                                <span>🔗</span> Channels
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-lg border border-blue-300 text-center">
                                    <span className="text-xs text-gray-500 block mb-1">Active Channels</span>
                                    <span className="text-3xl font-bold text-blue-600">{channelInfo.channels?.length || 0}</span>
                                </div>
                                <div className="bg-white p-4 rounded-lg border border-cyan-300 text-center">
                                    <span className="text-xs text-gray-500 block mb-1">Total Capacity</span>
                                    <span className="text-lg font-semibold text-cyan-700">
                                        {formatSats(channelInfo.channels?.reduce((sum, ch) => sum + parseInt(ch.capacity || 0), 0))}
                                    </span>
                                    <span className="text-xs text-gray-500 block">sats</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Quick Stats */}
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 rounded-lg text-white shadow-lg">
                        <h3 className="text-sm font-semibold mb-3 uppercase tracking-wide opacity-90">Quick Stats</h3>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-3xl font-bold">{nodeInfo.numActiveChannels || 0}</div>
                                <div className="text-xs opacity-80 mt-1">Active</div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold">{nodeInfo.numPendingChannels || 0}</div>
                                <div className="text-xs opacity-80 mt-1">Pending</div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold">{nodeInfo.numPeers || 0}</div>
                                <div className="text-xs opacity-80 mt-1">Peers</div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default NodeInfo;
