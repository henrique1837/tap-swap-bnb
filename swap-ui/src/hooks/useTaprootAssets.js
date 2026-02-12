import { useState, useCallback, useEffect } from 'react';
import { Buffer } from 'buffer';

const base64ToHex = (base64) => `0x${Buffer.from(base64, 'base64').toString('hex')}`;

export const useTaprootAssets = (lncClient, isConnected) => {
    const [assets, setAssets] = useState([]);
    const [channelAssets, setChannelAssets] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedAsset, setSelectedAsset] = useState(null);

    // Check if tapd is available
    const isTapdAvailable = useCallback(() => {
        return Boolean(lncClient?.tapd?.taprootAssets);
    }, [lncClient]);

    // Check if tapd channels service is available
    const isTapdChannelsAvailable = useCallback(() => {
        return Boolean(lncClient?.tapd?.taprootAssetChannels);
    }, [lncClient]);

    // Fetch assets in channels
    const fetchChannelAssets = useCallback(async () => {
        if (!isConnected || !isTapdChannelsAvailable()) {
            return [];
        }

        try {
            // List all Lightning channels
            const channelsResponse = await lncClient.lnd.lightning.listChannels({
                activeOnly: false,
                inactiveOnly: false,
                publicOnly: false,
                privateOnly: false,
            });

            const channels = channelsResponse.channels || [];
            const assetsInChannels = [];

            // Extract asset information from channels
            // Channels with Taproot Assets will have custom channel data
            for (const channel of channels) {
                // Check if channel has asset-related data
                // The channel may have custom records or asset balance information
                if (channel.customChannelData || channel.assetId) {
                    assetsInChannels.push({
                        channelId: channel.chanId,
                        remotePubkey: channel.remotePubkey,
                        capacity: channel.capacity,
                        localBalance: channel.localBalance,
                        remoteBalance: channel.remoteBalance,
                        assetId: channel.assetId || 'unknown',
                        active: channel.active,
                    });
                }
            }

            setChannelAssets(assetsInChannels);
            return assetsInChannels;
        } catch (err) {
            console.error('Error fetching channel assets:', err);
            return [];
        }
    }, [lncClient, isConnected, isTapdChannelsAvailable]);

    // Fetch all Taproot Assets
    const fetchAssets = useCallback(async () => {
        if (!isConnected || !isTapdAvailable()) {
            setAssets([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // List all assets in the wallet
            const response = await lncClient.tapd.taprootAssets.listAssets({
                withWitness: false,
                includeSpent: false,
                includeLeased: false,
            });

            const assetList = response.assets || [];

            // Also fetch channel assets to cross-reference
            const channelAssetsList = await fetchChannelAssets();

            // Transform assets to a more usable format
            const formattedAssets = assetList.map((asset) => {
                const assetId = Buffer.from(asset.assetGenesis?.assetId || []).toString('hex');

                // Check if this asset is in any channels
                const inChannels = channelAssetsList.some(ca => ca.assetId === assetId);

                return {
                    assetId,
                    name: asset.assetGenesis?.name || 'Unknown Asset',
                    assetType: asset.assetGenesis?.assetType || 'NORMAL',
                    amount: asset.amount || '0',
                    groupKey: asset.assetGroup?.tweakedGroupKey ?
                        Buffer.from(asset.assetGroup.tweakedGroupKey).toString('hex') : null,
                    scriptKey: asset.scriptKey ? Buffer.from(asset.scriptKey).toString('hex') : null,
                    anchorOutpoint: asset.chainAnchor?.anchorOutpoint || null,
                    inChannels, // Flag to indicate if asset is in channels
                };
            });

            setAssets(formattedAssets);

            // Auto-select first asset that's in a channel, or just first asset
            if (!selectedAsset && formattedAssets.length > 0) {
                const channelAsset = formattedAssets.find(a => a.inChannels);
                setSelectedAsset(channelAsset || formattedAssets[0]);
            }
        } catch (err) {
            console.error('Error fetching Taproot Assets:', err);
            setError(err.message || 'Failed to fetch Taproot Assets');
            setAssets([]);
        } finally {
            setIsLoading(false);
        }
    }, [lncClient, isConnected, isTapdAvailable, selectedAsset, fetchChannelAssets]);

    // Create a Taproot Asset invoice
    const createAssetInvoice = useCallback(async (asset, amountSats, memo = '') => {
        if (!isConnected || !isTapdChannelsAvailable()) {
            throw new Error('Taproot Asset Channels service not available');
        }

        if (!asset) {
            throw new Error('No asset selected');
        }

        try {
            // Use the TaprootAssetChannels service to create an invoice
            // This is the correct service for AddInvoice
            const invoiceResponse = await lncClient.tapd.taprootAssetChannels.addInvoice({
                assetId: Buffer.from(asset.assetId, 'hex'),
                assetAmount: amountSats.toString(),
                peerPubkey: Buffer.from([]), // Empty for now
                invoiceRequest: {
                    memo: memo || `Taproot Asset Swap: ${asset.name}`,
                },
            });

            // Extract payment request and hash
            const paymentRequest = invoiceResponse.invoiceResult?.invoice || '';
            const rHashBase64 = invoiceResponse.invoiceResult?.rHash || '';
            const paymentHash = rHashBase64 ? base64ToHex(rHashBase64) : null;

            return {
                paymentRequest,
                paymentHash,
                assetId: asset.assetId,
                assetName: asset.name,
                assetAmount: amountSats.toString(),
            };
        } catch (err) {
            console.error('Error creating Taproot Asset invoice:', err);
            throw new Error(`Failed to create Taproot Asset invoice: ${err.message || String(err)}`);
        }
    }, [lncClient, isConnected, isTapdChannelsAvailable]);

    // Fetch assets when connection status changes
    useEffect(() => {
        if (isConnected && isTapdAvailable()) {
            fetchAssets();
        } else {
            setAssets([]);
            setChannelAssets([]);
            setSelectedAsset(null);
        }
    }, [isConnected, isTapdAvailable, fetchAssets]);

    return {
        assets,
        channelAssets,
        isLoading,
        error,
        selectedAsset,
        setSelectedAsset,
        fetchAssets,
        createAssetInvoice,
        isTapdAvailable: isTapdAvailable(),
        isTapdChannelsAvailable: isTapdChannelsAvailable(),
    };
};
