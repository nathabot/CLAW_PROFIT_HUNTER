/**
 * Twitter Bot Master - @daiarticle
 * 
 * Runs:
 * - Auto-poster (3-4x daily)
 * - Mentions handler (replies)
 * - Content finder
 * 
 * Schedule: 07:00, 12:00, 17:00, 21:00 (WIB)
 */

const { spawn } = require('child_process');

console.log("=" .repeat(50));
console.log("🐦 Twitter Bot Master - @daiarticle");
console.log("=" .repeat(50));
console.log("");
console.log("Features:");
console.log("  ✓ Auto-post 3-4x daily (AI/OpenClaw content)");
console.log("  ✓ Mentions handler (natural replies)");
console.log("  ✓ Content finder (GitHub, news)");
console.log("");
console.log("Schedule:");
console.log("  • 07:00 - Morning post");
// Add other times from config
console.log("  • 12:00 - Noon post");
console.log("  • 17:00 - Afternoon post");
console.log("  • 21:00 - Evening post");
console.log("");

// Start poster
console.log("🤖 Starting auto-poster...");
const poster = spawn('node', ['twitter-poster.js'], {
  cwd: __dirname,
  detached: false,
  stdio: 'inherit'
});

poster.on('error', (err) => {
  console.log("❌ Poster error:", err.message);
});

// Start mentions handler  
console.log("📬 Starting mentions handler...");
const mentions = spawn('node', ['mentions-handler.js'], {
  cwd: __dirname,
  detached: false,
  stdio: 'inherit'
});

mentions.on('error', (err) => {
  console.log("❌ Mentions error:", err.message);
});

console.log("");
console.log("✅ Twitter bot running!");
console.log("📝 Use Ctrl+C to stop");
console.log("");

// Handle exit
process.on('SIGINT', () => {
  console.log("\n🛑 Stopping...");
  poster.kill();
  mentions.kill();
  process.exit();
});
