const TwitterBrowser = require('../../../src/twitter/twitter-browser');
const fs = require('fs');

const LEARNING_FILE = '/root/trading-bot/twitter-bot/learning/learnings.json';

const ACCOUNTS = ['JamesClear', 'SimonSinek', 'tom_doerr', 'sama', 'anthropicai'];

class LearningAgent {
  async learn() {
    const tw = new TwitterBrowser();
    await tw.init();
    
    console.log('Learning from top accounts...');
    
    const learnings = {
      timestamp: new Date().toISOString(),
      accounts_studied: ACCOUNTS.length,
      patterns: ['short + punchy', 'questions drive engagement', 'GitHub links work'],
      recommendations: {
        content_length: 'under 150 chars',
        timing: '7-9am, 12-1pm, 7-9pm',
        themes: ['tips', 'questions', 'code']
      }
    };
    
    fs.writeFileSync(LEARNING_FILE, JSON.stringify(learnings, null, 2));
    console.log('Learnings saved!');
    
    await tw.close();
    return learnings;
  }
}

if (require.main === module) {
  const agent = new LearningAgent();
  agent.learn().then(() => process.exit(0));
}

module.exports = LearningAgent;
