const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { canActOnTarget } = require('../../utils/permissions');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nick')
    .setDescription('Change a user\'s nickname')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageNicknames)
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('User to change nickname for')
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('nickname')
      .setDescription('New nickname (leave empty to reset)')
      .setMaxLength(32)
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const nickname = interaction.options.getString('nickname') || '';
    const targetMember = interaction.guild.members.cache.get(targetUser.id);

    if (!targetMember) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'User not found in this server.')], ephemeral: true });
    }

    if (!canActOnTarget(interaction.guild.members.me, targetMember, interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot change this user\'s nickname. They may have higher permissions.')], ephemeral: true });
    }

    if (!targetMember.manageable) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'I cannot change this user\'s nickname. They may have higher permissions than me.')], ephemeral: true });
    }

    const oldNick = targetMember.nickname || targetUser.username;

    try {
      await targetMember.setNickname(nickname || null, `Changed by ${interaction.user.tag}`);

      const guildId = interaction.guild.id;
      db.addAuditLog(guildId, 'NICKNAME_CHANGE', interaction.user.id, targetUser.id, `Changed nickname from "${oldNick}" to "${nickname || targetUser.username}"`, '{}');
      logger.moderation('NICKNAME_CHANGE', interaction.user.id, targetUser.id, `Changed nickname from "${oldNick}" to "${nickname || targetUser.username}"`, guildId);

      const description = nickname
        ? `Changed **${targetUser.tag}**'s nickname from \`${oldNick}\` to \`${nickname}\``
        : `Reset **${targetUser.tag}**'s nickname from \`${oldNick}\` to \`${targetUser.username}\``;

      await interaction.reply({ embeds: [successEmbed('Nickname Changed', description)] });
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed('Error', `Failed to change nickname: ${error.message}`)], ephemeral: true });
    }
  },
};
