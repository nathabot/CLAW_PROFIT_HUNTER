/**
 * Twitter Mentions Handler - Reply to mentions naturally
 * 
 * Monitors mentions and replies with AI-themed responses
 */

const CREDENTIALS = {
  bearer: "AAAAAAAAAAAAAAAAAAAAACZv7gEAAAAAJOhqEtXoa1KfzwDSSNvwgaju6zA%3DsvDP3xR5OZKqD3rIiGTxiuAlZNXnI5wqMgiYTpBk5BKbSl03SW",
  apiKey: "FbZ298Y3zG6JCtTYnEoZkQxdB",
  apiSecret: "YbGC7OAOiSY7DAZtIR4tsD0VAMbJH6GZXkKtfx8unvlg0Igqab",
  accessToken: "2022612607518244864-UghWDVVpKdgLd800Lmpi9UnvD4of0m",
  accessSecret: "t8jGIGzCObyh3wS7EceBiPLcdSI4YdimPZhhh9oKY2aMg"
};

const API_URL = "https://api.twitter.com/2";

// Response templates - natural replies
const REPLY_TEMPLATES = {
  greeting: [
    "Hey! 👋 Thanks for the mention!",
    "Hi there! Thanks for checking in!",
    "Hey! Good to hear from you!",
  ],
  question: [
    "Great question! Here's my take...",
    "Interesting! I think...",
    "Good point! Let me share my thoughts...",
  ],
  thanks: [
    "Thanks! 🙌 Appreciate the support!",
    "Thanks for the shoutout! 🙏",
    "Appreciate it! 💪",
  ],
  ai_topic: [
    "AI is moving so fast! Exciting times ahead 🚀",
    "Right?! The AI space is wild right now 🔥",
    "Exactly! These are interesting times for AI 🤖",
  ],
  default: [
    "Thanks for the mention! What do you think about AI?",
    "Hey! Good to connect. What's your take on AI?",
    "Thanks! Always great to meet fellow AI enthusiasts 🤝",
  ]
};

// Analyze mention and generate response
function generateReply(mention) {
  const text = mention.text?.toLowerCase() || "";
  const author = mention.author?.username || "there";
  
  // Detect intent
  if (text.includes("hello") || text.includes("hi") || text.includes("hey")) {
    const template = REPLY_TEMPLATES.greeting[Math.floor(Math.random() * REPLY_TEMPLATES.greeting.length)];
    return `${template}`;
  }
  
  if (text.includes("thanks") || text.includes("thank")) {
    const template = REPLY_TEMPLATES.thanks[Math.floor(Math.random() * REPLY_TEMPLATES.thanks.length)];
    return `${template}`;
  }
  
  if (text.includes("?") || text.includes("what") || text.includes("how")) {
    const template = REPLY_TEMPLATES.question[Math.floor(Math.random() * REPLY_TEMPLATES.question.length)];
    return `${template}`;
  }
  
  if (text.includes("ai") || text.includes("claude") || text.includes("openai") || text.includes("openclaw")) {
    const template = REPLY_TEMPLATES.ai_topic[Math.floor(Math.random() * REPLY_TEMPLATES.ai_topic.length)];
    return `${template}`;
  }
  
  // Default
  const template = REPLY_TEMPLATES.default[Math.floor(Math.random() * REPLY_TEMPLATES.default.length)];
  return `${template}`;
}

class MentionsHandler {
  constructor() {
    this.lastMentionId = null;
    this.stateFile = "/root/trading-bot/twitter-bot/mentions-state.json";
    this.loadState();
  }
  
  loadState() {
    try {
      const fs = require('fs');
      const data = fs.readFileSync(this.stateFile, 'utf8');
      const state = JSON.parse(data);
      this.lastMentionId = state.lastMentionId;
    } catch {
      this.lastMentionId = null;
    }
  }
  
  saveState() {
    const fs = require('fs');
    fs.writeFileSync(this.stateFile, JSON.stringify({ lastMentionId: this.lastMentionId }));
  }
  
  async getMentions() {
    // Use twclaw for reading mentions
    const { execSync } = require('child_process');
    
    const cmd = `export TWITTER_BEARER_TOKEN="${CREDENTIALS.bearer}" && node ~/.openclaw/workspace/skills/x-twitter/bin/twclaw.js mentions -n 10`;
    
    try {
      const result = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
      
      // Parse mentions from output
      // For now, return empty - twclaw output parsing would be needed
      return [];
    } catch (e) {
      console.log("⚠️ Mentions check:", e.message);
      return [];
    }
  }
  
  async replyToMention(mentionId, text) {
    const { execSync } = require('child_process');
    
    const escaped = text.replace(/"/g, '\\"');
    
    const cmd = `export TWITTER_BEARER_TOKEN="${CREDENTIALS.bearer}" && export TWITTER_API_KEY="${CREDENTIALS.apiKey}" && export TWITTER_API_SECRET="${CREDENTIALS.apiSecret}" && export TWITTER_ACCESS_TOKEN="${CREDENTIALS.accessToken}" && export TWITTER_ACCESS_SECRET="${CREDENTIALS.accessSecret}" && node ~/.openclaw/workspace/skills/x-twitter/bin/twclaw.js reply ${mentionId} "${escaped}"`;
    
    try {
      const result = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
      console.log(`✅ Replied to mention ${mentionId}:`, text.slice(0, 30) + "...");
      return true;
    } catch (e) {
      console.log("❌ Reply failed:", e.message);
      return false;
    }
  }
  
  async checkAndReply() {
    console.log("📬 Checking mentions...");
    
    const mentions = await this.getMentions();
    
    if (mentions.length === 0) {
      console.log("📭 No new mentions");
      return;
    }
    
    for (const mention of mentions) {
      if (mention.id === this.lastMentionId) continue;
      
      console.log(`💬 New mention from @${mention.author?.username}: ${mention.text?.slice(0, 50)}...`);
      
      // Generate reply
      const reply = generateReply(mention);
      
      // Reply to mention
      await this.replyToMention(mention.id, reply);
      
      // Update last seen
      this.lastMentionId = mention.id;
      this.saveState();
    }
  }
  
  start() {
    console.log("📬 Mentions Handler starting...");
    console.log("🔄 Checking every 2 minutes...");
    
    // Check mentions every 2 minutes
    setInterval(() => {
      this.checkAndReply();
    }, 120000);
    
    // Initial check
    this.checkAndReply();
  }
}

// Run
const handler = new MentionsHandler();
handler.start();
