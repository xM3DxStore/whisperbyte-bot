const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const { rateLimiter, RateLimitConfig } = require('../../utils/rateLimiter');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway-dm')
    .setDescription('Send a DM about a giveaway to all server members')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(opt => opt
      .setName('message')
      .setDescription('The giveaway announcement message')
      .setMaxLength(1900)
      .setRequired(true)
    )
    .addRoleOption(opt => opt
      .setName('exclude-role')
      .setDescription('Exclude members with this role from the DM')
    )
    .addBooleanOption(opt => opt
      .setName('preview')
      .setDescription('Preview the DM without sending')
    ),

  rateLimit: 'DM_BROADCAST',

  async execute(interaction) {
    const message = interaction.options.getString('message');
    const excludeRole = interaction.options.getRole('exclude-role');
    const preview = interaction.options.getBoolean('preview') || false;

    // Check rate limit (per guild)
    const guildLimit = rateLimiter.check(
      interaction.guild.id,
      'giveaway_dm',
      1, // once per 5 minutes
      300000
    );

    if (guildLimit.limited && !preview) {
      const retryMinutes = Math.ceil(guildLimit.retryAfter / 60000);
      return interaction.reply({
        embeds: [errorEmbed('Rate Limited',
          `Giveaway DM broadcast is limited to once every 5 minutes per server.\n` +
          `Please wait ${retryMinutes} minute(s) before trying again.`
        )],
        ephemeral: true,
      });
    }

    if (preview) {
      const memberCount = interaction.guild.memberCount;
      const botCount = interaction.guild.members.cache.filter(m => m.user.bot).size;
      const excludeCount = excludeRole
        ? interaction.guild.members.cache.filter(m => m.roles.cache.has(excludeRole.id)).size
        : 0;
      const willReceive = memberCount - botCount - excludeCount;

      const embed = infoEmbed(
        'Giveaway DM Preview',
        `**Message:**\n\`\`\`${message}\`\`\`\n` +
        `─────────────────────────\n` +
        `**Delivery Statistics:**\n` +
        `> Total members: **${memberCount}**\n` +
        `> Bots excluded: **${botCount}**\n` +
        `${excludeRole ? `> ${excludeRole.name} excluded: **${excludeCount}**\n` : ''}` +
        `> Recipients: **${willReceive}**\n\n` +
        `*This is a preview — no DMs have been sent.*`
      );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // Fetch all members (ensure cache is populated)
    await interaction.guild.members.fetch();

    const members = interaction.guild.members.cache;
    let sentCount = 0;
    let failedCount = 0;
    let botCount = 0;
    const failedUsers = [];

    // Send DMs with rate limiting (50 DMs per second to respect Discord limits)
    const sendWithDelay = async (member) => {
      try {
        await member.send(
          `🎉 **Giveaway Announcement — ${interaction.guild.name}** 🎉\n\n${message}\n\n` +
          `— ${interaction.user.tag}`
        );
        sentCount++;
      } catch (error) {
        failedCount++;
        failedUsers.push(member.user.tag);
        // Log failed DM
        logger.debug('Giveaway DM failed', {
          user: member.user.tag,
          error: error.message,
        });
      }

      // Respect rate limits: 5 messages per second per bot
      await new Promise(resolve => setTimeout(resolve, 200));
    };

    const botId = interaction.client.user.id;

    // Process members in parallel batches (10 at a time for speed)
    const batchSize = 10;
    const memberArray = [...members.values()];

    for (let i = 0; i < memberArray.length; i += batchSize) {
      const batch = memberArray.slice(i, i + batchSize);
      const promises = batch.map(async (member) => {
        // Skip bots
        if (member.user.bot) {
          botCount++;
          return;
        }

        // Skip excluded role
        if (excludeRole && member.roles.cache.has(excludeRole.id)) {
          return;
        }

        // Skip the bot itself
        if (member.id === botId) {
          return;
        }

        await sendWithDelay(member);
      });

      await Promise.all(promises);
    }

    // Log results
    logger.moderation('GIVEAWAY_DM', interaction.user.id, null,
      `Sent to ${sentCount} members, ${failedCount} failed`, interaction.guild.id
    );

    const totalAttempted = sentCount + failedCount;
    const successRate = totalAttempted > 0 ? Math.round((sentCount / totalAttempted) * 100) : 0;

    const embed = successEmbed(
      'Giveaway DMs Completed',
      `**Message:**\n\`\`\`${message.substring(0, 80)}${message.length > 80 ? '...' : ''}\`\`\`\n` +
      `─────────────────────────\n` +
      `**Delivery Results:**\n` +
      `> Successfully sent: **${sentCount}**\n` +
      `> Failed: **${failedCount}**\n` +
      `> Bots skipped: **${botCount}**\n` +
      `> Success rate: **${successRate}%**\n\n` +
      (failedCount > 0
        ? `**Failed Users** (${Math.min(failedUsers.length, 10)} of ${failedCount}):\n` +
          failedUsers.slice(0, 10).map(u => `> ${u}`).join('\n') + '\n\n' +
          `*Failed DMs are usually due to users having DMs disabled or privacy settings blocking bot messages.*`
        : `All DMs delivered successfully!`)
    );

    await interaction.editReply({ embeds: [embed], ephemeral: true });
  },
};
