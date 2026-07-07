const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configure-xp')
    .setDescription('Configure XP and leveling settings')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => sub
      .setName('settings')
      .setDescription('View current XP settings')
    )
    .addSubcommand(sub => sub
      .setName('toggle')
      .setDescription('Enable or disable XP system')
      .addBooleanOption(opt => opt
        .setName('enabled')
        .setDescription('Enable XP system?')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('multiplier')
      .setDescription('Set XP rate multiplier')
      .addNumberOption(opt => opt
        .setName('rate')
        .setDescription('XP multiplier (0.5 = half, 2.0 = double)')
        .setMinValue(0.1)
        .setMaxValue(5.0)
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('add-channel')
      .setDescription('Add an XP-enabled channel')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to enable XP in')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('remove-channel')
      .setDescription('Remove an XP-enabled channel (all channels = XP)')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to remove')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('ignore')
      .setDescription('Ignore a channel (no XP)')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to ignore')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('role-reward')
      .setDescription('Configure role rewards for leveling')
      .addIntegerOption(opt => opt
        .setName('level')
        .setDescription('Level at which to assign the role')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
      )
      .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Role to assign')
        .setRequired(true)
      )
    ),

  rateLimit: 'SENSITIVE',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const xpSystem = interaction.client.xpSystem;

    switch (subcommand) {
      case 'settings':
        return this.showSettings(interaction, guildId, xpSystem);
      case 'toggle':
        return this.toggleXp(interaction, guildId, xpSystem);
      case 'multiplier':
        return this.setMultiplier(interaction, guildId, xpSystem);
      case 'add-channel':
        return this.addChannel(interaction, guildId, xpSystem);
      case 'remove-channel':
        return this.removeChannel(interaction, guildId, xpSystem);
      case 'ignore':
        return this.ignoreChannel(interaction, guildId, xpSystem);
      case 'role-reward':
        return this.setRoleReward(interaction, guildId);
    }
  },

  async showSettings(interaction, guildId, xpSystem) {
    const guild = db.ensureGuild(guildId);
    const xpChannels = db.getXpChannels(guildId);
    const ignoreChannels = db.getIgnoreChannels(guildId);
    const levelRoles = db.getLevelRoles(guildId);

    const channelLinks = xpChannels.map(id => `<#${id}>`).join(', ') || 'All channels (not filtered)';
    const ignoreLinks = ignoreChannels.map(id => `<#${id}>`).join(', ') || 'None';

    const roleRewardsStr = levelRoles.length > 0
      ? levelRoles.map(r => `• Level ${r.level} → <@&${r.role_id}>`).join('\n')
      : 'No custom role rewards configured.';

    const embed = infoEmbed(
      '⚙️ XP & Leveling Settings',
      `**Enabled:** ${guild.xp_enabled ? '✅ Yes' : '❌ No'}\n` +
      `**Multiplier:** ${guild.xp_rate_multiplier}x\n\n` +
      `**XP Channels:**\n${channelLinks}\n\n` +
      `**Ignored Channels:**\n${ignoreLinks}\n\n` +
      `**Role Rewards:**\n${roleRewardsStr}\n\n` +
      `**Level Formula:** XP = ${require('../../config').xp.levelBaseXp} × level^${require('../../config').xp.levelExponent}`
    );

    await interaction.reply({ embeds: [embed] });
  },

  async toggleXp(interaction, guildId, xpSystem) {
    const enabled = interaction.options.getBoolean('enabled');
    xpSystem.setXpEnabled(guildId, enabled);

    logger.moderation('XP_TOGGLE', interaction.user.id, null, `XP ${enabled ? 'enabled' : 'disabled'}`, guildId);

    await interaction.reply({
      embeds: [successEmbed(
        enabled ? 'XP System Enabled' : 'XP System Disabled',
        `The XP and leveling system has been ${enabled ? 'enabled' : 'disabled'}.`
      )],
    });
  },

  async setMultiplier(interaction, guildId, xpSystem) {
    const rate = interaction.options.getNumber('rate');
    xpSystem.setXpMultiplier(guildId, rate);

    await interaction.reply({
      embeds: [successEmbed('XP Multiplier Updated',
        `XP rate multiplier set to **${rate}x**.\n` +
        `Users will now earn ${rate}x the normal XP amount.`
      )],
    });
  },

  async addChannel(interaction, guildId, xpSystem) {
    const channel = interaction.options.getChannel('channel');
    const xpChannels = db.getXpChannels(guildId);

    if (xpChannels.includes(channel.id)) {
      return interaction.reply({ embeds: [errorEmbed('Already Added', `${channel} is already an XP-enabled channel.`)], ephemeral: true });
    }

    xpChannels.push(channel.id);
    xpSystem.setXpChannels(guildId, xpChannels);

    await interaction.reply({
      embeds: [successEmbed('Channel Added', `${channel} is now an XP-enabled channel.`)],
    });
  },

  async removeChannel(interaction, guildId, xpSystem) {
    const channel = interaction.options.getChannel('channel');
    const xpChannels = db.getXpChannels(guildId);

    if (!xpChannels.includes(channel.id)) {
      return interaction.reply({ embeds: [errorEmbed('Not Found', `${channel} is not in the XP-enabled channels list.`)], ephemeral: true });
    }

    const updated = xpChannels.filter(id => id !== channel.id);
    xpSystem.setXpChannels(guildId, updated);

    await interaction.reply({
      embeds: [successEmbed('Channel Removed', `${channel} has been removed from XP-enabled channels.`)],
    });
  },

  async ignoreChannel(interaction, guildId, xpSystem) {
    const channel = interaction.options.getChannel('channel');
    const ignoreChannels = db.getIgnoreChannels(guildId);

    if (ignoreChannels.includes(channel.id)) {
      // Remove from ignore list
      const updated = ignoreChannels.filter(id => id !== channel.id);
      xpSystem.setIgnoreChannels(guildId, updated);
      await interaction.reply({ embeds: [successEmbed('Channel Unignored', `${channel} will now earn XP.`)], ephemeral: true });
    } else {
      ignoreChannels.push(channel.id);
      xpSystem.setIgnoreChannels(guildId, ignoreChannels);
      await interaction.reply({ embeds: [successEmbed('Channel Ignored', `${channel} will not earn XP.`)], ephemeral: true });
    }
  },

  async setRoleReward(interaction, guildId) {
    const level = interaction.options.getInteger('level');
    const role = interaction.options.getRole('role');

    // Prevent role hierarchy issues
    if (role.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Error', 'You cannot assign a role higher than your highest role.')], ephemeral: true });
    }

    db.addLevelRole(guildId, level, role.id);

    logger.moderation('ROLE_REWARD', interaction.user.id, null, `Level ${level} → ${role.name}`, guildId);

    await interaction.reply({
      embeds: [successEmbed('Role Reward Set',
        `Users reaching **Level ${level}** will receive the <@&${role.id}> role.`
      )],
    });
  },
};
