const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { successEmbed, errorEmbed, BRAND } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send an announcement to a channel')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(opt => opt
      .setName('title')
      .setDescription('Announcement title')
      .setMaxLength(200)
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('message')
      .setDescription('Announcement message content (supports bolds, spares, custom lines)')
      .setMaxLength(2000)
      .setRequired(true)
    )
    .addChannelOption(opt => opt
      .setName('channel')
      .setDescription('Channel to send to (default: current)')
    )
    .addStringOption(opt => opt
      .setName('color')
      .setDescription('Embed color (default: None)')
      .addChoices(
        { name: 'None / Default logo', value: 'none' },
        { name: 'Blue', value: 'blue' },
        { name: 'Green', value: 'green' },
        { name: 'Red', value: 'red' },
        { name: 'Yellow', value: 'yellow' },
        { name: 'Purple', value: 'purple' },
        { name: 'Orange', value: 'orange' },
        { name: 'Dark Grey', value: 'dark_grey' },
      )
    )
    .addStringOption(opt => opt
      .setName('image')
      .setDescription('Link to a large image to display inside the embed')
    )
    .addStringOption(opt => opt
      .setName('thumbnail')
      .setDescription('Link to a small thumbnail image logo')
    )
    .addStringOption(opt => opt
      .setName('footer')
      .setDescription('Custom footer message at the bottom')
    )
    .addBooleanOption(opt => opt
      .setName('ping')
      .setDescription('Add @everyone ping')
    ),

  rateLimit: 'SENSITIVE',

  async execute(interaction) {
    const title = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const colorOption = interaction.options.getString('color') || 'none';
    const image = interaction.options.getString('image');
    const thumbnail = interaction.options.getString('thumbnail');
    const footerText = interaction.options.getString('footer');
    const ping = interaction.options.getBoolean('ping') || false;

    if (!channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Channel', 'The selected channel is not a text-based channel.')],
        ephemeral: true,
      });
    }

    const colorMap = {
      blue: 0x3498DB,
      green: 0x2ECC71,
      red: 0xE74C3C,
      yellow: 0xF1C40F,
      purple: 0x9B59B6,
      orange: 0xE67E22,
      dark_grey: 0x2F3136,
    };

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(message.replace(/\\n/g, '\n'))
      .setTimestamp();

    if (colorOption !== 'none' && colorMap[colorOption]) {
      embed.setColor(colorMap[colorOption]);
    }

    if (image) {
      if (image.startsWith('http://') || image.startsWith('https://')) {
        embed.setImage(image);
      } else {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Image URL', 'Please provide a valid HTTP/HTTPS link for the image.')],
          ephemeral: true,
        });
      }
    }

    if (thumbnail) {
      if (thumbnail.startsWith('http://') || thumbnail.startsWith('https://')) {
        embed.setThumbnail(thumbnail);
      } else {
        return interaction.reply({
          embeds: [errorEmbed('Invalid Thumbnail URL', 'Please provide a valid HTTP/HTTPS link for the thumbnail.')],
          ephemeral: true,
        });
      }
    }

    if (footerText) {
      embed.setFooter({ text: footerText });
    } else {
      embed.setFooter({ text: `Announcement by ${interaction.user.tag}` });
    }

    const content = ping ? '@everyone' : '';

    await channel.send({ content, embeds: [embed] });

    await interaction.reply({
      embeds: [successEmbed('Announcement Delivered', `Successfully sent to ${channel}\nTitle: ${title}`)],
      ephemeral: true,
    });
  },
};
