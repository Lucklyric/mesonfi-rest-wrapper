import { ethers } from 'ethers';
import { EncodeSwapResult, Chain } from './types';
import * as TransferToMesonContract from './TransferToMesonContract.json';

// Meson minimal interface ABI
const MESON_CONTRACT_ABI = [
  {
    "inputs": [
      { "internalType": "uint8", "name": "tokenIndex", "type": "uint8" }
    ],
    "name": "tokenForIndex",
    "outputs": [
      { "internalType": "address", "name": "token", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "encodedSwap", "type": "uint256" },
      { "internalType": "uint200", "name": "postingValue", "type": "uint200" },
      { "internalType": "address", "name": "fromContract", "type": "address" }
    ],
    "name": "postSwapFromContract",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

// Get TransferToMeson contract from the JSON file
const TRANSFER_TO_MESON_ABI = TransferToMesonContract.abi;
const TRANSFER_TO_MESON_BYTECODE = TransferToMesonContract.data.bytecode;

/**
 * Utility function to find the Meson contract address for a specific chain
 * 
 * @param chains Array of chains from the MesonFi API
 * @param chainId The chain ID to find the contract address for
 * @returns The contract address or null if not found
 */
export function findContractAddress(chains: Chain[], chainId: string): string | null {
  const chain = chains.find(c => c.id === chainId);
  if (!chain) {
    return null;
  }
  return chain.address;
}

export class MesonContractService {
  private provider: ethers.Provider;
  private debug: boolean;

  constructor(rpcUrl: string, debug = false) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.debug = debug;
  }

  // Log debug message if debug mode is enabled
  private log(message: string, data?: any): void {
    if (this.debug) {
      if (data) {
        console.debug(`[${new Date().toISOString()}] ${message}`);
        console.debug(JSON.stringify(data, null, 2));
      } else {
        console.debug(`[${new Date().toISOString()}] ${message}`);
      }
    }
  }

  /**
   * Deploys a new TransferToMeson contract
   * 
   * @param mesonContractAddress The address of the Meson contract
   * @param wallet The wallet to use for deployment
   * @returns The address of the deployed TransferToMeson contract
   */
  async deployTransferToMesonContract(
    mesonContractAddress: string,
    wallet: ethers.Wallet
  ): Promise<string> {
    this.log('Deploying new TransferToMeson contract', { mesonContractAddress });
    
    // Connect wallet to provider
    const connectedWallet = wallet.connect(this.provider);
    
    // Create contract factory for deployment using the ABI and bytecode from the JSON file
    const factory = new ethers.ContractFactory(
      TRANSFER_TO_MESON_ABI,
      TRANSFER_TO_MESON_BYTECODE,
      connectedWallet
    );
    
    try {
      // Deploy contract with the meson contract address as constructor parameter
      const contract = await factory.deploy(mesonContractAddress);
      
      this.log('Waiting for deployment transaction to be mined...');
      await contract.deploymentTransaction()?.wait();
      
      const deployedAddress = await contract.getAddress();
      this.log('TransferToMeson contract deployed successfully', { address: deployedAddress });
      
      return deployedAddress;
    } catch (error) {
      this.log('Error deploying TransferToMeson contract', error);
      throw error;
    }
  }

  /**
   * Calls the transferToMeson function on the TransferToMeson contract
   * 
   * @param mesonContractAddress The address of the Meson contract
   * @param encodedSwap The encoded swap data
   * @param wallet The wallet to use for the transaction
   * @param amount Amount to send with the transaction (for ETH swaps)
   * @param transferContractAddress The address of the TransferToMeson contract (optional)
   * @param deployIfMissing Whether to deploy a new TransferToMeson contract if not provided
   * @returns The transaction hash
   */
  async callTransferToMeson(
    mesonContractAddress: string,
    encodedSwap: EncodeSwapResult,
    wallet: ethers.Wallet,
    amount: string,
    transferContractAddress?: string,
    deployIfMissing?: boolean
  ): Promise<string> {
    // Connect wallet to provider
    const connectedWallet = wallet.connect(this.provider);
    
    // Extract encoded swap string if an EncodeSwapResult was provided
    const encodedSwapStr = encodedSwap.encoded;
    
    // Get initiator from the encoded swap data
    const initiator = encodedSwap.initiator;
    
    // Deploy TransferToMeson contract if needed
    let transferToMesonAddress = transferContractAddress;
    
    if (!transferToMesonAddress && deployIfMissing) {
      this.log('No TransferToMeson contract address provided, deploying new contract');
      transferToMesonAddress = await this.deployTransferToMesonContract(mesonContractAddress, connectedWallet);
    } else if (!transferToMesonAddress) {
      throw new Error('TransferToMeson contract address not provided and deployment not requested');
    }
    
    this.log('Calling transferToMeson', {
      mesonContractAddress,
      transferToMesonAddress,
      encodedSwap: encodedSwapStr,
      initiator,
      fromAddress: wallet.address,
      amount
    });
    
    // Convert the encoded swap from hex string to BigInt
    const encodedSwapBigInt = BigInt(encodedSwapStr);
    
    // Create TransferToMeson contract instance with the ABI from the JSON file
    const transferContract = new ethers.Contract(
      transferToMesonAddress, 
      TRANSFER_TO_MESON_ABI,
      connectedWallet
    );
    
    try {
      // Call transferToMeson
      const tx = await transferContract.transferToMeson.populateTransaction(
        encodedSwapBigInt,
        initiator,
        { value: ethers.parseEther(amount) }
      );
      
      // Estimate gas
      const gasEstimate = await this.provider.estimateGas(tx);
      
      // Add 20% buffer to gas estimate
      const gasLimit = gasEstimate * BigInt(12) / BigInt(10);
      
      // Send transaction
      const response = await connectedWallet.sendTransaction({
        ...tx,
        gasLimit
      });
      
      this.log('Transaction sent', {
        hash: response.hash,
        gasLimit: gasLimit.toString()
      });
      
      // Wait for transaction to be mined
      const receipt = await response.wait();
      
      this.log('Transaction confirmed', {
        hash: receipt?.hash,
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed.toString()
      });
      
      return response.hash;
    } catch (error) {
      this.log('Error calling transferToMeson', error);
      throw error;
    }
  }
} 