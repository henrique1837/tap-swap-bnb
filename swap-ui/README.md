# swap-ui

Frontend application for coordinating atomic swaps between Taproot Assets (Lightning) and BNB (EVM), using Nostr for intention communication.

## What This UI Does

The UI connects:
- LNC (Lightning node access)
- EVM wallet (for BNB lock transactions)
- Nostr (for intention, acceptance, and invoice coordination events)

The app uses a step-based UX (`Create`, `Market`, `Execute`) and auto-advances tabs based on progress.

## Main UX Flow

1. `Create`
- User chooses swap intent (`BNB` or `TAPROOT_BNB`) and publishes intention to Nostr.

2. `Market`
- Users browse open intentions and accept one.
- Test mode can allow self-accept for local testing.

3. `Execute`
- Correct role generates Lightning invoice.
- Correct role locks BNB on-chain.
- Invoice details are published to Nostr after successful lock.
- Counterparty proceeds to payment/claim side.

## Role Rules

- If intention wants `BNB`:
  - Accepter generates invoice
  - Accepter locks BNB
  - Poster waits, then pays invoice and claims BNB path

- If intention wants `TAPROOT_BNB`:
  - Poster generates invoice
  - Poster locks BNB
  - Accepter proceeds after invoice is published

## Key UI Files

- `src/App.jsx`: Main orchestration and tab UX.
- `src/contexts/NostrContext.jsx`: Nostr event publish/fetch logic.
- `src/components/SwapIntentionsList.jsx`: Intention list and acceptance UI.
- `src/components/CreateSwapIntention.jsx`: New intention publishing UI.
- `src/components/ConnectScreen.jsx`: LNC + wallet connection screen.

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

![Execute Tab](./docs/images/execute-tab.png)

### 5) Success / Invoice Published

![Success State](./docs/images/success-state.png)


