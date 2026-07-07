const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anti-spam')
    .setDescription('Configure AI-powered spam detection settings')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => sub
      .setName('settings')
      .setDescription('View current anti-spam settings')
    )
    .addSubcommand(sub => sub
      .setName('sensitivity')
      .setDescription('Set spam detection sensitivity (0.0 - 1.0)')
      .addNumberOption(opt => opt
        .setName('level')
        .setDescription('Sensitivity level (0.0 = least sensitive, 1.0 = most sensitive)')
        .setMinValue(0)
        .setMaxValue(1.0)
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('thresholds')
      .setDescription('Set custom spam action thresholds')
      .addNumberOption(opt => opt
        .setName('warn')
        .setDescription('Score threshold for warnings (default: 3)')
        .setMinValue(1)
        .setMaxValue(20)
      )
      .addNumberOption(opt => opt
        .setName('mute')
        .setDescription('Score threshold for automatic mute (default: 8)')
        .setMinValue(1)
        .setMaxValue(20)
      )
      .addNumberOption(opt => opt
        .setName('ban')
        .setDescription('Score threshold for automatic ban (default: 15)')
        .setMinValue(1)
        .setMaxValue(30)
      )
    )
    .addSubcommand(sub => sub
      .setName('ignore')
      .setDescription('Toggle spam detection ignore for a channel')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to toggle ignore status')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Reset spam score for a user')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to reset spam score for')
        .setRequired(true)
      )
    ),

  rateLimit: 'SENSITIVE',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    switch (subcommand) {
      case 'settings':
        return this.showSettings(interaction, guildId);
      case 'sensitivity':
        return this.setSensitivity(interaction, guildId);
      case 'thresholds':
        return this.setThresholds(interaction, guildId);
      case 'ignore':
        return this.toggleIgnoreChannel(interaction, guildId);
      case 'reset':
        return this.resetUser(interaction, guildId);
    }
  },

  async showSettings(interaction, guildId) {
    const guild = db.ensureGuild(guildId);
    const spamScores = db.getHighSpamScores(guildId, 1);

    const embed = infoEmbed(
      '🛡️ Anti-Spam Settings',
      `**Sensitivity:** ${guild.spam_sensitivity}\n` +
      `**XP Enabled:** ${guild.xp_enabled ? '✅ Yes' : '❌ No'}\n` +
      `**Anti-Raid:** ${guild.anti_raid_enabled ? '✅ Active' : '❌ Disabled'}\n` +
      `**Lockdown Active:** ${guild.lockdown_active ? '🔴 Yes' : '🟢 No'}\n\n` +
      `**High Spam Scores (top 5):**\n${
        spamScores.slice(0, 5).map(s =>
          `<@${s.user_id}> — Score: ${s.score.toFixed(1)} (${s.violations} violations)`
        ).join('\n') || 'No high spam scores recorded.'
      }`
    );

    await interaction.reply({ embeds: [embed] });
  },

  async setSensitivity(interaction, guildId) {
    const level = interaction.options.getNumber('level');
    db.updateGuild(guildId, { spam_sensitivity: level });

    logger.moderation('CONFIG_UPDATE', interaction.user.id, null, `Spam sensitivity set to ${level}`, guildId);

    await interaction.reply({
      embeds: [successEmbed('Sensitivity Updated', `Spam detection sensitivity set to **${level}**.\nHigher values = more aggressive detection.`)],
    });
  },

  async setThresholds(interaction, guildId) {
    const warn = interaction.options.getNumber('warn');
    const mute = interaction.options.getNumber('mute');
    const ban = interaction.options.getNumber('ban');

    // Build response message
    let responseParts = [];

    if (warn !== null) {
      responseParts.push(`Warn: **${warn}**`);
    }
    if (mute !== null) {
      responseParts.push(`Mute: **${mute}**`);
    }
    if (ban !== null) {
      responseParts.push(`Ban: **${ban}**`);
      // Adjust sensitivity proportionally to ban threshold
      db.updateGuild(guildId, { spam_sensitivity: Math.max(0.1, Math.min(1.0, ban / 20)) });
    }

    await interaction.reply({
      embeds: [successEmbed('Thresholds Updated',
        `${warn !== null ? `• Warn: **${warn}**\n` : ''}` +
        `${mute !== null ? `• Mute: **${mute}**\n` : ''}` +
        `${ban !== null ? `• Ban: **${ban}**\n` : ''}`
      )],
    });
  },

  async toggleIgnoreChannel(interaction, guildId) {
    const channel = interaction.options.getChannel('channel');
    const guild = db.ensureGuild(guildId);

    const ignoreChannels = db.getIgnoreChannels(guildId);
    const alreadyIgnored = ignoreChannels.includes(channel.id);

    if (alreadyIgnored) {
      const updated = ignoreChannels.filter(id => id !== channel.id);
      db.setXpChannels(guildId, updated);
      await interaction.reply({
        embeds: [successEmbed('Channel Removed', `${channel} has been removed from the ignore list.`)],
      });
    } else {
      ignoreChannels.push(channel.id);
      db.updateGuild(guildId, { ignore_channels: JSON.stringify(ignoreChannels) });
      await interaction.reply({
        embeds: [successEmbed('Channel Ignored', `${channel} will be ignored by spam detection.`)],
      });
    }
  },

  async resetUser(interaction, guildId) {
    const user = interaction.options.getUser('user');
    db.resetSpamScore(guildId, user.id);

    logger.moderation('SPAM_RESET', interaction.user.id, user.id, 'Spam score manually reset', guildId);

    await interaction.reply({
      embeds: [successEmbed('Score Reset', `Spam score for ${user.tag} has been reset to 0.`)],
    });
  },
};
