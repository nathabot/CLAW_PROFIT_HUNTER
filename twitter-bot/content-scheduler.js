/**
 * @daiarticle Content Scheduler
 * Personal Branding v2
 * 
 * Posts 3-4x daily with branded content
 * Based on branding.js profile
 */

const { BRAND, generateContent, formatHashtags } = require('./branding.js');

const CREDENTIALS = {
  bearer: "AAAAAAAAAAAAAAAAAAAAACZv7gEAAAAAJOhqEtXoa1KfzwDSSNvwgaju6zA%3DsvDP3xR5OZKqD3rIiGTxiuAlZNXnI5wqMgiYTpBk5BKbSl03SW",
  apiKey: "FbZ298Y3zG6JCtTYnEoZkQxdB",
  apiSecret: "YbGC7OAOiSY7DAZtIR4tsD0VAMbJH6GZXkKtfx8unvlg0Igqab",
  accessToken: "2022612607518244864-UghWDVVpKdgLd800Lmpi9UnvD4of0m",
  accessSecret: "t8jGIGzCObyh3wS7EceBiPLcdSI4YdimPZhhh9oKY2aMg"
};

// Schedule (WIB)
const SCHEDULE = {
  morning: "07:00",   // News roundup
  noon: "12:00",      // Deep dive / thread
  afternoon: "17:00", // Quick tips
  evening: "21:00"    // Engagement
};

const POST_TYPES = {
  "07:00": ["morning", "news"],
  "12:00": ["thread", "github"],
  "17:00": ["tip", "news"],
  "21:00": ["engagement", "tip"]
};

// Content database - simulated for now
const CONTENT_DB = {
  // OpenClaw content
  openclaw: [
    {
      topic: "OpenClaw",
      summary: "OpenClaw v2 released with 50+ new skills and faster inference. Your personal AI assistant that runs everywhere.",
      source: "github.com/openclaw/openclaw"
    },
    {
      topic: "AI Agents",
      summary: "The future of AI is autonomous agents. OpenClaw leads the pack with multi-channel support.",
      source: "docs.openclaw.ai"
    }
  ],
  
  // AI News
  ai_news: [
    {
      topic: "Claude AI",
      summary: "Claude continues to impress with better reasoning and longer context windows.",
      source: "anthropic.com"
    },
    {
      topic: "AI Automation",
      summary: "AI agents are now capable of complex multi-step tasks. The productivity revolution is here.",
      source: "openai.com"
    }
  ],
  
  // Tips
  tips: [
    "Use AI agents to automate repetitive tasks",
    "OpenClaw can run on your phone + desktop",
    "Set up AI reminders for trading signals",
    "Automate your research with AI agents"
  ],
  
  // Questions
  questions: [
    "What's your take on AI agents?",
    "Have you tried autonomous AI assistants?",
    "Which AI tool do you use most?",
    "AI agents: hype or real?"
  ]
};

class ContentScheduler {
  constructor() {
    this.logFile = "/root/trading-bot/twitter-bot/content-log.json";
    this.loadLog();
  }
  
  loadLog() {
    try {
      const fs = require('fs');
      this.log = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
    } catch {
      this.log = { posts: [], lastPost: null };
    }
  }
  
  saveLog() {
    const fs = require('fs');
    fs.writeFileSync(this.logFile, JSON.stringify(this.log, null, 2));
  }
  
  async tweet(text) {
    const { execSync } = require('child_process');
    const escaped = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    
    const cmd = `export TWITTER_BEARER_TOKEN="${CREDENTIALS.bearer}" && export TWITTER_API_KEY="${CREDENTIALS.apiKey}" && export TWITTER_API_SECRET="${CREDENTIALS.apiSecret}" && export TWITTER_ACCESS_TOKEN="${CREDENTIALS.accessToken}" && export TWITTER_ACCESS_SECRET="${CREDENTIALS.accessSecret}" && node ~/.openclaw/workspace/skills/x-twitter/bin/twclaw.js tweet "${escaped}"`;
    
    try {
      const result = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
      console.log("✅ Posted:", text.slice(0, 50) + "...");
      
      this.log.posts.push({
        text: text.slice(0, 100),
        time: new Date().toISOString(),
        type: 'scheduled'
      });
      this.saveLog();
      
      return true;
    } catch (e) {
      console.log("❌ Failed:", e.message);
      return false;
    }
  }
  
  // Get content for specific time slot
  getContentForTime(time) {
    const types = POST_TYPES[time];
    if (!types) return null;
    
    const type = types[Math.floor(Math.random() * types.length)];
    
    switch(type) {
      case 'morning':
        const news = [...CONTENT_DB.openclaw, ...CONTENT_DB.ai_news];
        const item = news[Math.floor(Math.random() * news.length)];
        return generateContent('morning', {
          topic: item.topic,
          summary: item.summary,
          source: item.source
        });
        
      case 'news':
        const newsItem = [...CONTENT_DB.openclaw, ...CONTENT_DB.ai_news];
        const n = newsItem[Math.floor(Math.random() * newsItem.length)];
        return generateContent('news', {
          topic: n.topic,
          summary: n.summary,
          source: n.source
        });
        
      case 'thread':
        return generateContent('thread', {
          topic: BRAND.topics[Math.floor(Math.random() * BRAND.topics.length)],
          content: "Key insight about AI agents and automation. They're changing how we work and interact with technology. The future is autonomous. 🚀"
        });
        
      case 'github':
        return generateContent('github', {
          repo: "openclaw/openclaw",
          description: "Personal AI assistant that works on any platform. 50+ new skills in latest update!",
          url: "github.com/openclaw/openclaw"
        });
        
      case 'tip':
        const tip = CONTENT_DB.tips[Math.floor(Math.random() * CONTENT_DB.tips.length)];
        return generateContent('tip', {
          topic: "AI Tip",
          tip: tip
        });
        
      case 'engagement':
        const q = CONTENT_DB.questions[Math.floor(Math.random() * CONTENT_DB.questions.length)];
        return generateContent('engagement', {
          question: q
        });
        
      default:
        return generateContent('engagement', {
          question: "What AI tools are you using?"
        });
    }
  }
  
  start() {
    console.log("📅 Content Scheduler starting...");
    console.log(`📝 Brand: ${BRAND.name} (${BRAND.handle})`);
    console.log(`🎯 Topics: ${BRAND.topics.slice(0, 3).join(", ")}`);
    console.log(`⏰ Schedule: ${Object.values(SCHEDULE).join(", ")} (WIB)`);
    console.log("");
    
    // Check every minute
    setInterval(() => {
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      // Check if it's post time
      if (Object.values(SCHEDULE).includes(time)) {
        // Get last post time
        const lastPost = this.log.posts[this.log.posts.length - 1];
        const lastPostHour = lastPost ? new Date(lastPost.time).getHours() : -1;
        
        // Don't double-post same hour
        if (lastPostHour !== now.getHours()) {
          console.log(`⏰ Time to post: ${time}`);
          const content = this.getContentForTime(time);
          if (content) {
            this.tweet(content);
          }
        }
      }
    }, 60000);
    
    console.log("✅ Scheduler running!");
  }
}

// Run
const scheduler = new ContentScheduler();
scheduler.start();
