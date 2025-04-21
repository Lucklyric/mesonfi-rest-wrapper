#!/usr/bin/env node
import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { MesonApiService } from './api';
import { BridgeOptions } from './types';
import { deriveAddress, signMessageHash } from './signature';
import { MesonContractService, findContractAddress } from './contract';
import { ethers } from 'ethers';

// Load environment variables from .env file
dotenv.config();

// Create the CLI program
const program = new Command();

// Configure program metadata
program
  .name('meson-cli')
  .description('CLI to interact with MesonFi cross-chain bridge')
  .version('1.0.0');

// Bridge command
program
  .command('bridge')
  .description('Bridge tokens between chains using MesonFi')
  .requiredOption('--from <chain:token>', 'Source chain and token (e.g., eth:usdc)')
  .requiredOption('--to <chain:token>', 'Destination chain and token (e.g., bsc:usdc)')
  .requiredOption('--amount <value>', 'Amount to bridge')
  .requiredOption('--recipient <address>', 'Recipient address on the destination chain')
  .option('--private-key <key>', 'Private key for signing (can also be set via PRIVATE_KEY env var)')
  .option('--dry-run', 'Execute all steps without submitting the final transaction', false)
  .option('--debug', 'Enable debug logging', false)
  .action(async (options: BridgeOptions) => {
    try {
      await runBridge(options);
    } catch (error) {
      console.error('\nError:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Contract Bridge command
program
  .command('bridge-contract')
  .description('Bridge tokens between chains using MesonFi via the TransferToMeson contract')
  .requiredOption('--from <chain:token>', 'Source chain and token (e.g., eth:usdc)')
  .requiredOption('--to <chain:token>', 'Destination chain and token (e.g., bsc:usdc)')
  .requiredOption('--amount <value>', 'Amount to bridge')
  .requiredOption('--recipient <address>', 'Recipient address on the destination chain')
  .requiredOption('--rpc-url <url>', 'RPC URL for the source chain')
  .option('--meson-contract <address>', 'Address of the Meson contract (will be looked up from the address field in chain data if not provided)')
  .option('--transfer-contract <address>', 'Address of your deployed TransferToMeson contract (will deploy a new one if not provided)')
  .option('--deploy-if-missing', 'Deploy a new TransferToMeson contract if one is not provided', false)
  .option('--private-key <key>', 'Private key for signing (can also be set via PRIVATE_KEY env var)')
  .option('--dry-run', 'Execute all steps without submitting the final transaction', false)
  .option('--debug', 'Enable debug logging', false)
  .action(async (options: BridgeOptions & { 
    mesonContract?: string,
    transferContract?: string,
    deployIfMissing?: boolean,
    rpcUrl: string
  }) => {
    try {
      await runContractBridge(options);
    } catch (error) {
      console.error('\nError:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

/**
 * Executes the bridge operation with the provided options
 */
async function runBridge(options: BridgeOptions): Promise<void> {
  const { from, to, amount, recipient, privateKey: optionsPrivateKey, dryRun, debug } = options;
  
  // Configure API service with debug mode
  const api = new MesonApiService(debug);
  
  // Output options when debug is enabled
  if (debug) {
    console.debug('Options:', { from, to, amount, recipient, dryRun, debug });
  }
  
  // --- 1. Get Private Key ---
  const privateKey = optionsPrivateKey || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Private key must be provided via --private-key option or PRIVATE_KEY environment variable.');
  }
  
  // Derive fromAddress from private key
  const fromAddress = deriveAddress(privateKey);
  console.log(`Using source address: ${fromAddress}`);
  
  // --- 2. Fetch Chain Data and Validate ---
  console.log('Fetching supported chains and tokens...');
  const supportedChains = await api.getSupportedChains();
  
  console.log('Fetching swap limits...');
  const swapLimits = await api.getSwapLimits();
  
  // Parse input parameters
  const [fromChain, fromToken] = from.split(':');
  const [toChain, toToken] = to.split(':');
  const amountFloat = parseFloat(amount);
  
  // Validate chains and tokens
  validateChainToken(supportedChains, fromChain, fromToken, 'source');
  validateChainToken(supportedChains, toChain, toToken, 'destination');
  
  // Validate amount against limits
  validateAmount(swapLimits, toChain, toToken, amountFloat);
  
  console.log('Input validation passed.');
  
  // --- 3. Encode Swap ---
  console.log(`Encoding swap: ${amount} ${from} -> ${to} for ${recipient}`);
  const encodedData = await api.encodeSwap(from, to, amount, fromAddress, recipient);
  
  if (!encodedData.encoded || !encodedData.signingRequest) {
    throw new Error('Failed to encode swap: missing required data in response');
  }
  
  console.log(`Encoded Swap: ${encodedData.encoded}`);
  console.log(`Fee: ${JSON.stringify(encodedData.fee)}`);
  console.log(`Hash to sign: ${encodedData.signingRequest.hash}`);
  
  // --- 4. Sign Message Hash ---
  console.log('Signing transaction...');
  const signature = await signMessageHash(encodedData.signingRequest.hash, privateKey);
  console.log(`Signature: ${signature.substring(0, 20)}...`);
  
  // --- 5. Submit Swap (or skip if dry run) ---
  if (dryRun) {
    console.log('\n-- DRY RUN --');
    console.log('Swap encoded and signed, but not submitted.');
    console.log(`Encoded Swap: ${encodedData.encoded}`);
    console.log(`Signature: ${signature}`);
    console.log(`Recipient: ${recipient}`);
    console.log(`From Address: ${fromAddress}`);
    return; // Exit successfully for dry run
  }
  
  console.log('Submitting swap...');
  const swapResult = await api.submitSwap(encodedData.encoded, fromAddress, recipient, signature);
  
  console.log('\nSwap submitted successfully!');
  console.log(`Swap ID: ${swapResult.swapId}`);
  console.log(`Track status on Meson Explorer: https://explorer.meson.fi/swap/${swapResult.swapId}`);
}

/**
 * Executes the bridge operation via smart contract with the provided options
 */
async function runContractBridge(
  options: BridgeOptions & { mesonContract?: string, transferContract?: string, deployIfMissing?: boolean, rpcUrl: string }
): Promise<void> {
  const { 
    from, 
    to, 
    amount, 
    recipient, 
    privateKey: optionsPrivateKey, 
    mesonContract: mesonContractOption,
    transferContract: transferContractOption,
    deployIfMissing = false,
    rpcUrl,
    dryRun, 
    debug
  } = options;
  
  // Configure API service with debug mode
  const api = new MesonApiService(debug);
  
  // Configure contract service with debug mode
  const contractService = new MesonContractService(rpcUrl, debug);
  
  // Output options when debug is enabled
  if (debug) {
    console.debug('Options:', { 
      from, 
      to, 
      amount, 
      recipient, 
      mesonContractOption,
      transferContractOption,
      deployIfMissing,
      rpcUrl,
      dryRun, 
      debug
    });
  }
  
  // --- 1. Get Private Key ---
  const privateKey = optionsPrivateKey || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Private key must be provided via --private-key option or PRIVATE_KEY environment variable.');
  }
  
  // Derive fromAddress from private key
  const fromAddress = deriveAddress(privateKey);
  console.log(`Using source address: ${fromAddress}`);
  
  // --- 2. Fetch Chain Data and Validate ---
  console.log('Fetching supported chains and tokens...');
  const supportedChains = await api.getSupportedChains();
  
  console.log('Fetching swap limits...');
  const swapLimits = await api.getSwapLimits();
  
  // Parse input parameters
  const [fromChain, fromToken] = from.split(':');
  const [toChain, toToken] = to.split(':');
  const amountFloat = parseFloat(amount);
  
  // Validate chains and tokens
  validateChainToken(supportedChains, fromChain, fromToken, 'source');
  validateChainToken(supportedChains, toChain, toToken, 'destination');
  
  // Validate amount against limits
  validateAmount(swapLimits, toChain, toToken, amountFloat);
  
  console.log('Input validation passed.');
  
  // --- 3. Determine Meson contract address if not provided ---
  let mesonContractAddress = mesonContractOption;
  
  // If we have a transfer contract address, use that as the fromAddress
  // Otherwise, we'll need to deploy first or get it from another source
  let fromContractAddress: string | undefined = transferContractOption;
  
  // Resolve Meson contract address in priority order:
  // 1. Use --meson-contract parameter if provided
  // 2. Use address from supported chains
  if (mesonContractAddress) {
    console.log(`Using meson contract address from --meson-contract parameter: ${mesonContractAddress}`);
  } else {
    // Try to find the contract address from the chain data
    console.log('No meson contract address provided, looking up from address field in chain data...');
    const foundAddress = findContractAddress(supportedChains, fromChain);
    
    if (!foundAddress) {
      throw new Error(`Could not find Meson contract address for chain ${fromChain}. Please provide it with --meson-contract option.`);
    }
    
    mesonContractAddress = foundAddress;
    console.log(`Found Meson contract address for ${fromChain}: ${mesonContractAddress} (from chain data address field)`);
  }
  
  // If we need to deploy the transfer contract and don't have it yet
  if (!fromContractAddress && deployIfMissing && !dryRun) {
    // Create wallet from private key
    const wallet = new ethers.Wallet(privateKey);
    console.log(`Deploying new TransferToMeson contract...`);
    fromContractAddress = await contractService.deployTransferToMesonContract(mesonContractAddress, wallet);
    console.log(`Deployed new TransferToMeson contract at: ${fromContractAddress}`);
  }
  
  // --- 4. Encode Swap with fromContract=true ---
  console.log(`Encoding contract swap: ${amount} ${from} -> ${to} for ${recipient}`);
  // Use fromContractAddress if available, otherwise use derived address (but this should be a less common case)
  const encodingFromAddress = fromContractAddress || fromAddress;
  console.log(`Using address for swap encoding: ${encodingFromAddress}`);
  
  // The initiator should be the user's wallet address, while the fromAddress for encoding is the contract
  const initiator = fromAddress;
  console.log(`Using initiator address: ${initiator}`);
  
  // Pass both the contract address for fromAddress and the wallet address as initiator
  const encodedData = await api.encodeSwap(from, to, amount, encodingFromAddress, recipient, true);
  
  // Manually set initiator if it's not already in the response
  if (!encodedData.initiator) {
    encodedData.initiator = initiator;
  }
  
  if (!encodedData.encoded) {
    throw new Error('Failed to encode swap: missing required data in response');
  }
  
  console.log(`Encoded Swap: ${encodedData.encoded}`);
  console.log(`Fee: ${JSON.stringify(encodedData.fee)}`);
  console.log(`Initiator: ${encodedData.initiator || initiator}`);
  
  // Update fromContract from API response if available
  if (encodedData.fromContract) {
    console.log(`API response included fromContract address: ${encodedData.fromContract}`);
    // If we don't have a contract address yet, use the one from the API
    if (!fromContractAddress) {
      fromContractAddress = encodedData.fromContract;
      console.log(`Using fromContract address from API response`);
    }
  }
  
  // --- 5. Execute Contract Call (or skip if dry run) ---
  if (dryRun) {
    console.log('\n-- DRY RUN --');
    console.log('Swap encoded, but contract call not executed.');
    console.log(`Encoded Swap: ${encodedData.encoded}`);
    console.log(`Meson Contract Address: ${mesonContractAddress}`);
    if (transferContractOption) {
      console.log(`TransferToMeson Contract Address: ${transferContractOption}`);
    } else if (deployIfMissing) {
      console.log('Will deploy new TransferToMeson contract');
    } else {
      console.log('No TransferToMeson contract provided and deployment not requested');
    }
    console.log(`Recipient: ${recipient}`);
    console.log(`From Address: ${encodingFromAddress}`);
    console.log(`Amount: ${amount}`);
    return; // Exit successfully for dry run
  }
  
  console.log(`Submitting transaction using TransferToMeson contract...`);
  
  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);
  
  // Execute contract transaction
  const txHash = await contractService.callTransferToMeson(
    mesonContractAddress,
    encodedData,
    wallet,
    amount,
    fromContractAddress,
    deployIfMissing && !fromContractAddress // Only deploy if we don't already have an address
  );
  
  console.log('\nTransaction submitted successfully!');
  console.log(`Transaction Hash: ${txHash}`);
  
  // For contract swaps, we can directly use the encoded data for the explorer link
  console.log(`\nTrack status on Meson Explorer: https://explorer.meson.fi/swap/${encodedData.encoded}`);
}

/**
 * Validates that a chain and token are supported
 */
function validateChainToken(chains: any[], chainId: string, tokenId: string, type: string): void {
  const chainInfo = chains.find(c => c.id === chainId);
  if (!chainInfo) {
    throw new Error(`${type.charAt(0).toUpperCase() + type.slice(1)} chain '${chainId}' is not supported.`);
  }
  
  const tokenInfo = chainInfo.tokens.find((t: any) => t.id === tokenId);
  if (!tokenInfo) {
    throw new Error(`${type.charAt(0).toUpperCase() + type.slice(1)} token '${tokenId}' is not supported on chain '${chainId}'.`);
  }
}

/**
 * Validates that the amount is within the allowed limits
 */
function validateAmount(limits: any[], chainId: string, tokenId: string, amount: number): void {
  const chainLimit = limits.find(c => c.id === chainId);
  if (!chainLimit) {
    console.warn(`Warning: Could not find swap limits for destination chain '${chainId}'. Proceeding without amount limit check.`);
    return;
  }
  
  const tokenLimit = chainLimit.tokens.find((t: any) => t.id === tokenId);
  if (!tokenLimit) {
    console.warn(`Warning: Could not find swap limits for token '${tokenId}' on chain '${chainId}'. Proceeding without amount limit check.`);
    return;
  }
  
  const minSwap = tokenLimit.min ? parseFloat(tokenLimit.min) : 0;
  const maxSwap = tokenLimit.max ? parseFloat(tokenLimit.max) : Infinity;
  
  if (amount < minSwap || amount > maxSwap) {
    throw new Error(`Amount ${amount} is outside the allowed limits for ${tokenId} on ${chainId} (${minSwap} - ${maxSwap}).`);
  }
} 