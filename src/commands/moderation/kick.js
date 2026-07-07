const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { canActOnTarget } = require('../../utils/permissions');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers)
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('User to kick')
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for the kick')
      .setMaxLength(1000)
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    const guildId = interaction.guild.id;

    if (!targetMember) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'User not found in this server.')], ephemeral: true });
    }

    if (!canActOnTarget(interaction.guild.members.me, targetMember, interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot kick this user. They may have higher permissions.')], ephemeral: true });
    }

    if (!targetMember.kickable) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'I cannot kick this user. They may have higher permissions than me.')], ephemeral: true });
    }

    // DM the user before kicking
    try {
      await targetUser.send(
        `👢 **You have been kicked from ${interaction.guild.name}**\n\n` +
        `**Reason:** ${reason}\n` +
        `**Moderator:** ${interaction.user.tag}\n\n` +
        (db.ensureGuild(guildId).appeal_invite
          ? `If you believe this was a mistake, you can appeal here: ${db.ensureGuild(guildId).appeal_invite}`
          : '')
      );
    } catch (dmErr) {
      // DM may be disabled
    }

    // Execute kick
    await targetMember.kick(reason);

    // Log to database
    db.addAuditLog(guildId, 'KICK', interaction.user.id, targetUser.id, reason, '{}');
    logger.moderation('KICK', interaction.user.id, targetUser.id, reason, guildId);

    await interaction.reply({
      embeds: [successEmbed('User Kicked',
        `${targetUser.tag} has been kicked.\n` +
        `**Reason:** ${reason}`
      )],
    });
  },
};
