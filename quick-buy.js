const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fs = require('fs');

const WALLET_PATH = './wallet.json';
const TOKEN_CA = '6jqv9GMLXWsdam62SE63NctxkXND4nZFz97gLcopump'; // CLAW
const BUY_AMOUNT = 0.005; // SOL

async function main() {
  // Load wallet
  const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'));
  const secretKey = Buffer.from(walletData.secretKey, 'base64');
  const wallet = Keypair.fromSecretKey(new Uint8Array(secretKey));
  
  console.log('Wallet:', wallet.publicKey.toString());
  console.log('Token CA:', TOKEN_CA);
  console.log('Buy amount:', BUY_AMOUNT, 'SOL');
  
  // Use SolanaTracker API for quick swap
  const SOLANA_TRACKER_BASE_URL = 'https://swap-v2.solanatracker.io';
  const wsol = 'So11111111111111111111111111111111111111112';
  
  const url = `${SOLANA_TRACKER_BASE_URL}/swap?from=${wsol}&to=${TOKEN_CA}&fromAmount=${BUY_AMOUNT}&slippage=15&payer=${wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
  
  console.log('\nRequesting swap...');
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.txn) {
    console.log('\n✅ Got swap transaction! Signing and sending...');
    console.log('Rate: 0.005 SOL →', data.rate.amountOut, 'CLAW');
    console.log('Min output:', data.rate.minAmountOut, 'CLAW');
    
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Handle versioned transaction properly
    const txBytes = Uint8Array.from(Buffer.from(data.txn, 'base64'));
    const transaction = VersionedTransaction.deserialize(txBytes);
    
    // Sign the transaction
    transaction.sign([wallet]);
    
    // Send the transaction
    const signature = await connection.sendTransaction(transaction, {
      preflightCommitment: 'confirmed',
      maxRetries: 5
    });
    
    console.log('\n✅ Trade executed!');
    console.log('Signature:', signature);
    console.log('Explorer: https://solscan.io/tx/' + signature);
    
    // Save position info
    const position = {
      token: 'CLAW',
      ca: TOKEN_CA,
      amount: data.rate.amountOut,
      entryPrice: 0.005 / data.rate.amountOut,
      solSpent: 0.005,
      timestamp: Date.now(),
      tp1: data.rate.amountOut * 0.5, // Sell 50% at TP
      sl: 0.00425 // -15% SL
    };
    console.log('\n📊 Position:', JSON.stringify(position, null, 2));
    
  } else {
    console.log('Error:', data);
  }
}

main();
