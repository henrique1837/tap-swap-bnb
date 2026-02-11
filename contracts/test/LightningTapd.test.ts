import assert from "node:assert/strict";
import { describe, it,beforeEach } from "node:test";
import path from "node:path";
// No longer need fs for reading the cert file directly
// import fs from "node:fs";
import * as dotenv from 'dotenv';
import axios from "axios"; // Our HTTP client
import https from "https"; // We'll use this directly for the Agent

// --- ESM-compatible way to get current directory ---
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();
// --- Configuration ---
const TAPD_REST_HOST = process.env.TAPD_REST_HOST; // From your Polar info

// You MUST REPLACE these with your ACTUAL hex values from Polar
const TAPD_ADMIN_MACAROON_HEX = process.env.TAPD_ADMIN_MACAROON_HEX

// Helper function to decode hex to base64 or buffer
const hexToBase64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64');
const hexToBuffer = (hex: string) => Buffer.from(hex, 'hex');

describe("Lightning Taproot Assets (tapd) REST Connection", function () {
  let axiosClient: any; // Axios instance configured for tapd

  beforeEach(function () {
    // Convert the hex TLS certificate directly to a Buffer

    // Create an Axios instance with necessary configurations
    axiosClient = axios.create({
      baseURL: TAPD_REST_HOST,
      headers: {
        // Add macaroon for authentication
        'Grpc-Metadata-macaroon': TAPD_ADMIN_MACAROON_HEX,
      },
      httpsAgent: new https.Agent({ // Use imported 'https' module
        // This is crucial for self-signed certificates in development/testing
        rejectUnauthorized: false, // DO NOT USE IN PRODUCTION WITHOUT PROPER CA VERIFICATION
      }),
      timeout: 10000, // 10 seconds timeout
    });
  });

  it("Should successfully connect to tapd via REST and list assets", async function () {
    try {
      // The endpoint for listing assets might vary slightly.
      // Common paths are /v1/assets, /v1/taprootassets/assets, or /v1/tapd/assets
      // Let's stick with /v1/assets as a common default.
      const response = await axiosClient.get('/v1/taproot-assets/assets');

      console.log("Successfully connected to tapd (REST) and listed assets:");
      console.log(JSON.stringify(response.data, null, 2));

      // Basic assertion: ensure assets array exists (even if empty)
      assert.ok(response.data && typeof response.data === 'object', "Response data should be an object");
      assert.ok(Array.isArray(response.data.assets), "Response data should contain an 'assets' array");

    } catch (error: any) {
      console.error("Error connecting to tapd (REST) or listing assets:");
      if (error.response) {
        console.error("Status:", error.response.status);
        console.error("Data:", error.response.data);
        console.error("Headers:", error.response.headers);
      } else if (error.request) {
        console.error("No response received:", error.request);
      } else {
        console.error("Error message:", error.message);
      }
      assert.fail(`Failed to list assets via REST: ${error.message || error.response?.statusText}`);
    }
  });
});