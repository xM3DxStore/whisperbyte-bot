const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages in the current channel')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addIntegerOption(opt => opt
      .setName('amount')
      .setDescription('Number of messages to delete (1-100)')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true)
    )
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('Only delete messages from this user')
    )
    .addStringOption(opt => opt
      .setName('filter')
      .setDescription('Filter messages to delete')
      .addChoices(
        { name: 'All Messages', value: 'all' },
        { name: 'Bot Messages', value: 'bots' },
        { name: 'Links Only', value: 'links' },
        { name: 'Images/Attachments', value: 'attachments' },
      )
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('user');
    const filter = interaction.options.getString('filter') || 'all';
    const channel = interaction.channel;

    await interaction.deferReply({ ephemeral: true });

    let messages = await channel.messages.fetch({ limit: 100 });
    let toDelete = [...messages.values()];

    // Apply user filter
    if (targetUser) {
      toDelete = toDelete.filter(m => m.author.id === targetUser.id);
    }

    // Apply content filter
    if (filter === 'bots') {
      toDelete = toDelete.filter(m => m.author.bot);
    } else if (filter === 'links') {
      toDelete = toDelete.filter(m => /https?:\/\/[^\s]+/i.test(m.content));
    } else if (filter === 'attachments') {
      toDelete = toDelete.filter(m => m.attachments.size > 0 || m.embeds.length > 0);
    }

    // Limit to requested amount
    toDelete = toDelete.slice(0, amount);

    if (toDelete.length === 0) {
      return interaction.editReply({
        embeds: [errorEmbed('No Messages', 'No messages matched the specified criteria.')],
        ephemeral: true,
      });
    }

    // Bulk delete (works for messages < 14 days old)
    const messageIds = toDelete.map(m => m.id);
    await channel.bulkDelete(messageIds, true).catch(async err => {
      // Fallback: delete one by one for older messages
      for (const msg of toDelete) {
        try {
          await msg.delete();
        } catch { break; }
      }
    });

    logger.moderation('PURGE', interaction.user.id, null,
      `Deleted ${toDelete.length} messages in #${channel.name}${targetUser ? ` from ${targetUser.tag}` : ''}`,
      interaction.guild.id
    );

    await interaction.editReply({
      embeds: [successEmbed('Messages Purged',
        `Deleted **${toDelete.length}** message(s) in ${channel}.` +
        `${targetUser ? `\n**User:** ${targetUser.tag}` : ''}` +
        `${filter !== 'all' ? `\n**Filter:** ${filter}` : ''}`
      )],
      ephemeral: true,
    });
  },
};
