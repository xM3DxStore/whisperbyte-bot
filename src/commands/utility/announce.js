const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');

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
      .setDescription('Announcement message content')
      .setMaxLength(2000)
      .setRequired(true)
    )
    .addChannelOption(opt => opt
      .setName('channel')
      .setDescription('Channel to send to (default: current)')
    )
    .addStringOption(opt => opt
      .setName('color')
      .setDescription('Embed color')
      .addChoices(
        { name: 'Blue', value: 'blue' },
        { name: 'Green', value: 'green' },
        { name: 'Red', value: 'red' },
        { name: 'Yellow', value: 'yellow' },
        { name: 'Purple', value: 'purple' },
        { name: 'Orange', value: 'orange' },
      )
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
    const colorOption = interaction.options.getString('color') || 'blue';
    const ping = interaction.options.getBoolean('ping') || false;

    if (!channel.isTextBased()) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'The specified channel is not a text channel.')], ephemeral: true });
    }

    const colorMap = {
      blue: 0x3498DB,
      green: 0x2ECC71,
      red: 0xE74C3C,
      yellow: 0xF1C40F,
      purple: 0x9B59B6,
      orange: 0xE67E22,
    };

    const embed = infoEmbed(`📢 ${title}`, message)
      .setColor(colorMap[colorOption] || 0x3498DB)
      .setFooter({ text: `Announcement by ${interaction.user.tag}` })
      .setTimestamp();

    const content = ping ? '@everyone' : '';

    await channel.send({ content, embeds: [embed] });

    await interaction.reply({
      embeds: [successEmbed('Announcement Sent',
        `Announcement sent to ${channel}.\n**Title:** ${title}`
      )],
      ephemeral: true,
    });
  },
};
