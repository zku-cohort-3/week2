pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

//二分技仕様のPoseidonを実装
template HashLeftRight() {
    var nINputs = 2;
    signal input left;
    signal input right;

    signal output hash;

    component hasher = Poseidon(nINputs);
    left ==> hasher.inputs[0];
    right ==> hasher.inputs[1];

    hash <== hasher.out;
}

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;
    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    var numLeafHashers = 2**n / 2;
    var numIntermediateHashers =   numLeafHashers - 1;
    
    var numHashers = 2**n - 1;
    component hashers[numHashers];

var i = 0;
    for ( i=0; i<numHashers; i++) {
                hashers[i].left <== leaves[i*2];
        hashers[i].right <== leaves[i*2+1];
    }

    var k = 0;
    for (i=numLeafHashers; i<numLeafHashers + numIntermediateHashers; i++) {
        hashers[i].left <== hashers[k*2].hash;
        hashers[i].right <== hashers[k*2+1].hash;
        k++;
    }

    root <== hashers[numHashers-1].hash;
    
}

// 既にハッシュ化されたleafと、そのrootへのパスに沿った全ての要素が与えられたとき、対応するrootを計算する。
// 「そのrootにたどり着けることを、leafや要素を明かすことなくzkpする問題」
//具体的な要素は考慮せず、path_elementsがある位置において、確かに存在することを示す
//n=木の高さ
template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
    //hasherとmuxは使用する度にfor文の中でインスタンス化するのが良い。
    //ここでは木の高さだけインスタンス化する(要素はルートから見て右か左にしかない)のでそれを初期化しておく.
    component hashers[n];
    component mux[n];

    signal levelHashes[n + 1];
    levelHashes[0] <== leaf;  

    for (var i=0; i<n; i++) {
        //0か1なる
        path_index[i]*(1-path_index[i]) === 0;

        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== levelHashes[i];
        mux[i].c[0][1] <== path_elements[i];
        mux[i].c[1][0] <== path_elements[i];
        mux[i].c[1][1] <== levelHashes[i];

        //path_index[i]が右か左か(0or1)で分岐する(0と1のどっちが右か左かはどうでもいい)
        mux[i].s <== path_index[i];

        hashers[i] = HashLeftRight();
        hashers[i].left <== mux[i].out[0];
        hashers[i].right <== mux[i].out[1];

        levelHashes[i + 1] <== hashers[i].hash;
    }
    root <== levelHashes[n];
}