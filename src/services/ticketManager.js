const { ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const config = require('../config');
const db = require('../database');
const { successEmbed, errorEmbed, infoEmbed, ticketEmbed } = require('../utils/embedBuilder');
const logger = require('./logger');

/**
 * Comprehensive Ticket Management System
 *
 * Features:
 * - Create tickets via commands or interactive panels
 * - Track order details, payment info, and completion status
 * - Support ticket priorities and assignment
 * - Auto-generate private ticket channels
 * - Role-based access control
 * - Message transcripts
 * - Persistent storage with full audit trail
 */
class TicketManager {
  constructor(client) {
    this.client = client;
  }

  /**
   * Create a new ticket.
   * @param {object} interaction - Discord interaction (command or button)
   * @param {object} options - Ticket options
   * @param {string} options.subject - Ticket subject
   * @param {string} [options.description] - Detailed description
   * @param {number} [options.priority] - Priority level (1-4)
   * @param {string} [options.orderDetails] - Order details as JSON string
   * @returns {Promise<object>} - Created ticket data
   */
  async createTicket(interaction, options) {
    const guild = interaction.guild;
    const member = interaction.member;
    const guildId = guild.id;

    // Ensure guild exists in DB
    db.ensureGuild(guildId);

    // Check max tickets per user
    const activeCount = db.getActiveTicketCount(guildId, member.id);
    if (activeCount >= config.tickets.maxPerUser) {
      throw new Error(`You already have ${activeCount} active tickets. Maximum is ${config.tickets.maxPerUser}.`);
    }

    // Get or create ticket category
    const category = await this._ensureCategory(guild);

    // Create ticket in database
    const ticket = db.createTicket(
      guildId,
      member.id,
      options.subject,
      options.description || '',
      options.priority || 1
    );

    // Create private ticket channel
    const channel = await this._createTicketChannel(guild, category, ticket, member);

    // Update ticket with channel ID
    db.updateTicket(ticket.ticket_id, { channel_id: channel.id });

    // Create initial order record if provided
    if (options.orderDetails) {
      db.createOrder(ticket.ticket_id, options.orderDetails, options.description || '');
    }

    // Log to audit
    db.addAuditLog(guildId, 'TICKET_CREATE', member.id, member.id,
      `Created ticket ${ticket.ticket_id}: ${options.subject}`,
      JSON.stringify({ ticketId: ticket.ticket_id, channelId: channel.id })
    );

    logger.info(`Ticket ${ticket.ticket_id} created by ${member.id} in ${guildId}`);

    return { ticket, channel };
  }

  /**
   * Close a ticket.
   */
  async closeTicket(interaction, ticketId, reason = '') {
    const guild = interaction.guild;
    const member = interaction.member;

    const ticket = db.getTicket(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found.`);

    if (ticket.status === 'CLOSED') {
      throw new Error(`Ticket ${ticketId} is already closed.`);
    }

    // Update ticket status
    db.updateTicket(ticketId, { status: 'CLOSED' });

    // Log to audit
    db.addAuditLog(guild.id, 'TICKET_CLOSE', member.id, ticket.creator_id,
      `Closed ticket ${ticketId}${reason ? `: ${reason}` : ''}`,
      JSON.stringify({ ticketId })
    );

    // If channel exists, send closing message and archive
    if (ticket.channel_id) {
      const channel = guild.channels.cache.get(ticket.channel_id);
      if (channel) {
        const embed = successEmbed(
          'Ticket Closed',
          `Ticket ${ticketId} has been closed by ${member.user.tag}.${reason ? `\n**Reason:** ${reason}` : ''}`
        );
        await channel.send({ embeds: [embed] });

        // Save transcript before deleting
        await this._saveTranscript(ticket);

        // Auto-delete channel after 30 seconds
        setTimeout(async () => {
          try {
            await channel.delete(`Ticket ${ticketId} closed by ${member.user.tag}`);
          } catch (err) {
            logger.warn(`Could not delete ticket channel ${channel.id}`, { error: err.message });
          }
        }, 30000);
      }
    }

    logger.info(`Ticket ${ticketId} closed by ${member.id}`);

    return ticket;
  }

  /**
   * Re-open a closed ticket.
   */
  async reopenTicket(interaction, ticketId) {
    const ticket = db.getTicket(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found.`);

    if (ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED') {
      throw new Error(`Ticket ${ticketId} is not closed/resolved.`);
    }

    db.updateTicket(ticketId, { status: 'OPEN', closed_at: null });

    db.addAuditLog(interaction.guild.id, 'TICKET_REOPEN', interaction.member.id, ticket.creator_id,
      `Reopened ticket ${ticketId}`,
      JSON.stringify({ ticketId })
    );

    return db.getTicket(ticketId);
  }

  /**
   * Update ticket status.
   */
  updateStatus(ticketId, status) {
    const validStatuses = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Valid: ${validStatuses.join(', ')}`);
    }
    return db.updateTicket(ticketId, { status });
  }

  /**
   * Assign a ticket to a staff member.
   */
  assignTicket(ticketId, moderatorId) {
    return db.updateTicket(ticketId, { assigned_to: moderatorId, status: 'PENDING' });
  }

  /**
   * Add order information to a ticket.
   */
  addOrder(ticketId, orderDetails, paymentMethod = null, paymentAmount = null) {
    const order = db.createOrder(ticketId, orderDetails, '');
    if (paymentMethod || paymentAmount !== null) {
      db.updateOrder(order.id, {
        payment_method: paymentMethod,
        payment_amount: paymentAmount,
      });
    }
    return db.getOrder(order.id);
  }

  /**
   * Update payment information for an order.
   */
  updatePayment(orderId, paymentMethod, paymentAmount, paymentCurrency = 'USD') {
    return db.updateOrder(orderId, {
      payment_method: paymentMethod,
      payment_amount: paymentAmount,
      payment_currency: paymentCurrency,
      payment_status: 'PAID',
    });
  }

  /**
   * Mark order as complete or incomplete.
   */
  setOrderComplete(orderId, isComplete) {
    const updates = {
      is_complete: isComplete ? 1 : 0,
      order_status: isComplete ? 'COMPLETED' : 'PENDING',
    };
    return db.updateOrder(orderId, updates);
  }

  /**
   * Get all information for a ticket including orders.
   */
  getTicketInfo(ticketId) {
    const ticket = db.getTicket(ticketId);
    if (!ticket) return null;
    const orders = db.getTicketOrders(ticketId);
    const messages = db.getTicketMessages(ticketId);
    return { ticket, orders, messages };
  }

  /**
   * Create the ticket panel message for a channel.
   */
  async createTicketPanel(channel) {
    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_create_select')
          .setPlaceholder('Select ticket type...')
          .addOptions([
            {
              label: '💬 General Support',
              description: 'Get help with general issues',
              value: 'general',
              emoji: '💬',
            },
            {
              label: '📦 Order Support',
              description: 'Inquire about an existing order',
              value: 'order',
              emoji: '📦',
            },
            {
              label: '🚨 Report',
              description: 'Report a user or issue',
              value: 'report',
              emoji: '🚨',
            },
            {
              label: '💳 Payment Issue',
              description: 'Payment or billing questions',
              value: 'payment',
              emoji: '💳',
            },
            {
              label: '📋 Other',
              description: 'Other inquiries',
              value: 'other',
              emoji: '📋',
            },
          ]),
      );

    const embed = infoEmbed(
      '🎫 Create a Ticket',
      'Select a ticket type from the dropdown below to create a support ticket.\n\n' +
      '**Guidelines:**\n' +
      `• Maximum ${config.tickets.maxPerUser} active tickets per user\n` +
      '• Please be detailed in your request\n' +
      '• A support team member will assist you shortly\n\n' +
      '**Ticket Types:**\n' +
      '• **General Support** — General questions and help\n' +
      '• **Order Support** — Questions about your orders\n' +
      '• **Report** — Report rule violations or issues\n' +
      '• **Payment Issue** — Billing and payment inquiries\n' +
      '• **Other** — Anything else'
    );

    await channel.send({ embeds: [embed], components: [row] });
  }

  /**
   * Handle ticket panel interaction (modal submission after select menu).
   */
  async handleTicketInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_create_select') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
      const ticketType = interaction.values[0];

      const subjectLabels = {
        general: 'General Support Request',
        order: 'Order Support Request',
        report: 'Report / Complaint',
        payment: 'Payment Issue Report',
        other: 'Other Inquiry',
      };

      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${ticketType}`)
        .setTitle(subjectLabels[ticketType] || 'New Ticket');

      // Subject input
      const subjectInput = new TextInputBuilder()
        .setCustomId('ticket_subject')
        .setLabel('Subject')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Brief summary of your request')
        .setMinLength(3)
        .setMaxLength(100)
        .setRequired(true);

      // Description input
      const descInput = new TextInputBuilder()
        .setCustomId('ticket_description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Provide detailed information about your request...')
        .setMinLength(10)
        .setMaxLength(2000)
        .setRequired(true);

      // Priority input (shown for reports)
      const orderInput = new TextInputBuilder()
        .setCustomId('ticket_order_details')
        .setLabel('Order Details (if applicable)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Order ID, items purchased, amount paid, etc.')
        .setMaxLength(1000)
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(subjectInput);
      const row2 = new ActionRowBuilder().addComponents(descInput);
      const row3 = new ActionRowBuilder().addComponents(orderInput);

      modal.addComponents(row1, row2, row3);

      await interaction.showModal(modal);
    }

    // Handle modal submission
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
      await interaction.deferReply({ ephemeral: true });

      try {
        const subject = interaction.fields.getTextInputValue('ticket_subject');
        const description = interaction.fields.getTextInputValue('ticket_description');
        const orderDetails = interaction.fields.getTextInputValue('ticket_order_details');

        const result = await this.createTicket(interaction, {
          subject,
          description,
          priority: interaction.customId.includes('report') ? 3 : 1,
          orderDetails: orderDetails || null,
        });

        const embed = successEmbed(
          'Ticket Created!',
          `Your ticket **${result.ticket.ticket_id}** has been created.\n` +
          `Check your private channel: ${result.channel}`
        );

        await interaction.editReply({ embeds: [embed], ephemeral: true });
      } catch (error) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', error.message)],
          ephemeral: true,
        });
      }
    }
  }

  /**
   * Ensure the ticket category exists.
   */
  async _ensureCategory(guild) {
    const guildConfig = db.getGuild(guild.id);
    if (guildConfig && guildConfig.ticket_category_id) {
      const existing = guild.channels.cache.get(guildConfig.ticket_category_id);
      if (existing) return existing;
    }

    // Create the category
    const category = await guild.channels.create({
      name: config.tickets.categoryName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: this.client.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels],
        },
      ],
    });

    // Save category ID
    db.updateGuild(guild.id, { ticket_category_id: category.id });

    return category;
  }

  /**
   * Create a private ticket channel.
   */
  async _createTicketChannel(guild, category, ticket, creator) {
    const channelName = `${config.tickets.channelPrefix}${ticket.ticket_id.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    // Find support role
    const supportRole = guild.roles.cache.find(
      r => r.name === config.tickets.roles.supportTeam ||
           r.name.toLowerCase().includes('support') ||
           r.name.toLowerCase().includes('staff')
    );

    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: creator.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks,
        ],
      },
      {
        id: this.client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.EmbedLinks,
        ],
      },
    ];

    // Add support role permissions
    if (supportRole) {
      permissionOverwrites.push({
        id: supportRole.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.EmbedLinks,
        ],
      });
    }

    // Add admin override
    const adminRole = guild.roles.cache.find(
      r => r.name === config.tickets.roles.adminOverride || r.name === 'Admin'
    );
    if (adminRole) {
      permissionOverwrites.push({
        id: adminRole.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.ManageChannels,
        ],
      });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Ticket ${ticket.ticket_id} | Creator: ${creator.user.tag} | Subject: ${ticket.subject}`,
      permissionOverwrites,
    });

    // Send welcome message with ticket info
    const ticketInfoEmbed = ticketEmbed(ticket);
    const closeButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_close_${ticket.ticket_id}`)
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId(`ticket_claim_${ticket.ticket_id}`)
          .setLabel('Claim Ticket')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✋'),
      );

    await channel.send({
      content: `${creator}, welcome to your ticket! A support team member will be with you shortly. ${supportRole ? supportRole.toString() : ''}`,
      embeds: [ticketInfoEmbed],
      components: [closeButton],
    });

    return channel;
  }

  /**
   * Save ticket transcript before channel deletion.
   */
  async _saveTranscript(ticket) {
    try {
      if (!ticket.channel_id) return;

      // Get the channel
      const guild = this.client.guilds.cache.get(ticket.guild_id);
      if (!guild) return;

      const channel = guild.channels.cache.get(ticket.channel_id);
      if (!channel) return;

      // Collect messages from the ticket channel
      let transcript = [];
      let lastId = null;

      for (let i = 0; i < 3; i++) { // Max 3 iterations (150 messages)
        const options = { limit: 50 };
        if (lastId) options.before = lastId;

        const messages = await channel.messages.fetch(options);
        if (messages.size === 0) break;

        messages.forEach(msg => {
          transcript.push({
            authorId: msg.author.id,
            authorTag: msg.author.tag,
            content: msg.content,
            timestamp: msg.createdAt.toISOString(),
            attachments: msg.attachments.map(a => a.url),
          });
        });

        lastId = messages.last().id;
        if (messages.size < 50) break;
      }

      // Save to database
      for (const msg of transcript) {
        db.addTicketMessage(
          ticket.ticket_id,
          msg.authorId,
          msg.authorTag,
          msg.content,
          msg.attachments.length > 0 ? msg.attachments.join(', ') : null
        );
      }

      const stmt = db.getDb().prepare(
        'UPDATE tickets SET transcript_saved = 1 WHERE ticket_id = ?'
      );
      stmt.run(ticket.ticket_id);

      logger.info(`Transcript saved for ticket ${ticket.ticket_id} (${transcript.length} messages)`);
    } catch (error) {
      logger.warn(`Failed to save transcript for ticket ${ticket.ticket_id}`, { error: error.message });
    }
  }

  /**
   * Handle ticket button interactions (close, claim).
   */
  async handleButtonInteraction(interaction) {
    const customId = interaction.customId;

    // Close ticket button
    if (customId.startsWith('ticket_close_')) {
      const ticketId = customId.replace('ticket_close_', '');
      await interaction.deferReply({ ephemeral: true });

      try {
        const ticket = db.getTicket(ticketId);
        if (!ticket) {
          await interaction.editReply({ embeds: [errorEmbed('Error', 'Ticket not found.')], ephemeral: true });
          return;
        }

        // Check permissions
        const isStaff = interaction.member.roles.cache.some(r =>
          r.name === config.tickets.roles.supportTeam || r.name === config.tickets.roles.adminOverride
        );
        if (!isStaff && interaction.member.id !== ticket.creator_id) {
          await interaction.editReply({ embeds: [errorEmbed('Permission Denied', 'Only the ticket creator or staff can close this ticket.')], ephemeral: true });
          return;
        }

        await this.closeTicket(interaction, ticketId);
        await interaction.editReply({ embeds: [successEmbed('Ticket Closed', `Ticket ${ticketId} will be deleted in 30 seconds.`)], ephemeral: true });
      } catch (error) {
        await interaction.editReply({ embeds: [errorEmbed('Error', error.message)], ephemeral: true });
      }
    }

    // Claim ticket button
    if (customId.startsWith('ticket_claim_')) {
      const ticketId = customId.replace('ticket_claim_', '');
      await interaction.deferReply({ ephemeral: true });

      try {
        const ticket = db.getTicket(ticketId);
        if (!ticket) {
          await interaction.editReply({ embeds: [errorEmbed('Error', 'Ticket not found.')], ephemeral: true });
          return;
        }

        // Check staff permissions
        const isStaff = interaction.member.roles.cache.some(r =>
          r.name === config.tickets.roles.supportTeam || r.name === config.tickets.roles.adminOverride
        );
        if (!isStaff) {
          await interaction.editReply({ embeds: [errorEmbed('Permission Denied', 'Only support team members can claim tickets.')], ephemeral: true });
          return;
        }

        this.assignTicket(ticketId, interaction.member.id);

        await interaction.editReply({ embeds: [successEmbed('Ticket Claimed', `You have claimed ticket ${ticketId}.`)], ephemeral: true });

        // Notify in ticket channel
        if (ticket.channel_id) {
          const channel = interaction.guild.channels.cache.get(ticket.channel_id);
          if (channel) {
            await channel.send({ embeds: [infoEmbed('Ticket Claimed', `This ticket has been claimed by ${interaction.member.user.tag}. They will assist you shortly.`)] });
          }
        }
      } catch (error) {
        await interaction.editReply({ embeds: [errorEmbed('Error', error.message)], ephemeral: true });
      }
    }
  }
}

module.exports = TicketManager;
