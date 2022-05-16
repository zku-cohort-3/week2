pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

// compute the root of a MerkleTree of n Levels
template CheckRoot(n) {
    signal input leaves[2**n]; // 3 levels would be 8 leaves
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    // Root hash will be hashedTree[0]
    var capacity = 2**(n+1) - 1;
    component hashedTree[capacity];
    // We know n levels, so we can figure out how many leaves are needing to be filled
    var numLeaves = 2**n / 2
    // Fill in our leaves, which will be the last items in the array
    for (var i = 0; i <= numLeaves; i++) hashedTree[capacity - 1 - i] = leaves[2**n - i];
    // Fill in the rest of our flattened array starting from our leaves and working backwards towards the root
    var startingIdx = capacity - numLeaves - 1;
    component p[startingIdx];
    for (var i = startingIdx; i >= 0; i--) {
        p[i] = Poseidon(2); // instantiate a new poseidon circuit
        p[i].inputs[0] <-- hashedTree[i*2 + 1]; // left node
        p[i].inputs[1] <-- hashedTree[i*2 + 2]; // right node
        hashedTree[i] = p[i].out; // assign the hash to our hashedTree
    }

    root <== hashedTree[0];
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
    component merkleRoot;
    merkleRoot = CheckRoot(n);
    root <== merkleRoot.root;
}