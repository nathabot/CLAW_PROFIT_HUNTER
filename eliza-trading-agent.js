/**
 * ElizaOS Trading Agent - Ready to Use
 * 
 * How it works:
 * 1. Create AgentRuntime with character config
 * 2. Load plugins (Telegram, Discord, etc.)
 * 3. Agent responds to messages automatically
 */

import { AgentRuntime, BootstrapPlugin } from "@elizaos/core";

// Simple trading agent character
const tradingAgent = {
  name: "TradingBot",
  bio: "A smart crypto trading assistant that analyzes market trends and executes trades",
  style: {
    all: ["helpful", "analytical", "concise"],
    chat: ["friendly", "professional"],
  },
  message_examples: [
    ["user", "What's the market like?"],
    ["agent", "BTC is showing bearish signals. Fear & Greed is at 9 (Extreme Fear)"],
    ["user", "Should I buy SOL?"],
    ["agent", "SOL looks promising. Based on current momentum, entry around $0.95-$1.00 would be ideal."],
  ],
};

async function main() {
  console.log("🤖 Starting ElizaOS Trading Agent...\n");

  // Create runtime with character
  const runtime = new AgentRuntime({
    character: tradingAgent,
    plugins: [new BootstrapPlugin()],
  });

  await runtime.initialize();

  console.log("✅ Agent initialized!");
  console.log(`   Name: ${runtime.character.name}`);
  console.log(`   Bio: ${runtime.character.bio}`);
  console.log("\n📝 Available actions:", runtime.actions?.length || 0);
  console.log("📝 Available plugins:", runtime.plugins?.length || 0);
  
  // Note: To actually receive/send messages, you need:
  // 1. Telegram plugin (for Telegram bot)
  // 2. Discord plugin (for Discord)
  // 3. Or use runtime.message() directly
  
  console.log("\n⚠️  To connect to Telegram/Discord:");
  console.log("   bun add @elizaos/plugin-telegram");
  console.log("   bun add @elizaos/plugin-discord");
  
  console.log("\n✅ ElizaOS is ready!");
  console.log("   Next step: Add message plugins for communication");
}

main().catch(console.error);
