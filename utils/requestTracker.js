// Simple in-memory request tracker
// In production, you'd want to use a database like Redis or MongoDB

class RequestTracker {
  constructor() {
    this.requestCounts = new Map();
    this.totalRequests = 0;
    this.dailyRequests = new Map();
    this.startTime = new Date();
  }

  // Track a request for a specific API endpoint
  trackRequest(apiPath, method = 'GET') {
    const key = `${method.toUpperCase()} ${apiPath}`;
    const currentCount = this.requestCounts.get(key) || 0;
    this.requestCounts.set(key, currentCount + 1);
    this.totalRequests++;

    // Track daily requests
    const today = new Date().toDateString();
    const dailyCount = this.dailyRequests.get(today) || 0;
    this.dailyRequests.set(today, dailyCount + 1);

    console.log(`📊 Request tracked: ${key} (${currentCount + 1} total)`);
  }

  // Get request count for a specific endpoint
  getRequestCount(apiPath, method = 'GET') {
    const key = `${method.toUpperCase()} ${apiPath}`;
    return this.requestCounts.get(key) || 0;
  }

  // Get all request counts
  getAllRequestCounts() {
    return Object.fromEntries(this.requestCounts);
  }

  // Get total requests
  getTotalRequests() {
    return this.totalRequests;
  }

  // Get today's requests
  getTodayRequests() {
    const today = new Date().toDateString();
    return this.dailyRequests.get(today) || 0;
  }

  // Get statistics
  getStatistics() {
    const now = new Date();
    const uptimeHours = Math.floor((now - this.startTime) / (1000 * 60 * 60));
    
    return {
      totalRequests: this.totalRequests,
      todayRequests: this.getTodayRequests(),
      uptimeHours,
      topEndpoints: this.getTopEndpoints(5),
      requestCounts: this.getAllRequestCounts()
    };
  }

  // Get top N endpoints by request count
  getTopEndpoints(limit = 5) {
    return Array.from(this.requestCounts.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([endpoint, count]) => ({ endpoint, count }));
  }

  // Reset all counts (useful for testing)
  reset() {
    this.requestCounts.clear();
    this.totalRequests = 0;
    this.dailyRequests.clear();
    this.startTime = new Date();
  }
}

// Create a singleton instance
const requestTracker = new RequestTracker();

module.exports = requestTracker;