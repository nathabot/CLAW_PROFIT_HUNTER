/**
 * ElizaOS Trading Bot - Simple Telegram Integration
 * 
 * A trading bot that uses Telegram for communication
 * Can respond to commands and integrate with our trading system
 */
const TELEGRAM_TOKEN = "8295470573:AAEfp_o-I2FEOaQcfMeHHbWce54WTNHBwCE";
const API_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Character prompt (ElizaOS style)
const CHARACTER = {
  name: "Natha",
  personality: "Sharp, analytical, direct - crypto trader mindset. Prioritizes survival over moon shots.",
  expertise: ["Technical analysis", "Market sentiment", "Risk management", "Solana tokens"],
  style: "Concise, actionable, Indonesian casual (kamu/aku)"
};

// Simple command handlers
const commands = {
  '/start': async (chatId) => {
    return sendMessage(chatId, 
      `🤖 <b>Halo! Aku Natha</b>\n\n` +
      `${CHARACTER.personality}\n\n` +
      `📋 <b>Commands:</b>\n` +
      `• /balance - Check saldo\n` +
      `• /status - Status sistem\n` +
      `• /positions - Posisi terbuka\n` +
      `• /help - Menu lengkap`
    );
  },
  
  '/help': async (chatId) => {
    return sendMessage(chatId,
      `📋 <b>Menu</b>\n\n` +
      `• /start - Perkenalan\n` +
      `• /balance - Cek saldo & P/L\n` +
      `• /status - Status trading\n` +
      `• /positions - Posisi terbuka\n` +
      `• /market - Kondisi pasar\n` +
      `• /help - Menu ini`
    );
  },
  
  '/balance': async (chatId) => {
    try {
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync('/root/trading-bot/current-balance.json'));
      return sendMessage(chatId,
        `💰 <b>Balance</b>\n\n` +
        `SOL: ${data.balance?.toFixed(4) || '0'}\n` +
        `Peak: 0.4099 SOL\n` +
        `Drawdown: ~19%`
      );
    } catch {
      return sendMessage(chatId, `❌ Gagal mengambil balance`);
    }
  },
  
  '/status': async (chatId) => {
    return sendMessage(chatId,
      `📊 <b>System Status</b>\n\n` +
      `🤖 Live Trader: Running v4.2.1\n` +
      `📈 Mode: AUTO | DEGEN\n` +
      `💵 Balance: 0.332 SOL\n` +
      `📊 Peak: 0.4099 SOL\n` +
      `🛡️ Emergency: OFF\n` +
      `⚠️ Open Positions: 4`
    );
  },
  
  '/positions': async (chatId) => {
    return sendMessage(chatId,
      `📋 <b>Open Positions</b>\n\n` +
      `1. ATLAS-1: -3.37%\n` +
      `2. ATLAS-2: +1.67%\n` +
      `3. SAMO-x: -0.02%\n` +
      `4. BONK-x: -0.78%\n\n` +
      `Waiting for TP/SL...`
    );
  },
  
  '/market': async (chatId) => {
    return sendMessage(chatId,
      `📈 <b>Market</b>\n\n` +
      `Fear & Greed: 9 (Extreme Fear)\n` +
      `Volume: 10%\n` +
      `Trend: Sideways/Bearish\n\n` +
      `💡 Tips: Riska rendah, tunggu sinyal clear`
    );
  }
};

// Telegram API helpers
async function sendMessage(chatId, text) {
  const res = await fetch(`${API_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
  return res.json();
}

async function getUpdates(offset = 0) {
  const res = await fetch(`${API_URL}/getUpdates?timeout=60&offset=${offset}`);
  return res.json();
}

// Main loop
async function startBot() {
  console.log("🤖 Starting Natha Trading Bot...");
  
  // Test connection
  const me = await fetch(`${API_URL}/getMe`).then(r => r.json());
  if (!me.ok) {
    console.log("❌ Bot error:", me.description);
    return;
  }
  
  console.log(`✅ Bot: @${me.result.username}`);
  console.log("📡 Listening for commands...\n");
  
  let offset = 0;
  
  // Poll for messages (simple version)
  // In production, use webhook for efficiency
  setInterval(async () => {
    try {
      const updates = await getUpdates(offset);
      
      if (updates.ok && updates.result?.length > 0) {
        for (const update of updates.result) {
          offset = update.update_id + 1;
          
          if (update.message?.text) {
            const chatId = update.message.chat.id;
            const text = update.message.text;
            const username = update.message.chat.username;
            
            console.log(`📩 ${username}: ${text}`);
            
            // Handle commands
            const cmd = text.split(' ')[0];
            if (commands[cmd]) {
              await commands[cmd](chatId);
            } else if (!cmd.startsWith('/')) {
              // Echo with character
              await sendMessage(chatId, 
                `🤖 <b>Natha:</b>\n\n` +
                `Ketik /help untuk menu.\n` +
                `Atau /balance untuk cek saldo!`
              );
            }
          }
        }
      }
    } catch (e) {
      console.log("⚠️ Error:", e.message);
    }
  }, 3000);
}

// Start
startBot();
