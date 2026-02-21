/**
 * Centralized Threshold Configuration
 * All WR thresholds read from here - single source of truth
 */

const fs = require('fs');

const CONFIG_PATH = '/root/trading-bot/trading-config.json';

function getThresholds() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      WR_THRESHOLD: config.THRESHOLDS?.WIN_RATE || 50,
      BOK_WR_THRESHOLD: config.THRESHOLDS?.BOK_WIN_RATE || 50,
      MIN_EXPECTANCY: config.THRESHOLDS?.MIN_EXPECTANCY || 2,
      MAX_DRAWDOWN: config.THRESHOLDS?.MAX_DRAWDOWN || 30,
      SOURCE: 'trading-config.json'
    };
  } catch (e) {
    // Fallback to defaults
    return {
      WR_THRESHOLD: 50,
      BOK_WR_THRESHOLD: 50,
      MIN_EXPECTANCY: 2,
      MAX_DRAWDOWN: 30,
      SOURCE: 'fallback-defaults'
    };
  }
}

// Export for use in other modules
module.exports = { getThresholds, CONFIG_PATH };

// CLI test
if (require.main === module) {
  const t = getThresholds();
  console.log('📊 Centralized Thresholds:');
  console.log(JSON.stringify(t, null, 2));
}
