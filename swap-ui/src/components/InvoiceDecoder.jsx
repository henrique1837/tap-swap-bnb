import React, { useState, useEffect } from 'react';
import { decode } from 'light-bolt11-decoder';

function InvoiceDecoder({ invoice, title = "Invoice Details" }) {
    const [decodedInvoice, setDecodedInvoice] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!invoice || invoice.trim() === '') {
            setDecodedInvoice(null);
            setError(null);
            return;
        }

        try {
            const decoded = decode(invoice);
            console.log('Decoded invoice:', decoded);
            setDecodedInvoice(decoded);
            setError(null);
        } catch (err) {
            console.error('Error decoding invoice:', err);
            setError('Invalid Lightning invoice format');
            setDecodedInvoice(null);
        }
    }, [invoice]);

    const getTagValue = (sections, tagName) => {
        const section = sections.find(s => s.name === tagName);
        return section?.value || null;
    };

    const formatSats = (millisats) => {
        if (!millisats) return '0';
        const sats = Math.floor(millisats / 1000);
        return sats.toLocaleString();
    };

    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
    };

    if (!invoice || invoice.trim() === '') {
        return null;
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700 font-semibold">⚠️ {error}</p>
            </div>
        );
    }

    if (!decodedInvoice) {
        return null;
    }

    // Extract data from sections
    const paymentHash = getTagValue(decodedInvoice.sections, 'payment_hash');
    const description = getTagValue(decodedInvoice.sections, 'description');
    const expiry = getTagValue(decodedInvoice.sections, 'expiry');
    const payeeNode = getTagValue(decodedInvoice.sections, 'payee_node_key');
    const timestamp = getTagValue(decodedInvoice.sections, 'timestamp');
    const amountMillisats = getTagValue(decodedInvoice.sections, 'amount');

    return (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-5 space-y-4">
            <h3 className="text-lg font-bold text-green-800 flex items-center gap-2">
                <span>⚡</span> {title}
            </h3>

            {/* Amount */}
            {amountMillisats && (
                <div className="bg-white p-4 rounded-lg border border-green-300">
                    <span className="text-xs text-gray-500 block mb-1">Amount</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-green-600">
                            {formatSats(amountMillisats)}
                        </span>
                        <span className="text-sm text-gray-600">sats</span>
                    </div>
                    <span className="text-xs text-gray-500">
                        {amountMillisats.toLocaleString()} millisats
                    </span>
                </div>
            )}

            {/* Payment Hash */}
            {paymentHash && (
                <div className="bg-white p-4 rounded-lg border border-green-300">
                    <span className="text-xs text-gray-500 block mb-1">Payment Hash</span>
                    <span className="text-xs font-mono text-gray-700 break-all block">
                        {paymentHash}
                    </span>
                </div>
            )}

            {/* Description */}
            {description && (
                <div className="bg-white p-4 rounded-lg border border-green-300">
                    <span className="text-xs text-gray-500 block mb-1">Description</span>
                    <span className="text-sm text-gray-800">{description}</span>
                </div>
            )}

            {/* Timestamp */}
            {timestamp && (
                <div className="bg-white p-4 rounded-lg border border-green-300">
                    <span className="text-xs text-gray-500 block mb-1">Created</span>
                    <span className="text-sm text-gray-800">
                        {formatTimestamp(timestamp)}
                    </span>
                </div>
            )}

            {/* Expiry */}
            {expiry && (
                <div className="bg-white p-4 rounded-lg border border-green-300">
                    <span className="text-xs text-gray-500 block mb-1">Expires In</span>
                    <span className="text-sm text-gray-800">{expiry} seconds</span>
                </div>
            )}

            {/* Payee Node */}
            {payeeNode && (
                <div className="bg-white p-4 rounded-lg border border-green-300">
                    <span className="text-xs text-gray-500 block mb-1">Payee Node</span>
                    <span className="text-xs font-mono text-gray-700 break-all block">
                        {payeeNode}
                    </span>
                </div>
            )}



            {/* Raw Invoice */}
            <details className="bg-gray-50 p-3 rounded-lg border border-gray-300">
                <summary className="text-xs font-semibold text-gray-700 cursor-pointer">
                    View Raw Invoice
                </summary>
                <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                    <span className="text-xs font-mono text-gray-600 break-all block">
                        {invoice}
                    </span>
                </div>
            </details>
        </div>
    );
}

export default InvoiceDecoder;
