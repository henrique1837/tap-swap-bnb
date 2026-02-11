// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title AtomicSwapBNB
 * @dev This contract facilitates the BNB side of an atomic swap
 *      using a Hash Time-Locked Contract (HTLC) mechanism.
 *      It allows a sender to lock BNB, which can then be claimed by
 *      a receiver who knows the preimage (secret) of a specific hash,
 *      or reclaimed by the sender after a timeout.
 */
contract AtomicSwapBNB {

    // Structure to hold details of each ongoing swap
    struct Swap {
        uint256 value;          // Amount of BNB locked for the swap
        address payable sender;   // The address that initiated and locked the BNB
        bytes32 hashlock;       // The hash of the secret (preimage) required to claim
        uint256 timelock;       // Unix timestamp after which the sender can reclaim
        bool claimed;           // True if the swap has been successfully claimed by receiver
        bool refunded;          // True if the swap has been refunded to the sender
    }

    // Mapping to store swap details, indexed by a unique swap ID (hashlock)
    mapping(bytes32 => Swap) public swaps;

    // Event emitted when a new swap is initiated
    event SwapInitiated(
        bytes32 indexed hashlock,
        address indexed sender,
        uint256 value,
        uint256 timelock
    );

    // Event emitted when a swap is successfully claimed
    event SwapClaimed(
        bytes32 indexed hashlock,
        address indexed receiver,
        bytes32 secret
    );

    // Event emitted when a swap is refunded due to timeout
    event SwapRefunded(
        bytes32 indexed hashlock,
        address indexed sender
    );

    /**
     * @dev Initiates an atomic swap by locking BNB.
     *      The BNB is sent with the transaction and stored in the contract.
     * @param _hashlock The SHA256 hash of the secret (preimage) needed to claim.
     * @param _timelock A Unix timestamp (in seconds) after which the sender can reclaim the funds
     *                  if the receiver has not claimed them.
     *                  This should be far enough in the future for the swap to complete,
     *                  but shorter than the timelock on the Lightning Network side.
     */
    function initiateSwap(
        bytes32 _hashlock,
        uint256 _timelock
    )
        external
        payable
    {
        require(msg.value > 0, "Swap: Amount must be greater than zero");
        require(_timelock > block.timestamp, "Swap: Timelock must be in the future");
        require(swaps[_hashlock].sender == address(0), "Swap: Hashlock already in use");
        // Ensure the timelock is not excessively long (e.g., max 1 week from now)
        // This prevents locking funds for an unreasonable duration.
        require(_timelock <= block.timestamp + 7 days, "Swap: Timelock too far in future");

        swaps[_hashlock] = Swap({
            value: msg.value,
            sender: payable(msg.sender),
            hashlock: _hashlock,
            timelock: _timelock,
            claimed: false,
            refunded: false
        });

        emit SwapInitiated(_hashlock, msg.sender, msg.value, _timelock);
    }

    /**
     * @dev Claims the locked BNB by providing the correct secret (preimage).
     * @param _secret The secret (preimage) that hashes to the _hashlock.
     *                This must be the original secret known by the receiver from the Lightning side.
     */
    function claimSwap(
        bytes32 _secret
    )
        external
    {
        bytes32 _hashlock = sha256(abi.encodePacked(_secret));
        Swap storage swap = swaps[_hashlock];

        require(swap.sender != address(0), "Swap: No swap for this hashlock");
        require(!swap.claimed, "Swap: Already claimed");
        require(!swap.refunded, "Swap: Already refunded");
        require(block.timestamp < swap.timelock, "Swap: Timelock has passed, cannot claim");

        // The SHA256 of the provided secret must match the stored hashlock
        require(_hashlock == swap.hashlock, "Swap: Incorrect secret for hashlock");

        swap.claimed = true;
        // Transfer the locked BNB to the caller (the receiver)
        payable(msg.sender).transfer(swap.value);

        emit SwapClaimed(_hashlock, msg.sender, _secret);
    }

    /**
     * @dev Refunds the locked BNB to the sender if the timelock has passed
     *      and the swap has not been claimed.
     * @param _hashlock The SHA256 hash of the secret associated with the swap to be refunded.
     */
    function refundSwap(
        bytes32 _hashlock
    )
        external
    {
        Swap storage swap = swaps[_hashlock];

        require(swap.sender != address(0), "Swap: No swap for this hashlock");
        require(!swap.claimed, "Swap: Already claimed");
        require(!swap.refunded, "Swap: Already refunded");
        require(block.timestamp >= swap.timelock, "Swap: Timelock has not yet passed");
        require(msg.sender == swap.sender, "Swap: Only sender can refund");

        swap.refunded = true;
        // Transfer the locked BNB back to the original sender
        payable(swap.sender).transfer(swap.value);

        emit SwapRefunded(_hashlock, msg.sender);
    }
}