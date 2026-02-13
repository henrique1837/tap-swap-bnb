# swap-ui

Frontend application for coordinating atomic swaps between Taproot Assets (Lightning) and BNB (EVM), using Nostr for intention communication.

## What This UI Does

The UI connects:
- LNC (Lightning node access)
- EVM wallet (for BNB lock transactions)
- Nostr (for intention, acceptance, and invoice coordination events)

The app uses a step-based UX (`Create`, `Market`, `Lock`, `Claim`) and isolates logic by role.

## Main UX Flow

1. `Create`
- User chooses swap intent (`BNB` or `TAPROOT_BNB`) and publishes intention to Nostr.

2. `Market`
- Users browse open intentions and accept one.
- **Test Mode**: Allows self-accept for local testing.

3. `Lock (Execute)`
- **Role**: The party responsible for locking BNB (Locker).
- Generates Lightning invoice or waits for Counterparty's invoice.
- Locks BNB on the atomic swap contract.
- Invoice details are published to Nostr automatically.

4. `Claim`
- **Role**: The party who receives BNB (Claimer).
- **Provide Invoice**: If needed, generates/submits LN invoice for the Locker.
- **Verify**: Checks if BNB is locked on-chain.
- **Pay**: Pays the Lightning invoice via LNC (or manual).
- **Claim**: Uses the revealed preimage to claim the locked BNB.

## Role Rules

- If intention wants `BNB`:
  - **Locker**: Accepter (Generates Invoice -> Locks BNB).
  - **Claimer**: Poster (Pays Invoice -> Claims BNB).

- If intention wants `TAPROOT_BNB`:
  - **Locker**: Poster (Generates Invoice -> Locks BNB).
  - **Claimer**: Accepter (Pays Invoice -> Claims BNB).

## Key UI Files

- `src/App.jsx`: Main orchestration, state management, and tabbed workflow.
- `src/contexts/NostrContext.jsx`: Nostr event publishing, fetching, and coordination logic.
- `src/components/ClaimableIntentionsList.jsx`: Specialized list for filtering and selecting claimable swaps.
- `src/components/SwapIntentionsList.jsx`: Market list for browsing and accepting open swap intentions.
- `src/components/CreateSwapIntention.jsx`: UI for defining and publishing new swap intentions.
- `src/components/ConnectScreen.jsx`: LNC + EVM Wallet connection and authentication screen.
- `src/components/InvoiceDecoder.jsx`: Utility component for visualizing and verifying Lightning invoices.
- `src/components/NodeInfo.jsx`: Modal displaying connected Lightning node URI and Taproot Asset balances.
- `src/components/NostrIdentityDisplay.jsx`: Modal for viewing and managing the derived Nostr identity.

## Run

```bash
npm install
npm run dev
```

## Screenshot Placeholders

### 1) Connect Screen

![Connect Screen](./docs/images/connect-screen.png)

### 2) Create Intention (Create Tab)

![Create Tab](./docs/images/create-tab.png)

### 3) Market Intentions (Market Tab)

![Market Tab](./docs/images/market-tab.png)

### 4) Execute Step (Invoice + Lock)

  4.1 Generate a taproot asset lightning invoice using Polar

![Execute Tab - Invoice Creation](./docs/images/polar-invoice-creation.png)

  4.2 Invoice created

![Execute Tab - Invoice Done](./docs/images/polar-invoice-done.png)

  4.3 Invoice Paste (LNC does not supports taproot asset invoices yet, so we need to paste it manually, we allow using a normal invoice to test LNC);

![Execute Tab - Invoice Paste](./docs/images/paste-invoice.png)

  4.4 Lock BNB - The invoice hashlock is used to lock the BNB on the atomic swap contract, the secret needed to release it is revealed after the invoice is paid for the user that pays it;

![Execute Tab - Lock BNB](./docs/images/lock-bnb.png)

### 5) Success / Invoice Published

![Success State](./docs/images/success-state.png)


