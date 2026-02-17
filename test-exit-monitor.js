const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');

const RPC = 'https://test.com';
const connection = new Connection(RPC);

// Load wallet with bs58
const bs58 = require('bs58');
const walletData = JSON.parse(fs.readFileSync('/root/trading-bot/wallet.json', 'utf8'));
const secretKey = bs58.decode(walletData.privateKey);
const wallet = Keypair.fromSecretKey(secretKey);
console.log('Wallet loaded: ' + wallet.publicKey.toString().slice(0, 20) + '...');

const POS = {
  symbol: 'TEST',
  ca: 'abc123',
  entry: 0.001,
  stop: 0.0009,
  tp1: 0.0011,
  tp2: 0.0012,
  partialExit: 0.5
};

const MAX_RETRIES = 5;

const BOT_TOKEN = 'test';
const CHAT_ID = 'test';

console.log('Exit monitor for', POS.symbol);
