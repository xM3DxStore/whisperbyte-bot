const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, BRAND } = require('../../utils/embedBuilder');

const reminders = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remindme')
    .setDescription('Set a reminder that DMs you later')
    .addStringOption(opt => opt
      .setName('time')
      .setDescription('When to remind you (e.g., 30m, 2h, 1d)')
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('message')
      .setDescription('What to remind you about')
      .setRequired(true)
      .setMaxLength(500)
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const timeStr = interaction.options.getString('time');
    const message = interaction.options.getString('message');

    const ms = this.parseDuration(timeStr);
    if (!ms) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Time Format', 'Use a format like 30m, 2h, or 1d. Maximum duration is 7 days.')],
        ephemeral: true,
      });
    }

    if (ms > 7 * 86400000) {
      return interaction.reply({
        embeds: [errorEmbed('Duration Too Long', 'The maximum reminder duration is 7 days.')],
        ephemeral: true,
      });
    }

    const key = `${interaction.user.id}_${Date.now()}`;
    const timeout = setTimeout(async () => {
      try {
        await interaction.user.send({
          embeds: [infoEmbed('⏰ Reminder', `You asked me to remind you:\n\n**${message}**\n\n*Set ${timeStr} ago*`)],
        });
      } catch (err) {}
      reminders.delete(key);
    }, ms);

    reminders.set(key, { timeout, userId: interaction.user.id, message, expires: Date.now() + ms });

    const date = new Date(Date.now() + ms);
    const timeDisplay = date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const durationDisplay = this.formatDuration(ms);

    await interaction.reply({
      embeds: [successEmbed('Reminder Scheduled', `I'll DM you at **${timeDisplay}** (${durationDisplay} from now)\n\n⏰ ${message}`)],
      ephemeral: true,
    });
  },

  parseDuration(duration) {
    const match = duration.toLowerCase().match(/^(\d+)\s*(m|min|minutes?|h|hr|hours?|d|days?)$/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2][0];
    const multipliers = { m: 60000, h: 3600000, d: 86400000 };
    return value * (multipliers[unit] || 60000);
  },

  formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);

    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  },
};
