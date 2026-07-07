const config = require('../config');
const db = require('../database');
const spamDetector = require('./spamDetector');
const logger = require('./logger');

/**
 * XP & Leveling System
 *
 * Awards XP for messages in designated channels with spam protection.
 * Automatically assigns role rewards at specified level thresholds.
 * Uses exponential level scaling: XP required = base * (level ^ exponent)
 */
class XPSystem {
  constructor(client) {
    this.client = client;
    this.userCooldowns = new Map(); // Map<guildId, Map<userId, lastXpTime>>
    this.levelBroadcasts = new Map(); // Map<guildId, Set<userId>> - recently leveled up
  }

  /**
   * Process a message and award XP if applicable.
   * @param {object} message - Discord message object
   * @returns {Promise<object|null>} - Level-up info if user leveled up
   */
  async processMessage(message) {
    // Skip bots and system messages
    if (message.author.bot || message.system) return null;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const channelId = message.channel.id;

    // Ensure guild exists in DB
    db.ensureGuild(guildId);

    // Check if XP is enabled in this guild
    const guildConfig = db.getGuild(guildId);
    if (guildConfig && !guildConfig.xp_enabled) return null;

    // Check if the channel is allowed for XP
    if (!this._isXpChannel(guildId, channelId)) return null;

    // Check if the channel should be ignored
    if (this._isIgnoredChannel(guildId, channelId)) return null;

    // Check for spam - don't award XP to spammers
    if (spamDetector.analyze(message, message.member).isSpam) {
      return null;
    }

    // Check cooldown
    if (!this._checkCooldown(guildId, userId)) return null;

    // Calculate XP for this message
    const xpGained = this._calculateXp(message);

    // Get or create user level data
    let userLevel = db.getUserLevel(guildId, userId);
    if (!userLevel) {
      db.upsertUserLevel(guildId, userId, {
        xp: xpGained,
        level: 1,
        total_xp: xpGained,
        message_count: 1,
        last_message_time: new Date().toISOString(),
      });
      userLevel = db.getUserLevel(guildId, userId);
    } else {
      const newXp = userLevel.xp + xpGained;
      const newTotalXp = userLevel.total_xp + xpGained;

      db.upsertUserLevel(guildId, userId, {
        xp: newXp,
        total_xp: newTotalXp,
        message_count: userLevel.message_count + 1,
        last_message_time: new Date().toISOString(),
      });
    }

    // Re-fetch updated data
    userLevel = db.getUserLevel(guildId, userId);

    // Check if user leveled up
    const newLevel = this._calculateLevel(userLevel.xp);
    if (newLevel > userLevel.level) {
      // Update level in database
      db.upsertUserLevel(guildId, userId, { level: newLevel });

      // Award role rewards
      await this._checkRoleRewards(message.guild, message.member, newLevel);

      // Notify user
      await this._notifyLevelUp(message, newLevel);

      return {
        userId,
        oldLevel: userLevel.level,
        newLevel,
        xpGained,
      };
    }

    return null;
  }

  /**
   * Calculate XP for a message with bonuses.
   */
  _calculateXp(message) {
    const guildConfig = db.getGuild(message.guild.id);
    const rateMultiplier = guildConfig ? guildConfig.xp_rate_multiplier : 1.0;

    // Base XP
    let xp = config.xp.baseXp;

    // Random bonus
    xp += Math.floor(Math.random() * config.xp.randomBonus);

    // Message length bonus (min 5 chars, max 20 bonus)
    const contentLength = (message.content || '').length;
    if (contentLength > 50) {
      xp += Math.min(20, Math.floor(contentLength / 25));
    }

    // Attachment bonus
    if (message.attachments.size > 0) {
      xp += 5;
    }

    // Embed/sticker bonus
    if (message.embeds.length > 0 || message.stickers.size > 0) {
      xp += 3;
    }

    // Apply rate multiplier
    xp = Math.round(xp * rateMultiplier);

    return Math.min(xp, 100); // Cap XP per message
  }

  /**
   * Calculate level from XP amount.
   * Formula: Level = (XP / base) ^ (1 / exponent)
   */
  _calculateLevel(xp) {
    const level = Math.pow(xp / config.xp.levelBaseXp, 1 / config.xp.levelExponent);
    return Math.max(1, Math.floor(level));
  }

  /**
   * Get XP required for a specific level.
   */
  getXpForLevel(level) {
    return Math.floor(config.xp.levelBaseXp * Math.pow(level, config.xp.levelExponent));
  }

  /**
   * Get XP progress towards the next level.
   */
  getLevelProgress(userLevel) {
    const currentLevelXp = this.getXpForLevel(userLevel.level);
    const nextLevelXp = this.getXpForLevel(userLevel.level + 1);
    const currentProgress = userLevel.xp - currentLevelXp;
    const needed = nextLevelXp - currentLevelXp;

    return {
      current: currentProgress,
      needed,
      percentage: Math.min(100, Math.floor((currentProgress / needed) * 100)),
    };
  }

