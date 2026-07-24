const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { infoEmbed, progressBar, BRAND } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and API response time'),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const sent = await interaction.reply({ embeds: [infoEmbed('🏓 Pinging...', 'Calculating latency metrics...')], fetchReply: true });

    const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = interaction.client.ws.ping;
    const uptime = this.formatUptime(interaction.client.uptime);

    const wsBar = progressBar(Math.max(0, 500 - wsLatency), 500, 10);
    const apiBar = progressBar(Math.max(0, 600 - apiLatency), 600, 10);

    let wsStatus, wsColor;
    if (wsLatency <= 150) { wsStatus = '🟢 Excellent'; wsColor = 'Excellent'; }
    else if (wsLatency <= 300) { wsStatus = '🟡 Good'; wsColor = 'Good'; }
    else if (wsLatency <= 500) { wsStatus = '🟠 Fair'; wsColor = 'Fair'; }
    else { wsStatus = '🔴 Poor'; wsColor = 'Poor'; }

    let apiStatus, apiColor;
    if (apiLatency <= 150) { apiStatus = '🟢 Excellent'; apiColor = 'Excellent'; }
    else if (apiLatency <= 300) { apiStatus = '🟡 Good'; apiColor = 'Good'; }
    else if (apiLatency <= 600) { apiStatus = '🟠 Fair'; apiColor = 'Fair'; }
    else { apiStatus = '🔴 Poor'; apiColor = 'Poor'; }

    const overallHealth = (wsColor === 'Excellent' || wsColor === 'Good') && (apiColor === 'Excellent' || apiColor === 'Good')
      ? '🟢 Operational'
      : (wsColor === 'Poor' || apiColor === 'Poor')
        ? '🔴 Degraded'
        : '🟡 Minor Issues';

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setColor(0x5865F2)
      .addFields(
        { name: `${BRAND.thinDivider}`, value: '\u200B', inline: false },
        {
          name: '📡 WebSocket',
          value: `\`\`\`${wsLatency}ms\`\`\`${wsBar} ${wsStatus}`,
          inline: true,
        },
        {
          name: '🌐 API',
          value: `\`\`\`${apiLatency}ms\`\`\`${apiBar} ${apiStatus}`,
          inline: true,
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: true,
        },
        {
          name: `${BRAND.thinDivider}`,
          value: '\u200B',
          inline: false,
        },
        {
          name: '⏱️ Uptime',
          value: `\`${uptime}\``,
          inline: true,
        },
        {
          name: '📊 Status',
          value: overallHealth,
          inline: true,
        },
      )
      .setFooter({ text: BRAND.name, iconURL: BRAND.icon || undefined })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  },
};
