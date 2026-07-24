const { SlashCommandBuilder, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Export a ticket transcript')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addStringOption(opt => opt
      .setName('ticket-id')
      .setDescription('Ticket ID to export')
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('format')
      .setDescription('Export format')
      .addChoices(
        { name: 'Text', value: 'text' },
        { name: 'JSON', value: 'json' },
      )
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const ticketId = interaction.options.getString('ticket-id');
    const format = interaction.options.getString('format') || 'text';

    const ticket = db.getTicket(ticketId);
    if (!ticket) {
      return interaction.editReply({ embeds: [errorEmbed('Error', `Ticket ${ticketId} not found.`)] });
    }

    const messages = db.getTicketMessages(ticketId);

    if (messages.length === 0) {
      return interaction.editReply({
        embeds: [infoEmbed('No Messages', `Ticket ${ticketId} has no saved messages. Use /close first to save the transcript.`)],
      });
    }

    let content;
    let filename;
    let mimeType;

    if (format === 'json') {
      content = JSON.stringify({
        ticket: {
          id: ticket.ticket_id,
          subject: ticket.subject,
          description: ticket.description,
          status: ticket.status,
          creator: ticket.creator_id,
          created: ticket.created_at,
          closed: ticket.closed_at,
        },
        messages: messages.map(m => ({
          author: m.username,
          content: m.content,
          timestamp: m.created_at,
          attachments: m.attachment_url,
        })),
      }, null, 2);
      filename = `${ticketId}_transcript.json`;
      mimeType = 'application/json';
    } else {
      const header = `TICKET TRANSCRIPT: ${ticket.ticket_id}\n` +
        `Subject: ${ticket.subject}\n` +
        `Status: ${ticket.status}\n` +
        `Creator: <@${ticket.creator_id}>\n` +
        `Created: ${ticket.created_at}\n` +
        `Closed: ${ticket.closed_at || 'N/A'}\n` +
        `${'='.repeat(50)}\n\n`;

      const msgText = messages.map(m => {
        const date = new Date(m.created_at).toLocaleString();
        return `[${date}] ${m.username}:\n${m.content || '(no content)'}\n`;
      }).join('\n');

      content = header + msgText;
      filename = `${ticketId}_transcript.txt`;
      mimeType = 'text/plain';
    }

    const buffer = Buffer.from(content, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: filename });

    db.addAuditLog(interaction.guild.id, 'TRANSCRIPT_EXPORT', interaction.user.id, ticket.creator_id,
      `Exported transcript for ${ticketId}`,
      JSON.stringify({ ticketId, format, messageCount: messages.length })
    );

    await interaction.editReply({
      embeds: [successEmbed('Transcript Exported',
        `Ticket **${ticketId}** transcript has been exported successfully.\n` +
        `─────────────────────────\n\n` +
        `📄  Format:       ${format.toUpperCase()}\n` +
        `💬  Messages:     ${messages.length}\n` +
        `📎  Filename:     ${filename}`
      )],
      files: [attachment],
    });
  },
};
