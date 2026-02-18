// Load environment variables from .env.local and .env
const fs = require('fs');
const path = require('path');

function loadEnvFile(fileName) {
  const envPath = path.join(__dirname, '..', fileName);
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          if (value) {
            process.env[key.trim()] = value;
          }
        }
      }
    });
  }
}

// Load both .env and .env.local (latter takes precedence)
loadEnvFile('.env');
loadEnvFile('.env.local');

module.exports = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  VPS_HOST: process.env.VPS_HOST,
  VPS_USER: process.env.VPS_USER
};
