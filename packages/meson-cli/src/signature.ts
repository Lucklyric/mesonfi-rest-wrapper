import { ethers } from 'ethers';

/**
 * Signs a message hash directly (without the Ethereum message prefix)
 * @param messageHash - The hash to sign (must be a valid hex string with 0x prefix)
 * @param privateKey - The private key to sign with
 * @returns The signature as a hex string
 */
export async function signMessageHash(messageHash: string, privateKey: string): Promise<string> {
  try {
    // Create a wallet from the private key
    const wallet = new ethers.Wallet(privateKey);
    
    // Sign the hash directly
    // This approach directly signs the hash without adding the Ethereum message prefix
    const signature = wallet.signingKey.sign(messageHash);
    
    // Return the serialized signature
    return signature.serialized;
  } catch (error) {
    console.error('Error signing message hash:', error);
    throw error;
  }
}

/**
 * Derives an Ethereum address from a private key
 * @param privateKey - The private key to derive the address from
 * @returns The Ethereum address
 */
export function deriveAddress(privateKey: string): string {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.address;
} 