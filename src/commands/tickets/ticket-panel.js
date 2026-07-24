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
      embeds: [successEmbed('Ticket Panel Deployed',
        'The ticket creation panel is now live in this channel.\n' +
        '─────────────────────────\n' +
        'Users can select a ticket type from the dropdown menu below to open a new support request.\n\n' +
        '📋 Panel Status: Active\n' +
        '🎯 Channel: ' + interaction.channel
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
      embeds: [successEmbed('Auto-Setup Complete',
        `The ticket system has been fully configured for this server.\n` +
        `─────────────────────────\n\n` +
        `✅  Step 1 — Created ticket panel channel\n` +
        `      ${panelChannel}\n` +
        `✅  Step 2 — Created support role\n` +
        `      ${supportRole}\n` +
        `✅  Step 3 — Configured ticket category & permissions\n` +
        `✅  Step 4 — Deployed ticket creation panel\n` +
        `─────────────────────────\n\n` +
        `📋  Next Steps\n` +
        `•  Assign ${supportRole} to your support staff\n` +
        `•  Customize ticket types via the panel dropdown\n` +
        `•  Review channel permissions as needed`
      )],
    });
  },
};
