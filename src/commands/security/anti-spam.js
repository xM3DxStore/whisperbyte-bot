const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, BRAND } = require('../../utils/embedBuilder');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anti-spam')
    .setDescription('Configure AI-powered spam detection settings')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => sub
      .setName('toggle')
      .setDescription('Enable or disable anti-spam detection entirely')
    )
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
      case 'toggle':
        return this.toggleSpam(interaction, guildId);
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

  async toggleSpam(interaction, guildId) {
    const guild = db.ensureGuild(guildId);
    const newState = guild.spam_enabled ? 0 : 1;
    db.updateGuild(guildId, { spam_enabled: newState });

    const label = newState ? 'Enabled' : 'Disabled';
    const emoji = newState ? '🟢' : '🔴';

    logger.moderation('CONFIG_UPDATE', interaction.user.id, null, `Anti-spam ${label}`, guildId);

    await interaction.reply({
      embeds: [successEmbed('Anti-Spam Toggled',
        `${emoji} Anti-spam detection is now **${label}**.\n${
          newState
            ? 'Spam detection is active. Messages will be analyzed and flagged.'
            : 'Spam detection is off. All messages will pass through without checks.'
        }`
      )],
    });
  },

  async showSettings(interaction, guildId) {
    const guild = db.ensureGuild(guildId);
    const spamScores = db.getHighSpamScores(guildId, 1);
    const s = guild.spam_sensitivity;
    const filled = Math.round(s * 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    const embed = infoEmbed(
      'Anti-Spam Configuration',
      `\`Sensitivity\`  **${s}**  \`${bar}\`\n` +
      `\`Anti-Spam\`    ${guild.spam_enabled ? '🟢 Active' : '🔴 Disabled'}\n` +
      `${BRAND.divider}\n` +
      `\`XP System\`    ${guild.xp_enabled ? '🟢 Active' : '🔴 Disabled'}\n` +
      `\`Anti-Raid\`    ${guild.anti_raid_enabled ? '🟢 Active' : '🔴 Disabled'}\n` +
      `\`Lockdown\`     ${guild.lockdown_active ? '🔴 Active' : '🟢 Clear'}\n` +
      `${BRAND.divider}\n` +
      `**Top Offenders**\n${
        spamScores.length > 0
          ? spamScores.slice(0, 5).map((s, i) =>
            `\`${i + 1}.\` <@${s.user_id}> — **${s.score.toFixed(1)}** score · **${s.violations}** violations`
          ).join('\n')
          : '> _No elevated spam scores._'
      }`
    );

    await interaction.reply({ embeds: [embed] });
  },

  async setSensitivity(interaction, guildId) {
    const level = interaction.options.getNumber('level');
    db.updateGuild(guildId, { spam_sensitivity: level });

    logger.moderation('CONFIG_UPDATE', interaction.user.id, null, `Spam sensitivity set to ${level}`, guildId);

    const filled = Math.round(level * 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const label = level >= 0.8 ? 'Maximum' : level >= 0.6 ? 'High' : level >= 0.4 ? 'Moderate' : level >= 0.2 ? 'Low' : 'Minimal';

    await interaction.reply({
      embeds: [successEmbed('Sensitivity Updated',
        `Detection sensitivity set to **${level}** — _${label}_\n\`${bar}\`\nHigher values increase detection strictness.`
      )],
    });
  },

  async setThresholds(interaction, guildId) {
    const warn = interaction.options.getNumber('warn');
    const mute = interaction.options.getNumber('mute');
    const ban = interaction.options.getNumber('ban');

    let responseParts = [];

    if (warn !== null) responseParts.push(`Warn Threshold   **${warn}**`);
    if (mute !== null) responseParts.push(`Mute Threshold   **${mute}**`);
    if (ban !== null) {
      responseParts.push(`Ban Threshold    **${ban}**`);
      db.updateGuild(guildId, { spam_sensitivity: Math.max(0.1, Math.min(1.0, ban / 20)) });
    }

    await interaction.reply({
      embeds: [successEmbed('Thresholds Updated',
        `${responseParts.join('\n')}\n\nActions are triggered when a user's spam score reaches the listed threshold.`
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
        embeds: [successEmbed('Ignore Removed',
          `${channel} is no longer ignored.\nSpam detection will now monitor messages in this channel.`
        )],
      });
    } else {
      ignoreChannels.push(channel.id);
      db.updateGuild(guildId, { ignore_channels: JSON.stringify(ignoreChannels) });
      await interaction.reply({
        embeds: [successEmbed('Channel Ignored',
          `${channel} added to the ignore list.\nSpam detection will skip all messages in this channel.`
        )],
      });
    }
  },

  async resetUser(interaction, guildId) {
    const user = interaction.options.getUser('user');
    db.resetSpamScore(guildId, user.id);

    logger.moderation('SPAM_RESET', interaction.user.id, user.id, 'Spam score manually reset', guildId);

    await interaction.reply({
      embeds: [successEmbed('Score Reset',
        `Spam score for **${user.tag}** has been reset.\nAll violations cleared and monitoring has been restored.`
      )],
    });
  },
};
