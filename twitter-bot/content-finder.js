/**
 * Content Finder - Find trending AI/OpenClaw content
 * 
 * Sources:
 * - GitHub repos (releases, commits, issues)
 * - AI news sites
 * - Tech blogs
 */

const CONTENT_SOURCES = [
  {
    name: "OpenClaw",
    repo: "openclaw/openclaw",
    type: "github"
  },
  {
    name: "Anthropic", 
    url: "https://anthropic.com",
    type: "news"
  },
  {
    name: "OpenAI",
    url: "https://openai.com/blog",
    type: "news"
  }
];

// Templates for posting
const POST_TEMPLATES = {
  release: `🚀 {name} v{version} released!\n\n{description}\n\n#AI #OpenSource {tags}`,
  
  news: `📰 {title}\n\n{summary}\n\nSource: {source}\n\n#AI #Tech`,
  
  github: `🛠️ {name}: {action}\n\n{details}\n\n🔗 {url}\n\n#GitHub #AI`,
  
  thread: `🧵 {topic}\n\n{content}\n\n{parts}\n\n#AI #Tech`
};

// Fetch from GitHub
async function fetchGitHub(repo) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      name: data.name || data.tag_name,
      description: data.body?.slice(0, 200) || "New release",
      url: data.html_url,
      published: data.published_at
    };
  } catch (e) {
    console.log("GitHub fetch error:", e.message);
    return null;
  }
}

// Get trending AI topics
function getTrendingTopics() {
  return [
    "AI Agents",
    "Claude AI", 
    "OpenClaw",
    "LLM Automation",
    "Autonomous Coding",
    "AI Assistants"
  ];
}

// Generate post content
function generatePost(type, data) {
  const template = POST_TEMPLATES[type];
  let post = template
    .replace('{name}', data.name || 'AI Update')
    .replace('{version}', data.version || '')
    .replace('{description}', data.description || '')
    .replace('{title}', data.title || '')
    .replace('{summary}', data.summary || '')
    .replace('{source}', data.source || '')
    .replace('{action}', data.action || '')
    .replace('{details}', data.details || '')
    .replace('{url}', data.url || '')
    .replace('{topic}', data.topic || '')
    .replace('{content}', data.content || '')
    .replace('{parts}', data.parts || '')
    .replace('{tags}', data.tags || '#AI');
  
  // Truncate if too long
  if (post.length > 280) {
    post = post.slice(0, 277) + "...";
  }
  
  return post;
}

// Main content finder
class ContentFinder {
  constructor() {
    this.sources = CONTENT_SOURCES;
  }
  
  async findContent() {
    const results = [];
    
    // Check GitHub repos
    for (const source of this.sources) {
      if (source.type === 'github' && source.repo) {
        const data = await fetchGitHub(source.repo);
        if (data) {
          results.push({
            type: 'release',
            source: source.name,
            data: {
              name: data.name,
              description: data.description,
              url: data.url
            }
          });
        }
      }
    }
    
    return results;
  }
  
  getRandomPost() {
    const topics = getTrendingTopics();
    const topic = topics[Math.floor(Math.random() * topics.length)];
    
    const posts = [
      `🤖 ${topic} Update\n\nThe AI space is evolving fast! What's your take?\n\n#AI #${topic.replace(/\s/g, '')}`,
      
      `💡 ${topic}\n\nInteresting developments happening. Worth following closely.\n\n#ArtificialIntelligence #Tech`,
      
      `🧠 ${topic}\n\nAI continues to amaze. The future is now.\n\n#MachineLearning #AI #OpenClaw`,
      
      `📡 ${topic}\n\nLatest in AI: automation, agents, and beyond.\n\nSource: GitHub / OpenAI / Anthropic\n\n#TechNews #AI`
    ];
    
    return posts[Math.floor(Math.random() * posts.length)];
  }
}

// Export
module.exports = { ContentFinder, generatePost, getTrendingTopics };