  /**
   * Check role rewards for a level.
   */
  async _checkRoleRewards(guild, member, level) {
    try {
      // Get configured level roles from database
      const levelRoles = db.getLevelRoles(guild.id);
      const roleMap = new Map(levelRoles.map(r => [r.level, r.role_id]));

      // Check default config roles
      for (const [reqLevel, roleName] of Object.entries(config.xp.roleRewards)) {
        if (level >= parseInt(reqLevel)) {
          const role = guild.roles.cache.find(r => r.name === roleName);
          if (role && !member.roles.cache.has(role.id)) {
            await member.roles.add(role).catch(err => {
              logger.warn(`Failed to add role ${roleName} to ${member.id}`, { error: err.message });
            });
          }
        }
      }

      // Check database-configured roles (override defaults)
      for (const [reqLevelStr, roleId] of roleMap.entries()) {
        if (level >= reqLevelStr) {
          const role = guild.roles.cache.get(roleId);
          if (role && !member.roles.cache.has(role.id)) {
            await member.roles.add(role).catch(err => {
              logger.warn(`Failed to add custom role ${role.name} to ${member.id}`, { error: err.message });
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error checking role rewards', { error: error.message, memberId: member.id, level });
    }
  }

  /**
   * Notify user when they level up.
   */
  async _notifyLevelUp(message, newLevel) {
    try {
      const levelUpMessages = [
        `🎉 **Level Up!** You've reached **Level ${newLevel}**!`,
        `⭐ **Congratulations!** You're now **Level ${newLevel}**!`,
        `🚀 **Amazing!** Level **${newLevel}** achieved!`,
        `💫 **Level ${newLevel}** — You're on fire!`,
        `🎊 **Level ${newLevel}** — Keep up the great work!`,
      ];

      const msg = levelUpMessages[Math.floor(Math.random() * levelUpMessages.length)];
      await message.channel.send(`${message.author} ${msg}`).catch(() => {});
    } catch (error) {
      logger.debug('Failed to send level up notification', { error: error.message });
    }
  }

  /**
   * Check if user is off cooldown for XP.
   */
  _checkCooldown(guildId, userId) {
    if (!this.userCooldowns.has(guildId)) {
      this.userCooldowns.set(guildId, new Map());
      return true;
    }

    const guildCooldowns = this.userCooldowns.get(guildId);
    const lastXp = guildCooldowns.get(userId);

    if (lastXp && Date.now() - lastXp < config.xp.cooldown) {
      return false;
    }

    guildCooldowns.set(userId, Date.now());
    return true;
  }

  /**
   * Check if a channel is in the XP-allowed channels list.
   */
  _isXpChannel(guildId, channelId) {
    const xpChannels = db.getXpChannels(guildId);
    // If no specific channels are set, all channels are allowed
    if (xpChannels.length === 0) return true;
    return xpChannels.includes(channelId);
  }

  /**
   * Check if a channel should be ignored for XP.
   */
  _isIgnoredChannel(guildId, channelId) {
    const ignoreChannels = db.getIgnoreChannels(guildId);
    return ignoreChannels.includes(channelId);
  }

  /**
   * Set XP channels for a guild.
   */
  setXpChannels(guildId, channelIds) {
    db.setXpChannels(guildId, channelIds);
  }

  /**
   * Set ignored channels for a guild.
   */
  setIgnoreChannels(guildId, channelIds) {
    db.updateGuild(guildId, { ignore_channels: JSON.stringify(channelIds) });
  }

  /**
   * Get or set the XP rate multiplier for a guild.
   */
  getXpMultiplier(guildId) {
    const guild = db.getGuild(guildId);
    return guild ? guild.xp_rate_multiplier : 1.0;
  }

  setXpMultiplier(guildId, multiplier) {
    db.updateGuild(guildId, { xp_rate_multiplier: multiplier });
  }

  /**
   * Enable or disable XP for a guild.
   */
  setXpEnabled(guildId, enabled) {
    db.updateGuild(guildId, { xp_enabled: enabled ? 1 : 0 });
  }

  /**
   * Cleanup cooldown data.
   */
  cleanup() {
    const now = Date.now();
    for (const [guildId, cooldowns] of this.userCooldowns.entries()) {
      for (const [userId, lastTime] of cooldowns.entries()) {
        if (now - lastTime > config.xp.cooldown * 2) {
          cooldowns.delete(userId);
        }
      }
      if (cooldowns.size === 0) {
        this.userCooldowns.delete(guildId);
      }
    }
  }
}

module.exports = XPSystem;
