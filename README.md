# tap-swap-bnb

Atomic swap prototype between:
- Taproot Assets (Lightning) side (invoice + preimage flow)
- BNB on EVM chain (HTLC contract)

Nostr is used as the communication layer for swap intentions and coordination events.

## Contract Deployed

https://testnet.bscscan.com/address/0x63189b272c97d148a609ed6c3b99075abf0c1693

## Intent

This project demonstrates a practical cross-domain swap UX where participants:
1. Publish swap intentions on Nostr
2. Accept intentions on Nostr
3. Generate invoice + lock BNB in role-based order
4. Publish invoice details to Nostr after lock
5. Continue claim/refund flow via hashlock and timelock

## Project Structure

- `swap-ui/`: Frontend app (React + Vite) that manages LNC, Nostr, and swap flow UX.
- `contracts/`: Hardhat project containing the EVM-side HTLC contract (`AtomicSwapBNB.sol`).

## High-Level Flow

1. A user publishes an intention (`wantedAsset` = `BNB` or `TAPROOT_BNB`) on Nostr.
2. Another user accepts the intention.
3. According to the selected intention, the correct role generates an LN invoice.
4. The correct role locks BNB on-chain using the invoice hashlock.
5. After successful lock, invoice details are published to Nostr.
6. Counterparty pays invoice, preimage is revealed, and claim path proceeds.

## Folder Docs

- UI details: `swap-ui/README.md`
- Contract details: `contracts/README.md`

### Lightning network regtest setup
 
  - Install https://lightningpolar.com/
  - Run polar and create two litd (lightning terminal daemon) nodes (alice and bob) alongside a bitcoind node
  - Mint some Taproot Assets (TA) to the alice node
  - Open a channel between alice and bob with the Taproot Asset (TA)
  - Run the tests, start with LightningTapd.test.ts to see if everything works fine
  - Test the atomic swap with AtomicSwapTaproot.ts
  
