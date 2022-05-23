//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {PoseidonT3} from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root

    uint256 private constant depth = 3;
    uint256 private leafCount;
    uint256 private capacity;
    uint256[depth] private placeholders;

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        // Hardcode for 8 leaves
        leafCount = 2**depth;
        capacity = 2**(depth + 1) - 1;

        // Initialize all nodes as 0
        for (uint8 i = 0; i < capacity; i++) {
            hashes[i] = 0;
        }
        // Start filling placeholder for later use
        placeholders[0] = 0;

        // Compute the rest of the tree
        uint256 hashedValue = 0;
        uint256 left = 0;
        uint256 right = 0;
        for (uint8 i = 1; i <= depth; i++) {
            for (uint8 j = 0; j < (1 << (depth - i)); j++) {
                left = hashes[16 - (1 << (4 - (i - 1))) + (j << 1)];
                right = hashes[16 - (1 << (4 - (i - 1))) + ((j << 1) | 1)];
                hashedValue = PoseidonT3.poseidon([left, right]);
                hashes[16 - (1 << (4 - i)) + j] = hashedValue;
            }
            if (i != depth) {
                placeholders[i] = hashes[16 - (1 << (4 - i))];
            }
        }

        root = hashes[16 - (1 << (4 - 3)) + 0];
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
        // Check that we have leaf node spots available for insertion
        require(index < leafCount, "Merkle tree is full");

        // Our index is primed to receive a new hashed value, so we insert first
        hashes[index] = hashedLeaf;

        // Cache and increment for next time
        uint256 currentIndex = index;
        ++index;

        // Then we compute the necessary hash nodes up to the root
        uint256 hashedValue = 0;
        uint256 left = 0;
        uint256 right = 0;

        for (uint8 i = 1; i <= depth; i++) {
            if (currentIndex % 2 == 0) {
                // current node at left
                left = hashes[16 - (1 << (4 - (i - 1))) + currentIndex];
                right = placeholders[i - 1];
                hashedValue = PoseidonT3.poseidon([left, right]);

                hashes[16 - (1 << (4 - i)) + (currentIndex >> 1)] = hashedValue;
            } else {
                // current node at right
                left = hashes[16 - (1 << (4 - (i - 1))) + currentIndex - 1];
                right = hashes[16 - (1 << (4 - (i - 1))) + currentIndex];
                hashedValue = PoseidonT3.poseidon([left, right]);

                hashes[16 - (1 << (4 - i)) + (currentIndex >> 1)] = hashedValue;
            }

            currentIndex >>= 1;
        }

        // Set our root to the hash of it's two children
        root = hashes[16 - (1 << (4 - 3)) + 0];

        // Return our insertion index
        return currentIndex;
    }

    function verify(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[1] memory input
    ) public view returns (bool) {
        // [assignment] verify an inclusion proof and check that the proof root matches current root
        bool matchesRoot = root == input[0];
        bool isVerified = verifyProof(a, b, c, input);
        return matchesRoot && isVerified;
    }
}
