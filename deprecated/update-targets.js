const sqlite3 = require('sqlite3').verbose();
const DB_PATH = '/root/trading-bot/scalper-positions.db';

const db = new sqlite3.Database(DB_PATH);

// Update existing positions to new targets
db.run(
  `UPDATE positions SET target_price = entry_price * 1.15, stop_price = entry_price * 0.93 WHERE status = 'OPEN'`,
  [],
  function(err) {
    if (err) {
      console.log('Error:', err.message);
    } else {
      console.log('✅ Updated', this.changes, 'positions to 15% target');
      
      // Show current positions
      db.all(`SELECT token_symbol, entry_price, target_price, stop_price FROM positions WHERE status = 'OPEN'`, [], (err, rows) => {
        if (!err) {
          console.log('\nCurrent positions:');
          rows.forEach(row => {
            console.log(`- ${row.token_symbol}: Entry $${row.entry_price}, Target $${row.target_price.toFixed(6)} (+15%), Stop $${row.stop_price.toFixed(6)} (-7%)`);
          });
        }
        db.close();
      });
    }
  }
);
