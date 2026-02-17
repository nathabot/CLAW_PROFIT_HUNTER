/**
 * SOLANA TRACKER SWAP EXECUTOR
 * Alternative to Jupiter API for swap execution
 */

const fetch = require('node-fetch');
const fs = require('fs');

class SolanaTrackerExecutor {
  constructor(apiKey, connection, walletOrPath) {
    this.apiKey = apiKey;
    this.connection = connection;
    this.baseURL = 'https://swap-v2.solanatracker.io';
    
    // Handle wallet
    if (typeof walletOrPath === 'string') {
      const walletData = JSON.parse(fs.readFileSync(walletOrPath, 'utf8'));
      if (walletData.privateKey) {
        const bs58mod = require('bs58');
        const bs58 = bs58mod.default || bs58mod;
        const secretKey = bs58.decode(walletData.privateKey);
        this.wallet = require('@solana/web3.js').Keypair.fromSecretKey(secretKey);
      } else {
        this.wallet = require('@solana/web3.js').Keypair.fromSecretKey(new Uint8Array(walletData));
      }
    } else {
      this.wallet = walletOrPath;
    }
  }

  /**
   * Get quote and build swap transaction
   */
  async getSwapQuote(fromMint, toMint, amount, slippage = 10) {
    try {
      const url = `${this.baseURL}/swap?from=${fromMint}&to=${toMint}&fromAmount=${amount}&slippage=${slippage}&payer=${this.wallet.publicKey.toString()}&priorityFee=0.000005&txVersion=v0`;
      
      console.log('  🔄 Getting quote from Solana Tracker...');
      
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 15000
      });
      
      const text = await res.text();
      
      if (!text.startsWith('{')) {
        return { success: false, error: 'Invalid response (HTML?)' };
      }
      
      const data = JSON.parse(text);
      
      if (data.error) {
        return { success: false, error: data.error };
      }
      
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Execute buy (SOL → Token)
   */
  async executeBuy(tokenCA, amountSol, slippage = 10) {
    const wsol = 'So11111111111111111111111111111111111111112';
    
    const quoteResult = await this.getSwapQuote(wsol, tokenCA, amountSol, slippage);
    
    if (!quoteResult.success) {
      return { success: false, error: quoteResult.error };
    }
    
    try {
      const { VersionedTransaction } = require('@solana/web3.js');
      
      // Deserialize transaction
      const txBuf = Buffer.from(quoteResult.data.txn, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuf);
      
      // Sign
      transaction.sign([this.wallet]);
      
      // Send
      console.log('  🚀 Sending transaction...');
      const signature = await this.connection.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      // Confirm
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return {
        success: true,
        signature,
        inputAmount: amountSol,
        expectedOutput: quoteResult.data.rate.amountOut,
        platform: 'SolanaTracker'
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Execute sell (Token → SOL)
   */
  async executeSell(tokenCA, tokenAmount, slippage = 10) {
    const wsol = 'So11111111111111111111111111111111111111112';
    
    const quoteResult = await this.getSwapQuote(tokenCA, wsol, tokenAmount, slippage);
    
    if (!quoteResult.success) {
      return { success: false, error: quoteResult.error };
    }
    
    try {
      const { VersionedTransaction } = require('@solana/web3.js');
      
      const txBuf = Buffer.from(quoteResult.data.txn, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuf);
      
      transaction.sign([this.wallet]);
      
      const signature = await this.connection.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return {
        success: true,
        signature,
        outputAmount: quoteResult.data.rate.amountOut
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Honeypot check (try to get quote for selling)
   */
  async honeypotCheck(tokenCA) {
    try {
      const wsol = 'So11111111111111111111111111111111111111112';
      const quote = await this.getSwapQuote(tokenCA, wsol, 1000000, 50);
      
      if (quote.success && quote.data.txn) {
        return { safe: true, reason: 'Solana Tracker quote OK' };
      }
      
      return { safe: false, reason: quote.error || 'Cannot get sell quote' };
    } catch (e) {
      return { safe: false, reason: e.message };
    }
  }
}

module.exports = SolanaTrackerExecutor;
