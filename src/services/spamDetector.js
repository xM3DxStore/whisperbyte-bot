const config = require('../config');
const db = require('../database');
const logger = require('./logger');

/**
 * AI-Powered Spam Detection Service
 *
 * Uses a multi-layered scoring system combining:
 * 1. Heuristic analysis (content patterns, rate limits)
 * 2. Behavioral scoring (user history, message similarity)
 * 3. Machine-learning-inspired pattern recognition (frequency analysis, anomaly detection)
 * 4. Adaptive thresholds that adjust based on server activity
 */
class SpamDetector {
  constructor() {
    // In-memory tracking for fast access
    this.messageCache = new Map();     // Map<guildId, Map<userId, MessageRecord[]>>
    this.contentHashes = new Map();     // Map<guildId, Map<contentHash, count>>
    this.serverActivity = new Map();    // Map<guildId, { msgCount, windowStart }>

    // Cleanup stale data every 2 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 120000);

    // Learning data for adaptive thresholds
    this.learningData = new Map();      // Map<guildId, LearningMetrics>
  }

  /**
   * Analyze a message for spam patterns.
   * @param {object} message - Discord message object
   * @param {object} member - Guild member
   * @returns {{ isSpam: boolean, score: number, reasons: string[], actions: object }}
   */
  analyze(message, member) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const content = message.content || '';

    // Check for bot bypass
    if (message.author.bot) {
      // Still check for webhook spam or bot abuse
      if (message.webhookId) {
        return this._analyzeContent(content, member, guildId);
      }
      return { isSpam: false, score: 0, reasons: [], actions: null };
    }

    // Initialize tracking for this guild/user
    this._ensureTracking(guildId, userId);

    // Calculate individual spam factor scores
    const factors = [
      this._checkRateLimit(guildId, userId),
      this._checkDuplicateContent(guildId, userId, content),
      this._checkGlobalDuplicate(guildId, content),
      this._checkExcessiveLinks(content),
      this._checkExcessiveMentions(content),
      this._checkExcessiveEmoji(content),
      this._checkExcessiveCaps(content),
      this._checkRepeatedCharacters(content),
      this._checkExcessiveNewlines(content),
      this._checkMessageSimilarity(guildId, userId, content),
      this._checkServerAbnormalActivity(guildId),
    ];

    // Filter zero-score factors and calculate weighted total
    const activeFactors = factors.filter(f => f.score > 0);
    const rawScore = activeFactors.reduce((sum, f) => sum + f.score, 0);

    // Apply guild sensitivity modifier
    const guildSensitivity = this._getGuildSensitivity(guildId);
    const adjustedScore = rawScore * guildSensitivity;

    // Apply adaptive threshold based on learning data
    const threshold = this._getAdaptiveThreshold(guildId);

    // Determine if this is spam
    const isSpam = adjustedScore >= config.spam.warnThreshold;

    // Track this message in cache
    this._trackMessage(guildId, userId, content);

    // Determine actions based on score severity
    const actions = this._determineActions(adjustedScore, member, guildId);

