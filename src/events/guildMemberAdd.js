const logger = require('../services/logger');
const { premiumEmbed, BRAND } = require('../utils/embedBuilder');

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  async execute(member, client) {
    try {
      if (client.raidDetector) {
        const raidResult = await client.raidDetector.analyzeJoin(member);

        if (raidResult.isRaid) {
          logger.security('Raid join detected', {
            guildId: member.guild.id,
            userId: member.id,
            userTag: member.user.tag,
            reasons: raidResult.reasons,
          });

          if (raidResult.riskScore >= 5 && member.kickable) {
            await member.kick('Automated protection: raid join detected').catch(err => {
              logger.warn('Failed to kick raid joiner', { error: err.message });
            });
          }
          return;
        }
      }

      try {
        const welcomeChannel = member.guild.channels.cache.find(
          c => c.name === 'welcome' || c.name === 'general' || c.name === 'introductions'
        );

        if (welcomeChannel) {
          const memberCount = member.guild.memberCount;
          const ordinal = memberCount === 1 ? 'st' : memberCount === 2 ? 'nd' : memberCount === 3 ? 'rd' : 'th';

          const embed = premiumEmbed(
            `Welcome to ${member.guild.name}`,
            [
              `Welcome ${member}, you are our **${memberCount}${ordinal}** member!`,
              '',
              BRAND.thinDivider,
              '',
              `> 📖  Please read the rules in <#rules>`,
              `> 🛡️  This server is protected by **Guardian Security**`,
              `> 🎭  Grab your roles in the role channel`,
            ].join('\n')
          )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
              { name: 'Member Count', value: `\`${memberCount}\``, inline: true },
              { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
            );

          await welcomeChannel.send({ embeds: [embed] });
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
