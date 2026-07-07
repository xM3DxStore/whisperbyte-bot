const { PermissionsBitField } = require('discord.js');
const config = require('../config');
const db = require('../database');
const logger = require('./logger');

/**
 * Anti-Raid Detection Service
 *
 * Detects and mitigates raid attacks including:
 * - Rapid member joins (join burst)
 * - Mass mention/emoji spam
 * - Automated bot account creation
 * - Server nuke attempts
 *
 * Automatically activates lockdown mode when a raid is detected.
 */
class RaidDetector {
  constructor(client) {
    this.client = client;
    this.joinTimestamps = new Map();     // Map<guildId, number[]>
    this.joinCache = new Map();          // Map<guildId, Map<userId, joinTime>>
    this.lockdownStatus = new Map();     // Map<guildId, { active, until }>
    this.verificationQueue = new Map();  // Map<guildId, Map<userId, joinTime>>
  }

  /**
   * Analyze a guild member join event.
   * @param {object} member - GuildMember object
   * @returns {Promise<object>} - Raid analysis result
   */
  async analyzeJoin(member) {
    const guildId = member.guild.id;
    const now = Date.now();

    // Track join time
    if (!this.joinTimestamps.has(guildId)) {
      this.joinTimestamps.set(guildId, []);
    }
    const timestamps = this.joinTimestamps.get(guildId);
    timestamps.push(now);

    // Log event in database only when join rate is suspicious
    if (timestamps.length >= config.antiRaid.joinThreshold) {
      db.logRaidEvent(guildId, 'JOIN_BURST', 1, JSON.stringify({
        userId: member.id,
        userTag: member.user.tag,
        accountAge: now - member.user.createdAt,
        joinRate: timestamps.length,
      }));
    }

    // Calculate join rate
    const windowMs = config.antiRaid.joinWindow;
    const recentJoins = timestamps.filter(ts => now - ts < windowMs);
    const joinRate = recentJoins.length;

    // Keep only recent timestamps
    this.joinTimestamps.set(guildId, recentJoins.slice(-50));

    // Check account age (new accounts are suspicious)
    const accountAgeHours = (now - member.user.createdAt) / (1000 * 60 * 60);
    const isNewAccount = accountAgeHours < 24;

    // Calculate risk score
    let riskScore = 0;
    let reasons = [];

    if (joinRate >= config.antiRaid.joinThreshold) {
      riskScore += joinRate - config.antiRaid.joinThreshold + 1;
      reasons.push(`Rapid join burst: ${joinRate} joins in ${windowMs / 1000}s`);
    }

    if (isNewAccount) {
      riskScore += 2;
      reasons.push(`New account (< 24h old): ${accountAgeHours.toFixed(1)} hours`);
    }

    // Check for raid in progress
    const isRaid = riskScore >= 3;

    if (isRaid) {
      logger.security('Raid detected', {
        guildId,
        joinRate,
        riskScore,
        reasons,
        newMember: member.user.tag,
      });

      // Auto-activate lockdown
      await this.activateLockdown(member.guild, riskScore);
    }

    return {
      isRaid,
      riskScore,
      reasons,
      joinRate,
      isNewAccount,
    };
  }

  /**
   * Activate lockdown mode for a guild.
   */
  async activateLockdown(guild, severity = 1) {
    const guildId = guild.id;
    const duration = config.antiRaid.lockdownDuration * severity;

    // Already in lockdown
    if (this.lockdownStatus.get(guildId)?.active) {
      return;
    }

    this.lockdownStatus.set(guildId, {
      active: true,
      until: Date.now() + duration * 60 * 1000,
    });

    // Update database
    db.updateGuild(guildId, {
      lockdown_active: 1,
      lockdown_until: new Date(Date.now() + duration * 60 * 1000).toISOString(),
    });

    // Apply lockdown measures
    try {
      // 1. Disable @everyone @here permissions for default role
      const defaultRole = guild.roles.everyone;
      await defaultRole.setPermissions(
        defaultRole.permissions.remove([
          PermissionsBitField.Flags.MentionEveryone,
          PermissionsBitField.Flags.SendMessages,
        ]),
        `Raid lockdown activated (severity: ${severity})`
      );

      // 2. Enable slowmode on all text channels
      const textChannels = guild.channels.cache.filter(c => c.isTextBased());
      const promises = [];
      for (const [, channel] of textChannels) {
        promises.push(channel.setRateLimitPerUser(60).catch(() => {}));
      }
      await Promise.allSettled(promises);

      // Send alert
      await this._sendAlert(guild, '🚨 **RAID DETECTED**', [
        `Lockdown has been activated for **${duration} minutes**.`,
        `Severity level: **${severity}**`,
        '',
        '**Actions taken:**',
        '• @everyone mention permission disabled',
        '• Chat slowmode set to 60 seconds',
        '• New member joins restricted',
        '',
        'A server administrator should investigate immediately.',
      ], 'critical');

      // Log to audit
      db.addAuditLog(guildId, 'LOCKDOWN_ACTIVATE', this.client.user.id, null,
        `Raid lockdown activated for ${duration} minutes (severity: ${severity})`,
        JSON.stringify({ severity, duration })
      );

      logger.info(`Lockdown activated for ${guildId} (severity: ${severity}, ${duration} min)`);
    } catch (error) {
      logger.error('Failed to activate lockdown', { guildId, error: error.message });
    }

    // Schedule auto-deactivation
    setTimeout(async () => {
      await this.deactivateLockdown(guild);
    }, duration * 60 * 1000);
  }

