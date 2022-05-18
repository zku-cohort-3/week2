//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { PoseidonT3 } from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract
import "hardhat/console.sol";

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root
    uint256 public layer;
    uint256 public leafCnt;

    constructor() {
        layer = 3;
        leafCnt = 8;
        hashes = new uint256[](2*leafCnt-1);

        for (uint i = 0; i < leafCnt-1; i++) {
            hashes[leafCnt+i] = PoseidonT3.poseidon([hashes[2 * i],
                                                     hashes[2 * i + 1]]);
        }

        root = hashes[hashes.length-1];
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // insert a hashed leaf into the Merkle tree
        hashes[index] = hashedLeaf;
        uint256 traversed;
        uint cntBase;
        uint256 layerIndex = index;

        // calculate hash through parent path
        for (uint i = 0; i < layer; i++) {
            cntBase = layerIndex - traversed;
            traversed += 2 ** (layer-i);
            uint256 nextLayerIndex = cntBase / 2 + traversed;

            if (layerIndex % 2 == 0) {
                hashes[nextLayerIndex] = PoseidonT3.poseidon([hashes[layerIndex], hashes[layerIndex + 1]]);
            } else {
                hashes[nextLayerIndex] = PoseidonT3.poseidon([hashes[layerIndex - 1], hashes[layerIndex]]);
            }

            layerIndex = nextLayerIndex;
        }

        root = hashes[hashes.length-1];
        index++;

        return root;
    }

    function verify(
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[1] memory input
        ) public view returns (bool) {
        // verifies the inclusion proof and output root is the same as the one on chain
        return verifyProof(a, b, c, input) && input[0] == root;
    }
}
