/**
 * JUPITER SWAP EXECUTOR v2
 * Multi-API key support with rotation on rate limit
 */

const fetch = require('node-fetch');
const fs = require('fs');

class JupiterSwapExecutorV2 {
  constructor(connection, walletOrPath, apiPoolPath = null) {
    this.connection = connection;
    this.baseURL = 'https://api.jup.ag';
    this.ultraURL = 'https://api.jup.ag/ultra';  // New Ultra endpoint
    this.apiKeys = [];
    this.currentKeyIndex = 0;
    
    // Load API keys
    this.loadApiKeys(apiPoolPath);
    
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
  
  loadApiKeys(apiPoolPath) {
    try {
      if (apiPoolPath && fs.existsSync(apiPoolPath)) {
        const pool = JSON.parse(fs.readFileSync(apiPoolPath, 'utf8'));
        this.apiKeys.push(pool.primary.apiKey);
        pool.fallbacks.forEach(fb => {
          if (fb.apiKey) this.apiKeys.push(fb.apiKey);
        });
      } else {
        // Single key from old config
        const config = JSON.parse(fs.readFileSync('/root/trading-bot/jupiter-config.json', 'utf8'));
        this.apiKeys.push(config.apiKey);
      }
    } catch (e) {
      console.log('⚠️  Failed to load API keys:', e.message);
    }
  }
  
  getCurrentApiKey() {
    return this.apiKeys[this.currentKeyIndex];
  }
  
  rotateApiKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    console.log(`🔄 Rotated to API key ${this.currentKeyIndex + 1}/${this.apiKeys.length}`);
    return this.getCurrentApiKey();
  }

  async fetchWithRotation(url, options, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Update Authorization header with current key
        options.headers = options.headers || {};
        options.headers['Authorization'] = `Bearer ${this.getCurrentApiKey()}`;
        options.headers['Accept'] = 'application/json';
        
        const res = await fetch(url, options);
        const text = await res.text();
        
        // Check if JSON
        if (text.trim().startsWith('{')) {
          return { success: true, data: JSON.parse(text) };
        }
        
        // HTML response = rate limit
        console.log(`⚠️  API ${this.currentKeyIndex + 1} rate limited (HTML)`);
        
        // Try rotate if we have more keys
        if (this.apiKeys.length > 1) {
          this.rotateApiKey();
        } else {
          // Wait and retry
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
        
      } catch (e) {
        if (attempt === maxRetries - 1) throw e;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    
    return { success: false, error: 'All API keys exhausted' };
  }

  async honeypotCheck(tokenCA) {
    // Try Jupiter with rotation
    const result = await this.fetchWithRotation(
      `${this.baseURL}/v6/quote?inputMint=${tokenCA}&outputMint=So11111111111111111111111111111111111111112&amount=1000000&slippageBps=5000`,
      { timeout: 10000 },
      6  // Try all keys + retries
    );
    
    if (result.success) {
      const quote = result.data;
      if (quote.error) return { safe: false, reason: quote.error };
      return { safe: true, reason: 'Jupiter quote OK', quote };
    }
    
    // Fallback to DexScreener
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenCA}`);
      const data = await res.json();
      const pair = data.pairs?.[0];
      
      if (!pair) return { safe: false, reason: 'No pair data' };
      
      const liquidity = parseFloat(pair.liquidity?.usd || 0);
      const sells = pair.txns?.h24?.sells || 0;
      
      if (liquidity < 10000) return { safe: false, reason: `Low liquidity: $${liquidity}` };
      if (sells === 0) return { safe: false, reason: 'No sell transactions' };
      
      return { safe: true, reason: `DexScreener: $${liquidity} liq, ${sells} sells` };
    } catch (e) {
      return { safe: false, reason: `Check failed: ${e.message}` };
    }
  }

  async executeBuy(tokenCA, amountSol, slippage = 10) {
    const wsol = 'So11111111111111111111111111111111111111112';
    const lamports = Math.floor(amountSol * 1e9);
    
    // Try Ultra endpoint first (faster, less rate limited)
    console.log('  🔄 Trying Jupiter Ultra endpoint...');
    let quoteResult = await this.fetchWithRotation(
      `${this.ultraURL}/v1/quote?inputMint=${wsol}&outputMint=${tokenCA}&amount=${lamports}&slippageBps=${slippage * 100}`,
      { timeout: 15000 },
      2
    );
    
    // Fallback to v6 if ultra fails
    if (!quoteResult.success) {
      console.log('  🔄 Ultra failed, trying v6 endpoint...');
      quoteResult = await this.fetchWithRotation(
        `${this.baseURL}/v6/quote?inputMint=${wsol}&outputMint=${tokenCA}&amount=${lamports}&slippageBps=${slippage * 100}&onlyDirectRoutes=false`,
        { timeout: 15000 },
        6
      );
    }
    
    if (!quoteResult.success) {
      return { success: false, error: quoteResult.error };
    }
    
    const quote = quoteResult.data;
    if (quote.error) return { success: false, error: `Quote error: ${quote.error}` };
    
    // Get swap transaction (try Ultra first)
    console.log('  🔄 Building swap transaction...');
    let swapResult = await this.fetchWithRotation(
      `${this.ultraURL}/v1/swap`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: this.wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          prioritizationFeeLamports: 10000
        }),
        timeout: 15000
      },
      2
    );
    
    // Fallback to v6 swap
    if (!swapResult.success) {
      swapResult = await this.fetchWithRotation(
        `${this.baseURL}/v6/swap`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteResponse: quote,
            userPublicKey: this.wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 10000
          }),
          timeout: 15000
        },
        3
      );
    }
    
    if (!swapResult.success) {
      return { success: false, error: swapResult.error };
    }
    
    const swapData = swapResult.data;
    if (swapData.error) return { success: false, error: `Swap error: ${swapData.error}` };
    
    // Execute transaction
    try {
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
        inputAmount: amountSol,
        expectedOutput: quote.outAmount,
        price: quote.priceImpactPct
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async executeSell(tokenCA, tokenAmount, slippage = 10) {
    const wsol = 'So11111111111111111111111111111111111111112';
    
    // Try Ultra first
    let quoteResult = await this.fetchWithRotation(
      `${this.ultraURL}/v1/quote?inputMint=${tokenCA}&outputMint=${wsol}&amount=${tokenAmount}&slippageBps=${slippage * 100}`,
      { timeout: 15000 },
      2
    );
    
    // Fallback to v6
    if (!quoteResult.success) {
      quoteResult = await this.fetchWithRotation(
        `${this.baseURL}/v6/quote?inputMint=${tokenCA}&outputMint=${wsol}&amount=${tokenAmount}&slippageBps=${slippage * 100}`,
        { timeout: 15000 },
        6
      );
    }
    
    if (!quoteResult.success) return { success: false, error: quoteResult.error };
    
    const quote = quoteResult.data;
    if (quote.error) return { success: false, error: `Quote error: ${quote.error}` };
    
    const swapResult = await this.fetchWithRotation(
      `${this.baseURL}/v6/swap`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: this.wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          prioritizationFeeLamports: 10000
        }),
        timeout: 15000
      },
      3
    );
    
    if (!swapResult.success) return { success: false, error: swapResult.error };
    
    const swapData = swapResult.data;
    if (swapData.error) return { success: false, error: `Swap error: ${swapData.error}` };
    
    try {
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
        outputAmount: quote.outAmount / 1e9
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = JupiterSwapExecutorV2;
