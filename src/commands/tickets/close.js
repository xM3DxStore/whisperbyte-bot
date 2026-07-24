const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close a ticket quickly')
    .addStringOption(opt => opt
      .setName('ticket-id')
      .setDescription('Ticket ID to close (auto-detects if in ticket channel)')
    )
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for closing')
      .setMaxLength(500)
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let ticketId = interaction.options.getString('ticket-id');
    const reason = interaction.options.getString('reason') || '';

    if (!ticketId) {
      const tickets = db.getAllTickets(interaction.guild.id, 'OPEN');
      const channelTicket = tickets.find(t => t.channel_id === interaction.channel.id);
      if (channelTicket) {
        ticketId = channelTicket.ticket_id;
      }
    }

    if (!ticketId) {
      return interaction.editReply({
        embeds: [errorEmbed('Error', 'No ticket ID provided and this channel is not a ticket channel.')],
      });
    }

    const ticket = db.getTicket(ticketId);
    if (!ticket) {
      return interaction.editReply({ embeds: [errorEmbed('Error', `Ticket ${ticketId} not found.`)] });
    }

    if (ticket.status === 'CLOSED') {
      return interaction.editReply({ embeds: [errorEmbed('Error', `Ticket ${ticketId} is already closed.`)] });
    }

    const isStaff = interaction.member.roles.cache.some(r =>
      r.name === 'Support Team' || r.name === 'Administrator'
    );
    if (!isStaff && interaction.member.id !== ticket.creator_id) {
      return interaction.editReply({ embeds: [errorEmbed('Permission Denied', 'Only the ticket creator or staff can close this ticket.')] });
    }

    try {
      db.updateTicket(ticketId, { status: 'CLOSED' });

      db.addAuditLog(interaction.guild.id, 'TICKET_CLOSE', interaction.user.id, ticket.creator_id,
        `Closed ticket ${ticketId}${reason ? `: ${reason}` : ''}`,
        JSON.stringify({ ticketId })
      );

      logger.info(`Ticket ${ticketId} closed by ${interaction.user.id}`);

      await interaction.editReply({
        embeds: [successEmbed('Ticket Closed',
          `Ticket **${ticketId}** has been closed.\n` +
          `─────────────────────────\n` +
          (reason ? `📝  Reason: ${reason}\n` : '') +
          `⚠️  This channel will be deleted automatically in **30 seconds**.`
        )],
      });

      if (ticket.channel_id) {
        const channel = interaction.guild.channels.cache.get(ticket.channel_id);
        if (channel) {
          await channel.send({
            embeds: [successEmbed('Ticket Closed',
              `This ticket has been closed by ${interaction.user.tag}.\n` +
              `─────────────────────────\n` +
              (reason ? `📝  Reason: ${reason}\n` : '') +
              `⚠️  This channel will be deleted automatically in **30 seconds**.`
            )],
          });

          setTimeout(async () => {
            try { await channel.delete(`Ticket ${ticketId} closed`); } catch (err) {}
          }, 30000);
        }
      }
    } catch (error) {
      await interaction.editReply({ embeds: [errorEmbed('Error', error.message)] });
    }
  },
};
