# contracts

EVM-side smart contracts for the atomic swap prototype.

## Main Contract: `AtomicSwapBNB.sol`

`AtomicSwapBNB` is a Hash Time-Locked Contract (HTLC) for locking BNB and resolving swaps with a hashlock/preimage flow.

### Contract address

https://testnet.bscscan.com/address/0x63189b272c97d148a609ed6c3b99075abf0c1693#code

### Purpose

It secures the BNB side of the swap by enforcing:
- Claim with correct secret before timelock
- Refund to original sender after timelock

### Core Functions

- `initiateSwap(bytes32 _hashlock, uint256 _timelock)`
  - Locks BNB (`msg.value`) under a hashlock and timelock.
  - Requires unique hashlock and valid future timelock.

- `claimSwap(bytes32 _secret)`
  - Computes `sha256(secret)` and matches it to existing swap hashlock.
  - If valid and before timelock, transfers locked BNB to caller.

- `refundSwap(bytes32 _hashlock)`
  - Allows original sender to recover BNB after timelock expires.

### Events

- `SwapInitiated(hashlock, sender, value, timelock)`
- `SwapClaimed(hashlock, receiver, secret)`
- `SwapRefunded(hashlock, sender)`

### Notes

- Swap entries are indexed by hashlock.
- Only sender can refund.
- A successful claim/refund marks swap state to prevent double spend.
