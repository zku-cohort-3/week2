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

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
    // [assignment] complete code here
    const { tornadoPool, token, omniBridge} = await loadFixture(fixture)
  
    // Layer(1) Insertion 
    const keypair = new Keypair()
    const depositAmount = utils.parseEther('0.1')
    const depositUtxo = new Utxo({ amount: depositAmount, keypair })
    const { args, extData } = await prepareTransaction({
        tornadoPool,
        outputs: [depositUtxo],
    })
    const onTokenBridgedData = encodeDataForBridge({
        proof: args,
        extData,
    })
    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
        token.address,
        depositUtxo.amount,
        onTokenBridgedData,
    )
    await token.transfer(omniBridge.address, depositAmount)
    const transferTx = await token.populateTransaction.transfer(tornadoPool.address, depositAmount)
    await omniBridge.execute([
        { who: token.address, callData: transferTx.data }, 
        { who: tornadoPool.address, callData: onTokenBridgedTx.data }, 
    ])

    // Layer(2) Withdraw
    const withdrawAmount = utils.parseEther('0.08')
    const recipient = '0xDeaD00000000000000000000000000000000BEEf'
    const changeUtxo = new Utxo({
        amount: depositAmount.sub(withdrawAmount),
        keypair,
    })
    await transaction({
        tornadoPool,
        inputs: [depositUtxo],
        outputs: [changeUtxo],
        recipient: recipient,
        isL1Withdrawal: false,
    })

    // Readingg Current balance in tornadoPool
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
    
    // Reading Balance in bridge and recipience wallet
    const recipientBalance = await token.balanceOf(recipient)
    const omniBridgeBalance = await token.balanceOf(omniBridge.address)
    
    expect(receiveUtxo.amount).to.be.equal(depositAmount.sub(withdrawAmount), "TornadoPool balance error")
    expect(recipientBalance).to.be.equal(withdrawAmount, "Reciepient balance error")
    expect(omniBridgeBalance).to.be.equal(0, "OmniBridge balance error")
})

  it('[assignment] iii. see assignment doc for details', async () => {
    // [assignment] complete code here
    const { tornadoPool, token, omniBridge} = await loadFixture(fixture)

    ///////////////////////////////////////////
    // 1. Alice deposits 0.13 ETH in L1 ->
  ///////////////////////////////////////////
    const aliceKeypair = new Keypair()
    const aliceDepositAmount = utils.parseEther('0.13')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, aliceKeypair })
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
    await token.transfer(omniBridge.address, aliceDepositAmount)
    const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)
    
    const omniBalance = await token.balanceOf(omniBridge.address)
    expect(omniBalance).to.be.equal(utils.parseEther("0.13"), "OmniBridge Balance is 0.13 Eth");

    await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, 
      { who: tornadoPool.address, callData: onTokenBridgedTx.data }, 
    ])      
    // console.log(await token.balanceOf(token.address))
    let aliceBalanceTornado = await token.balanceOf(tornadoPool.address)
    expect(aliceBalanceTornado).to.be.equal(utils.parseEther("0.13"), "Alice Balance in Tornado Pool is 0.13 Eth");
    ///////////////////////////////////////////
    // 2. Alice sends 0.06 ETH to Bob in L2 ->
  ///////////////////////////////////////////
    // Bob gives Alice address to send some eth inside the shielded pool
    const bobKeypair = new Keypair() // contains private and public keys
    const bobAddress = bobKeypair.address() // contains only public key

    const bobSendAmount = utils.parseEther('0.06')
    const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) })
    let aliceChangeUtxo = new Utxo({
      amount: aliceDepositAmount.sub(bobSendAmount),
      keypair: aliceDepositUtxo.keypair,
    })
    await transaction({ tornadoPool, inputs: [aliceDepositUtxo], outputs: [bobSendUtxo, aliceChangeUtxo] })

    ///////////////////////////////////////////
    // 3. Bob withdraws all his funds in L2 -> 
    ///////////////////////////////////////////
    const filter = tornadoPool.filters.NewCommitment()
    const fromBlock = await ethers.provider.getBlock()
    const events = await tornadoPool.queryFilter(filter, fromBlock.number)
    let bobReceiveUtxo
    try {
      bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[0].args.encryptedOutput, events[0].args.index)
    } catch (e) {
      // we try to decrypt another output here because it shuffles outputs before sending to blockchain
      bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[1].args.encryptedOutput, events[1].args.index)
    }
    let aliceLeftUtxo
    try {
      aliceLeftUtxo = Utxo.decrypt(aliceDepositUtxo.keypair, events[0].args.encryptedOutput, events[0].args.index)
    } catch (e) {
      // we try to decrypt another output here because it shuffles outputs before sending to blockchain
      aliceLeftUtxo = Utxo.decrypt(aliceDepositUtxo.keypair, events[1].args.encryptedOutput, events[1].args.index)
    }
    expect(aliceLeftUtxo.amount).to.be.equal(utils.parseEther("0.07"), "Alice has only 0.07 Eth after transfer");
    expect(bobReceiveUtxo.amount).to.be.equal(utils.parseEther("0.06"), "Bob recieved 0.06 Eth");
    

    // Bob withdraws a part of his funds from the shielded pool
    const bobWithdrawAmount = bobSendAmount
    const bobEthAddress = '0xDeaD00000000000000000000000000000000BEEf'
    const bobChangeUtxo = new Utxo({ amount: bobSendAmount.sub(bobWithdrawAmount), keypair: bobKeypair })
    await transaction({
      tornadoPool,
      inputs: [bobReceiveUtxo],
      // outputs: [bobChangeUtxo],
      recipient: bobEthAddress,
    })      
    expect(await token.balanceOf(bobEthAddress)).to.be.equal(utils.parseEther("0.06"), "Bob didn't recieved his money");
    ///////////////////////////////////////////
    // 4. Alice withdraws all her remaining funds in L1 -> 
  ///////////////////////////////////////////
    // const aliceKeypair = new Keypair() // contains private and public keys

    const aliceWithdrawAmount = utils.parseEther('0.07')
    const recipient = '0x4321000000000000000000000000000000001234'
    // aliceChangeUtxo = new Utxo({
    //   amount: aliceWithdrawAmount,
    //   keypair: aliceKeypair,
    // })
    await transaction({
      tornadoPool,
      inputs: [aliceChangeUtxo],
      // outputs: [aliceChangeUtxo],
      recipient: recipient,
      // isL1Withdrawal: true,
    })
    expect(await token.balanceOf(recipient)).to.be.equal(utils.parseEther("0.07"), "Alice didn't recieved his money");
    ///////////////////////////////////////////
    // 5. assert all relevant balances are correct
  ///////////////////////////////////////////
    
  
      // Asseertions are above after every step
  })
})
