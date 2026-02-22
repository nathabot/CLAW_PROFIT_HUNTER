/**
 * ElizaOS - Simple Test (JavaScript)
 */
import { AgentRuntime, ElizaOS } from "@elizaos/core";

// Simple character config
const tradingCharacter = {
  id: "trading-bot",
  name: "TradingBot",
  description: "A smart crypto trading assistant",
  instructions: "You are a helpful crypto trading assistant",
};

async function main() {
  try {
    const runtime = new AgentRuntime({
      character: tradingCharacter,
    });
    
    console.log("✅ ElizaOS AgentRuntime works!");
    console.log("   Agent ID:", runtime.agentId?.slice(0, 8) || "unknown");
    console.log("   Name:", runtime.character?.name);
    
    // Check available features
    console.log("\n📋 Available features:");
    console.log("   - Actions:", runtime.actions?.length || 0);
    console.log("   - Evaluators:", runtime.evaluators?.length || 0);
    console.log("   - Providers:", runtime.providers?.length || 0);
    
    console.log("\n⚠️  Next steps for communication:");
    console.log("   1. Install Telegram plugin: bun add @elizaos/plugin-telegram");
    console.log("   2. Or use runtime.sendMessage() for direct messaging");
    
  } catch (e) {
    console.log("❌ Error:", e.message);
  }
}

main();
