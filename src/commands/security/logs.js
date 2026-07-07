const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { infoEmbed, errorEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('View moderation action history')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addIntegerOption(opt => opt
      .setName('limit')
      .setDescription('Number of logs to show (default 10, max 25)')
      .setMinValue(1)
      .setMaxValue(25)
    )
    .addStringOption(opt => opt
      .setName('action')
      .setDescription('Filter by action type')
      .addChoices(
        { name: 'All', value: 'ALL' },
        { name: 'Mute/Timeout', value: 'MUTE' },
        { name: 'Kick', value: 'KICK' },
        { name: 'Ban', value: 'BAN' },
        { name: 'Warn', value: 'WARN' },
        { name: 'Tickets', value: 'TICKET' },
      )
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const limit = interaction.options.getInteger('limit') || 10;
    const actionFilter = interaction.options.getString('action') || 'ALL';

    const logs = db.getAuditLogs(interaction.guild.id, limit * 2);

    let filtered = logs;
    if (actionFilter !== 'ALL') {
      filtered = logs.filter(l => l.action.startsWith(actionFilter));
    }

    filtered = filtered.slice(0, limit);

    if (filtered.length === 0) {
      return interaction.reply({
        embeds: [infoEmbed('Audit Logs', 'No audit logs found for the specified filter.')],
        ephemeral: true,
      });
    }

    const lines = filtered.map(log => {
      const date = new Date(log.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const mod = log.moderator_id ? `<@${log.moderator_id}>` : 'System';
      const target = log.target_id ? `<@${log.target_id}>` : '-';
      const reason = log.reason ? log.reason.substring(0, 60) : '';
      return `**${log.action}** | ${date}\nMod: ${mod} → Target: ${target}${reason ? `\nReason: ${reason}` : ''}`;
    });

    const embed = infoEmbed(
      `📋 Audit Logs (${filtered.length})`,
      lines.join('\n\n')
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
