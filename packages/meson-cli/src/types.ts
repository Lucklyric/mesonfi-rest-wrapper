export interface Token {
  id: string;
  addr?: string;
  min?: string;
  max?: string;
}

export interface Chain {
  id: string;
  name: string;
  chainId: string;
  address: string;
  destinationChainOnly?: boolean;
  tokens: Token[];
}

export interface ChainLimit {
  id: string;
  name: string;
  tokens: Token[];
}

export interface EncodeSwapResult {
  encoded: string;
  fromAddress?: string;
  fromContract?: string;
  recipient: string;
  fee: {
    serviceFee: string;
    lpFee: string;
    totalFee: string;
  };
  converted?: {
    amount: string;
    token: string;
  };
  signingRequest?: {
    message: string;
    hash: string;
  };
  initiator?: string;
}

export interface SwapResult {
  swapId: string;
}

export interface MesonApiResponse<T> {
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: {
      code: string;
    };
  };
}

export interface BridgeOptions {
  from: string;
  to: string;
  amount: string;
  recipient: string;
  privateKey?: string;
  fromContract?: boolean;
  dataToContract?: string;
  hash?: string;  // Transaction hash for contract-based swaps
  dryRun?: boolean;
  debug?: boolean;
  
  // Contract-specific options
  contract?: string;  // Address of the Meson contract
  rpcUrl?: string;    // RPC URL for the blockchain
  value?: string;     // Native token value to send with transaction
}

export interface EncodeSwapParams {
  from: string;
  to: string;
  amount: string;
  fromAddress: string;
  recipient: string;
  fromContract?: boolean;
  dataToContract?: string;  
} 