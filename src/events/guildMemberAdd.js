const logger = require('../services/logger');

/**
 * Guild Member Add Event Handler
 *
 * Handles member joins with:
 * 1. Anti-raid analysis via RaidDetector
 * 2. Basic verification checks
 * 3. Welcome message with server rules
 */
module.exports = {
  name: 'guildMemberAdd',
  once: false,
  async execute(member, client) {
    try {
      // ===================================================================
      // 1. Anti-Raid Analysis
      // ===================================================================
      if (client.raidDetector) {
        const raidResult = await client.raidDetector.analyzeJoin(member);

        if (raidResult.isRaid) {
          logger.security('Raid join detected', {
            guildId: member.guild.id,
            userId: member.id,
            userTag: member.user.tag,
            reasons: raidResult.reasons,
          });

          // Optionally kick suspicious new users during a raid
          if (raidResult.riskScore >= 5 && member.kickable) {
            await member.kick('Automated protection: raid join detected').catch(err => {
              logger.warn('Failed to kick raid joiner', { error: err.message });
            });
          }
          return; // Skip welcome for raid joins
        }
      }

      // ===================================================================
      // 2. Send Welcome Message
      // ===================================================================
      try {
        const welcomeChannel = member.guild.channels.cache.find(
          c => c.name === 'welcome' || c.name === 'general' || c.name === 'introductions'
        );

        if (welcomeChannel) {
          const welcomeMessage = [
            `👋 Welcome to **${member.guild.name}**, ${member}!`,
            '',
            '📖 Please read the server rules in <#rules> if you haven\'t already.',
            '🛡️ This server is protected by Guardian Security Bot.',
          ].join('\n');

          await welcomeChannel.send(welcomeMessage);
        }
      } catch (err) {
        logger.debug('Could not send welcome message', { error: err.message });
      }

    } catch (error) {
      logger.error('Error in guildMemberAdd handler', {
        guildId: member.guild?.id,
        userId: member.id,
        error: error.message,
      });
    }
  },
};
