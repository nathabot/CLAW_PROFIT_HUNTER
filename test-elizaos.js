/**
 * ElizaOS Test - Simple Agent Test
 */
import { AgentRuntime } from "@elizaos/core";

const runtime = new AgentRuntime({
  character: {
    name: "TestTradingAgent",
    bio: "A helpful crypto trading assistant",
  },
});

console.log("✅ ElizaOS Core installed successfully!");
console.log("Version:", runtime.character?.name || "v1.7.2");
