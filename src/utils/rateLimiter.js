/**
 * Advanced rate limiter for commands and actions.
 * Uses a sliding window algorithm to prevent abuse.
 */
class RateLimiter {
  constructor() {
    // Map<userId, Map<action, {count, windowStart, timestamps[]}>>
    this.limits = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if an action is rate limited.
   * @param {string} userId - The user ID
   * @param {string} action - The action name
   * @param {number} maxAttempts - Max attempts allowed
   * @param {number} windowMs - Time window in milliseconds
   * @returns {{ limited: boolean, remaining: number, resetTime: number }}
   */
  check(userId, action, maxAttempts = 5, windowMs = 10000) {
    const now = Date.now();

    if (!this.limits.has(userId)) {
      this.limits.set(userId, new Map());
    }

    const userLimits = this.limits.get(userId);

    if (!userLimits.has(action)) {
      userLimits.set(action, {
        count: 0,
        windowStart: now,
        timestamps: [],
      });
    }

    const limit = userLimits.get(action);

    // Remove timestamps outside the window
    limit.timestamps = limit.timestamps.filter(ts => ts > now - windowMs);

    const remaining = Math.max(0, maxAttempts - limit.timestamps.length);
    const resetTime = limit.timestamps.length > 0
      ? limit.timestamps[0] + windowMs
      : now + windowMs;

    if (limit.timestamps.length >= maxAttempts) {
      return {
        limited: true,
        remaining: 0,
        resetTime,
        retryAfter: resetTime - now,
      };
    }

    limit.timestamps.push(now);
    limit.count++;

    return {
      limited: false,
      remaining: maxAttempts - limit.timestamps.length,
      resetTime,
      retryAfter: 0,
    };
  }

  /**
   * Get the remaining attempts for a user action.
   */
  getRemaining(userId, action, maxAttempts = 5, windowMs = 10000) {
    const result = this.check(userId, action, maxAttempts, windowMs);
    return result.remaining;
  }

  /**
   * Reset rate limit for a user action.
   */
  reset(userId, action) {
    const userLimits = this.limits.get(userId);
    if (userLimits) {
      userLimits.delete(action);
    }
  }

  /**
   * Reset all rate limits for a user.
   */
  resetAll(userId) {
    this.limits.delete(userId);
  }

  /**
   * Cleanup expired entries to prevent memory leaks.
   */
  cleanup() {
    const now = Date.now();
    for (const [userId, userLimits] of this.limits.entries()) {
      for (const [action, limit] of userLimits.entries()) {
        limit.timestamps = limit.timestamps.filter(ts => ts > now - 60000);
        if (limit.timestamps.length === 0) {
          userLimits.delete(action);
        }
      }
      if (userLimits.size === 0) {
        this.limits.delete(userId);
      }
    }
  }

  /**
   * Destroy the rate limiter and cleanup interval.
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }
}

/**
 * Predefined rate limit configurations for different command types.
 */
const RateLimitConfig = {
  // Standard commands (5 per 10 seconds)
  STANDARD: { maxAttempts: 5, windowMs: 10000 },

  // Sensitive commands (3 per 30 seconds)
  SENSITIVE: { maxAttempts: 3, windowMs: 30000 },

  // Moderation actions (6 per 60 seconds)
  MODERATION: { maxAttempts: 6, windowMs: 60000 },

  // Ticket creation (2 per 60 seconds)
  TICKET_CREATE: { maxAttempts: 2, windowMs: 60000 },

  // DM broadcast (1 per 5 minutes)
  DM_BROADCAST: { maxAttempts: 1, windowMs: 300000 },

  // XP commands (10 per 30 seconds)
  XP: { maxAttempts: 10, windowMs: 30000 },

  // Security alerts (per guild, 3 per 60 seconds)
  SECURITY_ALERT: { maxAttempts: 3, windowMs: 60000 },

  // Global rate limit (per user, 30 per 10 seconds)
  GLOBAL: { maxAttempts: 30, windowMs: 10000 },
};

// Singleton instance
const rateLimiter = new RateLimiter();

module.exports = { RateLimiter, RateLimitConfig, rateLimiter };
