// [assignment] please copy the entire modified custom.test.js here
const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const {
	transaction,
	registerAndTransact,
	prepareTransaction,
	buildMerkleTree,
} = require('../src/index')
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

	/* Helper function to check account balances */
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

	it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
		// [assignment] complete code here
		const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
		const keypair = new Keypair() // Alice's private and public keys

		// Alice deposits 0.10 ETH into tornado pool
		const aliceDepositAmount = utils.parseEther('0.1')
		const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount })

		const { args, extData } = await prepareTransaction({ tornadoPool, outputs: [aliceDepositUtxo] })

		const onTokenBridgedData = encodeDataForBridge({ proof: args, extData })

		const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
			token.address,
			aliceDepositUtxo.amount,
			onTokenBridgedData,
		)
		// Emulating bridge. First send tokens to omnibridge mock, then send to the pool
		await token.transfer(omniBridge.address, aliceDepositAmount)
		const transferTx = await token.populateTransaction.transfer(
			tornadoPool.address,
			aliceDepositAmount,
		)

		await omniBridge.execute([
			{ who: token.address, callData: transferTx.data }, // send tokens to pool
			{ who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
		])

		// Withdraws 0.08 ETH of the fund from the shielded pool
		const aliceWithdrawAmount = utils.parseEther('0.08')
		const recipient = '0xDeaD00000000000000000000000000000000BEEf'
		const aliceChangeUtxo = new Utxo({
			amount: aliceDepositAmount.sub(aliceWithdrawAmount),
			keypair,
		})
		await transaction({
			tornadoPool,
			inputs: [aliceDepositUtxo],
			outputs: [aliceChangeUtxo],
			recipient,
			isL1Withdrawal: false,
		})

		// Remaining balance in Tornado pool must be 0.10 - 0.08 = 0.02 ETH
		const remainingBalance = await getBalance(tornadoPool, keypair)
		expect(remainingBalance).to.be.equal(aliceDepositAmount.sub(aliceWithdrawAmount))

		// Recipient should get 0.08 ethers on L2 from tornado pool
		const recipientBalance = await token.balanceOf(recipient)
		expect(recipientBalance).to.be.equal(aliceWithdrawAmount)

		// Balance in the L1 omni bridge must be 0
		const omniBridgeBalance = await token.balanceOf(omniBridge.address)
		expect(omniBridgeBalance).to.be.equal(0)
	})

	it('[assignment] iii. deposit 0.13 ETH to L1 -> send 0.06 ETH to Bob -> withdraw from L1 and L2', async () => {
		// [assignment] complete code here
		const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
		const aliceKeypair = new Keypair() // contains private and public keys

		// Alice deposits into L1 tornado pool
		const aliceDepositAmount = utils.parseEther('0.13')
		const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
		await transaction({ tornadoPool, outputs: [aliceDepositUtxo] })
		expect(await getBalance(tornadoPool, aliceKeypair)).to.be.equal(aliceDepositAmount)

		// Alice sends some funds to Bob in L2
		const bobKeypair = new Keypair() // contains private and public key
		const bobSendAmount = utils.parseEther('0.06')
		const bobSendUtxo = new Utxo({
			amount: bobSendAmount,
			keypair: Keypair.fromString(bobKeypair.address()),
		})
		const aliceChangeUtxo = new Utxo({
			amount: aliceDepositAmount.sub(bobSendAmount),
			keypair: aliceKeypair,
		})
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

		// Alice should have 0.07 ETH left and Bob should have 0.06 ETH
		expect(await getBalance(tornadoPool, aliceKeypair)).to.be.equal(
			aliceDepositAmount.sub(bobSendAmount),
		)
		expect(await getBalance(tornadoPool, bobKeypair)).to.be.equal(bobSendAmount)

		// Alice withdraws all her remaining funds in L1
		const aliceWithdrawAmount = aliceDepositAmount.sub(bobSendAmount)
		const aliceWithdrawUtxo = new Utxo({ amount: aliceWithdrawAmount, keypair: aliceKeypair })
		await transaction({
			tornadoPool,
			inputs: [aliceChangeUtxo],
			outputs: [aliceWithdrawUtxo],
			isL1Withdrawal: true,
		})
		// Alice should get her remaining 0.07 ETH
		expect(await getBalance(tornadoPool, aliceKeypair)).to.be.equal(aliceWithdrawAmount)

		// Bob withdraws all his funds in L2 ->
		const bobWithdrawUtxo = new Utxo({ amount: bobSendAmount, keypair: bobKeypair })
		await transaction({
			tornadoPool,
			outputs: [bobWithdrawUtxo],
			isL1Withdrawal: false,
		})
		// Bob should get his remaining 0.06 ETH
		expect(await getBalance(tornadoPool, bobKeypair)).to.be.equal(bobSendAmount)

		// There should be nothing left on the L1 omni bridge
		const omniBridgeBalance = await token.balanceOf(omniBridge.address)
		expect(omniBridgeBalance).to.be.equal(0)
	})
})
