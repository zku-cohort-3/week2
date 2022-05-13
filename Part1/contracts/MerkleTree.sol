//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import { PoseidonT3 } from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root
    uint32 depth = 3;

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        for(uint32 i=0; i<2**depth; ++i){
            hashes.push(0);
        }

        for(uint32 i=0; i<2**depth-1; ++i){
            hashes.push(PoseidonT3.poseidon([hashes[i*2], hashes[i*2+1]]));
        }

        index = 0;
        root = hashes[hashes.length-1];
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
        require(index<2**depth, "Tree is full");

        hashes[index] = hashedLeaf;
        ++index;

        uint base=0;
        uint nbase=0;
        uint level_index=index;
        uint li;
        uint ri;
        for(uint32 i=0; i<depth; ++i){
            nbase += uint(2**depth) /uint(2**i);
            
            li = uint(level_index/2)*2;
            ri = li+1;

            // console.log(nbase);
            // console.log(level_index);
            // console.log(li);
            // console.log("************   ************");
            hashes[nbase + level_index] = PoseidonT3.poseidon([hashes[base + li], hashes[base + ri]]);
            level_index /= 2;
            base = nbase;
        }
        ++index;

        return hashes[(2**depth)*2-2];
    }

    function verify(
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[1] memory input
        ) public view returns (bool) {

        // [assignment] verify an inclusion proof and check that the proof root matches current root
        if(/*verify(a,b,c,input) /*&& */input[0] == root){
            return true;
        }
        return false;
    }
}
