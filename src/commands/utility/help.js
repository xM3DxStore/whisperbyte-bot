const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed } = require('../../utils/embedBuilder');

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

    const embed = infoEmbed(
      '🛡️ Guardian Security Bot',
      'Your comprehensive Discord security and management solution.\n\n' +
      '**Core Features:**\n' +
      '• 🤖 **AI-Powered Spam Detection** — Multi-factor analysis with adaptive learning\n' +
      '• 🚨 **Anti-Raid Protection** — Automatic detection and lockdown\n' +
      '• 🎫 **Advanced Ticket System** — Full order & payment tracking\n' +
      '• ⭐ **XP & Leveling** — Gamified engagement with role rewards\n' +
      '• 🛡️ **Moderation Suite** — Warn, mute, kick, ban, purge, slowmode\n' +
      '• 📬 **Giveaway DM** — Broadcast messages to all members\n\n' +
      '**Quick Links:**\n' +
      'Use `/help security` for security commands\n' +
      'Use `/help tickets` for ticket commands\n' +
      'Use `/help leveling` for XP/leveling commands\n' +
      'Use `/help moderation` for moderation commands\n' +
      'Use `/help utility` for utility commands\n\n' +
      `**Servers:** ${interaction.client.guilds.cache.size}` +
      ` | **Uptime:** ${this.formatUptime(interaction.client.uptime)}`
    );

    await interaction.reply({ embeds: [embed] });
  },

  async showCategory(interaction, category) {
    const categories = {
      security: {
        title: '🔒 Security Commands',
        desc: 'Configure and manage security features.',
        commands: [
          '`/anti-spam settings` — View spam detection settings',
          '`/anti-spam sensitivity <level>` — Set detection sensitivity (0.0-1.0)',
          '`/anti-spam thresholds` — Set warn/mute/ban score thresholds',
          '`/anti-spam whitelist <channel>` — Ignore a channel from spam detection',
          '`/anti-spam reset <user>` — Reset a user\'s spam score',
          '`/anti-raid status` — Check anti-raid protection status',
          '`/anti-raid threshold <joins>` — Set join rate threshold',
          '`/anti-raid enable/disable` — Toggle raid protection',
          '`/lockdown activate/deactivate` — Emergency server lockdown',
          '`/lockdown status` — Check lockdown status',
          '`/verification setup` — Set up member verification',
          '`/verification disable` — Disable verification',
          '`/verification status` — Check verification status',
          '`/whitelist add <user>` — Whitelist user from spam/raid',
          '`/whitelist remove <user>` — Remove from whitelist',
          '`/whitelist list` — View whitelisted users',
        ],
      },
      tickets: {
        title: '🎫 Ticket Commands',
        desc: 'Create and manage support tickets with order tracking.',
        commands: [
          '`/ticket-create <subject>` — Create a new support ticket',
          '`/ticket-create-panel` — Set up ticket creation panel',
          '`/ticket-delete [ticket_id]` — Close a ticket',
          '`/ticket-status view [ticket_id]` — View ticket details',
          '`/ticket-status update <id> <status>` — Update ticket status',
          '`/ticket-status list [filter]` — List all tickets',
          '`/ticket-status my` — View your tickets',
          '`/ticket-payment record <id> <method> <amount>` — Record payment',
          '`/ticket-payment status <ticket_id>` — View payment info',
          '`/ticket-payment complete <id> <bool>` — Mark order complete',
          '`/close [ticket_id] [reason]` — Quick close a ticket',
          '`/transcript <ticket_id>` — Export ticket transcript',
          '`/rating <ticket_id>` — Send satisfaction rating',
        ],
      },
      leveling: {
        title: '⭐ Leveling Commands',
        desc: 'Track XP, levels, and manage the XP system.',
        commands: [
          '`/rank [user]` — Check your or another user\'s rank',
          '`/rank-card [user]` — Show visual rank card',
          '`/leaderboard [page]` — View server XP leaderboard',
          '`/configure-xp settings` — View XP configuration',
          '`/configure-xp toggle <enabled>` — Enable/disable XP',
          '`/configure-xp multiplier <rate>` — Set XP rate (0.5x-5x)',
          '`/configure-xp add-channel <channel>` — Add XP channel',
          '`/configure-xp ignore <channel>` — Ignore channel (no XP)',
          '`/configure-xp role-reward <level> <role>` — Set role reward',
          '`/xp-reset <user>` — Reset a user\'s XP',
        ],
      },
      moderation: {
        title: '🛡️ Moderation Commands',
        desc: 'Keep your server safe with powerful moderation tools.',
        commands: [
          '`/warn <user> <reason>` — Issue a warning to a user',
          '`/mute <user> <duration> [reason]` — Timeout a user',
          '`/timeout <user> <duration> [reason]` — Temp mute with duration',
          '`/kick <user> [reason]` — Kick a user from the server',
          '`/ban <user> [reason] [days]` — Ban a user',
          '`/purge <amount> [user] [filter]` — Bulk delete messages',
          '`/slowmode <seconds> [channel]` — Set channel slowmode',
          '`/embed <title> <description>` — Send rich embed announcement',
          '`/logs [limit] [action]` — View moderation action history',
        ],
      },
      utility: {
        title: '⚙️ Utility Commands',
        desc: 'Additional helpful commands.',
        commands: [
          '`/help [category]` — Show this help menu',
          '`/ping` — Check bot latency',
          '`/announce <title> <message>` — Send an announcement',
          '`/giveaway-dm <message>` — DM all members about a giveaway',
          '`/remindme <time> <message>` — Set a reminder',
          '`/poll <question> [options]` — Create a reaction poll',
          '`/backup [type]` — Export server settings',
        ],
      },
      all: {
        title: '📋 All Commands',
        desc: 'Complete list of all bot commands.',
        commands: [
          '**🔒 Security:**',
          '/anti-spam, /anti-raid, /lockdown, /verification, /whitelist',
          '',
          '**🎫 Tickets:**',
          '/ticket-create, /ticket-panel, /ticket-delete, /ticket-status, /ticket-payment, /close, /transcript, /rating',
          '',
          '**⭐ Leveling:**',
          '/rank, /rank-card, /leaderboard, /configure-xp, /xp-reset',
          '',
          '**🛡️ Moderation:**',
          '/warn, /mute, /timeout, /kick, /ban, /purge, /slowmode, /embed, /logs',
          '',
          '**⚙️ Utility:**',
          '/help, /ping, /announce, /giveaway-dm, /remindme, /poll, /backup',
        ],
      },
    };

    const cat = categories[category];
    if (!cat) return interaction.reply({ content: 'Category not found.', ephemeral: true });

    const embed = infoEmbed(cat.title, `${cat.desc}\n\n${cat.commands.join('\n')}`);

    await interaction.reply({ embeds: [embed] });
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
