pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/Poseidon.circom";

// compute the root of a MerkleTree of n Levels
template CheckRoot(n) {
    signal input leaves[2**n]; // 3 levels would be 8 leaves; all leaves are expected to be provided and hashed already
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves

    // Root hash will be hashedTree[capacity]
    var treeCapacity = 2**(n+1) - 1;
    var hashedTree[treeCapacity];

    // Fill in our leaves, which will be the first items in the array
    for (var i = 0; i < 2**n; i++) hashedTree[i] = leaves[i];

    //  0   2   4   6   8   10  12  14  index
    // [3,3,3,3,3,3,3,3,2,2,2,2,1,1,0]  hashedTree levels
    // Compute Poseidon hashes for all our non-leaves, up to the root
    var numNonLeaves = 2**n - 1;
    component pHashes[numNonLeaves];

    for (var i = 0; i < numNonLeaves; i++) {
        // Instantiate a new Poseidon circuit
        pHashes[i] = Poseidon(2);
        pHashes[i].inputs[0] <-- hashedTree[2*i]; // left node, grab from previous hashes
        pHashes[i].inputs[1] <-- hashedTree[2*i+1]; // right node, grab from previous hashes
        // assign the Poseidon hash to our hashedTree at the next level up
        var insertIdx = 2**n + i;
        hashedTree[insertIdx] = pHashes[i].out;
    }

    root <== hashedTree[treeCapacity-1];
}

// 'n' is 3 based off of our circuit.circom invocation
template MerkleTreeInclusionProof(n) {
    signal input leaf; // A hashed leaf
    signal input path_elements[n]; // The given hashes for the nodes needed to compute the root hash, ordered from level up, i.e. path_elements[0] will be a leaf
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path

    /*======= Visualization of 3-level merkle tree =========

        L0                  h14 root               1 node
                          /0       \1
        L1              h12         h13            2 nodes
                     /0   \1      /0   \1
        L2          h8    h9     h10    h11        4 nodes
                  /  |   /  \    |  \   |  \
        L3     h0   h1  h2  h3  h4  h5  h6  h7     8 nodes
    =========================================================*/

    // We will need 3 hashes from the merkle proof to compute up to the root
    component pHashes[n];
    // Keep a temp var for current hash
    var currHash = leaf;
    // Compute Poseidon hashes for the remaining nodes up to the root
    // Each iteration is computing 1 level and 1 hash
    for (var i = 0; i < n; i++) {
        // Instantiate a new Poseidon circuit
        pHashes[i] = Poseidon(2);
        // Compute left input for parent node - if current path_index is on left (0), then use provided hash, otherwise use our current hash
        pHashes[i].inputs[0] <-- path_index[i] == 0 ? path_elements[i] : currHash;
        // Compute right input for parent node - if current path_index is on right (1), then use provided hash, otherwise use our current hash
        pHashes[i].inputs[1] <-- path_index[i] == 1 ? path_elements[i] : currHash;
        // Assign our current hash iterator to the resulting hash
        // Our iterator becomes the parent node
        currHash = pHashes[i].out;
    }
    // We've computed through all levels and ended up with the final merkle root hash, assign to circuit output.
    root <== currHash;
}