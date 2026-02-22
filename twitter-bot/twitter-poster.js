/**
 * Twitter Auto-Poster v2 - Enhanced with Content Finder
 * Runs 3-4 times per day for @daiarticle
 * 
 * Schedule:
 * - 08:00 Morning
 * - 12:00 Noon  
 * - 17:00 Afternoon
 * - 21:00 Evening
 */

const { ContentFinder } = require('./content-finder.js');

const CREDENTIALS = {
  bearer: "AAAAAAAAAAAAAAAAAAAAACZv7gEAAAAAJOhqEtXoa1KfzwDSSNvwgaju6zA%3DsvDP3xR5OZKqD3rIiGTxiuAlZNXnI5wqMgiYTpBk5BKbSl03SW",
  apiKey: "FbZ298Y3zG6JCtTYnEoZkQxdB",
  apiSecret: "YbGC7OAOiSY7DAZtIR4tsD0VAMbJH6GZXkKtfx8unvlg0Igqab",
  accessToken: "2022612607518244864-UghWDVVpKdgLd800Lmpi9UnvD4of0m",
  accessSecret: "t8jGIGzCObyh3wS7EceBiPLcdSI4YdimPZhhh9oKY2aMg"
};

// Posting times (WIB - Jakarta)
const POST_TIMES = [
  "07:00", // Morning
  "12:00", // Noon
  "17:00", // Afternoon  
  "21:00", // Evening
];

const LOG_FILE = "/root/trading-bot/twitter-bot/post-log.json";

class TwitterPoster {
  constructor() {
    this.contentFinder = new ContentFinder();
    this.lastPostFile = LOG_FILE;
    this.loadPostLog();
  }
  
  loadPostLog() {
    try {
      const fs = require('fs');
      const data = fs.readFileSync(this.lastPostFile, 'utf8');
      this.postLog = JSON.parse(data);
    } catch {
      this.postLog = { posts: [], lastMentionId: null };
    }
  }
  
  savePostLog() {
    const fs = require('fs');
    fs.writeFileSync(this.lastPostFile, JSON.stringify(this.postLog, null, 2));
  }
  
  async tweet(text) {
    const { execSync } = require('child_process');
    
    // Escape text for shell
    const escaped = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    
    const cmd = `export TWITTER_BEARER_TOKEN="${CREDENTIALS.bearer}" && export TWITTER_API_KEY="${CREDENTIALS.apiKey}" && export TWITTER_API_SECRET="${CREDENTIALS.apiSecret}" && export TWITTER_ACCESS_TOKEN="${CREDENTIALS.accessToken}" && export TWITTER_ACCESS_SECRET="${CREDENTIALS.accessSecret}" && node ~/.openclaw/workspace/skills/x-twitter/bin/twclaw.js tweet "${escaped}"`;
    
    try {
      const result = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
      console.log("✅ Tweet posted:", text.slice(0, 50) + "...");
      
      // Log the post
      this.postLog.posts.push({
        text: text.slice(0, 100),
        time: new Date().toISOString()
      });
      this.savePostLog();
      
      return result;
    } catch (e) {
      console.log("❌ Tweet failed:", e.message);
      return null;
    }
  }
  
  async postWithContent() {
    // Get content from finder
    const content = this.contentFinder.getRandomPost();
    await this.tweet(content);
  }
  
  async postGitHubUpdate() {
    // Try to get actual GitHub content
    const results = await this.contentFinder.findContent();
    
    if (results.length > 0 && results[0].data) {
      const post = `🚀 New Update: ${results[0].data.name}\n\n${results[0].data.description}\n\n🔗 ${results[0].data.url}\n\n#OpenSource #AI`;
      await this.tweet(post);
    } else {
      // Fallback to generic post
      await this.postWithContent();
    }
  }
  
  start() {
    console.log("🤖 Twitter Auto-Poster starting...");
    console.log(`📅 Schedule: ${POST_TIMES.join(", ")} (WIB)`);
    console.log(`📋 Posts so far: ${this.postLog.posts.length}`);
    
    // Main posting schedule
    setInterval(() => {
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      if (POST_TIMES.includes(time)) {
        // Check if we already posted this hour
        const hourKey = `${now.getHours()}:00`;
        const lastPost = this.postLog.posts[this.postLog.posts.length - 1];
        
        if (!lastPost || !lastPost.time.includes(time)) {
          console.log(`⏰ Posting time: ${time}`);
          
          // Alternate between content and GitHub updates
          if (Math.random() > 0.5) {
            this.postGitHubUpdate();
          } else {
            this.postWithContent();
          }
        }
      }
    }, 60000); // Check every minute
    
    // Initial post
    console.log("✅ Poster running...");
  }
}

// Run
const poster = new TwitterPoster();
poster.start();
