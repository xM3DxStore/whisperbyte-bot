const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-delete')
    .setDescription('Close and delete a ticket')
    .addStringOption(opt => opt
      .setName('ticket_id')
      .setDescription('Ticket ID to close (e.g., TKT-...)')
      .setMaxLength(30)
    )
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for closing')
      .setMaxLength(500)
    ),

  rateLimit: 'TICKET_CREATE',

  async execute(interaction) {
    let ticketId = interaction.options.getString('ticket_id');
    const reason = interaction.options.getString('reason') || '';

    // If no ticket ID provided, try to find from channel name
    if (!ticketId) {
      const db = require('../../database');
      const allTickets = db.getAllTickets(interaction.guild.id, null);
      const channelTicket = allTickets.find(t => t.channel_id === interaction.channel.id);

      if (channelTicket) {
        ticketId = channelTicket.ticket_id;
      } else {
        return interaction.reply({
          embeds: [errorEmbed('No Ticket Found', 'Could not detect a ticket in this channel.\nPlease provide a ticket ID manually.')],
          ephemeral: true,
        });
      }
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await interaction.client.ticketManager.closeTicket(interaction, ticketId, reason);
      await interaction.editReply({
        embeds: [successEmbed('Ticket Closed & Archived',
          `Ticket **${ticketId}** has been permanently closed and archived.\n` +
          `─────────────────────────\n\n` +
          `📦  Transcript saved to database\n` +
          `🔔  Creator notified of closure\n` +
          `⚠️  This channel will be deleted automatically in **30 seconds**`
        )],
      });
    } catch (error) {
      await interaction.editReply({
        embeds: [errorEmbed('Failed to Close Ticket', error.message)],
      });
    }
  },
};
