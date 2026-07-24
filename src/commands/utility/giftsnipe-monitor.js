const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const giftSniper = require('../../services/giftSniper');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giftsnipe-monitor')
    .setDescription('Start or stop the passive gift link snipe monitor')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(opt => opt
      .setName('action')
      .setDescription('Start or stop the monitor')
      .addChoices(
        { name: 'Start', value: 'start' },
        { name: 'Stop', value: 'stop' },
        { name: 'Status', value: 'status' },
      )
      .setRequired(true)
    )
    .addChannelOption(opt => opt
      .setName('channel')
      .setDescription('Channel to post sniped codes and ping you (default: current)')
    ),

  async execute(interaction) {
    const action = interaction.options.getString('action');

    if (action === 'status') {
      const stats = giftSniper.getStats();
      const embed = new EmbedBuilder()
        .setTitle('🎁 Gift Snipe Monitor — Status')
        .setColor(stats.enabled ? Colors.Green : Colors.Grey)
        .setDescription(
          stats.enabled
            ? `> Monitor is currently active.\n\n─────────────────────────`
            : `> Monitor is currently inactive.\n\n─────────────────────────`
        )
        .addFields(
          { name: 'Status', value: stats.enabled ? '> 🟢 Running' : '> 🔴 Stopped', inline: true },
          { name: 'Target Channel', value: stats.targetChannelId ? `> <#${stats.targetChannelId}>` : '> None', inline: true },
          { name: 'Pinging', value: stats.ownerUserId ? `> <@${stats.ownerUserId}>` : '> None', inline: true },
          { name: '\u200B', value: '\u200B', inline: false },
          { name: 'Codes Seen', value: `> **${stats.seenCodes}**`, inline: true },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action === 'stop') {
      if (!giftSniper.isEnabled()) {
        return interaction.reply({ embeds: [errorEmbed('Not Running', 'The gift snipe monitor is not currently running.')], ephemeral: true });
      }
      giftSniper.disable();
      return interaction.reply({ embeds: [successEmbed('Monitor Stopped', 'The gift snipe monitor has been stopped.\nStart it again with action:Start.')], ephemeral: true });
    }

    if (giftSniper.isEnabled()) {
      return interaction.reply({ embeds: [errorEmbed('Already Running', 'The monitor is already running. Use `action:Stop` first to restart.')], ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel') || interaction.channel;

    giftSniper.configure({
      channelId: channel.id,
      ownerId: interaction.user.id,
    });

    const embed = new EmbedBuilder()
      .setTitle('🎁 Gift Snipe Monitor — Started!')
      .setColor(Colors.Green)
      .setDescription(
        `Monitoring **all servers** this bot is in for \`discord.gift/\` links.\n\n` +
        `─────────────────────────\n` +
        `> Target Channel: <#${channel.id}>\n` +
        `> Pinging: <@${interaction.user.id}>\n` +
        `> Mode: **Passive real-time scan**\n\n` +
        `When someone shares a gift link anywhere, I will check it instantly and post valid codes here.`
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    logger.info('GIFT_SNIPE_MONITOR_STARTED', {
      user: interaction.user.tag,
      guild: interaction.guild.id,
      channel: channel.id,
    });
  },
};
