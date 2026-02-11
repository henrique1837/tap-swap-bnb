import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";
import { parseEther, getAddress, Hex, bytesToHex, parseGwei } from "viem";
import { sha256 } from 'ethereum-cryptography/sha256';
import { hexToBytes } from 'ethereum-cryptography/utils';
import crypto from 'crypto'; // Still needed for computeHashlock validation
import axios from "axios";
import https from "https";
import * as dotenv from 'dotenv';
import * as AtomicSwapBNBArtifact from "../artifacts/contracts/AtomicSwapBNB.sol/AtomicSwapBNB.json";
dotenv.config();
const AtomicSwapBNB_ABI = AtomicSwapBNBArtifact.abi;
const AtomicSwapBNB_BYTECODE = AtomicSwapBNBArtifact.bytecode;

// --- Shared Utilities ---
// NOTE: generateSecret() and computeHashlock() are now for *validation*
// or for the refund test, not for the primary swap hashlock.
function generateSecret(): Hex {
    return bytesToHex(crypto.randomBytes(32));
}

function computeHashlock(secret: Hex): Hex {
    return bytesToHex(sha256(hexToBytes(secret)));
}
function sendStreamingPayment(lnd: AxiosInstance, payload: any): Promise<any> {
    return new Promise(async (resolve, reject) => {
        try {
            const responseStream = await lnd.post('/v1/taproot-assets/channels/send-payment', payload, {
                responseType: 'stream'
            })
            responseStream.data.on('data', (chunk: Buffer) => {
                try {
                    const response = JSON.parse(chunk.toString())
                    console.log(response)
                    if (response.result?.payment_result?.status === 'SUCCEEDED') {
                        resolve(response.result.payment_result)
                        responseStream.data.destroy()
                    }
                    if (response.result?.payment_result?.status === 'FAILED') {
                        reject(new Error(`LND/TAPD payment failed! Reason: ${response.result.failure_reason}`))
                        responseStream.data.destroy()
                    }
                } catch (e) {}
            })
            responseStream.data.on('end', () => {
                reject(new Error('LND/TAPD payment stream ended without a final SUCCEEDED status.'))
            })
            responseStream.data.on('error', (err: Error) => {
                reject(new Error(`LND/TAPD payment stream error: ${err.message}`))
            })
        } catch (error) {
            reject(error)
        }
    })
}
// Helper to delay execution
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Configuration ---
const ALICE_LITD_REST_HOST = process.env.ALICE_LITD_REST_HOST;
const ALICE_LITD_ADMIN_MACAROON_HEX = process.env.ALICE_LITD_ADMIN_MACAROON_HEX;
const ALICE_LITD_INVOICE_MACAROON_HEX = process.env.ALICE_LITD_INVOICE_MACAROON_HEX;
const BOB_LITD_REST_HOST = process.env.BOB_LITD_REST_HOST;
const BOB_LITD_ADMIN_MACAROON_HEX = process.env.BOB_LITD_ADMIN_MACAROON_HEX;

const TAPROOT_ASSET_ID = process.env.TAPROOT_ASSET_ID;
const SWAP_AMOUNT_TAP_SATOSHIS = 500;
const SWAP_AMOUNT_BNB = parseEther("0.00015")

const BNB_TIMELOCK_OFFSET = 3600;
// --- Axios instances for litd/tapd interactions ---
const getTapdAxiosClient = (host: string, macaroon: string) => axios.create({
    baseURL: host,
    headers: { 'Grpc-Metadata-macaroon': macaroon },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 30000,
});

