const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Colors } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rating')
    .setDescription('Send a satisfaction rating poll for a ticket')
    .addStringOption(opt => opt
      .setName('ticket-id')
      .setDescription('Ticket ID to rate')
      .setRequired(true)
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const ticketId = interaction.options.getString('ticket-id');

    const ticket = db.getTicket(ticketId);
    if (!ticket) {
      return interaction.reply({ embeds: [errorEmbed('Error', `Ticket ${ticketId} not found.`)], ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rating_1_${ticketId}`).setLabel('1 - Poor').setStyle(ButtonStyle.Danger).setEmoji('😞'),
      new ButtonBuilder().setCustomId(`rating_2_${ticketId}`).setLabel('2 - Okay').setStyle(ButtonStyle.Secondary).setEmoji('😐'),
      new ButtonBuilder().setCustomId(`rating_3_${ticketId}`).setLabel('3 - Good').setStyle(ButtonStyle.Primary).setEmoji('🙂'),
      new ButtonBuilder().setCustomId(`rating_4_${ticketId}`).setLabel('4 - Great').setStyle(ButtonStyle.Success).setEmoji('😊'),
      new ButtonBuilder().setCustomId(`rating_5_${ticketId}`).setLabel('5 - Excellent').setStyle(ButtonStyle.Success).setEmoji('🤩'),
    );

    const embed = new EmbedBuilder()
      .setTitle('⭐ Rate Your Experience')
      .setDescription(`How was your experience with ticket **${ticketId}**?\n\nClick a button below to rate from 1 (Poor) to 5 (Excellent).`)
      .setColor(Colors.Gold)
      .setFooter({ text: 'Your feedback helps us improve!' })
      .setTimestamp();

    const channel = interaction.guild.channels.cache.get(ticket.channel_id) || interaction.channel;
    await channel.send({ embeds: [embed], components: [row] });

    await interaction.reply({
      embeds: [successEmbed('Rating Sent', `Rating poll sent for ticket **${ticketId}** in ${channel}`)],
      ephemeral: true,
    });
  },

  async handleButton(interaction) {
    if (!interaction.customId.startsWith('rating_')) return false;

    const parts = interaction.customId.split('_');
    const score = parseInt(parts[1]);
    const ticketId = parts.slice(2).join('_');

    db.addAuditLog(interaction.guild.id, 'TICKET_RATING', interaction.user.id, null,
      `Rated ticket ${ticketId}: ${score}/5`,
      JSON.stringify({ ticketId, score })
    );

    const labels = { 1: 'Poor', 2: 'Okay', 3: 'Good', 4: 'Great', 5: 'Excellent' };

    await interaction.reply({
      embeds: [successEmbed('Rating Submitted', `You rated ticket **${ticketId}** as **${score}/5 — ${labels[score]}**. Thank you!`)],
      ephemeral: true,
    });

    return true;
  },
};
