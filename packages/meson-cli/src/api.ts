import axios from 'axios';
import { Chain, ChainLimit, EncodeSwapResult, MesonApiResponse, SwapResult, EncodeSwapParams } from './types';

// Constants
const MESON_API_URL = 'https://relayer.meson.fi/api/v1';

// API service
export class MesonApiService {
  // Debug mode flag
  private debug: boolean;

  constructor(debug = false) {
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

  // Fetch supported chains and tokens
  async getSupportedChains(): Promise<Chain[]> {
    this.log('Fetching supported chains and tokens...');
    
    const url = `${MESON_API_URL}/list`;
    const config = {
      method: 'get',
      url,
      headers: { 
        'Accept': 'application/json'
      }
    };
    
    this.log('Request config:', config);
    
    try {
      const response = await axios(config);
      
      this.log('Response data:', response.data);
      
      if (response.data.result) {
        this.log(`Received ${response.data.result.length} supported chains`);
        return response.data.result;
      } else if (response.data.error) {
        throw new Error(`Error fetching supported chains: ${response.data.error.message}`);
      } else {
        throw new Error('Invalid response format from Meson API');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.log(`API Error: ${error.message}`);
        if (error.response) {
          this.log(`Status: ${error.response.status}, Data:`, error.response.data);
        }
      }
      throw error;
    }
  }

  // Fetch swap limits
  async getSwapLimits(): Promise<ChainLimit[]> {
    this.log('Fetching swap limits...');
    
    const url = `${MESON_API_URL}/limits`;
    const config = {
      method: 'get',
      url,
      headers: { 
        'Accept': 'application/json'
      }
    };
    
    this.log('Request config:', config);
    
    try {
      const response = await axios(config);
      
      this.log('Response data:', response.data);
      
      if (response.data.result) {
        this.log(`Received limits for ${response.data.result.length} chains`);
        return response.data.result;
      } else if (response.data.error) {
        throw new Error(`Error fetching swap limits: ${response.data.error.message}`);
      } else {
        throw new Error('Invalid response format from Meson API');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.log(`API Error: ${error.message}`);
        if (error.response) {
          this.log(`Status: ${error.response.status}, Data:`, error.response.data);
        }
      }
      throw error;
    }
  }

  // Encode a swap
  async encodeSwap(
    fromChainToken: string,
    toChainToken: string,
    amount: string,
    fromAddress: string,
    recipient: string,
    fromContract?: boolean,
    dataToContract?: string
  ): Promise<EncodeSwapResult> {
    this.log(`Encoding swap: ${amount} ${fromChainToken} -> ${toChainToken} for ${recipient}`);
    
    const url = `${MESON_API_URL}/swap`;
    const payload: EncodeSwapParams = {
      from: fromChainToken,
      to: toChainToken,
      amount,
      fromAddress,
      recipient
    };
    
    // Add optional parameters if provided
    if (fromContract) {
      payload.fromContract = fromContract;
    }
    
    if (dataToContract) {
      payload.dataToContract = dataToContract;
    }
    
    const data = JSON.stringify(payload);
    
    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url,
      headers: { 
        'Content-Type': 'application/json', 
        'Accept': 'application/json'
      },
      data
    };
    
    this.log('Request config:', config);
    this.log('Request payload:', JSON.parse(data));
    
    try {
      const response = await axios(config);
      
      this.log('Response data:', response.data);
      
      if (response.data.result) {
        this.log('Successfully encoded swap');
        return response.data.result;
      } else if (response.data.error) {
        throw new Error(`Error encoding swap: ${response.data.error.message}`);
      } else {
        throw new Error('Invalid response format from Meson API');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.log(`API Error: ${error.message}`);
        if (error.response) {
          this.log(`Status: ${error.response.status}, Data:`, error.response.data);
        }
      }
      throw error;
    }
  }

  // Submit encoded swap with signature (EOA flow)
  async submitSwap(
    encodedSwap: string,
    fromAddress: string,
    recipient: string,
    signature: string
  ): Promise<SwapResult> {
    this.log(`Submitting swap: ${encodedSwap}`);
    
    const url = `${MESON_API_URL}/swap/${encodedSwap}`;
    const data = JSON.stringify({
      fromAddress,
      recipient,
      signature
    });
    
    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url,
      headers: { 
        'Content-Type': 'application/json', 
        'Accept': 'application/json'
      },
      data
    };
    
    this.log('Request config:', config);
    this.log('Request payload:', JSON.parse(data));
    
    try {
      const response = await axios(config);
      
      this.log('Response data:', response.data);
      
      if (response.data.result) {
        this.log(`Successfully submitted swap. Swap ID: ${response.data.result.swapId}`);
        return response.data.result;
      } else if (response.data.error) {
        throw new Error(`Error submitting swap: ${response.data.error.message}`);
      } else {
        throw new Error('Invalid response format from Meson API');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.log(`API Error: ${error.message}`);
        if (error.response) {
          this.log(`Status: ${error.response.status}, Data:`, error.response.data);
        } else {
          this.log('Error details:', error);
        }
      } else {
        this.log('Unknown error:', error);
      }
      throw error;
    }
  }
  
  // Submit swap from smart contract (Contract flow)
  async submitSwapFromContract(
    encodedSwap: string,
    transactionHash: string
  ): Promise<SwapResult> {
    this.log(`Submitting contract swap: ${encodedSwap} with tx hash: ${transactionHash}`);
    
    const url = `${MESON_API_URL}/swap/from-contract/${encodedSwap}`;
    const data = JSON.stringify({
      hash: transactionHash
    });
    
    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url,
      headers: { 
        'Content-Type': 'application/json', 
        'Accept': 'application/json'
      },
      data
    };
    
    this.log('Request config:', config);
    this.log('Request payload:', JSON.parse(data));
    
    try {
      const response = await axios(config);
      
      this.log('Response data:', response.data);
      
      if (response.data.result) {
        this.log(`Successfully submitted contract swap. Swap ID: ${response.data.result.swapId}`);
        return response.data.result;
      } else if (response.data.error) {
        throw new Error(`Error submitting contract swap: ${response.data.error.message}`);
      } else {
        throw new Error('Invalid response format from Meson API');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.log(`API Error: ${error.message}`);
        if (error.response) {
          this.log(`Status: ${error.response.status}, Data:`, error.response.data);
        } else {
          this.log('Error details:', error);
        }
      } else {
        this.log('Unknown error:', error);
      }
      throw error;
    }
  }
} 