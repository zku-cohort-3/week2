// [assignment] please copy the entire modified custom.test.js here
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
      
      // Destructure to get some properties
      const {tornadoPool, token, omniBridge} = await loadFixture(fixture)
      // Get a key pair for Alice
      const keyPairForAlice = new Keypair()

      // Alices makes a deposit into the pool
      const depositFromAlice = new Utxo({amount: utils.parseEther("0.1"), keypair: keyPairForAlice})
      const {extData, args} = await prepareTransaction({tornadoPool, outputs: [depositFromAlice]})

      // Data is encoded to conceal tx
      const dataFromTokenBridge = encodeDataForBridge({proof: args, extData})

      // Tx is populated on the pool
      const tokenBridgeTx = await tornadoPool.populateTransaction.onTokenBridged(
        token.address, depositFromAlice.amount, dataFromTokenBridge
      )
      
      // Transfer is made to the omniBridge address
      await token.transfer(omniBridge.address, utils.parseEther("0.1"))

      // Get balance in OmniBrige
      const balInOmniBridge = await token.balanceOf(omniBridge.address)

      // Tx is propagated.
      const txPopulated = await token.populateTransaction.transfer(tornadoPool.address, utils.parseEther("0.1"))

      await omniBridge.execute([
        {who: token.address, callData: txPopulated.data}, {who: tornadoPool.address, callData: tokenBridgeTx.data}
      ])

      expect(balInOmniBridge).to.be.equal(utils.parseEther("0.1"))

      // Withdrawal from L2
      const recipient = "0xDeaD00000000000000000000000000000000BEEf"
      const aliceWithdrawTx = new Utxo({amount: (utils.parseEther("0.1")).sub(utils.parseEther("0.08")), keypair: keyPairForAlice})
      await transaction({
        tornadoPool, inputs: [depositFromAlice], outputs: [aliceWithdrawTx], recipient: recipient, isL1Withdrawal: false
      })

      // Alice balance in L2
      const balOfRecipient = await token.balanceOf(recipient)
      expect(balOfRecipient).to.be.equal(utils.parseEther("0.08"))

      // OmniBridge balance
      const balOfOmniBridge2 = await token.balanceOf(omniBridge.address)
      expect(balOfOmniBridge2).to.be.equal(0)

      // Tornado Pool
      const balOfTP = await token.balanceOf(tornadoPool.address)
      expect(balOfTP).to.be.equal(utils.parseEther("0.02"))
  })

  it('[assignment] iii. see assignment doc for details', async () => {
      // [assignment] complete code here
  // Destructure to get some properties
  const {tornadoPool, token, omniBridge} = await loadFixture(fixture)
  // Get a key pair for Alice
  const keyPairForAlice = new Keypair()

  // Alices makes a deposit into the pool
  const depositFromAlice = new Utxo({amount: utils.parseEther("0.13"), keypair: keyPairForAlice})
  const {extData, args} = await prepareTransaction({tornadoPool, outputs: [depositFromAlice]})

  // Data is encoded to conceal tx
  const dataFromTokenBridge = encodeDataForBridge({proof: args, extData})

  // Tx is populated on the pool
  const tokenBridgeTx = await tornadoPool.populateTransaction.onTokenBridged(
    token.address, depositFromAlice.amount, dataFromTokenBridge
  )
  
  // Transfer is made to the omniBridge address
  await token.transfer(omniBridge.address, utils.parseEther("0.13"))

  // Get balance in OmniBrige
  const balInOmniBridge = await token.balanceOf(omniBridge.address)

  // Tx is propagated.
  const txPopulated = await token.populateTransaction.transfer(tornadoPool.address, utils.parseEther("0.1"))

  await omniBridge.execute([
    {who: token.address, callData: txPopulated.data}, {who: tornadoPool.address, callData: tokenBridgeTx.data}
  ])

  expect(balInOmniBridge).to.be.equal(utils.parseEther("0.13"))
      
  })
})
