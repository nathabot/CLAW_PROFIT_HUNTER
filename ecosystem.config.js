module.exports = {
  apps: [
    {
      name: 'live-trader',
      script: 'src/live-trader-v4.2.js',
      cwd: '/root/trading-bot',
      instances: 1,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '60000',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/root/trading-bot/logs/pm2-live-trader-error.log',
      out_file: '/root/trading-bot/logs/pm2-live-trader-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },
    {
      name: 'paper-trader',
      script: 'src/soul-core-paper-trader-v5.js',
      cwd: '/root/trading-bot',
      instances: 1,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '60000',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/root/trading-bot/logs/pm2-paper-trader-error.log',
      out_file: '/root/trading-bot/logs/pm2-paper-trader-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },
    {
      name: 'balance-guardian',
      script: 'src/balance-guardian.js',
      cwd: '/root/trading-bot',
      instances: 1,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '60000',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/root/trading-bot/logs/pm2-guardian-error.log',
      out_file: '/root/trading-bot/logs/pm2-guardian-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },
    {
      name: 'sl-tracker',
      script: 'src/sl-tracker.js',
      cwd: '/root/trading-bot',
      instances: 1,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '60000',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/root/trading-bot/logs/pm2-sl-tracker-error.log',
      out_file: '/root/trading-bot/logs/pm2-sl-tracker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
};
