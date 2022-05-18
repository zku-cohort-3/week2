const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }
  
  async function getBalance(tornadoPool, keypair) {
    // Parse chain to detect incoming funds
    const filter = tornadoPool.filters.NewCommitment()
    const fromBlock = await ethers.provider.getBlock()
    const events = await tornadoPool.queryFilter(filter, fromBlock.number)
    let receiveUtxo
    try {
      receiveUtxo = Utxo.decrypt(keypair, events[0].args.encryptedOutput, events[0].args.index)
    } catch (e) {
      // we try to decrypt another output here because it shuffles outputs before sending to blockchain
      receiveUtxo = Utxo.decrypt(keypair, events[1].args.encryptedOutput, events[1].args.index)
    }
    return receiveUtxo.amount
  }


  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('i. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)

    // Alice deposits 0.1 ether into tornado pool
    const aliceKeypair = new Keypair() // contains private and public keys
    const aliceDepositAmount = utils.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [aliceDepositUtxo],
    })

    const onTokenBridgedData = encodeDataForBridge({
      proof: args,
      extData,
    })

    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      aliceDepositUtxo.amount,
      onTokenBridgedData,
    )
    // emulating bridge. first it sends tokens to omnibridge mock then it sends to the pool
    await token.transfer(omniBridge.address, aliceDepositAmount)
    const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)

    await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, // send tokens to pool
      { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
    ])

    // Alice withdraws 0.08 ETH in L2
    const aliceWithdrawAmount = utils.parseEther('0.08')
    const recipient = '0xDeaD00000000000000000000000000000000BEEf'
    const aliceChangeUtxo = new Utxo({
      amount: aliceDepositAmount.sub(aliceWithdrawAmount),
      keypair: aliceKeypair,
    })
    await transaction({
      tornadoPool,
      inputs: [aliceDepositUtxo],
      outputs: [aliceChangeUtxo],
      recipient: recipient,
      isL1Withdrawal: false,
    })

    // assert recipient, omniBridge, and tornadoPool balances are correct.
    const recipientBalance = await token.balanceOf(recipient)
    expect(recipientBalance).to.be.equal(aliceWithdrawAmount)
    const omniBridgeBalance = await token.balanceOf(omniBridge.address)
    expect(omniBridgeBalance).to.be.equal(0)
    const tonardoPoolBalance = await token.balanceOf(tornadoPool.address)
    expect(tonardoPoolBalance).to.be.equal(aliceDepositAmount.sub(aliceWithdrawAmount))
  })

  it('ii. see assignment doc for details', async () => {
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
    const aliceKeypair = new Keypair() // contains private and public keys
    const aliceEthAddress = '0xa54d3c09E34aC96807c1CC397404bF2B98DC4eFb'

    // Alice deposits into L1 tornado pool
    const aliceDepositAmount = utils.parseEther('0.13')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
    await transaction({ tornadoPool, outputs: [aliceDepositUtxo] })
    expect(await getBalance(tornadoPool, aliceKeypair)).to.be.equal(aliceDepositAmount)

    // Alice sends some funds to Bob in L2
    const bobSendAmount = utils.parseEther('0.06')
    const bobKeypair = new Keypair() // contains private and public key
    const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobKeypair.address()) })
    const bobEthAddress = '0xDeaD00000000000000000000000000000000BEEf'
    const aliceChangeUtxo = new Utxo({ amount: aliceDepositAmount.sub(bobSendAmount), keypair: aliceKeypair })
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      inputs: [aliceDepositUtxo],
      outputs: [bobSendUtxo, aliceChangeUtxo],
    })
    const onTokenBridgedData = encodeDataForBridge({ proof: args, extData })
    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      bobSendAmount,
      onTokenBridgedData,
    )

    // Emulating bridge. First send tokens to omnibridge mock, then send to the pool
    await token.transfer(omniBridge.address, bobSendAmount)
    const transferTx = await token.populateTransaction.transfer(tornadoPool.address, bobSendAmount)
    await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, // send tokens to pool
      { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
    ])

    // Bob parses chain to detect incoming funds
    const filter = tornadoPool.filters.NewCommitment();
    const fromBlock = await ethers.provider.getBlock();
    const events = await tornadoPool.queryFilter(filter, fromBlock.number);
    let bobReceiveUtxo;
    try {
      bobReceiveUtxo = Utxo.decrypt(
        bobKeypair,
        events[0].args.encryptedOutput,
        events[0].args.index
      );
    } catch (e) {
      // we try to decrypt another output here because it shuffles outputs before sending to blockchain
      bobReceiveUtxo = Utxo.decrypt(
        bobKeypair,
        events[1].args.encryptedOutput,
        events[1].args.index
      );
    }
    expect(bobReceiveUtxo.amount).to.be.equal(bobSendAmount);

    // Alice: 0.07 ETH; Bob: 0.06 ETH
    expect(await getBalance(tornadoPool, aliceKeypair)).to.be.equal(aliceDepositAmount.sub(bobSendAmount))
    expect(await getBalance(tornadoPool, bobKeypair)).to.be.equal(bobSendAmount)

    // Alice withdraws all her remaining funds in L1
    const aliceWithdrawAmount = aliceDepositAmount.sub(bobSendAmount)
    const aliceWithdrawUtxo = new Utxo({ amount: 0, keypair: aliceKeypair })
    await transaction({
      tornadoPool,
      inputs: [aliceChangeUtxo],
      outputs: [aliceWithdrawUtxo],
      recipient: aliceEthAddress
    })
    // Alice should get her remaining 0.07 ETH
    expect(await token.balanceOf(aliceEthAddress)).to.be.equal(aliceWithdrawAmount)

    // Bob withdraws all his funds in L2
    const bobWithdrawUtxo = new Utxo({ amount: 0, keypair: bobKeypair })
    await transaction({
      tornadoPool,
      inputs: [bobReceiveUtxo],
      outputs: [bobWithdrawUtxo],
      recipient: bobEthAddress,
      isL1Withdrawal: false
    })

    // Bob: 0.06 ether, no ether in L1 omni bridge
    expect(await token.balanceOf(bobEthAddress)).to.be.equal(bobSendAmount)
  })
})
