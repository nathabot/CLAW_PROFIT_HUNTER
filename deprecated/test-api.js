const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    const data = await res.json();
    console.log('Total:', data.length);
    console.log('First keys:', Object.keys(data[0] || {}));
    console.log('First item:', JSON.stringify(data[0], null, 2).substring(0, 500));
  } catch (e) {
    console.log('Error:', e.message);
  }
}

test();
