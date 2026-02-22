/**
 * ElizaOS - Full Trading Bot Setup
 * With Telegram Integration
 */
import { ElizaOS } from "@elizaos/core";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("🤖 Starting ElizaOS Trading Bot...\n");

  try {
    // Initialize ElizaOS with character
    const elizaOS = new ElizaOS();
    
    await elizaOS.initialize();
    
    console.log("✅ ElizaOS initialized!");
    console.log("   Runtime:", elizaOS.runtime?.agentId);
    console.log("   Character:", elizaOS.runtime?.character?.name);
    
    // Note: Full Telegram integration requires more setup
    // The plugin needs proper database configuration
    
    console.log("\n📋 Status:");
    console.log("   - Core: ✅");
    console.log("   - Database: ⚠️ Needs configuration");
    console.log("   - Telegram: ⚠️ Needs full setup");
    
    console.log("\n⚠️  Full setup requires:");
    console.log("   1. Run: bun start --characters ./characters");
    console.log("   2. Or configure manually with database");
    
  } catch (e) {
    console.log("❌ Error:", e.message);
    console.log("\n📝 Alternative: Use simple Telegram API wrapper");
  }
}

main();