    return {
      isSpam,
      score: Math.round(adjustedScore * 10) / 10,
      reasons: activeFactors.map(f => f.reason),
      actions,
      factors: activeFactors.map(f => ({ name: f.name, score: f.score })),
    };
  }

  // ===========================================================================
  // Spam Detection Factors (Heuristic Analysis)
  // ===========================================================================

  /**
   * 1. Rate limiting: Detect rapid message sending.
   */
  _checkRateLimit(guildId, userId) {
    const cache = this.messageCache.get(guildId).get(userId);
    const now = Date.now();
    const windowMs = config.spam.rateLimitWindow;

    // Count messages in the time window
    const recentMessages = cache.timestamps.filter(ts => now - ts < windowMs);
    const msgCount = recentMessages.length;

    if (msgCount <= config.spam.maxMessagesPerSecond) {
      return { name: 'rate_limit', score: 0, reason: '' };
    }

    // Exponential scoring based on message count
    const excess = msgCount - config.spam.maxMessagesPerSecond;
    const score = Math.min(5, excess * 1.5);

    return {
      name: 'rate_limit',
      score,
      reason: `Rapid messaging: ${msgCount} messages in ${windowMs / 1000}s (limit: ${config.spam.maxMessagesPerSecond})`,
    };
  }

  /**
   * 2. Duplicate content: Check if user is sending the same message repeatedly.
   */
  _checkDuplicateContent(guildId, userId, content) {
    const cache = this.messageCache.get(guildId).get(userId);
    if (cache.length < 1) return { name: 'duplicate', score: 0, reason: '' };

    const normalizedContent = content.toLowerCase().trim();

    // Check last N messages for duplicates
    const recentMessages = cache.messages || [];
    const duplicateCount = recentMessages.filter(m => {
      const normalized = (m.content || '').toLowerCase().trim();
      return normalized === normalizedContent;
    }).length + 1; // +1 for current message

    if (duplicateCount < config.spam.maxDuplicateMessages) {
      return { name: 'duplicate', score: 0, reason: '' };
    }

    // Score increases with each duplicate
    const score = Math.min(4, (duplicateCount - config.spam.maxDuplicateMessages + 1) * 1.5);

    return {
      name: 'duplicate',
      score,
      reason: `Duplicate message: sent ${duplicateCount} times`,
    };
  }

  /**
   * 3. Global duplicate: Check if same content is being spammed across users.
   */
  _checkGlobalDuplicate(guildId, content) {
    const hash = this._hashContent(content);
    if (!hash) return { name: 'global_duplicate', score: 0, reason: '' };

    const guildHashes = this.contentHashes.get(guildId);
    const count = guildHashes.get(hash) || 0;

    if (count < 3) return { name: 'global_duplicate', score: 0, reason: '' };

    // If many users are sending the same content, it's a coordinated spam attack
    const score = Math.min(5, count * 0.5);

    return {
      name: 'global_duplicate',
      score,
      reason: `Coordinated spam: same content from ${count} users`,
    };
  }

  /**
   * 4. Excessive links: Detect messages with too many URLs.
   */
  _checkExcessiveLinks(content) {
    if (!content) return { name: 'links', score: 0, reason: '' };

    const urlRegex = /https?:\/\/[^\s<>"]+/gi;
    const links = content.match(urlRegex);
    const linkCount = links ? links.length : 0;

    if (linkCount <= config.spam.maxLinksPerMessage) {
      return { name: 'links', score: 0, reason: '' };
    }

    const score = Math.min(3, (linkCount - config.spam.maxLinksPerMessage) * 0.8);

    return {
      name: 'links',
      score,
      reason: `Excessive links: ${linkCount} URLs in message`,
    };
  }

  /**
   * 5. Excessive mentions: Detect mass mentions/ping spam.
   */
  _checkExcessiveMentions(content) {
    if (!content) return { name: 'mentions', score: 0, reason: '' };

    const userMentionRegex = /<@!?\d+>/g;
    const roleMentionRegex = /<@&\d+>/g;
    const everyoneRegex = /@everyone|@here/g;

    const userMentions = content.match(userMentionRegex);
    const roleMentions = content.match(roleMentionRegex);
    const everyoneMentions = content.match(everyoneRegex);

    const mentionCount = (userMentions || []).length + (roleMentions || []).length;
    const hasEveryone = (everyoneMentions || []).length > 0;

    let score = 0;
    let reasons = [];

    if (mentionCount > config.spam.maxMentionsPerMessage) {
      score += Math.min(5, (mentionCount - config.spam.maxMentionsPerMessage) * 1.5);
      reasons.push(`Excessive mentions: ${mentionCount} mentions`);
    }

    // @everyone/@here is extremely suspicious
    if (hasEveryone) {
      score += 4;
      reasons.push('Mass ping: @everyone or @here used');
    }

    return {
      name: 'mentions',
      score,
      reason: reasons.join('; '),
    };
  }

  /**
   * 6. Excessive emoji: Detect messages with too many emojis.
   */
  _checkExcessiveEmoji(content) {
    if (!content || content.length < 3) return { name: 'emoji', score: 0, reason: '' };

    // Count unicode emojis
    const unicodeEmojiRegex = /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]/gu;
    const unicodeEmojis = content.match(unicodeEmojiRegex);

    // Count custom Discord emojis
    const customEmojiRegex = /<a?:[a-zA-Z0-9_]+:\d+>/g;
    const customEmojis = content.match(customEmojiRegex);

    const totalEmojis = (unicodeEmojis || []).length + (customEmojis || []).length;
    const emojiRatio = totalEmojis / content.length;

    if (emojiRatio <= config.spam.maxEmojiRatio && totalEmojis < 10) {
      return { name: 'emoji', score: 0, reason: '' };
    }

    const score = Math.min(3, totalEmojis * 0.3 + (emojiRatio - config.spam.maxEmojiRatio) * 5);

    return {
      name: 'emoji',
      score,
      reason: `Excessive emoji: ${totalEmojis} emojis (${(emojiRatio * 100).toFixed(0)}% of message)`,
    };
  }

  /**
   * 7. Excessive caps: Detect SHOUTING spam.
   */
  _checkExcessiveCaps(content) {
    if (!content || content.length < config.spam.minCapsCheckLength) {
      return { name: 'caps', score: 0, reason: '' };
    }

    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length < config.spam.minCapsCheckLength) {
      return { name: 'caps', score: 0, reason: '' };
    }

    const capsLetters = content.replace(/[^A-Z]/g, '');
    const capsRatio = capsLetters.length / letters.length;

    if (capsRatio <= config.spam.maxCapsRatio) {
      return { name: 'caps', score: 0, reason: '' };
    }

    const score = Math.min(3, (capsRatio - config.spam.maxCapsRatio) * 6);

    return {
      name: 'caps',
      score,
      reason: `Excessive caps: ${(capsRatio * 100).toFixed(0)}% capitals`,
    };
  }

  /**
   * 8. Repeated characters: Detect "aaaaaaa" or "!!!!!!!" spam.
   */
  _checkRepeatedCharacters(content) {
    if (!content) return { name: 'repeated_chars', score: 0, reason: '' };

    // Check for repeated single characters
    const repeatRegex = /(.)\1{${config.spam.maxRepeatedChars},}/g;
    const matches = content.match(repeatRegex);

    if (!matches) return { name: 'repeated_chars', score: 0, reason: '' };

    const totalRepeated = matches.reduce((sum, m) => sum + m.length, 0);
    const score = Math.min(2, totalRepeated * 0.1);

    return {
      name: 'repeated_chars',
      score,
      reason: `Repeated characters: "${matches[0].substring(0, 20)}..."`,
    };
  }

  /**
   * 9. Excessive newlines: Detect wall-of-text spam.
   */
  _checkExcessiveNewlines(content) {
    if (!content) return { name: 'newlines', score: 0, reason: '' };

    const newlineCount = (content.match(/\n/g) || []).length;

    if (newlineCount <= config.spam.maxNewlines) {
      return { name: 'newlines', score: 0, reason: '' };
    }

    const score = Math.min(2, (newlineCount - config.spam.maxNewlines) * 0.2);

    return {
      name: 'newlines',
      score,
      reason: `Excessive newlines: ${newlineCount} lines`,
    };
  }

  /**
   * 10. Message similarity: Check if current message is similar to recent ones.
   * Uses Jaccard similarity on word tokens.
   */
  _checkMessageSimilarity(guildId, userId, content) {
    const cache = this.messageCache.get(guildId).get(userId);
    if (!cache.messages || cache.messages.length < 2) {
      return { name: 'similarity', score: 0, reason: '' };
    }

    const currentTokens = this._tokenize(content);
    if (currentTokens.size === 0) return { name: 'similarity', score: 0, reason: '' };

    let maxSimilarity = 0;

    // Compare with recent messages (last 5)
    const recentMessages = cache.messages.slice(-5);
    for (const msg of recentMessages) {
      const msgTokens = this._tokenize(msg.content || '');
      if (msgTokens.size === 0) continue;

      const similarity = this._jaccardSimilarity(currentTokens, msgTokens);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    if (maxSimilarity < 0.7) return { name: 'similarity', score: 0, reason: '' };

    const score = Math.min(3, maxSimilarity * 3 - 2);

    return {
      name: 'similarity',
      score,
      reason: `Message similarity: ${(maxSimilarity * 100).toFixed(0)}% similar to previous`,
    };
  }

  /**
   * 11. Server abnormal activity: Detect if the server is under active attack.
   */
  _checkServerAbnormalActivity(guildId) {
    const activity = this.serverActivity.get(guildId);
    if (!activity) return { name: 'server_activity', score: 0, reason: '' };

    const now = Date.now();
    const elapsed = now - activity.windowStart;
    const msgRate = elapsed > 0 ? activity.msgCount / (elapsed / 1000) : 0;

    // If message rate exceeds 10 messages/second, it's abnormal
    if (msgRate < 10) return { name: 'server_activity', score: 0, reason: '' };

    const score = Math.min(3, msgRate * 0.05);

    return {
      name: 'server_activity',
      score,
      reason: `Server under load: ${msgRate.toFixed(1)} msgs/sec`,
    };
  }

  // ===========================================================================
  // Content Analysis (for webhooks/bots)
  // ===========================================================================

  /**
   * Analyze content-only (for webhook messages).
   */
  _analyzeContent(content, member, guildId) {
    const factors = [
      this._checkExcessiveLinks(content),
      this._checkExcessiveEmoji(content),
      this._checkExcessiveCaps(content),
    ];

    const activeFactors = factors.filter(f => f.score > 0);
    const score = activeFactors.reduce((sum, f) => sum + f.score, 0);

    return {
      isSpam: score >= config.spam.warnThreshold,
      score,
      reasons: activeFactors.map(f => f.reason),
      actions: null,
    };
  }

  // ===========================================================================
  // Scoring & Action Determination
  // ===========================================================================

  /**
   * Determine what actions to take based on spam score.
   */
  _determineActions(score, member, guildId) {
    if (score < config.spam.warnThreshold) return null;

    const actions = [];

    // Always warn at minimum
    if (score >= config.spam.warnThreshold) {
      actions.push({ type: 'WARN', reason: 'Spam detected' });
    }

    // Mute if score is high
    if (score >= config.spam.muteThreshold) {
      const muteDuration = Math.min(3600000, Math.floor(score * 60000)); // 1 min per point, max 1 hour
      actions.push({ type: 'MUTE', duration: muteDuration, reason: 'High spam score' });
    }

    // Kick if score is very high
    if (score >= config.spam.banThreshold) {
      actions.push({ type: 'KICK', reason: 'Critical spam score' });
    }

    // Ban if score is extreme
    if (score >= config.spam.banThreshold * 1.5) {
      actions.push({ type: 'BAN', reason: 'Extreme spam score', deleteMessageDays: 1 });
    }

    return actions.length > 0 ? actions : null;
  }

  // ===========================================================================
  // Adaptive Thresholds (Learning)
  // ===========================================================================

  /**
   * Get the adaptive threshold for a guild based on learning data.
   * Adjusts sensitivity based on server activity patterns.
   */
  _getAdaptiveThreshold(guildId) {
    const learning = this.learningData.get(guildId);
    if (!learning || learning.messageCount < 100) {
      return config.spam.warnThreshold;
    }

    // If server has lots of false positives, raise threshold
    // If server is under attack, lower threshold
    const falsePositiveRate = learning.falsePositives / learning.messageCount;
    const attackFrequency = learning.attacks / Math.max(1, learning.hoursTracked);

    let adjustment = 0;
    if (falsePositiveRate > 0.05) adjustment += 1;
    if (attackFrequency > 2) adjustment -= 1;

    return Math.max(1, Math.min(10, config.spam.warnThreshold + adjustment));
  }

  /**
   * Report a false positive to improve learning.
   */
  reportFalsePositive(guildId) {
    if (!this.learningData.has(guildId)) {
      this.learningData.set(guildId, {
        messageCount: 0,
        falsePositives: 0,
        attacks: 0,
        hoursTracked: 0,
        lastAttackTime: 0,
      });
    }
    const learning = this.learningData.get(guildId);
    learning.falsePositives++;
  }

  /**
   * Get guild spam sensitivity from database.
   */
  _getGuildSensitivity(guildId) {
    try {
      const guild = db.getGuild(guildId);
      return guild ? guild.spam_sensitivity : config.spam.sensitivity;
    } catch {
      return config.spam.sensitivity;
    }
  }

  // ===========================================================================
  // Tracking & Caching
  // ===========================================================================

  /**
   * Initialize tracking data structures for a guild/user.
   */
  _ensureTracking(guildId, userId) {
    if (!this.messageCache.has(guildId)) {
      this.messageCache.set(guildId, new Map());
      this.contentHashes.set(guildId, new Map());
      this.serverActivity.set(guildId, { msgCount: 0, windowStart: Date.now() });
      this.learningData.set(guildId, {
        messageCount: 0,
        falsePositives: 0,
        attacks: 0,
        hoursTracked: 0,
        lastAttackTime: 0,
      });
    }

    if (!this.messageCache.get(guildId).has(userId)) {
      this.messageCache.get(guildId).set(userId, {
        timestamps: [],
        messages: [],
        content: [],
      });
    }
  }

  /**
   * Track a message in the cache.
   */
  _trackMessage(guildId, userId, content) {
    const cache = this.messageCache.get(guildId).get(userId);
    cache.timestamps.push(Date.now());
    cache.messages.push({ content, timestamp: Date.now() });

    // Update global hash tracking
    const hash = this._hashContent(content);
    if (hash) {
      const guildHashes = this.contentHashes.get(guildId);
      guildHashes.set(hash, (guildHashes.get(hash) || 0) + 1);
    }

    // Update server activity
    const activity = this.serverActivity.get(guildId);
    activity.msgCount++;

    // Update learning data
    const learning = this.learningData.get(guildId);
    learning.messageCount++;

    // Limit cache size per user (keep last 20 messages)
    if (cache.messages.length > 20) {
      cache.messages.shift();
      cache.timestamps.shift();
    }
  }

  /**
   * Hash content for duplicate detection.
   */
  _hashContent(content) {
    if (!content || content.length < 5) return null;
    return content.toLowerCase().trim().substring(0, 100);
  }

  /**
   * Tokenize content into a set of words for similarity comparison.
   */
  _tokenize(content) {
    if (!content) return new Set();
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);
    return new Set(words);
  }

  /**
   * Calculate Jaccard similarity between two token sets.
   */
  _jaccardSimilarity(setA, setB) {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Cleanup stale cache data.
   */
  cleanup() {
    const now = Date.now();
    const retentionMs = config.spam.scoreRetentionMinutes * 60 * 1000;
    const staleThreshold = now - retentionMs;

    // Legacy cleanup location update
    for (const [guildId, users] of this.messageCache.entries()) {
      for (const [userId, cache] of users.entries()) {
        // Remove old timestamps
        cache.timestamps = cache.timestamps.filter(ts => ts > staleThreshold);
        if (cache.timestamps.length === 0 && cache.messages.length === 0) {
          users.delete(userId);
        }
      }
      if (users.size === 0) {
        this.messageCache.delete(guildId);
      }
    }

    // Reset server activity counters periodically
    for (const [guildId, activity] of this.serverActivity.entries()) {
      if (now - activity.windowStart > 60000) {
        activity.msgCount = 0;
        activity.windowStart = now;
      }
    }

    // Update learning data hours tracked
    for (const [guildId, learning] of this.learningData.entries()) {
      learning.hoursTracked = Math.min(168, learning.hoursTracked + 0.02); // Max 1 week
    }
  }

  /**
   * Destroy the detector and cleanup.
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.messageCache.clear();
    this.contentHashes.clear();
    this.serverActivity.clear();
    this.learningData.clear();
  }
}

module.exports = new SpamDetector();
