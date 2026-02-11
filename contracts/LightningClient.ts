// src/lightningClient.ts
import axios from "axios";
import https from "https";
import { Hex } from "viem";
import { hexToBytes } from "ethereum-cryptography/utils"; // For preimage verification

interface LightningConfig {
    host: string;
    macaroon: string;
    tlsCert?: string; // For self-signed certs
}

// Interfaces for LND API responses (simplified)
interface AddInvoiceResponse {
    r_hash: string; // payment hash (hashlock) base64 encoded
    payment_request: string; // bolt11 invoice
    add_index: string;
    payment_addr: string; // payment address (not directly used in basic HTLC swaps)
}

interface SendPaymentResponse {
    payment_error: string;
    payment_preimage: string; // revealed secret (base64 encoded)
    payment_route: any;
    payment_hash: string; // payment hash (hashlock) base64 encoded
}

interface LookupInvoiceResponse {
    r_hash: string; // payment hash (hashlock) base64 encoded
    payment_request: string;
    value: string; // amount in satoshis
    creation_date: string; // unix timestamp
    settle_date: string; // unix timestamp
    cltv_expiry: string; // CLTV expiry delta
    settled: boolean;
    state: "OPEN" | "SETTLED" | "CANCELED" | "ACCEPTED";
    htlcs: Array<{
        amt_msat: string;
        accepted: boolean;
        chan_id: string;
        htlc_index: string;
        // Contains fields that might reveal the secret after settlement
        // custom_records: Record<string, string>; // Sometimes secret is here if custom records are used
    }>;
    add_index: string;
    // more fields...
    r_preimage: string; // This field is present and BASE64 encoded if the invoice is settled!
}

export class LightningClient {
    private client: any; // Axios instance

    constructor(config: LightningConfig) {
        this.client = axios.create({
            baseURL: `${config.host}/v1`, // LND REST typically uses /v1
            headers: {
                'Grpc-Metadata-macaroon': config.macaroon,
            },
            httpsAgent: new https.Agent({
                // DO NOT USE IN PRODUCTION WITHOUT PROPER CA VERIFICATION
                rejectUnauthorized: false,
                // You might need this if using a custom cert, but `litd` usually handles it
                // ca: config.tlsCert ? Buffer.from(config.tlsCert, 'hex') : undefined,
            }),
            timeout: 30000,
        });
    }

    // Converts base64 to hex, compatible with Viem's Hex type
    private base64ToHex(base64: string): Hex {
        return "0x" + Buffer.from(base64, 'base64').toString('hex') as Hex;
    }

    // Converts hex to base64
    private hexToBase64(hex: Hex): string {
        return Buffer.from(hexToBytes(hex)).toString('base64');
    }

    /**
     * @dev Creates a Lightning invoice (BOLT11) with an embedded hashlock and timelock.
     *      This is Alice's first step.
     * @param valueSatoshis The amount in satoshis for the invoice.
     * @param hashlock The SHA256 hash of the secret (payment hash).
     * @param cltvDelta The CLTV expiry delta for the HTLC.
     * @param memo An optional memo for the invoice.
     * @returns The generated BOLT11 payment request and the payment hash (hashlock).
     */
    async addInvoice(
        valueSatoshis: bigint,
        hashlock: Hex,
        cltvDelta: number,
        memo: string = "Atomic Swap Taproot Assets"
    ): Promise<{ paymentRequest: string; paymentHash: Hex }> {
        console.log(`[LN] Adding invoice for ${valueSatoshis} sats, hashlock: ${hashlock}, CLTV: ${cltvDelta}`);
        try {
            const response = await this.client.post<AddInvoiceResponse>('/invoices', {
                value_msat: valueSatoshis * 1000n, // LND API expects millisatoshis
                r_hash: this.hexToBase64(hashlock), // Payment hash must be base64 encoded
                cltv_expiry: cltvDelta,
                memo: memo,
                private: true, // Make it a private invoice for channel routing
            });
            console.log("[LN] Invoice created:", response.data);
            return {
                paymentRequest: response.data.payment_request,
                paymentHash: this.base64ToHex(response.data.r_hash), // Convert back to hex
            };
        } catch (error: any) {
            console.error("[LN] Error adding invoice:", error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * @dev Pays a Lightning invoice. This is Alice's action to claim BNB (by revealing secret on BSC)
     *      and then "paying" her own invoice to reveal the secret on LN for Bob.
     * @param paymentRequest The BOLT11 invoice string to pay.
     * @returns The payment preimage (secret) if successful.
     */
    async sendPayment(paymentRequest: string): Promise<Hex> {
        console.log(`[LN] Sending payment for invoice: ${paymentRequest}`);
        try {
            // LND's `sendpayment` endpoint: `/v1/channels/transactions`
            // You can also use `router.sendPaymentV2` for more control.
            // For simplicity, let's use the basic channels/transactions for now.
            const response = await this.client.post<SendPaymentResponse>('/channels/transactions', {
                payment_request: paymentRequest,
                timeout_seconds: 60, // Max 60 seconds to attempt payment
                allow_self_payment: true, // Crucial for Alice paying her own invoice
            });

            if (response.data.payment_error) {
                throw new Error(`LN Payment Error: ${response.data.payment_error}`);
            }

            console.log("[LN] Payment successful:", response.data);
            if (!response.data.payment_preimage) {
                throw new Error("LN Payment successful, but no preimage returned.");
            }
            return this.base64ToHex(response.data.payment_preimage);
        } catch (error: any) {
            console.error("[LN] Error sending payment:", error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * @dev Looks up an invoice by its payment hash (hashlock) to check its status
     *      and retrieve the preimage once settled.
     * @param paymentHash The base64-encoded payment hash.
     * @returns Invoice details, including `settled` status and `r_preimage` if settled.
     */
    async lookupInvoice(paymentHash: Hex): Promise<LookupInvoiceResponse> {
        const base64PaymentHash = this.hexToBase64(paymentHash);
        console.log(`[LN] Looking up invoice for payment hash: ${paymentHash}`);
        try {
            const response = await this.client.get<LookupInvoiceResponse>(`/invoices/${base64PaymentHash}`);
            return response.data;
        } catch (error: any) {
            console.error("[LN] Error looking up invoice:", error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * @dev Attempts to cancel an invoice if it's still open.
     *      This would be Alice's refund mechanism.
     */
    async cancelInvoice(paymentHash: Hex): Promise<any> {
        const base64PaymentHash = this.hexToBase64(paymentHash);
        console.log(`[LN] Canceling invoice for payment hash: ${paymentHash}`);
        try {
            const response = await this.client.post('/invoices/cancel', {
                payment_hash: base64PaymentHash
            });
            console.log("[LN] Invoice cancellation response:", response.data);
            return response.data;
        } catch (error: any) {
            console.error("[LN] Error canceling invoice:", error.response?.data || error.message);
            throw error;
        }
    }
}