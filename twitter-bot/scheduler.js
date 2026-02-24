const TwitterBrowser = require('../src/twitter/twitter-browser');
const fs = require('fs');

const CONTENT = require('./content.json');

class ContentScheduler {
  selectContent() {
    const rand = Math.random();
    if (rand < 0.30) return CONTENT.code_share[Math.floor(Math.random() * CONTENT.code_share.length)];
    if (rand < 0.55) return CONTENT.tips[Math.floor(Math.random() * CONTENT.tips.length)];
    if (rand < 0.75) return CONTENT.engagement[Math.floor(Math.random() * CONTENT.engagement.length)];
    if (rand < 0.90) return CONTENT.trending_ai[Math.floor(Math.random() * CONTENT.trending_ai.length)];
    return CONTENT.viral[Math.floor(Math.random() * CONTENT.viral.length)];
  }
  
  async runTask(task) {
    const tw = new TwitterBrowser();
    await tw.init();
    
    const content = this.selectContent();
    const result = await tw.postTweet(content);
    
    console.log(new Date().toISOString(), '-', task, '-', result.success ? 'OK' : 'FAIL');
    
    await tw.close();
    return result;
  }
}

if (require.main === module) {
  const task = process.argv[2] || 'post';
  const s = new ContentScheduler();
  s.runTask(task).then(() => process.exit(0));
}

module.exports = ContentScheduler;