// Helper to convert base64 to Hex
const base64ToHex = (base64: string): Hex => "0x" + Buffer.from(base64, 'base64').toString('hex') as Hex;
// Helper to convert Hex to base64
const hexToBase64 = (hex: Hex): string => Buffer.from(hexToBytes(hex)).toString('base64');
const toUrlSafeBase64 = (base64: Hex): string => {
    return base64.replace(/\+/g, '-').replace(/\//g, '_');
}
const TAPROOT_ASSET_ID_BASE64 = toUrlSafeBase64(hexToBase64(TAPROOT_ASSET_ID as Hex));

describe("AtomicSwap BNB <> Taproot Assets (Lightning HTLC)", async function () {
    let hardhatViem: any;
    let publicClient: any;
    let walletClient: any;

    let atomicSwapBNB: any;
    let deployer: any;
    let aliceBscAccount: Hex;
    let bobBscAccount: Hex;

    let aliceTapdClient: any;
    let bobTapdClient: any;
    let aliceInvoiceClient: any;
    // Secret and hashlock are NOT pre-generated here for the main swap
    // They will be derived from Alice's invoice.
    const atomicSwapSecret: Hex = generateSecret(); // This is the secret Bob will claim with on BSC
    const atomicSwapHashlock: Hex = computeHashlock(atomicSwapSecret); // This is the SHA256 hash of the secret
    
    beforeEach(async function () {
        const { viem } = await network.connect();
        hardhatViem = viem;

        publicClient = await hardhatViem.getPublicClient();
        walletClient = await hardhatViem.getWalletClient();

        const accounts = await walletClient.getAddresses();
        deployer = accounts[0];
        aliceBscAccount = accounts[1]; // Alice is the TA holder, claims BNB
        bobBscAccount = accounts[2]; // Bob is the BNB holder, claims TA

        atomicSwapBNB = await hardhatViem.deployContract(
            "AtomicSwapBNB",
            [],
            {
                abi: AtomicSwapBNB_ABI,
                bytecode: AtomicSwapBNB_BYTECODE,
                account: deployer,
            }
        );

        console.log(`Deployed AtomicSwapBNB at: ${atomicSwapBNB.address}`);

        aliceTapdClient = getTapdAxiosClient(ALICE_LITD_REST_HOST, ALICE_LITD_ADMIN_MACAROON_HEX);
        bobTapdClient = getTapdAxiosClient(BOB_LITD_REST_HOST, BOB_LITD_ADMIN_MACAROON_HEX);
        aliceInvoiceClient = getTapdAxiosClient(ALICE_LITD_REST_HOST, ALICE_LITD_INVOICE_MACAROON_HEX);

        console.log("--- Starting Atomic Swap Test ---");
    });

    it("Should successfully perform an atomic swap between Taproot Assets (LN) and BNB (BSC)", async function () {
        let aliceLnPaymentRequest: string;
        let aliceLnPaymentHash: Hex; // This will be the hashlock for the BSC contract
        let aliceLnPreimage: Hex; // This is the secret for the BSC contract

        // --- 1. Alice (BNB Holder, wants TaprootAsset) initiates the LN side ---
        // Alice creates a Taproot Asset invoice. litd will generate a random r_hash and r_preimage.
        console.log("\n--- 1. Alice: Creating Taproot Asset Invoice ---");
        try {
            const invoiceResponse = await aliceTapdClient.post('/v1/taproot-assets/channels/invoice', {
                asset_amount: SWAP_AMOUNT_TAP_SATOSHIS.toString(),
                asset_id: TAPROOT_ASSET_ID_BASE64,
                invoice_request: {
                    memo: `Swap for ${SWAP_AMOUNT_BNB.toString()} BNB`,
                    private: true,
                    value: "0", // For asset invoices, the actual value is in asset_amount 
                    r_hash: hexToBase64(atomicSwapHashlock), // Convert your hex hashlock to base64
                } 
            });
            console.log("Alice's Taproot Asset Invoice Created:", invoiceResponse.data);

            const invoiceResult = invoiceResponse.data.invoice_result;
            assert.ok(invoiceResult, "Invoice result missing from response");
            assert.ok(invoiceResult.payment_request, "Payment request missing from invoice result");
            assert.ok(invoiceResult.r_hash, "R_hash (payment hash) missing from invoice result");

            aliceLnPaymentRequest = invoiceResult.payment_request;
            console.log(`Alice PaymentHash: ${invoiceResult.r_hash}`)
            aliceLnPaymentHash = base64ToHex(invoiceResult.r_hash); // THIS IS OUR HASHLOCK!
            // We cannot get the preimage here. It will be revealed only when Bob pays.
            console.log(`Taproot Asset Payment Request (Invoice): ${aliceLnPaymentRequest}`);
            console.log(`Invoice Payment Hash (Hashlock for BSC): ${aliceLnPaymentHash}`);

        } catch (error: any) {
            console.error("Error creating Taproot Asset invoice:", error.response?.data?.error || error.response?.data || error.message || error);
            assert.fail(`Failed to create Taproot Asset invoice: ${error.message || error.response?.data?.error || JSON.stringify(error.response?.data)}`);
        }

        await sleep(2000); // Simulate network latency

        // --- 2. Alice: Locks BNB on BSC using the LN invoice's r_hash as hashlock ---
        console.log("\n--- 2. Alice: Locking BNB on BSC ---");
        const bscCurrentBlock = await publicClient.getBlock({ blockTag: "latest" });
        const bnbTimelock = BigInt(bscCurrentBlock.timestamp) + BigInt(BNB_TIMELOCK_OFFSET);

        const aliceInitialBnbBalance = await publicClient.getBalance({ address: aliceBscAccount });

        await hardhatViem.assertions.emitWithArgs(
            atomicSwapBNB.write.initiateSwap(
                [aliceLnPaymentHash, bnbTimelock], // Use the LN invoice's r_hash as the hashlock
                {
                    value: SWAP_AMOUNT_BNB,
                    account: aliceBscAccount, // Alice locks her BNB
                }
            ),
            atomicSwapBNB,
            "SwapInitiated",
            [aliceLnPaymentHash, getAddress(aliceBscAccount), SWAP_AMOUNT_BNB, bnbTimelock],
        );
        console.log(`Alice locked ${SWAP_AMOUNT_BNB} BNB.`);
        assert.ok(await publicClient.getBalance({ address: atomicSwapBNB.address }) > 0n, "BNB not locked in contract");
        const aliceAfterLockBnbBalance = await publicClient.getBalance({ address: aliceBscAccount });
        assert.ok(aliceAfterLockBnbBalance < aliceInitialBnbBalance - SWAP_AMOUNT_BNB, "Alice's balance should decrease"); // Account for gas
        await sleep(2000);

        // --- 3. Bob (TAP Holder): Pays Alice's Taproot Asset Invoice (REVEALS SECRET TO BOB) ---
        console.log("\n--- 3. Bob: Paying Taproot Asset Invoice ---");
        try {
            const payResponse = await sendStreamingPayment(bobTapdClient, {
                asset_id: TAPROOT_ASSET_ID_BASE64,
                payment_request: {
                    payment_request: aliceLnPaymentRequest, // The actual Bolt11 string goes INSIDE this nested object
                    timeout_seconds: 60, // This timeout is for the *nested* SendPaymentRequest
                }
            });

            console.log("Bob's invoice payment response:", payResponse);
            assert.ok(payResponse.payment_preimage, "Payment preimage missing in response for Bob's payment");

            aliceLnPreimage = payResponse.payment_preimage; // THIS IS OUR SECRET!
            console.log(`Preimage revealed to Bob: ${aliceLnPreimage}`);
            // Validate that the revealed preimage hashes to the hashlock Alice used on BSC
            assert.equal(computeHashlock(aliceLnPreimage), aliceLnPaymentHash, "Revealed preimage's hash must match the hashlock Alice used on BSC!");

        } catch (error: any) {
            console.error("Error paying Taproot Asset invoice:", error.response?.data?.error || error.response?.data || error.message || error);
            assert.fail(`Failed for Bob to pay Taproot Asset invoice: ${error.message || error.response?.data?.error || JSON.stringify(error.response?.data)}`);
        }
        await sleep(5000); // Give LN time to settle and propagate

        // --- 4. Bob: Claims BNB on BSC with the revealed secret (preimage) ---
        console.log("\n--- 4. Bob: Claiming BNB on BSC with Revealed Secret ---");
        const bobInitialBnbBalance = await publicClient.getBalance({ address: bobBscAccount });
        await hardhatViem.assertions.emitWithArgs(
            atomicSwapBNB.write.claimSwap(['0x'+aliceLnPreimage], { account: bobBscAccount }), // Bob uses the preimage as the secret
            atomicSwapBNB,
            "SwapClaimed",
            [aliceLnPaymentHash, getAddress(bobBscAccount), '0x'+aliceLnPreimage],
        );
        console.log("Bob claimed BNB.");
        const bobFinalBnbBalance = await publicClient.getBalance({ address: bobBscAccount });
        assert.ok(bobFinalBnbBalance > bobInitialBnbBalance, "Bob's balance should increase after claiming BNB");
        assert.equal(await publicClient.getBalance({ address: atomicSwapBNB.address }), 0n, "Contract should be empty after claim");
        await sleep(2000);

        // --- 5. Alice: Confirms her Taproot Asset invoice is settled ---
        // This step is mostly for verification. Alice implicitly knows it's settled if Bob paid.
        console.log("\n--- 5. Alice: Confirming Taproot Asset Invoice Settlement ---");
        try {
            const base64EncodedPaymentHash = toUrlSafeBase64(hexToBase64(aliceLnPaymentHash));
            const aliceInvoiceStatus = await aliceInvoiceClient.get(`/v2/invoices/lookup?payment_hash=${base64EncodedPaymentHash}`);
            console.log(`[Alice] Taproot Asset Invoice status: ${aliceInvoiceStatus}`);
            assert.equal(aliceInvoiceStatus.data.state, "SETTLED", "Alice's invoice should be settled after Bob pays.");
            assert.ok(aliceInvoiceStatus.data.r_preimage, "Alice's settled invoice should contain the preimage.");
            assert.equal(base64ToHex(aliceInvoiceStatus.data.r_preimage), '0x'+aliceLnPreimage, "Alice's retrieved preimage must match the one revealed to Bob.");
        } catch (error: any) {
            console.error("Error confirming Alice's invoice status:", error.response?.data?.error || error.response?.data || error.message || error);
            assert.fail(`Failed for Alice to confirm invoice settlement: ${error.message || error.response?.data?.error || JSON.stringify(error.response?.data)}`);
        }

        console.log(`Bob has successfully paid Alice's invoice, and the ${SWAP_AMOUNT_TAP_SATOSHIS} Taproot Assets are now transferred to Bob.`);
        console.log(`Alice has successfully claimed ${SWAP_AMOUNT_BNB} BNB.`);

        console.log("\n--- Atomic Swap Test Completed Successfully! ---");
    });

    // --- Refund path: Alice locks BNB, her invoice (or other trigger for LN payment) expires, she refunds ---
    it("Should allow Alice to refund BNB if her LN invoice expires or the swap isn't completed in time", async function () {
        console.log("\n--- Test: Alice Refunds BNB (Invoice Expiration) ---");
        let aliceOwnLnPaymentRequest: string;
        let aliceOwnLnPaymentHash: Hex;

        // 1. Alice creates her *own* Taproot Asset Invoice (e.g., to a dummy address, or self, which won't be paid)
        console.log("\n--- 1. Alice: Creating her own Taproot Asset Invoice for Refund Test ---");
        try {
            const invoiceResponse = await aliceTapdClient.post('/v1/taproot-assets/channels/invoice', {
                asset_amount: SWAP_AMOUNT_TAP_SATOSHIS.toString(),
                asset_id: TAPROOT_ASSET_ID_BASE64,
                invoice_request: {
                    memo: "Refund Test - Alice's Own LN Invoice (won't be paid)",
                    private: true,
                    value: "0",
                },
            });
            aliceOwnLnPaymentRequest = invoiceResponse.data.invoice_result.payment_request;
            aliceOwnLnPaymentHash = base64ToHex(invoiceResponse.data.invoice_result.r_hash);
            console.log("Alice created her own LN invoice for refund test:", aliceOwnLnPaymentRequest);
            console.log("Invoice Payment Hash (Hashlock for BSC):", aliceOwnLnPaymentHash);

        } catch (error: any) {
            console.error("Error creating Alice's own Taproot Asset invoice for refund test:", error.response?.data?.error || error.response?.data || error.message || error);
            assert.fail(`Failed to create Alice's own Taproot Asset invoice for refund test: ${error.message || error.response?.data?.error || JSON.stringify(error.response?.data)}`);
        }
        await sleep(1000);

        // 2. Alice locks BNB on BSC using the hashlock from her own LN invoice
        console.log("\n--- 2. Alice: Locking BNB on BSC for Refund Test ---");
        const bscCurrentBlock = await publicClient.getBlock({ blockTag: "latest" });
        const shortBnbTimelock = BigInt(bscCurrentBlock.timestamp) + 10n; // Very short timelock for testing

        const contractBalanceBeforeLock = await publicClient.getBalance({ address: atomicSwapBNB.address });

        await hardhatViem.assertions.emitWithArgs(
            atomicSwapBNB.write.initiateSwap(
                [aliceOwnLnPaymentHash, shortBnbTimelock], // Alice uses her own LN r_hash as hashlock
                { value: SWAP_AMOUNT_BNB, account: aliceBscAccount }
            ),
            atomicSwapBNB,
            "SwapInitiated",
            [aliceOwnLnPaymentHash, getAddress(aliceBscAccount), SWAP_AMOUNT_BNB, shortBnbTimelock],
        );
        const aliceInitialBnbBalance = await publicClient.getBalance({ address: aliceBscAccount });

        console.log(`Alice locked ${SWAP_AMOUNT_BNB} BNB for refund test.`);
        assert.equal(await publicClient.getBalance({ address: atomicSwapBNB.address }), contractBalanceBeforeLock + SWAP_AMOUNT_BNB, "BNB not locked in contract for refund test");
        await sleep(1000);

        // 3. Fast forward time on Hardhat to pass Alice's timelock on BSC
        // This simulates the LN invoice expiring or the counterparty (Bob) not taking action in time.
        console.log("\n--- 3. Fast-forwarding time to allow BNB refund ---");
        await publicClient.request({
            method: "evm_increaseTime",
            params: [Number(shortBnbTimelock - BigInt(bscCurrentBlock.timestamp)) + 100] // More buffer
        });
        await publicClient.request({ method: "evm_mine" });
        console.log("Hardhat time fast-forwarded.");
        await sleep(1000);

        // 4. Alice refunds her BNB
        console.log("\n--- 4. Alice: Refunding BNB ---");
        await hardhatViem.assertions.emitWithArgs(
            atomicSwapBNB.write.refundSwap([aliceOwnLnPaymentHash], { account: aliceBscAccount }), // Alice uses her own LN r_hash to refund
            atomicSwapBNB,
            "SwapRefunded",
            [aliceOwnLnPaymentHash, getAddress(aliceBscAccount)],
        );
        await publicClient.request({ method: "evm_mine" });

        assert.equal(await publicClient.getBalance({ address: atomicSwapBNB.address }), 0n, "Contract should be empty after refund");
        const aliceFinalBnbBalance = await publicClient.getBalance({ address: aliceBscAccount });
        assert.ok(aliceFinalBnbBalance > aliceInitialBnbBalance, "Alice's balance should largely recover after refund");
        console.log("Alice successfully refunded BNB.");
    });
});