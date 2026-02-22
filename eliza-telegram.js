/**
 * ElizaOS Trading Agent with Telegram
 * Using @nathabot_vps_bot
 */
import { AgentRuntime, ElizaOS } from "@elizaos/core";

// Character config for Telegram
const tradingAgent = {
  id: "trading-bot",
  name: "NathaTradingBot",
  description: "A smart crypto trading assistant on Solana",
  instructions: `You are Natha, an AI trading assistant. 
  
  You help with:
  - Analyzing Solana tokens
  - Checking market conditions
  - Executing trades
  
  Be concise and helpful. Always prioritize safety.`,
  
  // Telegram settings
  clients: ["telegram"],
  allowDirectMessages: true,
  shouldOnlyJoinInAllowedGroups: false,
  
  // Model - use Groq (free, fast)
  models: [],
  
  plugins: [],
  
  style: {
    all: ["concise", "helpful", "analytical"],
    chat: ["friendly", "professional"],
  },
};

// Environment
const TELEGRAM_BOT_TOKEN = "8295470573:AAEfp_o-I2FEOaQcfMeHHbWce54WTNHBwCE";

async function main() {
  console.log("🤖 Starting ElizaOS Trading Bot...\n");
  console.log("   Bot: @nathabot_vps_bot");
  console.log("   Token:", TELEGRAM_BOT_TOKEN.slice(0, 15) + "...");
  
  // Note: Need to configure Telegram plugin properly
  // For now, just test the runtime
  
  const runtime = new AgentRuntime({
    character: tradingAgent,
  });
  
  console.log("✅ Agent initialized!");
  console.log("   Name:", runtime.character.name);
  console.log("   Instructions:", runtime.character.instructions?.slice(0, 50) + "...");
  
  console.log("\n⚠️  Telegram plugin requires:");
  console.log("   1. Proper .env setup");
  console.log("   2. Database (SQLite/Postgres)");
  console.log("   3. Full ElizaOS setup");
  
  console.log("\n✅ ElizaOS core is working!");
}

main();
