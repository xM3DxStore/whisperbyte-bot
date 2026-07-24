const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, ticketEmbed, listEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');
const { formatDate } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-status')
    .setDescription('View or update ticket status')
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View details of a specific ticket')
      .addStringOption(opt => opt
        .setName('ticket_id')
        .setDescription('Ticket ID to view')
        .setMaxLength(30)
      )
    )
    .addSubcommand(sub => sub
      .setName('update')
      .setDescription('Update ticket status')
      .addStringOption(opt => opt
        .setName('ticket_id')
        .setDescription('Ticket ID')
        .setMaxLength(30)
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('status')
        .setDescription('New status')
        .setRequired(true)
        .addChoices(
          { name: '🟢 Open', value: 'OPEN' },
          { name: '🟡 Pending', value: 'PENDING' },
          { name: '🔵 Resolved', value: 'RESOLVED' },
          { name: '🔴 Closed', value: 'CLOSED' },
        )
      )
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all tickets')
      .addStringOption(opt => opt
        .setName('filter')
        .setDescription('Filter tickets by status')
        .addChoices(
          { name: 'All', value: 'ALL' },
          { name: '🟢 Open', value: 'OPEN' },
          { name: '🟡 Pending', value: 'PENDING' },
          { name: '🔵 Resolved', value: 'RESOLVED' },
          { name: '🔴 Closed', value: 'CLOSED' },
        )
      )
    )
    .addSubcommand(sub => sub
      .setName('my')
      .setDescription('View your own tickets')
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    switch (subcommand) {
      case 'view':
        return this.viewTicket(interaction, guildId);
      case 'update':
        return this.updateStatus(interaction, guildId);
      case 'list':
        return this.listTickets(interaction, guildId);
      case 'my':
        return this.myTickets(interaction, guildId);
    }
  },

  async viewTicket(interaction, guildId) {
    let ticketId = interaction.options.getString('ticket_id');

    // If no ticket ID, try to find from channel
    if (!ticketId) {
      const allTickets = db.getAllTickets(guildId, null);
      const channelTicket = allTickets.find(t => t.channel_id === interaction.channel.id);
      if (channelTicket) ticketId = channelTicket.ticket_id;
    }

    if (!ticketId) {
      return interaction.reply({
        embeds: [errorEmbed('No Ticket Found', 'Please provide a ticket ID or run this command inside a ticket channel.')],
        ephemeral: true,
      });
    }

    const info = db.getTicketInfo(ticketId);
    if (!info || !info.ticket) {
      return interaction.reply({ embeds: [errorEmbed('Ticket Not Found', `No ticket found with ID \`${ticketId}\`.`)], ephemeral: true });
    }

    const order = info.orders.length > 0 ? info.orders[0] : null;
    const embed = ticketEmbed(info.ticket, order);

    // Add message count if available
    if (info.messages.length > 0) {
      embed.addFields({ name: '💬 Transcript', value: `${info.messages.length} message${info.messages.length !== 1 ? 's' : ''} recorded`, inline: true });
    }

    await interaction.reply({ embeds: [embed] });
  },

  async updateStatus(interaction, guildId) {
    const ticketId = interaction.options.getString('ticket_id');
    const status = interaction.options.getString('status');

    const isStaff = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages);
    if (!isStaff) {
      return interaction.reply({ embeds: [errorEmbed('Access Denied', 'Only staff members with Manage Messages permission can update ticket status.')], ephemeral: true });
    }

    try {
      const ticket = interaction.client.ticketManager.updateStatus(ticketId, status);

      // Log
      db.addAuditLog(guildId, 'TICKET_UPDATE', interaction.user.id, ticket.creator_id,
        `Status updated to ${status}`,
        JSON.stringify({ ticketId, status })
      );

      await interaction.reply({
        embeds: [successEmbed('Status Updated', `Ticket ${ticketId} status has been changed to ${status}.`)],
      });

      // Notify in ticket channel
      if (ticket.channel_id) {
        const channel = interaction.guild.channels.cache.get(ticket.channel_id);
        if (channel) {
          await channel.send({
            embeds: [infoEmbed('Status Update', `Ticket status has been updated to **${status}** by ${interaction.user}.`)],
          });
        }
      }
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed('Error', error.message)], ephemeral: true });
    }
  },

  async listTickets(interaction, guildId) {
    const filter = interaction.options.getString('filter') || 'ALL';
    const tickets = filter === 'ALL'
      ? db.getAllTickets(guildId, null)
      : db.getAllTickets(guildId, filter);

    if (tickets.length === 0) {
      return interaction.reply({
        embeds: [infoEmbed('No Tickets Found',
          filter === 'ALL'
            ? 'No tickets have been created yet.\n\n' +
              '💡 **Tip:** Use `/ticket-create` to open your first support ticket, or ask a team member to run `/ticket-panel setup` for automatic configuration.'
            : `No tickets with status \`${filter}\` were found.\n\n` +
              '💡 **Tip:** Try a different filter or use `ALL` to see every ticket regardless of status.'
        )],
        ephemeral: true,
      });
    }

    const statusEmoji = { OPEN: '🟢', PENDING: '🟡', RESOLVED: '🔵', CLOSED: '🔴' };

    const items = tickets.slice(0, 20).map((t, i) =>
      `\`${i + 1}.\`  ${statusEmoji[t.status] || '⚪'} **${t.status}**  ·  \`${t.ticket_id}\`  ·  ${t.subject.substring(0, 40)}  ·  <@${t.creator_id}>  ·  ${formatDate(t.created_at)}`
    );

    const embed = listEmbed(
      `All Tickets — ${tickets.length} total`,
      items,
      1,
      1
    );

    await interaction.reply({ embeds: [embed] });
  },

  async myTickets(interaction, guildId) {
    const tickets = db.getUserTickets(guildId, interaction.user.id);

    if (tickets.length === 0) {
      return interaction.reply({
        embeds: [infoEmbed('No Tickets Found',
          'You haven\'t created any tickets yet.\n\n' +
          '💡 **Tip:** Use `/ticket-create` to open a support ticket and get help from our team.'
        )],
        ephemeral: true,
      });
    }

    const statusEmoji = { OPEN: '🟢', PENDING: '🟡', RESOLVED: '🔵', CLOSED: '🔴' };

    const items = tickets.map((t, i) =>
      `\`${i + 1}.\`  ${statusEmoji[t.status] || '⚪'} **${t.status}**  ·  \`${t.ticket_id}\`  ·  ${t.subject.substring(0, 40)}  ·  ${formatDate(t.created_at)}`
    );

    const embed = listEmbed(
      `Your Tickets — ${tickets.length} total`,
      items,
      1,
      1
    );

    await interaction.reply({ embeds: [embed] });
  },
};
