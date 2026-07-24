const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, warningEmbed, BRAND } = require('../../utils/embedBuilder');
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

    const endTimestamp = Math.floor((Date.now() + duration * 60 * 1000) / 1000);

    await interaction.reply({
      embeds: [warningEmbed('Lockdown Activated',
        `🔒 Server is now under **full lockdown** for **${duration} minutes**.\n` +
        `Ends <t:${endTimestamp}:R> (<t:${endTimestamp}:f>)\n` +
        `${BRAND.divider}\n` +
        `**Reason:** ${reason}\n` +
        `${BRAND.divider}\n` +
        `**Active Restrictions:**\n` +
        `> 🚫 @everyone mention permissions revoked\n` +
        `> 🚫 Message sending restricted for standard members\n` +
        `> ⏳ 60-second slowmode on all channels\n` +
        `> 👁️ New member joins under increased surveillance`
      )],
    });
  },

  async deactivate(interaction, raidDetector) {
    await raidDetector.deactivateLockdown(interaction.guild);

    logger.moderation('LOCKDOWN_DEACTIVATE', interaction.user.id, null, 'Manual deactivation', interaction.guild.id);

    await interaction.reply({
      embeds: [successEmbed('Lockdown Deactivated',
        'Server lockdown has been **lifted**.\n' +
        `${BRAND.divider}\n` +
        `**Restored Functions:**\n` +
        `> ✅ @everyone mentions re-enabled\n` +
        `> ✅ Message permissions restored\n` +
        `> ✅ Slowmode removed from all channels\n` +
        `> ✅ Normal join monitoring resumed`
      )],
    });
  },

  async status(interaction, raidDetector) {
    const status = raidDetector.getLockdownStatus(interaction.guild.id);

    if (status.active) {
      const remaining = Math.floor(status.until / 1000);
      const elapsed = Math.floor((status.until - Date.now()) / 1000);
      const total = 15 * 60;
      const progress = Math.max(0, Math.min(total, total - elapsed));
      const filled = Math.round((progress / total) * 12);
      const bar = '█'.repeat(filled) + '░'.repeat(12 - filled);

      const embed = infoEmbed('Lockdown Active',
        `🔒 **Server is currently under lockdown.**\n` +
        `${BRAND.divider}\n` +
        `\`Time Left\`    <t:${remaining}:R>\n` +
        `\`Expires At\`   <t:${remaining}:f>\n` +
        `\`${bar}\`\n` +
        `${BRAND.divider}\n` +
        `Use \`/lockdown deactivate\` to lift the lockdown early.`
      );

      await interaction.reply({ embeds: [embed] });
    } else {
      const embed = infoEmbed('No Active Lockdown',
        `🟢 The server is **secure** — no lockdown is in effect.\n` +
        `${BRAND.divider}\n` +
        `Use \`/lockdown activate\` to manually engage lockdown if needed.`
      );

      await interaction.reply({ embeds: [embed] });
    }
  },
};
