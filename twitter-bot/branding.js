/**
 * @daiarticle Personal Branding System
 * 
 * Brand Identity:
 * - Name: Natha (AI Trading Bot)
 * - Persona: Tech-savvy AI enthusiast, helpful, informative
 * - Niche: AI Agents, OpenClaw, Solana Trading, Automation
 * - Voice: Professional yet casual, Indonesian-inspired English
 * 
 * Content Pillars:
 * 1. AI News & Updates (40%)
 * 2. OpenClaw & AI Agents (30%)  
 * 3. Trading/Crypto Insights (20%)
 * 4. Tech Tips & Tools (10%)
 * 
 * Posting Schedule (WIB):
 * - 07:00 - Morning: News roundup
 * - 12:00 - Noon: Deep dive / Thread
 * - 17:00 - Afternoon: Quick tips / Findings
 * - 21:00 - Evening: Engagement / Thoughts
 */

const BRAND = {
  name: "Natha",
  handle: "@daiarticle",
  bio: "🤖 AI Trading Bot | Building autonomous trading systems | OpenClaw enthusiast | Crypto & AI",
  location: "Jakarta, Indonesia",
  website: "https://github.com/nathabot",
  
  // Colors (for future use)
  colors: {
    primary: "#6366F1", // Indigo
    secondary: "#10B981", // Emerald  
    accent: "#F59E0B" // Amber
  },
  
  // Topics to focus on
  topics: [
    "OpenClaw AI Assistant",
    "Claude AI",
    "AI Agents",
    "Autonomous AI",
    "LLM Automation",
    "Solana Trading",
    "Crypto AI Bots"
  ],
  
  // Hashtags
  hashtags: [
    "AI", "OpenClaw", "ArtificialIntelligence", "MachineLearning",
    "TradingBot", "Crypto", "Solana", "Automation", "Tech"
  ],
  
  // Accounts to engage with
  influencers: [
    "openai", "anthropic", "elonmusk", "sama",
    "openclaw", "github", "solana"
  ]
};

// Content Templates
const TEMPLATES = {
  // Morning News
  morning: [
    "🌅 Good morning! {topic} update:\n\n{summary}\n\nWhat's your take? {hashtags}",
    
    "☕ Quick {topic} rundown:\n\n{summary}\n\n{hashtags}"
  ],
  
  // Deep Dive / Thread
  thread: [
    "🧵 {topic} deep dive:\n\n{content}\n\nRT if helpful! {hashtags}",
    
    "📝 {topic} breakdown:\n\n{content}\n\nThread 🧵👇 {hashtags}"
  ],
  
  // Quick Tips
  tip: [
    "💡 {topic} Tip:\n\n{tip}\n\n{hashtags}",
    
    "🎯 {topic}:\n\n{tip}\n\n#Tip #AI"
  ],
  
  // Engagement
  engagement: [
    "🤔 {question}\n\nDrop your thoughts below! {hashtags}",
    
    "🔥 Hot take: {opinion}\n\nAgree or disagree? {hashtags}"
  ],
  
  // News/Update
  news: [
    "📰 {topic}:\n\n{summary}\n\nSource: {source}\n\n{hashtags}",
    
    "🚀 {topic} Update:\n\n{summary}\n\nLink: {source}\n\n{hashtags}"
  ],
  
  // GitHub/Code
  github: [
    "🛠️ {repo} just dropped:\n\n{description}\n\n🔗 {url}\n\n{hashtags}",
    
    "⭐ New {topic} release:\n\n{description}\n\nCheck it out → {url}\n\n{hashtags}"
  ]
};

// Helper functions
function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatHashtags(count = 3) {
  const tags = [...BRAND.hashtags].sort(() => Math.random() - 0.5);
  return tags.slice(0, count).map(t => `#${t}`).join(" ");
}

function formatTopics() {
  const topics = [...BRAND.topics].sort(() => Math.random() - 0.5);
  return topics.slice(0, 2).join(" & ");
}

// Generate content based on type
function generateContent(type, data = {}) {
  const template = random(TEMPLATES[type]);
  
  let content = template
    .replace('{topic}', data.topic || formatTopics())
    .replace('{summary}', data.summary || 'Latest updates in AI...')
    .replace('{content}', data.content || 'Key insights...')
    .replace('{tip}', data.tip || 'Something useful...')
    .replace('{question}', data.question || 'What do you think?')
    .replace('{opinion}', data.opinion || 'Interesting perspective...')
    .replace('{description}', data.description || 'New release details...')
    .replace('{repo}', data.repo || 'project')
    .replace('{url}', data.url || '')
    .replace('{source}', data.source || '')
    .replace('{hashtags}', formatHashtags());
  
  // Ensure under 280 chars
  if (content.length > 280) {
    content = content.slice(0, 277) + "...";
  }
  
  return content;
}

module.exports = { 
  BRAND, 
  TEMPLATES, 
  generateContent, 
  formatHashtags, 
  formatTopics 
};
