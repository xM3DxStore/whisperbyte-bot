const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a rich embed announcement')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addStringOption(opt => opt
      .setName('title')
      .setDescription('Embed title')
      .setRequired(true)
      .setMaxLength(256)
    )
    .addStringOption(opt => opt
      .setName('description')
      .setDescription('Embed description')
      .setRequired(true)
      .setMaxLength(4096)
    )
    .addStringOption(opt => opt
      .setName('color')
      .setDescription('Embed color (hex like #FF0000)')
      .setMaxLength(7)
    )
    .addChannelOption(opt => opt
      .setName('channel')
      .setDescription('Channel to send to (defaults to current)')
    )
    .addStringOption(opt => opt
      .setName('footer')
      .setDescription('Embed footer text')
      .setMaxLength(2048)
    )
    .addStringOption(opt => opt
      .setName('image')
      .setDescription('Image URL')
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const colorHex = interaction.options.getString('color');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const footer = interaction.options.getString('footer');
    const imageUrl = interaction.options.getString('image');

    let color = Colors.Blurple;
    if (colorHex) {
      const parsed = parseInt(colorHex.replace('#', ''), 16);
      if (!isNaN(parsed)) color = parsed;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();

    if (footer) embed.setFooter({ text: footer });
    if (imageUrl) embed.setImage(imageUrl);

    try {
      await channel.send({ embeds: [embed] });

      if (channel.id !== interaction.channel.id) {
        await interaction.reply({
          embeds: [successEmbed('Embed Sent', `Embed sent to ${channel}`)],
          ephemeral: true,
        });
      } else {
        await interaction.reply({ embeds: [successEmbed('Embed Sent', 'Embed posted to this channel.')], ephemeral: true });
      }
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed('Error', `Failed to send embed: ${error.message}`)],
        ephemeral: true,
      });
    }
  },
};
