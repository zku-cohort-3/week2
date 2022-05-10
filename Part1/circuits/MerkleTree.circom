pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves

    var MERKLE_size = 2**n-1; // Merkle Tree Size
    var ROOT_i = (2**n)-2;    // Root Index

    signal merkle[MERKLE_size];
    component poseidon[MERKLE_size];
    for(var i=0; i<(2**n)/2; ++i){
        poseidon[i] = Poseidon(2);
        poseidon[i].inputs[0] <== leaves[i*2]; 
        poseidon[i].inputs[1] <== leaves[i*2+1]
        merkle[i] =  poseidon.out;
    }

    for(var i=(2**n)/2; i<(2**n)-1; ++i){
        poseidon[i] = Poseidon(2);
        poseidon[i].inputs[0] <== merkle[(i-(2**n)/2)*2]; 
        poseidon[i].inputs[1] <== merkle[i-(2**n)/2)*2+1]
        merkle[i] =  poseidon.out;
    }

    root <== merkle[ROOT_i];
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
    
}