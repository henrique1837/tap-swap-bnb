import React from 'react';

function TaprootAssetSelector({
    assets,
    selectedAsset,
    onSelectAsset,
    isLoading,
    error,
    onRefresh,
    demoMode = true
}) {
    if (!demoMode && assets.length > 0) {
        // Production mode: auto-select TAPROOT_BNB and don't show selector
        const taprootBnb = assets.find(a => a.name === 'TAPROOT_BNB') || assets[0];
        if (selectedAsset?.assetId !== taprootBnb?.assetId) {
            onSelectAsset(taprootBnb);
        }
        return (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-lg shadow-md w-full max-w-2xl mb-6 border border-green-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="text-xl">🪙</span>
                    Selected Asset
                </h3>
                <div className="bg-white bg-opacity-70 backdrop-blur-sm p-4 rounded-md">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xl font-bold text-green-700">{taprootBnb.name}</p>
                            <p className="text-xs text-gray-500 font-mono mt-1">ID: {taprootBnb.assetId.slice(0, 16)}...</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-600">Balance</p>
                            <p className="text-2xl font-bold text-green-600">{parseInt(taprootBnb.amount).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 rounded-lg shadow-md w-full max-w-2xl mb-6 border border-amber-200">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <span className="text-xl">🪙</span>
                    Select Taproot Asset
                </h3>
                <button
                    onClick={onRefresh}
                    disabled={isLoading}
                    className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                    <span className={isLoading ? 'animate-spin' : ''}>↻</span>
                    Refresh
                </button>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-md mb-4 text-sm">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="space-y-3">
                    <div className="h-20 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-20 bg-gray-200 rounded animate-pulse"></div>
                </div>
            ) : assets.length === 0 ? (
                <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-3 rounded-md text-sm">
                    <p className="font-semibold">No Taproot Assets found</p>
                    <p className="text-xs mt-1">Make sure you have Taproot Assets in your wallet and channels.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {assets.map((asset) => (
                        <div
                            key={asset.assetId}
                            onClick={() => onSelectAsset(asset)}
                            className={`cursor-pointer p-4 rounded-md border-2 transition-all duration-200 ${selectedAsset?.assetId === asset.assetId
                                ? 'border-orange-500 bg-orange-100 shadow-md'
                                : 'border-gray-200 bg-white hover:border-orange-300 hover:shadow'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="text-lg font-bold text-gray-800">{asset.name}</p>
                                        {selectedAsset?.assetId === asset.assetId && (
                                            <span className="text-orange-600 text-xl">✓</span>
                                        )}
                                        {asset.inChannels && (
                                            <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                                                ⚡ In Channel
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 font-mono mt-1">
                                        ID: {asset.assetId.slice(0, 32)}...
                                    </p>
                                    {asset.groupKey && (
                                        <p className="text-xs text-gray-400 font-mono">
                                            Group: {asset.groupKey.slice(0, 16)}...
                                        </p>
                                    )}
                                </div>
                                <div className="text-right ml-4">
                                    <p className="text-xs text-gray-500">Balance</p>
                                    <p className="text-xl font-bold text-orange-600">
                                        {parseInt(asset.amount).toLocaleString()}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1 capitalize">{asset.assetType.toLowerCase()}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {selectedAsset && (
                <div className="mt-4 p-3 bg-orange-100 border border-orange-300 rounded-md">
                    <p className="text-sm text-orange-800">
                        <span className="font-semibold">Selected:</span> {selectedAsset.name} ({parseInt(selectedAsset.amount).toLocaleString()} units available)
                    </p>
                </div>
            )}

            {demoMode && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs text-blue-700">
                        <span className="font-semibold">Demo Mode:</span> In production, only "TAPROOT_BNB" asset will be used automatically.
                    </p>
                </div>
            )}
        </div>
    );
}

export default TaprootAssetSelector;
