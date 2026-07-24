const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-payment')
    .setDescription('Manage payment information for a ticket')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addSubcommand(sub => sub
      .setName('record')
      .setDescription('Record payment information')
      .addStringOption(opt => opt
        .setName('ticket_id')
        .setDescription('Ticket ID')
        .setMaxLength(30)
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('method')
        .setDescription('Payment method (e.g., PayPal, Stripe, Crypto)')
        .setMaxLength(50)
        .setRequired(true)
      )
      .addNumberOption(opt => opt
        .setName('amount')
        .setDescription('Amount paid')
        .setMinValue(0)
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('currency')
        .setDescription('Currency (default: USD)')
        .setMaxLength(10)
      )
    )
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('View payment status for a ticket')
      .addStringOption(opt => opt
        .setName('ticket_id')
        .setDescription('Ticket ID')
        .setMaxLength(30)
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('complete')
      .setDescription('Mark an order as complete/pending')
      .addStringOption(opt => opt
        .setName('ticket_id')
        .setDescription('Ticket ID')
        .setMaxLength(30)
        .setRequired(true)
      )
      .addBooleanOption(opt => opt
        .setName('is_complete')
        .setDescription('Is the order complete?')
        .setRequired(true)
      )
    ),

  rateLimit: 'SENSITIVE',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    switch (subcommand) {
      case 'record':
        return this.recordPayment(interaction, guildId);
      case 'status':
        return this.viewStatus(interaction, guildId);
      case 'complete':
        return this.toggleComplete(interaction, guildId);
    }
  },

  async recordPayment(interaction, guildId) {
    const ticketId = interaction.options.getString('ticket_id');
    const method = interaction.options.getString('method');
    const amount = interaction.options.getNumber('amount');
    const currency = interaction.options.getString('currency') || 'USD';

    const ticket = db.getTicket(ticketId);
    if (!ticket) {
      return interaction.reply({ embeds: [errorEmbed('Ticket Not Found', `No ticket found with ID \`${ticketId}\`.`)], ephemeral: true });
    }

    // Find or create order for this ticket
    let orders = db.getTicketOrders(ticketId);
    let order;
    if (orders.length === 0) {
      order = db.createOrder(ticketId, '{}', '');
    } else {
      order = orders[0];
    }

    // Update payment info
    db.updateOrder(order.id, {
      payment_method: method,
      payment_amount: amount,
      payment_currency: currency,
      payment_status: 'PAID',
    });

    // Log
    db.addAuditLog(guildId, 'PAYMENT_RECORDED', interaction.user.id, ticket.creator_id,
      `Payment recorded: ${method} ${amount} ${currency}`,
      JSON.stringify({ ticketId, method, amount, currency })
    );
    logger.moderation('PAYMENT', interaction.user.id, null, `$${amount} ${currency} via ${method} for ${ticketId}`, guildId);

    await interaction.reply({
      embeds: [successEmbed('Payment Recorded',
        `Payment has been successfully logged to this ticket.\n` +
        `─────────────────────────\n\n` +
        `📌  Ticket:    ${ticketId}\n` +
        `💳  Method:    ${method}\n` +
        `💰  Amount:    ${amount.toFixed(2)} ${currency}\n` +
        `📅  Status:    PAID\n` +
        `👤  Recorded by: ${interaction.user}`
      )],
    });
  },

  async viewStatus(interaction, guildId) {
    const ticketId = interaction.options.getString('ticket_id');
    const ticket = db.getTicket(ticketId);

    if (!ticket) {
      return interaction.reply({ embeds: [errorEmbed('Error', `Ticket ${ticketId} not found.`)], ephemeral: true });
    }

    const orders = db.getTicketOrders(ticketId);

    if (orders.length === 0) {
      return interaction.reply({
        embeds: [infoEmbed('💳 Payment Status',
          `**Ticket:** ${ticketId}\n` +
          `**Order:** No order recorded yet.\n\n` +
          '💡 **Tip:** Use `/ticket-payment record` to add payment information to this ticket.'
        )],
        ephemeral: true,
      });
    }

    const order = orders[0];
    const paymentMethod = order.payment_method || 'Not recorded';
    const paymentAmount = order.payment_amount ? `$${order.payment_amount.toFixed(2)} ${order.payment_currency || 'USD'}` : 'Not recorded';
    const paymentStatus = order.payment_status || 'N/A';

    const embed = infoEmbed('💳 Payment & Order Status',
      `**Ticket:**  ${ticketId}\n` +
      `**Status:**   ${ticket.status}\n` +
      `─────────────────────────\n\n` +
      `📦 **Order Details**\n` +
      `${order.order_details || 'N/A'}\n\n` +
      `💳 **Payment Information**\n` +
      `•  Method:  ${paymentMethod}\n` +
      `•  Amount:  ${paymentAmount}\n` +
      `•  Status:  ${paymentStatus}\n\n` +
      `✅ **Order Complete:** ${order.is_complete ? 'Yes' : 'No'}\n` +
      `📋 **Order Status:** ${order.order_status}`
    );

    await interaction.reply({ embeds: [embed] });
  },

  async toggleComplete(interaction, guildId) {
    const ticketId = interaction.options.getString('ticket_id');
    const isComplete = interaction.options.getBoolean('is_complete');

    const ticket = db.getTicket(ticketId);
    if (!ticket) {
      return interaction.reply({ embeds: [errorEmbed('Error', `Ticket ${ticketId} not found.`)], ephemeral: true });
    }

    let orders = db.getTicketOrders(ticketId);
    if (orders.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'No order found for this ticket. Record a payment first.')], ephemeral: true });
    }

    const updated = interaction.client.ticketManager.setOrderComplete(orders[0].id, isComplete);

    // Auto-update ticket status
    if (isComplete) {
      interaction.client.ticketManager.updateStatus(ticketId, 'RESOLVED');
    }

    db.addAuditLog(guildId, 'ORDER_STATUS', interaction.user.id, ticket.creator_id,
      `Order marked as ${isComplete ? 'complete' : 'incomplete'}`,
      JSON.stringify({ ticketId, isComplete })
    );

    await interaction.reply({
      embeds: [successEmbed(
        isComplete ? '✅ Order Completed' : '❌ Order Marked Incomplete',
        `**Ticket:** ${ticketId}\n` +
        `The order has been marked as **${isComplete ? 'COMPLETE' : 'INCOMPLETE'}**.`
      )],
    });
  },
};
