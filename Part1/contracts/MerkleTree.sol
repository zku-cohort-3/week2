//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {PoseidonT3} from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root

    uint256 internal constant MAX_DEPTH = 3;
    uint8 internal constant LEAVES_PER_NODE = 2;
    uint8 internal treeLevels;
    uint256 internal currentTreeNum;

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        uint256[LEAVES_PER_NODE] memory temp;

        for (uint8 i = 0; i < MAX_DEPTH; i++) {
            for (uint8 j = 0; j < LEAVES_PER_NODE; j++) {
                temp[j] = 0;
            }
        }
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
    }

    function verify(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[1] memory input
    ) public view returns (bool) {
        // [assignment] verify an inclusion proof and check that the proof root matches current root
    }
}
