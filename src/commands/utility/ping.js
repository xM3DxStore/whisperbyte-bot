const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and API response time'),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const sent = await interaction.reply({ embeds: [infoEmbed('🏓 Pinging...', 'Calculating...')], fetchReply: true });

    const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = interaction.client.ws.ping;

    let wsStatus = '🟢';
    if (wsLatency > 200) wsStatus = '🟡';
    if (wsLatency > 500) wsStatus = '🔴';

    let apiStatus = '🟢';
    if (apiLatency > 300) apiStatus = '🟡';
    if (apiLatency > 600) apiStatus = '🔴';

    await interaction.editReply({
      embeds: [infoEmbed('🏓 Pong!',
        `${wsStatus} **WebSocket:** ${wsLatency}ms\n` +
        `${apiStatus} **API:** ${apiLatency}ms\n\n` +
        `**Uptime:** ${this.formatUptime(interaction.client.uptime)}`
      )],
    });
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
