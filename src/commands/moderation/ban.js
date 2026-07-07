const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { canActOnTarget } = require('../../utils/permissions');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('User to ban')
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for the ban')
      .setMaxLength(1000)
    )
    .addIntegerOption(opt => opt
      .setName('delete_days')
      .setDescription('Delete messages from the last X days (0-7)')
      .setMinValue(0)
      .setMaxValue(7)
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    const guildId = interaction.guild.id;

    // Check if trying to ban self
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'You cannot ban yourself.')], ephemeral: true });
    }

    if (targetMember && !canActOnTarget(interaction.guild.members.me, targetMember, interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot ban this user. They may have higher permissions.')], ephemeral: true });
    }

    // DM the user before banning
    try {
      await targetUser.send(
        `🚫 **You have been banned from ${interaction.guild.name}**\n\n` +
        `**Reason:** ${reason}\n` +
        `**Moderator:** ${interaction.user.tag}\n\n` +
        (db.ensureGuild(guildId).appeal_invite
          ? `To appeal: ${db.ensureGuild(guildId).appeal_invite}`
          : 'This ban is permanent. You cannot appeal.')
      );
    } catch (dmErr) {
      // DM may be disabled
    }

    // Execute ban
    await interaction.guild.members.ban(targetUser.id, {
      reason,
      deleteMessageSeconds: deleteDays * 86400,
    });

    // Log to database
    db.addAuditLog(guildId, 'BAN', interaction.user.id, targetUser.id,
      reason, JSON.stringify({ deleteDays })
    );
    logger.moderation('BAN', interaction.user.id, targetUser.id, reason, guildId);

    await interaction.reply({
      embeds: [successEmbed('User Banned',
        `${targetUser.tag} has been banned.\n` +
        `**Reason:** ${reason}\n` +
        `**Message Deletion:** ${deleteDays} day(s)`
      )],
    });
  },
};
