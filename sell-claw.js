const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fs = require('fs');

const WALLET_PATH = './wallet.json';
const TOKEN_CA = '6jqv9GMLXWsdam62SE63NctxkXND4nZFz97gLcopump';
const CLAW_AMOUNT = 165784.57;

const RPC_ENDPOINTS = [
  'https://rpc.ankr.com/solana/9c0d1c7ed8c6c6c5d5c4b3a2e1f0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c',
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://mainnet-beta.conflux.rampage.io'
];

async function main() {
  const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'));
  const secretKey = Buffer.from(walletData.secretKey, 'base64');
  const wallet = Keypair.fromSecretKey(new Uint8Array(secretKey));
  
  console.log('Selling ALL CLAW...');
  
  const SOLANA_TRACKER_BASE_URL = 'https://swap-v2.solanatracker.io';
  const wsol = 'So11111111111111111111111111111111111111112';
  
  const url = `${SOLANA_TRACKER_BASE_URL}/swap?from=${TOKEN_CA}&to=${wsol}&fromAmount=${CLAW_AMOUNT}&slippage=50&payer=${wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.txn) {
    for (const rpc of RPC_ENDPOINTS) {
      try {
        console.log('Trying:', rpc.slice(0, 40));
        const connection = new Connection(rpc, { commitment: 'confirmed', maxRetry: 3 });
        const txBytes = Uint8Array.from(Buffer.from(data.txn, 'base64'));
        const transaction = VersionedTransaction.deserialize(txBytes);
        transaction.sign([wallet]);
        const signature = await connection.sendTransaction(transaction);
        console.log('\n✅ SOLD!');
        console.log('TX: https://solscan.io/tx/' + signature);
        return;
      } catch (e) {
        console.log('❌', e.message.slice(0, 60));
      }
    }
    console.log('\n⚠️ All RPCs failed. Save TX for later:');
    console.log(data.txn.slice(0, 100) + '...');
  }
}

main();
