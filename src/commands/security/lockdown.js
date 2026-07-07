const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Manage server lockdown mode')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => sub
      .setName('activate')
      .setDescription('Activate lockdown mode')
      .addIntegerOption(opt => opt
        .setName('duration')
        .setDescription('Duration in minutes (default: 15)')
        .setMinValue(1)
        .setMaxValue(1440)
      )
      .addStringOption(opt => opt
        .setName('reason')
        .setDescription('Reason for lockdown')
        .setMaxLength(500)
      )
    )
    .addSubcommand(sub => sub
      .setName('deactivate')
      .setDescription('Deactivate lockdown mode')
    )
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Check lockdown status')
    ),

  rateLimit: 'SENSITIVE',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const raidDetector = interaction.client.raidDetector;

    switch (subcommand) {
      case 'activate':
        return this.activate(interaction, raidDetector);
      case 'deactivate':
        return this.deactivate(interaction, raidDetector);
      case 'status':
        return this.status(interaction, raidDetector);
    }
  },

  async activate(interaction, raidDetector) {
    const duration = interaction.options.getInteger('duration') || 15;
    const reason = interaction.options.getString('reason') || 'Manual lockdown by moderator';

    await raidDetector.activateLockdown(interaction.guild, Math.ceil(duration / 15));

    logger.moderation('LOCKDOWN_MANUAL', interaction.user.id, null, reason, interaction.guild.id);

    await interaction.reply({
      embeds: [successEmbed('🔒 Lockdown Activated',
        `Server has been placed in lockdown for **${duration} minutes**.\n` +
        `**Reason:** ${reason}\n\n` +
        `**Effects:**\n` +
        `• @everyone can no longer @mention or send messages\n` +
        `• 60-second slowmode enabled on all channels\n` +
        `• New member joins will be monitored`
      )],
    });
  },

  async deactivate(interaction, raidDetector) {
    await raidDetector.deactivateLockdown(interaction.guild);

    logger.moderation('LOCKDOWN_DEACTIVATE', interaction.user.id, null, 'Manual deactivation', interaction.guild.id);

    await interaction.reply({
      embeds: [successEmbed('🔓 Lockdown Deactivated',
        'Server lockdown has been lifted.\nAll normal functions have been restored.'
      )],
    });
  },

  async status(interaction, raidDetector) {
    const status = raidDetector.getLockdownStatus(interaction.guild.id);

    const embed = status.active
      ? infoEmbed('🔒 Lockdown Active',
        `Lockdown is currently **ACTIVE**.\n` +
        `Ends: <t:${Math.floor(status.until / 1000)}:R>\n\n` +
        `Use \`/lockdown deactivate\` to lift it early.`
      )
      : infoEmbed('🔓 No Lockdown',
        'The server is not currently in lockdown mode.\n' +
        'Use `/lockdown activate` to manually enable lockdown if needed.'
      );

    await interaction.reply({ embeds: [embed] });
  },
};
