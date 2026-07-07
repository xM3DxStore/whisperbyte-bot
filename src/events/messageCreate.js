const spamDetector = require('../services/spamDetector');
const config = require('../config');
const db = require('../database');
const logger = require('../services/logger');

/**
 * Message Create Event Handler
 *
 * Core handler that processes every message for:
 * 1. AI-powered spam detection
 * 2. XP/Leveling tracking
 * 3. Automated enforcement actions
 */
module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {
    // Ignore DMs and system messages
    if (!message.guild || message.system) return;

    // Ignore bot messages (but not webhooks)
    if (message.author.bot && !message.webhookId) return;

    const guildId = message.guild.id;
    const member = message.member;
    const userId = message.author.id;

    // =====================================================================
    // 1. AI-Powered Spam Detection
    // =====================================================================
    if (message.content) {
      const analysis = spamDetector.analyze(message, member);

      if (analysis.isSpam) {
        logger.security('Spam detected', {
          guildId,
          userId,
          score: analysis.score,
          reasons: analysis.reasons,
          content: message.content.substring(0, 100),
        });

        // Update spam score in database
        const existingScore = db.getSpamScore(guildId, userId);
        const newScore = (existingScore?.score || 0) + analysis.score;

        db.upsertSpamScore(guildId, userId, {
          score: newScore,
          violations: (existingScore?.violations || 0) + 1,
          last_violation: new Date().toISOString(),
        });

        // Log to audit
        db.addAuditLog(guildId, 'SPAM_DETECTED', client.user.id, userId,
          `Spam score: ${analysis.score.toFixed(1)} | Reasons: ${analysis.reasons.join('; ')}`,
          JSON.stringify({ score: analysis.score, reasons: analysis.reasons })
        );

        // Execute automated actions based on score severity
        if (analysis.actions) {
          for (const action of analysis.actions) {
            try {
              await this._executeAction(message, member, action, analysis);
            } catch (error) {
              logger.error('Failed to execute spam action', {
                action: action.type,
                userId,
                error: error.message,
              });
            }
          }
        }

        // Auto-delete spam message
        if (analysis.score >= config.spam.warnThreshold) {
          try {
            await message.delete();
            logger.debug(`Deleted spam message from ${userId}`, { score: analysis.score });
          } catch (err) {
            // Message may already be deleted
          }
        }
      }
    }

    // =====================================================================
    // 2. XP/Leveling (only for non-spam messages from real users)
    // =====================================================================
    if (!message.author.bot && client.xpSystem) {
      await client.xpSystem.processMessage(message);
    }
  },

  /**
   * Execute an automated enforcement action.
   */
  async _executeAction(message, member, action, analysis) {
    const guildId = message.guild.id;
    const userId = member.id;

    switch (action.type) {
      case 'WARN': {
        db.addWarning(guildId, userId, message.client.user.id,
          action.reason || 'Automated spam detection', 2
        );
        logger.moderation('AUTO_WARN', message.client.user.id, userId, 'Spam', guildId);
        break;
      }

      case 'MUTE': {
        if (member.moderatable) {
          const duration = action.duration || 60000;
          await member.timeout(duration, action.reason || 'Automated spam mute');

          // Schedule unmute logging
          db.addScheduledAction(guildId, userId, 'UNMUTE',
            new Date(Date.now() + duration).toISOString(),
            JSON.stringify({ reason: 'Spam mute expired' })
          );

          logger.moderation('AUTO_MUTE', message.client.user.id, userId,
            `Spam timeout (${duration / 60000} min)`, guildId
          );

          // Send DM to user
          try {
            await member.send(
              `⚠️ You have been automatically muted in **${message.guild.name}** for ${duration / 60000} minute(s) due to spam detection.\n\n` +
              `**Spam Score:** ${analysis.score.toFixed(1)}\n` +
              `**Reasons:** ${analysis.reasons.join(', ')}\n\n` +
              `Please avoid: rapid messaging, duplicate content, excessive links/mentions/emoji, or spam-like behavior.`
            );
          } catch (dmErr) {
            // DM may be disabled
          }
        }
        break;
      }

      case 'KICK': {
        if (member.kickable) {
          await member.kick(action.reason || 'Automated spam kick (critical score)');
          logger.moderation('AUTO_KICK', message.client.user.id, userId, 'Critical spam', guildId);
        }
        break;
      }

      case 'BAN': {
        if (member.bannable) {
          const deleteDays = action.deleteMessageDays || 1;
          await message.guild.members.ban(userId, {
            reason: action.reason || 'Automated spam ban (extreme score)',
            deleteMessageSeconds: deleteDays * 86400,
          });
          logger.moderation('AUTO_BAN', message.client.user.id, userId, 'Extreme spam', guildId);
        }
        break;
      }
    }
  },
};
