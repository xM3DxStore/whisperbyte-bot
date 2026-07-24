const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { infoEmbed, BRAND } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and bot information')
    .addStringOption(opt => opt
      .setName('category')
      .setDescription('Command category to view')
      .addChoices(
        { name: '🔒 Security', value: 'security' },
        { name: '🎫 Tickets', value: 'tickets' },
        { name: '⭐ Leveling', value: 'leveling' },
        { name: '🛡️ Moderation', value: 'moderation' },
        { name: '⚙️ Utility', value: 'utility' },
        { name: '📋 All Commands', value: 'all' },
      )
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const category = interaction.options.getString('category');

    if (category) {
      return this.showCategory(interaction, category);
    }

    const uptime = this.formatUptime(interaction.client.uptime);
    const guilds = interaction.client.guilds.cache.size;
    const users = interaction.client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Guardian Security Bot')
      .setDescription(
        'Your comprehensive Discord security and management solution.\n' +
        `${BRAND.divider}`
      )
      .setColor(0x5865F2)
      .addFields(
        {
          name: '🔒 Security',
          value: '`/help security`',
          inline: true,
        },
        {
          name: '🎫 Tickets',
          value: '`/help tickets`',
          inline: true,
        },
        {
          name: '⭐ Leveling',
          value: '`/help leveling`',
          inline: true,
        },
        {
          name: '🛡️ Moderation',
          value: '`/help moderation`',
          inline: true,
        },
        {
          name: '⚙️ Utility',
          value: '`/help utility`',
          inline: true,
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: true,
        },
        {
          name: `${BRAND.thinDivider}`,
          value: '\u200B',
          inline: false,
        },
        {
          name: '🤖 AI-Powered Spam Detection',
          value: 'Multi-factor analysis with adaptive learning',
          inline: false,
        },
        {
          name: '🚨 Anti-Raid Protection',
          value: 'Automatic detection and lockdown',
          inline: false,
        },
        {
          name: '🎫 Advanced Ticket System',
          value: 'Full order and payment tracking',
          inline: false,
        },
        {
          name: '⭐ XP & Leveling',
          value: 'Gamified engagement with role rewards',
          inline: false,
        },
        {
          name: '🛡️ Moderation Suite',
          value: 'Warn, mute, kick, ban, purge, slowmode',
          inline: false,
        },
      )
      .setFooter({
        text: `${guilds} servers • ${users} users • Uptime: ${uptime} • ${BRAND.name}`,
        iconURL: BRAND.icon || undefined,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async showCategory(interaction, category) {
    const categories = {
      security: {
        title: '🔒 Security Commands',
        desc: 'Configure and manage security features.',
        color: 0xED4245,
        commands: [
          { name: '/anti-spam settings', desc: 'View spam detection settings' },
          { name: '/anti-spam sensitivity', desc: 'Set detection sensitivity (0.0–1.0)' },
          { name: '/anti-spam thresholds', desc: 'Set warn/mute/ban score thresholds' },
          { name: '/anti-spam whitelist', desc: 'Ignore a channel from spam detection' },
          { name: '/anti-spam reset', desc: "Reset a user's spam score" },
          { name: '/anti-raid status', desc: 'Check anti-raid protection status' },
          { name: '/anti-raid threshold', desc: 'Set join rate threshold' },
          { name: '/anti-raid enable/disable', desc: 'Toggle raid protection' },
          { name: '/lockdown activate', desc: 'Emergency server lockdown' },
          { name: '/lockdown status', desc: 'Check lockdown status' },
          { name: '/verification setup', desc: 'Set up member verification' },
          { name: '/verification disable', desc: 'Disable verification' },
          { name: '/whitelist add', desc: 'Whitelist user from spam/raid' },
          { name: '/whitelist remove', desc: 'Remove from whitelist' },
          { name: '/whitelist list', desc: 'View whitelisted users' },
        ],
      },
      tickets: {
        title: '🎫 Ticket Commands',
        desc: 'Create and manage support tickets with order tracking.',
        color: 0xEB459E,
        commands: [
          { name: '/ticket-create', desc: 'Create a new support ticket' },
          { name: '/ticket-create-panel', desc: 'Set up ticket creation panel' },
          { name: '/ticket-delete', desc: 'Close a ticket' },
          { name: '/ticket-status view', desc: 'View ticket details' },
          { name: '/ticket-status update', desc: 'Update ticket status' },
          { name: '/ticket-status list', desc: 'List all tickets' },
          { name: '/ticket-status my', desc: 'View your tickets' },
          { name: '/ticket-payment record', desc: 'Record payment' },
          { name: '/ticket-payment status', desc: 'View payment info' },
          { name: '/ticket-payment complete', desc: 'Mark order complete' },
          { name: '/close', desc: 'Quick close a ticket' },
          { name: '/transcript', desc: 'Export ticket transcript' },
          { name: '/rating', desc: 'Send satisfaction rating' },
        ],
      },
      leveling: {
        title: '⭐ Leveling Commands',
        desc: 'Track XP, levels, and manage the XP system.',
        color: 0xFEE75C,
        commands: [
          { name: '/rank', desc: "Check your or another user's rank" },
          { name: '/rank-card', desc: 'Show visual rank card' },
          { name: '/leaderboard', desc: 'View server XP leaderboard' },
          { name: '/configure-xp settings', desc: 'View XP configuration' },
          { name: '/configure-xp toggle', desc: 'Enable/disable XP' },
          { name: '/configure-xp multiplier', desc: 'Set XP rate (0.5x–5x)' },
          { name: '/configure-xp add-channel', desc: 'Add XP channel' },
          { name: '/configure-xp ignore', desc: 'Ignore channel (no XP)' },
          { name: '/configure-xp role-reward', desc: 'Set role reward' },
          { name: '/xp-reset', desc: "Reset a user's XP" },
        ],
      },
      moderation: {
        title: '🛡️ Moderation Commands',
        desc: 'Keep your server safe with powerful moderation tools.',
        color: 0x57F287,
        commands: [
          { name: '/warn', desc: 'Issue a warning to a user' },
          { name: '/mute', desc: 'Timeout a user' },
          { name: '/timeout', desc: 'Temp mute with duration' },
          { name: '/kick', desc: 'Kick a user from the server' },
          { name: '/ban', desc: 'Ban a user' },
          { name: '/purge', desc: 'Bulk delete messages' },
          { name: '/slowmode', desc: 'Set channel slowmode' },
          { name: '/embed', desc: 'Send rich embed announcement' },
          { name: '/logs', desc: 'View moderation action history' },
        ],
      },
      utility: {
        title: '⚙️ Utility Commands',
        desc: 'Additional helpful commands.',
        color: 0x5865F2,
        commands: [
          { name: '/help', desc: 'Show this help menu' },
          { name: '/ping', desc: 'Check bot latency' },
          { name: '/announce', desc: 'Send an announcement' },
          { name: '/giveaway-dm', desc: 'DM all members about a giveaway' },
          { name: '/remindme', desc: 'Set a reminder' },
          { name: '/poll', desc: 'Create a reaction poll' },
          { name: '/backup', desc: 'Export server settings' },
        ],
      },
      all: {
        title: '📋 All Commands',
        desc: 'Complete list of all bot commands.',
        color: 0x5865F2,
        commands: null,
      },
    };

    const cat = categories[category];
    if (!cat) return interaction.reply({ content: 'Category not found.', ephemeral: true });

    if (category === 'all') {
      const embed = new EmbedBuilder()
        .setTitle(`📋 All Commands`)
        .setDescription(`${cat.desc}\n${BRAND.divider}`)
        .setColor(cat.color)
        .addFields(
          {
            name: '🔒 Security',
            value: '`/anti-spam` · `/anti-raid` · `/lockdown` · `/verification` · `/whitelist`',
            inline: false,
          },
          {
            name: '🎫 Tickets',
            value: '`/ticket-create` · `/ticket-create-panel` · `/ticket-delete` · `/ticket-status` · `/ticket-payment` · `/close` · `/transcript` · `/rating`',
            inline: false,
          },
          {
            name: '⭐ Leveling',
            value: '`/rank` · `/rank-card` · `/leaderboard` · `/configure-xp` · `/xp-reset`',
            inline: false,
          },
          {
            name: '🛡️ Moderation',
            value: '`/warn` · `/mute` · `/timeout` · `/kick` · `/ban` · `/purge` · `/slowmode` · `/embed` · `/logs`',
            inline: false,
          },
          {
            name: '⚙️ Utility',
            value: '`/help` · `/ping` · `/announce` · `/giveaway-dm` · `/remindme` · `/poll` · `/backup`',
            inline: false,
          },
        )
        .setFooter({ text: `Use /help <category> for details • ${BRAND.name}`, iconURL: BRAND.icon || undefined })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    const numbered = cat.commands.map((c, i) => `**${i + 1}.** \`${c.name}\` — ${c.desc}`);

    const embed = new EmbedBuilder()
      .setTitle(cat.title)
      .setDescription(`${cat.desc}\n${BRAND.thinDivider}`)
      .setColor(cat.color)
      .setTimestamp()
      .setFooter({ text: `${cat.commands.length} commands • ${BRAND.name}`, iconURL: BRAND.icon || undefined });

    const chunks = this.chunk(numbered, 15);
    for (const chunk of chunks) {
      embed.addFields({
        name: '\u200B',
        value: chunk.join('\n'),
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },

  chunk(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  },

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  },
};
