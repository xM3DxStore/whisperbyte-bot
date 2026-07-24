const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, BRAND } = require('../../utils/embedBuilder');
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
    const enabled = guild.anti_raid_enabled;

    const shieldIcon = enabled ? '🛡️' : '⚠️';
    const protectionLevel = enabled ? 'Active' : 'Inactive';
    const threshold = require('../../config').antiRaid.joinThreshold;

    const embed = infoEmbed(
      'Anti-Raid Status',
      `${shieldIcon} **Protection Level:** _${protectionLevel}_\n` +
      `${BRAND.divider}\n` +
      `\`Status\`      ${enabled ? '🟢 Enabled' : '🔴 Disabled'}\n` +
      `\`Lockdown\`    ${lockdown.active ? '🔴 Active — ends <t:' + Math.floor(lockdown.until / 1000) + ':R>' : '🟢 Clear'}\n` +
      `\`Threshold\`   **${threshold}** joins per 10s\n` +
      `${BRAND.divider}\n` +
      `**Recommended Thresholds**\n` +
      `> 🏘️ Small (<100) — **3–5**\n` +
      `> 🏢 Medium (100–1K) — **5–8**\n` +
      `> 🌆 Large (1K+) — **8–15**`
    );

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
      embeds: [successEmbed('Threshold Updated',
        `Raid detection threshold set to **${joins}** joins per 10 seconds.\nAny spike exceeding this limit will trigger automatic mitigation.`
      )],
    });
  },

  async toggle(interaction, enabled) {
    const db = require('../../database');
    db.updateGuild(interaction.guild.id, { anti_raid_enabled: enabled ? 1 : 0 });

    logger.moderation('CONFIG_UPDATE', interaction.user.id, null,
      'Anti-raid ' + (enabled ? 'enabled' : 'disabled'), interaction.guild.id
    );

    const embed = enabled
      ? successEmbed('Anti-Raid Enabled',
          'Raid protection is now **active**.\n' +
          `${BRAND.divider}\n` +
          'What happens when a raid is detected:\n' +
          '> 🚨 Mass join spike triggers an alert\n' +
          '> 🔒 Auto-lockdown may engage if threshold is exceeded\n' +
          '> 👥 Suspicious accounts are flagged for review'
        )
      : successEmbed('Anti-Raid Disabled',
          'Raid protection has been **deactivated**.\n' +
          `${BRAND.divider}\n` +
          '⚠️ Without anti-raid protection:\n' +
          '> ❌ Mass join spikes go undetected\n' +
          '> ❌ No automatic lockdown during raids\n' +
          '> ⚠️ Server is vulnerable to coordinate raids'
        );

    await interaction.reply({ embeds: [embed] });
  },
};
