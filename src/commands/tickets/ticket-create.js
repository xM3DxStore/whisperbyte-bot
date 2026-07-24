const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-create')
    .setDescription('Create a new support ticket')
    .addStringOption(opt => opt
      .setName('subject')
      .setDescription('Brief summary of your issue')
      .setMinLength(3)
      .setMaxLength(100)
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('description')
      .setDescription('Detailed description of your issue')
      .setMinLength(10)
      .setMaxLength(2000)
    )
    .addIntegerOption(opt => opt
      .setName('priority')
      .setDescription('Priority level')
      .addChoices(
        { name: 'Low', value: 1 },
        { name: 'Medium', value: 2 },
        { name: 'High', value: 3 },
        { name: 'Critical', value: 4 },
      )
    ),

  rateLimit: 'TICKET_CREATE',

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const subject = interaction.options.getString('subject');
    const description = interaction.options.getString('description') || '';
    const priority = interaction.options.getInteger('priority') || 1;

    const priorityLabels = { 1: '🟢 Low', 2: '🟡 Medium', 3: '🟠 High', 4: '🔴 Critical' };

    try {
      const result = await interaction.client.ticketManager.createTicket(interaction, {
        subject,
        description,
        priority,
      });

      await interaction.editReply({
        embeds: [successEmbed('Ticket Created Successfully',
          `Your support ticket has been opened and assigned to a private channel.\n` +
          `─────────────────────────\n\n` +
          `📌  Ticket ID:   ${result.ticket.ticket_id}\n` +
          `📝  Subject:     ${subject}\n` +
          `⚡  Priority:    ${priorityLabels[priority] || '🟢 Low'}\n` +
          `💬  Channel:     ${result.channel}\n\n` +
          `A support representative will respond shortly.`
        )],
      });
    } catch (error) {
      await interaction.editReply({
        embeds: [errorEmbed('Ticket Creation Failed',
          `An error occurred while creating your ticket.\n` +
          `─────────────────────────\n\n` +
          `${error.message}\n\n` +
          `If this persists, please contact a server administrator.`
        )],
      });
    }
  },
};
