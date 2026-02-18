#!/usr/bin/env node
/**
 * TRADING DASHBOARD v1.0
 * Web interface for monitoring autonomous trading system
 * Port: 8080 (configurable)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.DASHBOARD_PORT || 8080;
const TRADING_BOT_DIR = '/root/trading-bot';
const MEMORY_DIR = '/root/.openclaw/workspace';

// MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Helper: Read JSON file safely
function readJSON(filePath, defaultValue = null) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        return defaultValue;
    }
}

// Helper: Read file safely
function readFile(filePath, defaultValue = '') {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        return defaultValue;
    }
}

// Helper: Get last N lines from file
function tailFile(filePath, lines = 50) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.split('\n').slice(-lines).join('\n');
    } catch (e) {
        return '';
    }
}

// API: Get system status
function getSystemStatus() {
    const emergencyStop = fs.existsSync(`${TRADING_BOT_DIR}/EMERGENCY_STOP`);
    const pauseTrading = fs.existsSync(`${TRADING_BOT_DIR}/PAUSE_TRADING`);
    
    const balance = readJSON(`${TRADING_BOT_DIR}/current-balance.json`, {});
    const peakBalance = readJSON(`${TRADING_BOT_DIR}/peak-balance.json`, {});
    const positions = readJSON(`${TRADING_BOT_DIR}/positions.json`, []);
    const watchdogIssues = readJSON(`${TRADING_BOT_DIR}/watchdog-issues.json`, { issues: [] });
    
    // Get cron jobs
    let cronJobs = [];
    try {
        const cronOutput = execSync('crontab -l', { encoding: 'utf8' });
        cronJobs = cronOutput.split('\n')
            .filter(line => line.includes('trading-bot') && !line.startsWith('#'))
            .map(line => {
                const parts = line.split('cd /root/trading-bot && ');
                return parts[1] || line;
            });
    } catch (e) {}
    
    return {
        emergencyStop,
        pauseTrading,
        balance: balance.balance || balance.current || 0,
        peakBalance: peakBalance.peak || 0,
        positions: positions.length,
        issues: watchdogIssues.issues || [],
        cronJobs,
        timestamp: new Date().toISOString()
    };
}

// API: Get configuration
function getConfiguration() {
    const adaptiveConfig = readJSON(`${TRADING_BOT_DIR}/adaptive-scoring-config.json`, {});
    
    return {
        minLiquidity: 25000,
        minTokenAge: '24 hours',
        minVolume: 10000,
        paperTraderThreshold: adaptiveConfig.adaptiveThresholds?.paperTrader?.currentThreshold || 6.0,
        liveTraderThreshold: adaptiveConfig.adaptiveThresholds?.liveTrader?.currentThreshold || 6.0,
        dailyTarget: 0.2,
        maxDailyTrades: 10
    };
}

// API: Get recent logs
function getRecentLogs() {
    return {
        liveTrader: tailFile(`${TRADING_BOT_DIR}/logs/live-trader-v4.2.log`, 100),
        paperTrader: tailFile(`${TRADING_BOT_DIR}/logs/paper-v5.log`, 100),
        slTracker: tailFile(`${TRADING_BOT_DIR}/logs/sl-tracker.log`, 50),
        guardian: tailFile(`${TRADING_BOT_DIR}/logs/guardian.log`, 50),
        intelligence: tailFile(`${TRADING_BOT_DIR}/logs/intelligence.log`, 100)
    };
}

// Generate HTML Dashboard
function generateDashboard() {
    const status = getSystemStatus();
    const config = getConfiguration();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trading Bot Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f1419;
            color: #e6edf3;
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        header {
            background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 20px;
            border: 1px solid #374151;
        }
        h1 { font-size: 24px; color: #60a5fa; margin-bottom: 10px; }
        .status-bar {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            margin-top: 15px;
        }
        .status-item {
            background: #1f2937;
            padding: 10px 20px;
            border-radius: 8px;
            border-left: 4px solid #10b981;
        }
        .status-item.warning { border-left-color: #f59e0b; }
        .status-item.danger { border-left-color: #ef4444; }
        .status-item.paused { border-left-color: #6b7280; }
        .status-label { font-size: 12px; color: #9ca3af; text-transform: uppercase; }
        .status-value { font-size: 20px; font-weight: bold; color: #fff; }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .card {
            background: #1f2937;
            border-radius: 12px;
            padding: 20px;
            border: 1px solid #374151;
        }
        .card h2 {
            font-size: 18px;
            color: #60a5fa;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #374151;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .config-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        .config-item {
            background: #111827;
            padding: 12px;
            border-radius: 8px;
        }
        .config-label { font-size: 12px; color: #9ca3af; }
        .config-value { font-size: 16px; font-weight: 600; color: #34d399; }
        
        .log-container {
            background: #111827;
            border-radius: 8px;
            padding: 15px;
            max-height: 500px;
            min-height: 200px;
            overflow-y: scroll !important;
            scroll-behavior: auto;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 11px;
            line-height: 1.4;
            padding-bottom: 50px;
            display: flex;
            flex-direction: column;
        }
        .log-container::-webkit-scrollbar {
            width: 10px;
        }
        .log-container::-webkit-scrollbar-track {
            background: #1f2937;
            border-radius: 5px;
        }
        .log-container::-webkit-scrollbar-thumb {
            background: #4b5563;
            border-radius: 5px;
        }
        .log-container::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
        }
        .log-line { margin: 2px 0; }
        .log-success { color: #34d399; }
        .log-warning { color: #fbbf24; }
        .log-error { color: #f87171; }
        .log-info { color: #60a5fa; }
        
        .issue-item {
            background: #111827;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 10px;
            border-left: 3px solid #f59e0b;
        }
        .issue-critical { border-left-color: #ef4444; }
        .issue-type { font-size: 11px; color: #f59e0b; text-transform: uppercase; }
        .issue-component { font-weight: 600; color: #fff; }
        .issue-desc { color: #9ca3af; font-size: 14px; margin-top: 5px; }
        
        .cron-list {
            list-style: none;
        }
        .cron-item {
            background: #111827;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 8px;
            font-size: 13px;
            color: #d1d5db;
            font-family: monospace;
        }
        
        .refresh-info {
            text-align: center;
            color: #6b7280;
            font-size: 12px;
            margin-top: 20px;
        }
        
        .btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 10px;
        }
        .btn:hover { background: #2563eb; }
        .btn-danger { background: #ef4444; }
        .btn-danger:hover { background: #dc2626; }
        .btn-warning { background: #f59e0b; }
        .btn-warning:hover { background: #d97706; }
        .btn-small {
            background: #1f2937;
            color: #9ca3af;
            border: 1px solid #374151;
            padding: 3px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px;
            margin-left: 8px;
            vertical-align: middle;
            font-weight: 500;
        }
        .btn-small:hover { 
            background: #374151; 
            color: #e5e7eb;
            border-color: #4b5563;
        }
        
        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        .tab {
            background: #374151;
            border: none;
            color: #d1d5db;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
        }
        .tab.active { background: #3b82f6; color: white; }
        .tab:hover { background: #4b5563; }
        
        /* Popup styles */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }
        .modal-overlay.active { display: flex; }
        .modal {
            background: #1f2937;
            border-radius: 12px;
            padding: 25px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            border: 1px solid #374151;
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #374151;
        }
        .modal-title { font-size: 20px; font-weight: 600; color: #fff; }
        .modal-close {
            background: none;
            border: none;
            color: #9ca3af;
            font-size: 24px;
            cursor: pointer;
        }
        .modal-close:hover { color: #fff; }
        .position-item {
            background: #111827;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 12px;
            border-left: 4px solid #3b82f6;
        }
        .position-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .position-symbol { font-size: 18px; font-weight: 600; color: #fff; }
        .position-status {
            background: #10b981;
            color: #fff;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }
        .position-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 10px;
        }
        .detail-row { display: flex; justify-content: space-between; }
        .detail-label { color: #9ca3af; font-size: 12px; }
        .detail-value { color: #fff; font-size: 13px; font-weight: 500; }
        .tx-link {
            color: #60a5fa;
            text-decoration: none;
            font-size: 12px;
        }
        .tx-link:hover { text-decoration: underline; }
        .targets-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #374151;
        }
        .target-box {
            background: #1f2937;
            padding: 10px;
            border-radius: 6px;
            text-align: center;
        }
        .target-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; }
        .target-value { font-size: 14px; font-weight: 600; margin-top: 3px; }
        .target-sl { color: #f87171; }
        .target-tp1 { color: #fbbf24; }
        .target-tp2 { color: #34d399; }
        
        .clickable { cursor: pointer; }
        .clickable:hover { opacity: 0.8; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🤖 Autonomous Trading Dashboard</h1>
            <div class="status-bar">
                <div class="status-item ${status.emergencyStop ? 'danger' : status.pauseTrading ? 'paused' : ''}">
                    <div class="status-label">Status</div>
                    <div class="status-value">${status.emergencyStop ? '🛑 EMERGENCY' : status.pauseTrading ? '⏸️ PAUSED' : '✅ ACTIVE'}</div>
                </div>
                <div class="status-item">
                    <div class="status-label">Balance</div>
                    <div class="status-value">${status.balance.toFixed(4)} SOL</div>
                </div>
                <div class="status-item">
                    <div class="status-label">Peak</div>
                    <div class="status-value">${status.peakBalance.toFixed(4)} SOL</div>
                </div>
                <div class="status-item ${status.positions > 0 ? 'warning' : ''} clickable" onclick="showPositions()">
                    <div class="status-label">Positions</div>
                    <div class="status-value">${status.positions}</div>
                </div>
                <div class="status-item ${status.issues.length > 0 ? 'warning' : ''}">
                    <div class="status-label">Issues</div>
                    <div class="status-value">${status.issues.length}</div>
                </div>
            </div>
        </header>
        
        <div class="grid">
            <div class="card">
                <h2>⚙️ Configuration</h2>
                <div class="config-grid">
                    <div class="config-item">
                        <div class="config-label">Min Liquidity</div>
                        <div class="config-value">$${config.minLiquidity.toLocaleString()}</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">Min Token Age</div>
                        <div class="config-value">${config.minTokenAge}</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">Min Volume</div>
                        <div class="config-value">$${config.minVolume.toLocaleString()}</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">Daily Target</div>
                        <div class="config-value">${config.dailyTarget} SOL</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">Paper Threshold</div>
                        <div class="config-value">${config.paperTraderThreshold}/10</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">Live Threshold</div>
                        <div class="config-value">${config.liveTraderThreshold}/10</div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <h2>⚠️ Issues & Alerts</h2>
                ${status.issues.length === 0 ? 
                    '<p style="color: #34d399;">✅ No active issues</p>' :
                    status.issues.map(issue => `
                        <div class="issue-item ${issue.type === 'critical' ? 'issue-critical' : ''}">
                            <div class="issue-type">${issue.type}</div>
                            <div class="issue-component">${issue.name}</div>
                            <div class="issue-desc">${issue.issue}</div>
                        </div>
                    `).join('')
                }
            </div>
            
            <div class="card">
                <h2>📝 Recent Live Trader Log <button class="btn-small" onclick="scrollToBottom('liveLog')">⬇️ Bottom</button></h2>
                <div class="log-container" id="liveLog">
                    Loading...
                </div>
            </div>
            
            <div class="card">
                <h2>📊 Paper Trader Log <button class="btn-small" onclick="scrollToBottom('paperLog')">⬇️ Bottom</button></h2>
                <div class="log-container" id="paperLog">
                    Loading...
                </div>
            </div>
            
            <div class="card">
                <h2>🐋 Strategy Intelligence <button class="btn-small" onclick="scrollToBottom('intelLog')">⬇️ Bottom</button></h2>
                <div class="log-container" id="intelLog">
                    Loading...
                </div>
            </div>
            
            <div class="card">
                <h2>⏰ Active Cron Jobs</h2>
                <ul class="cron-list">
                    ${status.cronJobs.map(job => `<li class="cron-item">${job.substring(0, 100)}${job.length > 100 ? '...' : ''}</li>`).join('')}
                </ul>
            </div>
        </div>
        
        <div class="refresh-info">
            <p>Last updated: ${new Date().toLocaleString()}</p>
            <p>Auto-refresh every 10 seconds</p>
            <button class="btn" onclick="location.reload()">🔄 Refresh Now</button>
        </div>
    </div>
    
    <!-- Positions Modal -->
    <div class="modal-overlay" id="positionsModal">
        <div class="modal">
            <div class="modal-header">
                <div class="modal-title">📊 Active Positions</div>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div id="positionsContent">
                <p style="color: #9ca3af; text-align: center;">Loading positions...</p>
            </div>
        </div>
    </div>
    
    <script>
        // Positions popup functions
        async function showPositions() {
            document.getElementById('positionsModal').classList.add('active');
            await loadPositions();
        }
        
        function closeModal() {
            document.getElementById('positionsModal').classList.remove('active');
        }
        
        async function loadPositions() {
            try {
                const response = await fetch('/api/positions');
                const positions = await response.json();
                
                const container = document.getElementById('positionsContent');
                
                if (positions.length === 0) {
                    container.innerHTML = '<p style="color: #9ca3af; text-align: center;">No active positions</p>';
                    return;
                }
                
                container.innerHTML = positions.map(pos => {
                    const pnlColor = pos.unrealizedPnL > 0 ? '#34d399' : pos.unrealizedPnL < 0 ? '#f87171' : '#9ca3af';
                    const pnlIcon = pos.unrealizedPnL > 0 ? '🟢' : pos.unrealizedPnL < 0 ? '🔴' : '⚪';
                    
                    return \`
                    <div class="position-item">
                        <div class="position-header">
                            <div class="position-symbol">\${pos.symbol}</div>
                            <div class="position-status">\${pos.exited ? 'CLOSED' : 'ACTIVE'}</div>
                        </div>
                        
                        <!-- UNREALIZED P/L SECTION -->
                        <div style="background: #0f1419; border-radius: 8px; padding: 12px; margin: 10px 0; text-align: center;">
                            <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px;">Unrealized P/L</div>
                            <div style="font-size: 24px; font-weight: 700; color: \${pnlColor};">
                                \${pnlIcon} \${pos.unrealizedPnL > 0 ? '+' : ''}\${pos.unrealizedPnL || '0.00'}%
                            </div>
                            <div style="font-size: 13px; color: \${pnlColor}; margin-top: 3px;">
                                \${pos.unrealizedPnLSOL > 0 ? '+' : ''}\${pos.unrealizedPnLSOL || '0.0000'} SOL
                            </div>
                            <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">
                                Entry: $\${pos.entryPrice?.toFixed(8)} → Current: $\${pos.currentPrice?.toFixed(8) || '...'}
                            </div>
                        </div>
                        
                        <div class="position-details">
                            <div class="detail-row">
                                <span class="detail-label">Entry Price</span>
                                <span class="detail-value">$\${pos.entryPrice?.toFixed(8) || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Position Size</span>
                                <span class="detail-value">\${pos.positionSize} SOL</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Strategy</span>
                                <span class="detail-value">\${pos.strategy || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Entry Time</span>
                                <span class="detail-value">\${pos.entryTime ? new Date(pos.entryTime).toLocaleString() : 'N/A'}</span>
                            </div>
                        </div>
                        <div style="margin-top: 12px;">
                            <span class="detail-label">TX: </span>
                            <a href="https://solscan.io/tx/\${pos.txHash}" target="_blank" class="tx-link">
                                \${pos.txHash?.slice(0, 20)}...\${pos.txHash?.slice(-8)}
                            </a>
                        </div>
                        <div class="targets-grid">
                            <div class="target-box">
                                <div class="target-label">Stop Loss</div>
                                <div class="target-value target-sl">$\${pos.targets?.sl?.toFixed(8) || 'N/A'}</div>
                            </div>
                            <div class="target-box">
                                <div class="target-label">TP1 (50%)</div>
                                <div class="target-value target-tp1">$\${pos.targets?.tp1?.toFixed(8) || 'N/A'}</div>
                            </div>
                            <div class="target-box">
                                <div class="target-label">TP2 (100%)</div>
                                <div class="target-value target-tp2">$\${pos.targets?.tp2?.toFixed(8) || 'N/A'}</div>
                            </div>
                        </div>
                    </div>
                \`;
                }).join('');
            } catch (e) {
                document.getElementById('positionsContent').innerHTML = '<p style="color: #f87171; text-align: center;">Failed to load positions</p>';
            }
        }
        
        // Close modal on overlay click
        document.getElementById('positionsModal').addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
        
        // Auto-refresh every 10 seconds
        setInterval(() => {
            location.reload();
        }, 10000);
        
        // Load logs via API
        async function loadLogs() {
            try {
                const response = await fetch('/api/logs');
                const logs = await response.json();
                
                document.getElementById('liveLog').innerHTML = formatLog(logs.liveTrader);
                document.getElementById('paperLog').innerHTML = formatLog(logs.paperTrader);
                document.getElementById('intelLog').innerHTML = formatLog(logs.intelligence);
                
                // Scroll to bottom after DOM update
                setTimeout(() => {
                    scrollToBottom('liveLog');
                    scrollToBottom('paperLog');
                    scrollToBottom('intelLog');
                }, 100);
            } catch (e) {
                console.error('Failed to load logs:', e);
            }
        }
        
        function scrollToBottom(elementId) {
            const el = document.getElementById(elementId);
            if (el) {
                el.scrollTop = el.scrollHeight + 100; // Add extra scroll
                console.log('Scrolled ' + elementId + ' to:', el.scrollTop);
            }
        }
        
        function formatLog(logText) {
            if (!logText) return '<span style="color: #6b7280;">No log data</span>';
            
            return logText.split('\\n').map(line => {
                let className = 'log-info';
                if (line.includes('✅') || line.includes('success') || line.includes('bought') || line.includes('sold')) className = 'log-success';
                if (line.includes('⚠️') || line.includes('warning')) className = 'log-warning';
                if (line.includes('❌') || line.includes('error') || line.includes('failed')) className = 'log-error';
                return '<div class="log-line ' + className + '">' + escapeHtml(line) + '</div>';
            }).join('');
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        loadLogs();
    </script>
</body>
</html>`;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Routes
    if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(generateDashboard());
    }
    else if (pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getSystemStatus()));
    }
    else if (pathname === '/api/positions') {
        const positions = readJSON(`${TRADING_BOT_DIR}/positions.json`, []);
        
        // Calculate unrealized P/L for active positions
        const positionsWithPnL = await Promise.all(positions.map(async (pos) => {
            if (pos.exited) return pos; // Skip closed positions
            
            try {
                const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${pos.ca}`);
                const data = await response.json();
                const pair = data.pairs?.[0];
                
                if (pair) {
                    const currentPrice = parseFloat(pair.priceUsd);
                    const unrealizedPnL = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
                    const unrealizedPnLSOL = (unrealizedPnL / 100) * pos.positionSize;
                    
                    return {
                        ...pos,
                        currentPrice,
                        unrealizedPnL: unrealizedPnL.toFixed(2),
                        unrealizedPnLSOL: unrealizedPnLSOL.toFixed(4)
                    };
                }
            } catch (e) {}
            
            return pos;
        }));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(positionsWithPnL));
    }
    else if (pathname === '/api/config') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getConfiguration()));
    }
    else if (pathname === '/api/logs') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getRecentLogs()));
    }
    else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Trading Dashboard running on http://0.0.0.0:${PORT}`);
    console.log(`📊 Access via browser: http://72.61.214.89:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Shutting down...');
    server.close(() => {
        process.exit(0);
    });
});
