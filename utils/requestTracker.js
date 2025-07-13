const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class RequestTracker {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data', 'requests.db');
    this.db = null;
    this.startTime = new Date();
    this.initDatabase();
  }

  // Initialize SQLite database
  initDatabase() {
    // Create data directory if it doesn't exist
    const fs = require('fs');
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('📊 Request tracking database connected');
        this.createTables();
      }
    });
  }

  // Create necessary tables
  createTables() {
    const createRequestCountsTable = `
      CREATE TABLE IF NOT EXISTS request_counts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT UNIQUE NOT NULL,
        count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createDailyRequestsTable = `
      CREATE TABLE IF NOT EXISTS daily_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createStatsTable = `
      CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.serialize(() => {
      this.db.run(createRequestCountsTable);
      this.db.run(createDailyRequestsTable);
      this.db.run(createStatsTable);
      
      // Initialize total requests if not exists
      this.db.run(`
        INSERT OR IGNORE INTO stats (key, value) 
        VALUES ('total_requests', '0')
      `);
      
      // Initialize start time if not exists
      this.db.run(`
        INSERT OR IGNORE INTO stats (key, value) 
        VALUES ('start_time', ?)
      `, [this.startTime.toISOString()]);
    });
  }

  // Track a request for a specific API endpoint
  trackRequest(apiPath, method = 'GET') {
    const key = `${method.toUpperCase()} ${apiPath}`;
    const today = new Date().toDateString();

    this.db.serialize(() => {
      // Update endpoint count
      this.db.run(`
        INSERT INTO request_counts (endpoint, count) 
        VALUES (?, 1)
        ON CONFLICT(endpoint) DO UPDATE SET 
          count = count + 1,
          updated_at = CURRENT_TIMESTAMP
      `, [key]);

      // Update daily count
      this.db.run(`
        INSERT INTO daily_requests (date, count) 
        VALUES (?, 1)
        ON CONFLICT(date) DO UPDATE SET 
          count = count + 1,
          updated_at = CURRENT_TIMESTAMP
      `, [today]);

      // Update total requests
      this.db.run(`
        UPDATE stats 
        SET value = CAST(value AS INTEGER) + 1, 
            updated_at = CURRENT_TIMESTAMP 
        WHERE key = 'total_requests'
      `);
    });

    console.log(`📊 Request tracked: ${key}`);
  }

  // Get request count for a specific endpoint
  getRequestCount(apiPath, method = 'GET') {
    return new Promise((resolve, reject) => {
      const key = `${method.toUpperCase()} ${apiPath}`;
      this.db.get(
        'SELECT count FROM request_counts WHERE endpoint = ?',
        [key],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? row.count : 0);
          }
        }
      );
    });
  }

  // Get all request counts
  getAllRequestCounts() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT endpoint, count FROM request_counts ORDER BY count DESC',
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const counts = {};
            rows.forEach(row => {
              counts[row.endpoint] = row.count;
            });
            resolve(counts);
          }
        }
      );
    });
  }

  // Get total requests
  getTotalRequests() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT value FROM stats WHERE key = ?',
        ['total_requests'],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? parseInt(row.value) : 0);
          }
        }
      );
    });
  }

  // Get today's requests
  getTodayRequests() {
    return new Promise((resolve, reject) => {
      const today = new Date().toDateString();
      this.db.get(
        'SELECT count FROM daily_requests WHERE date = ?',
        [today],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? row.count : 0);
          }
        }
      );
    });
  }

  // Get requests for a specific date
  getRequestsForDate(date) {
    return new Promise((resolve, reject) => {
      const dateString = new Date(date).toDateString();
      this.db.get(
        'SELECT count FROM daily_requests WHERE date = ?',
        [dateString],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? row.count : 0);
          }
        }
      );
    });
  }

  // Get daily request history (last 7 days)
  getDailyHistory() {
    return new Promise((resolve, reject) => {
      const history = [];
      let completed = 0;
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateString = date.toDateString();
        
        this.db.get(
          'SELECT count FROM daily_requests WHERE date = ?',
          [dateString],
          (err, row) => {
            if (err) {
              reject(err);
              return;
            }
            
            history.push({
              date: dateString,
              count: row ? row.count : 0,
              shortDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            });
            
            completed++;
            if (completed === 7) {
              // Sort by date to ensure correct order
              history.sort((a, b) => new Date(a.date) - new Date(b.date));
              resolve(history);
            }
          }
        );
      }
    });
  }

  // Get statistics
  async getStatistics() {
    try {
      const [totalRequests, todayRequests, topEndpoints, dailyHistory] = await Promise.all([
        this.getTotalRequests(),
        this.getTodayRequests(),
        this.getTopEndpoints(5),
        this.getDailyHistory()
      ]);

      // Get start time from database
      const startTimeResult = await new Promise((resolve, reject) => {
        this.db.get(
          'SELECT value FROM stats WHERE key = ?',
          ['start_time'],
          (err, row) => {
            if (err) reject(err);
            else resolve(row ? new Date(row.value) : this.startTime);
          }
        );
      });

      const now = new Date();
      const uptimeHours = Math.floor((now - startTimeResult) / (1000 * 60 * 60));
      
      return {
        totalRequests,
        todayRequests,
        uptimeHours,
        topEndpoints,
        requestCounts: await this.getAllRequestCounts(),
        dailyHistory,
        currentDate: new Date().toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      };
    } catch (error) {
      console.error('Error getting statistics:', error);
      return {
        totalRequests: 0,
        todayRequests: 0,
        uptimeHours: 0,
        topEndpoints: [],
        requestCounts: {},
        dailyHistory: [],
        currentDate: new Date().toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      };
    }
  }

  // Get top N endpoints by request count
  getTopEndpoints(limit = 5) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT endpoint, count FROM request_counts ORDER BY count DESC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const topEndpoints = rows.map(row => ({
              endpoint: row.endpoint,
              count: row.count
            }));
            resolve(topEndpoints);
          }
        }
      );
    });
  }

  // Reset all counts (useful for testing)
  reset() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('DELETE FROM request_counts');
        this.db.run('DELETE FROM daily_requests');
        this.db.run('UPDATE stats SET value = ? WHERE key = ?', ['0', 'total_requests']);
        this.db.run('UPDATE stats SET value = ? WHERE key = ?', [new Date().toISOString(), 'start_time'], (err) => {
          if (err) {
            reject(err);
          } else {
            this.startTime = new Date();
            resolve();
          }
        });
      });
    });
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('📊 Request tracking database connection closed');
        }
      });
    }
  }
}

// Create a singleton instance
const requestTracker = new RequestTracker();

// Graceful shutdown
process.on('SIGINT', () => {
  requestTracker.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  requestTracker.close();
  process.exit(0);
});

module.exports = requestTracker;