const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set or remove slowmode on a channel')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .addIntegerOption(opt => opt
      .setName('seconds')
      .setDescription('Slowmode duration in seconds (0 to disable)')
      .setMinValue(0)
      .setMaxValue(21600)
      .setRequired(true)
    )
    .addChannelOption(opt => opt
      .setName('channel')
      .setDescription('Channel to apply slowmode to (default: current)')
    )
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for the slowmode')
      .setMaxLength(500)
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!channel.isTextBased()) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'The specified channel is not a text channel.')], ephemeral: true });
    }

    await channel.setRateLimitPerUser(seconds, reason);

    const response = seconds > 0
      ? `${channel} now has a **${seconds} second** slowmode.`
      : `Slowmode has been **disabled** on ${channel}.`;

    await interaction.reply({
      embeds: [successEmbed(
        seconds > 0 ? 'Slowmode Enabled' : 'Slowmode Disabled',
        `${response}\n**Reason:** ${reason}`
      )],
    });
  },
};