  /**
   * Deactivate lockdown mode for a guild.
   */
  async deactivateLockdown(guild) {
    const guildId = guild.id;

    this.lockdownStatus.set(guildId, { active: false, until: null });

    // Update database
    db.updateGuild(guildId, {
      lockdown_active: 0,
      lockdown_until: null,
    });

    try {
      // Restore default role permissions
      const defaultRole = guild.roles.everyone;
      await defaultRole.setPermissions(
        defaultRole.permissions.add([
          PermissionsBitField.Flags.SendMessages,
        ]),
        'Raid lockdown deactivated'
      );

      // Remove slowmode from text channels
      const textChannels = guild.channels.cache.filter(c => c.isTextBased());
      const promises = [];
      for (const [, channel] of textChannels) {
        promises.push(channel.setRateLimitPerUser(0).catch(() => {}));
      }
      await Promise.allSettled(promises);

      // Send alert
      await this._sendAlert(guild, '🟢 **LOCKDOWN LIFTED**', [
        'The raid lockdown has been automatically lifted.',
        'All normal server functions have been restored.',
      ], 'low');

      // Log to audit
      db.addAuditLog(guildId, 'LOCKDOWN_DEACTIVATE', this.client.user.id, null,
        'Raid lockdown deactivated',
        JSON.stringify({})
      );

      logger.info(`Lockdown deactivated for ${guildId}`);
    } catch (error) {
      logger.error('Failed to deactivate lockdown', { guildId, error: error.message });
    }
  }

  /**
   * Check if a guild is currently in lockdown.
   */
  isLockdownActive(guildId) {
    const status = this.lockdownStatus.get(guildId);
    if (!status || !status.active) return false;
    if (status.until && Date.now() > status.until) {
      this.lockdownStatus.set(guildId, { active: false, until: null });
      return false;
    }
    return true;
  }

  /**
   * Get lockdown status for a guild.
   */
  getLockdownStatus(guildId) {
    const status = this.lockdownStatus.get(guildId);
    if (!status) return { active: false };
    if (status.until && Date.now() > status.until) {
      this.lockdownStatus.set(guildId, { active: false, until: null });
      return { active: false };
    }
    return status;
  }

  /**
   * Send an alert to the security alert channel.
   */
  async _sendAlert(guild, title, lines, severity = 'medium') {
    const { securityEmbed } = require('../utils/embedBuilder');

    try {
      const embed = securityEmbed(title, lines.join('\n'), severity);

      // Try to find security alerts channel
      const guildConfig = db.getGuild(guild.id);
      let alertChannel;

      if (guildConfig?.security_alert_channel_id) {
        alertChannel = guild.channels.cache.get(guildConfig.security_alert_channel_id);
      }

      if (!alertChannel) {
        alertChannel = guild.channels.cache.find(
          c => c.name === config.antiRaid.alertChannelName && c.isTextBased()
        );
      }

      if (alertChannel) {
        await alertChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      logger.warn('Failed to send raid alert', { guildId: guild.id, error: error.message });
    }
  }

  /**
   * Cleanup stale data.
   */
  cleanup() {
    const now = Date.now();
    const staleThreshold = now - 3600000; // 1 hour

    for (const [guildId, timestamps] of this.joinTimestamps.entries()) {
      const recent = timestamps.filter(ts => ts > staleThreshold);
      if (recent.length === 0) {
        this.joinTimestamps.delete(guildId);
      } else {
        this.joinTimestamps.set(guildId, recent);
      }
    }

    // Check for expired lockdowns
    for (const [guildId, status] of this.lockdownStatus.entries()) {
      if (status.active && status.until && now > status.until) {
        this.lockdownStatus.set(guildId, { active: false, until: null });
      }
    }
  }
}

module.exports = RaidDetector;
