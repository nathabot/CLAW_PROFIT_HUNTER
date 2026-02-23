/**
 * NEWS & MACRO ALERTS
 * Monitors news for market-moving events
 * Uses CryptoCompare API (free, no auth needed)
 */

const fetch = require('node-fetch');

class NewsAlerts {
  constructor() {
    this.lastCheck = null;
    this.keywords = ['solana', 'bitcoin', 'crypto', 'pump', 'token launch', 'sol'];
  }
  
  async checkNews() {
    try {
      const res = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
      const data = await res.json();
      
      if (data.Data) {
        const relevant = data.Data
          .filter(post => this.isRelevant(post))
          .slice(0, 10);
        
        return {
          hasNews: relevant.length > 0,
          count: relevant.length,
          headlines: relevant.map(p => ({
            title: p.title,
            source: p.source_info?.name || p.source || 'unknown',
            url: p.url,
            published: new Date(p.published_on * 1000).toISOString()
          }))
        };
      }
    } catch (e) {
      console.log('News API error:', e.message);
    }
    
    return { hasNews: false, count: 0, headlines: [] };
  }
  
  isRelevant(post) {
    const text = ((post.title || '') + ' ' + (post.body || '')).toLowerCase();
    return this.keywords.some(k => text.includes(k));
  }
  
  getSentiment(headlines) {
    const positive = ['pump', 'surge', 'bull', 'gain', 'up', 'rally', 'moon', 'soar', 'jump'];
    const negative = ['dump', 'crash', 'bear', 'drop', 'rug', 'scam', 'hack', 'plunge', 'tumble'];
    
    let score = 0;
    for (const h of headlines) {
      const text = h.title.toLowerCase();
      if (positive.some(w => text.includes(w))) score += 1;
      if (negative.some(w => text.includes(w))) score -= 1;
    }
    
    if (score > 1) return 'POSITIVE';
    if (score < -1) return 'NEGATIVE';
    return 'NEUTRAL';
  }
}

module.exports = NewsAlerts;
