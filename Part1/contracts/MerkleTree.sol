//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {PoseidonT3} from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract

contract MerkleTree is Verifier {
    // The maximum tree depth
    uint256 internal constant MAX_DEPTH = 3;
    // The number of leaves per node
    uint8 internal constant LEAVES_PER_NODE = 2;

    uint256[14] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf(nextLeafIndex)
    uint256 public root; // the current Merkle root

    uint256 internal currentTreeNum;

    // The zero value per level
    mapping(uint8 => uint256) public zeros;

    mapping(uint256 => mapping(uint256 => uint256)) internal filledSubtrees;

    // ある深さにおける、それ以下のサブツリー
    mapping(uint256 => mapping(uint256 => uint256))
        internal originalFilledSubtrees;

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        uint256[LEAVES_PER_NODE] memory temp;
        uint256 currentZero = 0;

        for (uint8 i = 0; i < MAX_DEPTH; i++) {
            for (uint8 j = 0; j < LEAVES_PER_NODE; j++) {
                originalFilledSubtrees[i][j] = currentZero;
                temp[j] = currentZero;
            }
            hashes[i] = PoseidonT3.poseidon(temp);
            zeros[i] = currentZero;
            currentZero = hashes[i];
        }
        root = currentZero;
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
        if (index >= uint256(LEAVES_PER_NODE)**uint256(MAX_DEPTH)) {
            currentTreeNum++;
            for (uint8 i = 0; i < MAX_DEPTH; i++) {
                for (uint8 j = 0; j < LEAVES_PER_NODE; j++) {
                    filledSubtrees[i][j] = originalFilledSubtrees[i][j];
                }
            }
        }

        uint256 currentIndex = index;
        uint256 currentLevelHash = hashedLeaf;
        uint256[LEAVES_PER_NODE] memory temp;
        // The leaf's relative position within its node
        uint256 m = currentIndex % LEAVES_PER_NODE;

        for (uint8 i = 0; i < MAX_DEPTH; i++) {
            // If the leaf is at relative index 0, zero out the level in
            // filledSubtrees
            if (m == 0) {
                for (uint8 j = 1; j < LEAVES_PER_NODE; j++) {
                    filledSubtrees[i][j] = zeros[i];
                }
            }
            filledSubtrees[i][m] = currentLevelHash;

            for (uint8 j = 0; j < LEAVES_PER_NODE; j++) {
                temp[j] = filledSubtrees[i][j];
            }

            currentLevelHash = PoseidonT3.poseidon(temp);
            currentIndex /= LEAVES_PER_NODE;
            m = currentIndex % LEAVES_PER_NODE;
        }

        root = currentLevelHash;

        index += 1;
        return currentIndex;
    }

    function verify(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[1] memory input
    ) public view returns (bool) {
        // [assignment] verify an inclusion proof and check that the proof root matches current root
        return verifyProof(a, b, c, input);
    }
}
