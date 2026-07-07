const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { canActOnTarget } = require('../../utils/permissions');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Temporarily mute a user with a duration')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('User to timeout')
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('duration')
      .setDescription('Duration (e.g., 5m, 1h, 1d)')
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for the timeout')
      .setMaxLength(1000)
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    const guildId = interaction.guild.id;

    const durationMs = this.parseDuration(durationStr);
    if (!durationMs) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Duration', 'Use format like `5m`, `1h`, `1d`. Max: 28 days.')],
        ephemeral: true,
      });
    }

    if (!targetMember) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'User not found in this server.')], ephemeral: true });
    }

    if (!canActOnTarget(interaction.guild.members.me, targetMember, interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot timeout this user. They may have higher permissions.')], ephemeral: true });
    }

    if (!targetMember.moderatable) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'I cannot timeout this user. Their role may be higher than mine.')], ephemeral: true });
    }

    await targetMember.timeout(durationMs, reason);

    db.addAuditLog(guildId, 'TIMEOUT', interaction.user.id, targetUser.id,
      reason, JSON.stringify({ duration: durationMs, durationDisplay: durationStr })
    );

    logger.moderation('TIMEOUT', interaction.user.id, targetUser.id, `${reason} (${durationStr})`, guildId);

    db.addScheduledAction(guildId, targetUser.id, 'UNMUTE',
      new Date(Date.now() + durationMs).toISOString(),
      JSON.stringify({ reason: 'Timeout expired', moderatorId: interaction.user.id })
    );

    try {
      await targetUser.send(
        `🔇 **You have been timed out in ${interaction.guild.name}**\n\n` +
        `**Duration:** ${durationStr}\n` +
        `**Reason:** ${reason}\n` +
        `**Moderator:** ${interaction.user.tag}\n\n` +
        `You will be automatically unmuted when the time expires.`
      );
    } catch (dmErr) {}

    await interaction.reply({
      embeds: [successEmbed('User Timed Out',
        `${targetUser.tag} has been timed out for **${durationStr}**.\n` +
        `**Reason:** ${reason}`
      )],
    });
  },

  parseDuration(duration) {
    const match = duration.toLowerCase().match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2][0];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = value * (multipliers[unit] || 60000);

    return Math.min(ms, 28 * 86400000);
  },
};
