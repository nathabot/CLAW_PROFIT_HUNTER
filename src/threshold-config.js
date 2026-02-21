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

function getMode() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const mode = config.MODE_CONTROLLER?.mode || 'balanced';
    const modeConfig = config.MODE_CONTROLLER?.modes?.[mode] || {
      minScore: 6,
      minLiquidity: 25000,
      maxPosition: 0.015,
      maxPositions: 3,
      minWR: 50
    };
    return {
      current: mode,
      config: modeConfig,
      isConservative: mode === 'conservative',
      isBalanced: mode === 'balanced',
      isAggressive: mode === 'aggressive'
    };
  } catch (e) {
    return {
      current: 'balanced',
      config: { minScore: 6, minLiquidity: 25000, maxPosition: 0.015, maxPositions: 3, minWR: 50 },
      isBalanced: true
    };
  }
}

// Export for use in other modules
module.exports = { getThresholds, getMode, CONFIG_PATH };

// CLI test
if (require.main === module) {
  const t = getThresholds();
  console.log('📊 Centralized Thresholds:');
  console.log(JSON.stringify(t, null, 2));
  
  const m = getMode();
  console.log('\n🎮 Trading Mode:');
  console.log(JSON.stringify(m, null, 2));
}
