# CLAW PROFIT HUNTER - Quick Start

## ⚡ 5 Menit Setup

```bash
# 1. Install & Setup
npm install
cp config/wallet.example.json config/wallet.json
# Edit wallet.json dengan private key Anda

# 2. Start sistem
npm run start:all

# 3. Monitoring
npm run monitor
```

## 📖 Dokumentasi Lengkap

Lihat [docs/COMPLETE_DOCUMENTATION.md](docs/COMPLETE_DOCUMENTATION.md)

## 🆘 Emergency

```bash
# Stop semua
echo $(date +%s) > EMERGENCY_STOP
pkill -f live-trader

# Resume
rm EMERGENCY_STOP PAUSE_TRADING
pm2 restart live-trader
```
