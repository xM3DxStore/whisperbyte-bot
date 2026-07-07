const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Create or update the ticket creation panel')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a ticket panel in the current channel')
    )
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Automatic setup: creates a ticket panel + category + support role')
    ),

  rateLimit: 'SENSITIVE',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create':
        return this.createPanel(interaction);
      case 'setup':
        return this.autoSetup(interaction);
    }
  },

  async createPanel(interaction) {
    await interaction.deferReply();

    await interaction.client.ticketManager.createTicketPanel(interaction.channel);

    await interaction.editReply({
      embeds: [successEmbed('Ticket Panel Created',
        'The ticket creation panel has been set up in this channel.\n' +
        'Users can select a ticket type from the dropdown to create a support ticket.'
      )],
    });
  },

  async autoSetup(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;

    // 1. Create ticket panel channel
    const panelChannel = await guild.channels.create({
      name: '🎫-create-ticket',
      type: ChannelType.GuildText,
      topic: 'Create a support ticket by selecting an option below.',
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
        {
          id: interaction.client.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels],
        },
      ],
    });

    // 2. Create support role if it doesn't exist
    let supportRole = guild.roles.cache.find(r => r.name === 'Support Team');
    if (!supportRole) {
      supportRole = await guild.roles.create({
        name: 'Support Team',
        color: '#00AAFF',
        reason: 'Auto-setup for ticket system',
      });
    }

    // 3. Create ticket panel
    await interaction.client.ticketManager.createTicketPanel(panelChannel);

    // 4. Notify
    await interaction.editReply({
      embeds: [successEmbed('✅ Auto-Setup Complete',
        `**Ticket Panel Channel:** ${panelChannel}\n` +
        `**Support Role:** ${supportRole}\n\n` +
        `What was done:\n` +
        `1. Created ${panelChannel} for ticket creation\n` +
        `2. Created/verified support role: ${supportRole.name}\n` +
        `3. Set up ticket category and permissions\n\n` +
        `Assign the ${supportRole} role to your support staff to give them access to all tickets.`
      )],
    });
  },
};
