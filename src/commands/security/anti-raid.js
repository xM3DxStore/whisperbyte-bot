const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anti-raid')
    .setDescription('Configure anti-raid protection settings')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Check current anti-raid status')
    )
    .addSubcommand(sub => sub
      .setName('threshold')
      .setDescription('Set join threshold for raid detection')
      .addIntegerOption(opt => opt
        .setName('joins')
        .setDescription('Max joins per 10 seconds before raid alert')
        .setMinValue(2)
        .setMaxValue(20)
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('enable')
      .setDescription('Enable anti-raid protection')
    )
    .addSubcommand(sub => sub
      .setName('disable')
      .setDescription('Disable anti-raid protection')
    ),

  rateLimit: 'SENSITIVE',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const raidDetector = interaction.client.raidDetector;

    switch (subcommand) {
      case 'status':
        return this.showStatus(interaction, raidDetector);
      case 'threshold':
        return this.setThreshold(interaction);
      case 'enable':
        return this.toggle(interaction, true);
      case 'disable':
        return this.toggle(interaction, false);
    }
  },

  async showStatus(interaction, raidDetector) {
    const lockdown = raidDetector.getLockdownStatus(interaction.guild.id);
    const db = require('../../database');
    const guild = db.ensureGuild(interaction.guild.id);

    const statusLines = [
      '**Protection:** ' + (guild.anti_raid_enabled ? 'Enabled' : 'Disabled'),
      '**Lockdown:** ' + (lockdown.active
        ? 'Active (until <t:' + Math.floor(lockdown.until / 1000) + ':R>)'
        : 'Inactive'),
      '**Join Threshold:** ' + require('../../config').antiRaid.joinThreshold + ' joins/10s',
      '',
      '**Recommended Settings:**',
      '- Small servers (< 100 members): 3-5 joins/10s',
      '- Medium servers (100-1000): 5-8 joins/10s',
      '- Large servers (> 1000): 8-15 joins/10s',
    ];

    const embed = infoEmbed('Anti-Raid Status', statusLines.join('\n'));
    await interaction.reply({ embeds: [embed] });
  },

  async setThreshold(interaction) {
    const joins = interaction.options.getInteger('joins');
    const { antiRaid } = require('../../config');
    antiRaid.joinThreshold = joins;

    const db = require('../../database');
    db.updateGuild(interaction.guild.id, { spam_sensitivity: joins / 20 });

    logger.moderation('CONFIG_UPDATE', interaction.user.id, null, 'Anti-raid threshold set to ' + joins, interaction.guild.id);

    await interaction.reply({
      embeds: [successEmbed('Threshold Updated', 'Raid detection threshold set to **' + joins + '** joins per 10 seconds.')],
    });
  },

  async toggle(interaction, enabled) {
    const db = require('../../database');
    db.updateGuild(interaction.guild.id, { anti_raid_enabled: enabled ? 1 : 0 });

    logger.moderation('CONFIG_UPDATE', interaction.user.id, null,
      'Anti-raid ' + (enabled ? 'enabled' : 'disabled'), interaction.guild.id
    );

    await interaction.reply({
      embeds: [successEmbed(
        enabled ? 'Anti-Raid Enabled' : 'Anti-Raid Disabled',
        enabled
          ? 'Raid protection is now active. Suspicious join activity will be detected and mitigated.'
          : 'Raid protection has been disabled. Consider re-enabling it for security.'
      )],
    });
  },
};
