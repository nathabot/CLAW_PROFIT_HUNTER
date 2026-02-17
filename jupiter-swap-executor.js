/**
 * JUPITER SWAP EXECUTOR
 * Handles swap execution with retry logic
 */

const fetch = require('node-fetch');

class JupiterSwapExecutor {
  constructor(apiKey, connection, walletOrPath) {
    this.apiKey = apiKey;
    this.connection = connection;
    this.baseURL = 'https://api.jup.ag';
    
    // Handle wallet object or wallet path
    if (typeof walletOrPath === 'string') {
      // Load from path
      const fs = require('fs');
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
   * Check if token is sellable (honeypot test) using DexScreener fallback
   */
  async honeypotCheck(tokenCA, retries = 3) {
    // Method 1: Try Jupiter v6 quote API
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(
          `${this.baseURL}/v6/quote?inputMint=${tokenCA}&outputMint=So11111111111111111111111111111111111111112&amount=1000000&slippageBps=5000`,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Accept': 'application/json'
            },
            timeout: 10000
          }
        );
        
        const text = await res.text();
        if (text.trim().startsWith('{')) {
          const quote = JSON.parse(text);
          if (quote.error) {
            return { safe: false, reason: quote.error };
          }
          return { 
            safe: true, 
            reason: 'Jupiter quote OK',
            quote: quote
          };
        }
        // HTML response - wait and retry
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      } catch (e) {
        if (i === retries - 1) break;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }

    // Method 2: Fallback to DexScreener liquidity check
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenCA}`);
      const data = await res.json();
      const pair = data.pairs?.[0];
      
      if (!pair) {
        return { safe: false, reason: 'No pair data' };
      }
      
      const liquidity = parseFloat(pair.liquidity?.usd || 0);
      const volume24h = parseFloat(pair.volume?.h24 || 0);
      const buys = pair.txns?.h24?.buys || 0;
      const sells = pair.txns?.h24?.sells || 0;
      
      // Checks
      if (liquidity < 10000) {
        return { safe: false, reason: `Low liquidity: $${liquidity}` };
      }
      
      if (sells === 0 && buys > 0) {
        return { safe: false, reason: 'No sell transactions detected' };
      }
      
      // Basic check passed
      return { 
        safe: true, 
        reason: `DexScreener: $${liquidity} liq, ${sells} sells`,
        liquidity,
        volume24h
      };
    } catch (e) {
      return { safe: false, reason: `Check failed: ${e.message}` };
    }
  }

  /**
   * Execute buy swap
   */
  async executeBuy(tokenCA, amountSol, slippage = 10) {
    const wsol = 'So11111111111111111111111111111111111111112';
    const lamports = Math.floor(amountSol * 1e9);
    
    try {
      console.log(`  🔄 Getting swap quote...`);
      
      // Get quote
      const quoteRes = await fetch(
        `${this.baseURL}/v6/quote?inputMint=${wsol}&outputMint=${tokenCA}&amount=${lamports}&slippageBps=${slippage * 100}&onlyDirectRoutes=false`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json'
          },
          timeout: 15000
        }
      );
      
      const quoteText = await quoteRes.text();
      if (!quoteText.trim().startsWith('{')) {
        throw new Error('Invalid quote response (HTML?)');
      }
      
      const quote = JSON.parse(quoteText);
      if (quote.error) {
        throw new Error(`Quote error: ${quote.error}`);
      }
      
      console.log(`  ✅ Quote received: ${quote.outAmount} out`);
      
      // Get swap transaction
      console.log(`  🔄 Building transaction...`);
      const swapRes = await fetch(`${this.baseURL}/v6/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: this.wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          prioritizationFeeLamports: 10000 // 0.001 SOL priority
        }),
        timeout: 15000
      });
      
      const swapText = await swapRes.text();
      if (!swapText.trim().startsWith('{')) {
        throw new Error('Invalid swap response (HTML?)');
      }
      
      const swapData = JSON.parse(swapText);
      if (swapData.error) {
        throw new Error(`Swap error: ${swapData.error}`);
      }
      
      // Deserialize and sign transaction
      const { VersionedTransaction } = require('@solana/web3.js');
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      
      // Sign
      transaction.sign([this.wallet]);
      
      // Send
      console.log(`  🚀 Sending transaction...`);
      const signature = await this.connection.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      console.log(`  ⏳ Confirming: ${signature.slice(0, 20)}...`);
      
      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }
      
      return {
        success: true,
        signature,
        inputAmount: amountSol,
        expectedOutput: quote.outAmount,
        price: quote.priceImpactPct
      };
      
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  /**
   * Execute sell swap (for exit)
   */
  async executeSell(tokenCA, tokenAmount, slippage = 10) {
    const wsol = 'So11111111111111111111111111111111111111112';
    
    try {
      // Get quote
      const quoteRes = await fetch(
        `${this.baseURL}/v6/quote?inputMint=${tokenCA}&outputMint=${wsol}&amount=${tokenAmount}&slippageBps=${slippage * 100}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json'
          },
          timeout: 15000
        }
      );
      
      const quote = await quoteRes.json();
      if (quote.error) {
        throw new Error(`Quote error: ${quote.error}`);
      }
      
      // Get swap transaction
      const swapRes = await fetch(`${this.baseURL}/v6/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: this.wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          prioritizationFeeLamports: 10000
        }),
        timeout: 15000
      });
      
      const swapData = await swapRes.json();
      if (swapData.error) {
        throw new Error(`Swap error: ${swapData.error}`);
      }
      
      // Execute
      const { VersionedTransaction } = require('@solana/web3.js');
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      
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
        outputAmount: quote.outAmount / 1e9 // Convert to SOL
      };
      
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }
}

module.exports = JupiterSwapExecutor;
