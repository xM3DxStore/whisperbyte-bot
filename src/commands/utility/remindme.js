const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');

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
        embeds: [errorEmbed('Invalid Time', 'Use format like `30m`, `2h`, `1d`. Max: 7 days.')],
        ephemeral: true,
      });
    }

    if (ms > 7 * 86400000) {
      return interaction.reply({
        embeds: [errorEmbed('Too Long', 'Maximum reminder time is 7 days.')],
        ephemeral: true,
      });
    }

    const key = `${interaction.user.id}_${Date.now()}`;
    const timeout = setTimeout(async () => {
      try {
        await interaction.user.send({
          embeds: [infoEmbed('⏰ Reminder', `You asked me to remind you:\n\n**${message}**\n\n*(Set ${timeStr} ago)*`)],
        });
      } catch (err) {}
      reminders.delete(key);
    }, ms);

    reminders.set(key, { timeout, userId: interaction.user.id, message, expires: Date.now() + ms });

    const date = new Date(Date.now() + ms);
    const timeDisplay = date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    await interaction.reply({
      embeds: [successEmbed('Reminder Set', `I'll DM you at **${timeDisplay}** with:\n\n**${message}**`)],
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
};
