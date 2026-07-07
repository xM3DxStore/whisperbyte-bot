const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const config = {
  // Bot Token
  token: process.env.DISCORD_BOT_TOKEN,

  // Client ID for slash command registration
  clientId: process.env.DISCORD_CLIENT_ID,

  // Owner user ID
  ownerId: process.env.OWNER_USER_ID,

  // Database
  database: {
    path: process.env.DATABASE_PATH || path.resolve(__dirname, '..', 'data', 'guardian.db'),
  },

  // Bot Settings
  prefix: process.env.DEFAULT_PREFIX || '!',

  // Spam Detection Configuration
  spam: {
    // Overall sensitivity (0.0 - 1.0)
    sensitivity: parseFloat(process.env.SPAM_SENSITIVITY) || 0.6,

    // Maximum messages per second before triggering spam alert
    maxMessagesPerSecond: 3,

    // Time window for rate limiting (ms)
    rateLimitWindow: 4000,

    // Maximum duplicate messages in a row
    maxDuplicateMessages: 3,

    // Maximum links per message
    maxLinksPerMessage: 3,

    // Maximum mentions per message
    maxMentionsPerMessage: 5,

    // Maximum emoji percentage (0.0 - 1.0)
    maxEmojiRatio: 0.6,

    // Maximum caps percentage (0.0 - 1.0)
    maxCapsRatio: 0.7,

    // Minimum message length to check for caps spam
    minCapsCheckLength: 8,

    // Maximum repeated characters in a row (e.g., "aaaaaa")
    maxRepeatedChars: 8,

    // Maximum newline count per message
    maxNewlines: 10,

    // Cooldown between XP awards (ms)
    xpCooldown: 5000,

    // Ban threshold score (automatic ban)
    banThreshold: 15,

    // Mute threshold score (automatic mute)
    muteThreshold: 8,

    // Warning threshold score
    warnThreshold: 3,

    // Score decay rate (per minute)
    scoreDecayPerMinute: 1,

    // Data retention for spam scores (minutes)
    scoreRetentionMinutes: 30,
  },

  // XP / Leveling Configuration
  xp: {
    // Base XP per message
    baseXp: 15,

    // Random XP bonus (0 to this value)
    randomBonus: 10,

    // XP cooldown per user (ms)
    cooldown: 60000,

    // Voice XP per minute
    voiceXpPerMinute: 20,

    // Level calculation: XP required = base * (level ^ exponent)
    levelBaseXp: 100,
    levelExponent: 1.5,

    // Role rewards: { level: 'roleName' }
    roleRewards: {
      5: '🌟 Active Member',
      10: '💬 Chatterbox',
      15: '🔥 Dedicated',
      20: '⚡ Enthusiast',
      25: '👑 Veteran',
      30: '💎 Elite',
      40: '🏆 Legend',
      50: '🌟 Hall of Fame',
    },
  },

  // Ticket Configuration
  tickets: {
    maxPerUser: parseInt(process.env.MAX_TICKETS_PER_USER) || 5,
    categoryName: '🎫 Tickets',
    channelPrefix: 'ticket-',
    roles: {
      supportTeam: 'Support Team',
      adminOverride: 'Administrator',
    },
    statuses: {
      OPEN: '🟢 Open',
      PENDING: '🟡 Pending',
      RESOLVED: '🔵 Resolved',
      CLOSED: '🔴 Closed',
    },
  },

  // Anti-Raid Configuration
  antiRaid: {
    // Max joins in time window
    joinThreshold: parseInt(process.env.ANTI_RAID_JOIN_THRESHOLD) || 5,
    // Time window in ms
    joinWindow: 10000,
    // Auto lockdown duration in minutes
    lockdownDuration: 15,
    // Alert channel name
    alertChannelName: 'security-alerts',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    channelName: 'security-logs',
  },

  // Appeal server invite
  appealInvite: process.env.APPEAL_SERVER_INVITE || '',
};

module.exports = config;
