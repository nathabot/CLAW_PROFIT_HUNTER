/**
 * DAILY ACTIVITY LOGGER
 * Logs all Twitter activities to memory + commits to GitHub
 */
const fs = require('fs');
const { execSync } = require('child_process');

const DATE = new Date().toISOString().split('T')[0];
const MEMORY_DIR = '/root/.openclaw/workspace/memory';
const LOG_FILE = `${MEMORY_DIR}/twitter-activity-${DATE}.md`;
const SUMMARY_FILE = `${MEMORY_DIR}/twitter-summary.md`;

// State files
const STATE_FILES = [
  '/root/trading-bot/twitter-bot/engagement-state.json',
  '/root/trading-bot/twitter-bot/learning/learnings.json',
  '/root/trading-bot/twitter-bot/learning/influencers.json'
];

function getDate() {
  const d = new Date();
  const options = { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString('id-ID', options);
}

function getTime() {
  return new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
}

function loadState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function log() {
  console.log(`[${getTime()}]`, ...arguments);
}

function saveDailyLog(engagement, learnings, influencers) {
  const content = `# Twitter Activity - ${getDate()}

## Today's Stats
- Total Engagements: ${engagement.totalEngagements || 0}
- Accounts Followed: ${engagement.followed?.length || 0}
- Tweets Liked: ${engagement.liked?.length || 0}

## Recent Activity
${engagement.lastRun ? `- Last run: ${engagement.lastRun}` : '- No activity yet'}

## Learned Accounts (by category)
${Object.entries(influencers).map(([cat, accs]) => `### ${cat}
- ${accs.slice(0, 10).join('\n- ')}`).join('\n\n')}

## Latest Learnings
\`\`\`
${JSON.stringify(learnings.recommendations || {}, null, 2)}
\`\`\`
`;

  fs.writeFileSync(LOG_FILE, content);
  log('📝 Daily log saved');
  
  // Update summary
  updateSummary(engagement, learnings, influencers);
}

function updateSummary(engagement, learnings, influencers) {
  let summary = `# Twitter Account Summary

## Account: @daiarticle

### All Target Accounts (by niche)
`;
  
  for (const [category, accounts] of Object.entries(influencers)) {
    summary += `#### ${category}\n`;
    summary += accounts.map(a => `- @${a}`).join('\n') + '\n\n';
  }
  
  summary += `### Stats (as of ${getDate()})
- Total engagements today: ${engagement.totalEngagements || 0}
- Total accounts followed: ${engagement.followed?.length || 0}
- Last activity: ${engagement.lastRun || 'N/A'}

### Learning Recommendations
- Content length: ${learnings.recommendations?.content_length || '<150 chars'}
- Best timing: ${learnings.recommendations?.timing || '7-9am, 12-1pm, 7-9pm'}
- Themes: ${learnings.recommendations?.themes?.join(', ') || 'tips, questions, code'}
`;

  fs.writeFileSync(SUMMARY_FILE, summary);
  log('📊 Summary updated');
}

function commitToGitHub() {
  try {
    // Add all twitter activity files
    execSync('cd /root/trading-bot && git add twitter-bot/ twitter-bot/', { stdio: 'pipe' });
    execSync('cd /root/.openclaw/workspace && git add memory/', { stdio: 'pipe' });
    
    // Commit
    const msg = `Twitter activity update - ${DATE}`;
    execSync(`git commit -m "${msg}"`, { stdio: 'pipe' });
    execSync('git push', { stdio: 'pipe' });
    
    log('✅ Pushed to GitHub');
    return true;
  } catch (e) {
    log('⚠️ Git push failed:', e.message);
    return false;
  }
}

function run() {
  log('📋 Running daily logger...');
  
  const engagement = loadState(STATE_FILES[0]) || {};
  const learnings = loadState(STATE_FILES[1]) || {};
  const influencers = loadState(STATE_FILES[2]) || {};
  
  saveDailyLog(engagement, learnings, influencers);
  
  // Try to commit (may fail if no changes, that's ok)
  commitToGitHub();
  
  log('✅ Daily logger complete');
}

if (require.main === module) {
  run();
}

module.exports = { run, log, commitToGitHub };
