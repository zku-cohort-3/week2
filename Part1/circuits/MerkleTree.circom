pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    // assign storage for hash calculated
    var hashes[2**n-1];
    component hash_calculators[2**n-1];

    for (var i=0; i<2**n-1; i++) {
        hash_calculators[i] = Poseidon(2);

        // calculate hash with leaves or hash calculated
        if(2*i+2 <= 2**n) {
            hash_calculators[i].inputs[0] <-- leaves[2*i];
            hash_calculators[i].inputs[1] <-- leaves[2*i+1];
        } else {
            hash_calculators[i].inputs[0] <-- hashes[2*(i-2**(n-1))];
            hash_calculators[i].inputs[1] <-- hashes[2*(i-2**(n-1))+1];            
        }

        hashes[i] = hash_calculators[i].out;
    }

    root <== hashes[2**n-2];
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    var hash = leaf;
    component hash_calculators[n];

    // calculate parent hash through path
    for (var i = 0; i < n; i++) {
        hash_calculators[i] = Poseidon(2);
        // current hash as inputs[0] when on left, otherwise as inputs[1]
        hash_calculators[i].inputs[0] <-- path_index[i] ? path_elements[i] : hash; 
        hash_calculators[i].inputs[1] <-- path_index[i] ? hash : path_elements[i];
        hash = hash_calculators[i].out;
    }

    root <== hash;
}