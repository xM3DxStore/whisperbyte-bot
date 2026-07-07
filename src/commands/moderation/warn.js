const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, userInfoEmbed } = require('../../utils/embedBuilder');
const { canActOnTarget } = require('../../utils/permissions');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user for rule violations')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('User to warn')
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for the warning')
      .setMaxLength(1000)
      .setRequired(true)
    )
    .addIntegerOption(opt => opt
      .setName('severity')
      .setDescription('Severity of the warning')
      .addChoices(
        { name: 'Low', value: 1 },
        { name: 'Medium', value: 2 },
        { name: 'High', value: 3 },
      )
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const severity = interaction.options.getInteger('severity') || 1;
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    const guildId = interaction.guild.id;

    // Permission checks
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'You cannot warn yourself.')], ephemeral: true });
    }

    if (targetMember && !canActOnTarget(interaction.guild.members.me, targetMember, interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'Cannot warn this user. They may have higher permissions than the bot or you.')], ephemeral: true });
    }

    // Save warning to database
    db.addWarning(guildId, targetUser.id, interaction.user.id, reason, severity);

    // Log to audit
    db.addAuditLog(guildId, 'WARN', interaction.user.id, targetUser.id, reason, JSON.stringify({ severity }));

    logger.moderation('WARN', interaction.user.id, targetUser.id, reason, guildId);

    // Get total warnings count
    const warnings = db.getUserWarnings(guildId, targetUser.id, true);
    const warningCount = warnings.length;

    // DM the user
    try {
      await targetUser.send(
        `⚠️ **Warning from ${interaction.guild.name}**\n\n` +
        `**Moderator:** ${interaction.user.tag}\n` +
        `**Reason:** ${reason}\n` +
        `**Severity:** ${['', 'Low', 'Medium', 'High'][severity]}\n` +
        `**Warning #${warningCount}**\n\n` +
        `Please review the server rules to avoid further actions. Continued violations may result in a mute, kick, or ban.`
      );
    } catch (dmErr) {
      // DM may be disabled
    }

    await interaction.reply({
      embeds: [successEmbed('Warning Issued',
        `${targetUser.tag} has been warned.\n` +
        `**Reason:** ${reason}\n` +
        `**Warning #${warningCount}**`
      )],
    });
  },
};
