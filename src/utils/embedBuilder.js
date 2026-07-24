const { EmbedBuilder, Colors } = require('discord.js');

const BRAND = {
  name: 'Guardian Security',
  icon: null,
  color: 0x2B2D31,
  accent: 0x5865F2,
  divider: '─────────────────────────',
  thinDivider: '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄',
};

function brandFooter() {
  return { text: `${BRAND.name} • Powered by AI`, iconURL: BRAND.icon || undefined };
}

function securityEmbed(title, description, severity = 'medium') {
  const colorMap = {
    low: 0xFEE75C,
    medium: 0xFEE75C,
    high: 0xED4245,
    critical: 0x9B2335,
  };
  const iconMap = {
    low: '🟡',
    medium: '🟠',
    high: '🔴',
    critical: '💀',
  };

  return new EmbedBuilder()
    .setTitle(`${iconMap[severity] || '🛡️'} ${title}`)
    .setDescription(
      `> ${description.split('\n').join('\n> ')}`
    )
    .setColor(colorMap[severity] || 0xFEE75C)
    .setTimestamp()
    .setFooter(brandFooter());
}

function successEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setColor(0x57F287)
    .setTimestamp()
    .setFooter(brandFooter());
}

function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setColor(0xED4245)
    .setTimestamp()
    .setFooter(brandFooter());
}

function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description)
    .setColor(0x5865F2)
    .setTimestamp()
    .setFooter(brandFooter());
}

function warningEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`⚠️ ${title}`)
    .setDescription(
      `> ${description.split('\n').join('\n> ')}`
    )
    .setColor(0xFEE75C)
    .setTimestamp()
    .setFooter(brandFooter());
}

function ticketEmbed(ticket, order = null) {
  const statusEmoji = {
    OPEN: '🟢',
    PENDING: '🟡',
    RESOLVED: '🔵',
    CLOSED: '🔴',
  };

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket ${ticket.ticket_id}`)
    .setColor(0xEB459E)
    .setDescription(
      ticket.description
        ? `> ${ticket.description.substring(0, 1024).split('\n').join('\n> ')}`
        : `> ${ticket.subject}`
    )
    .addFields(
      { name: '━━━━━━━━━━━━━━━━━━━', value: '\u200B', inline: false },
      { name: '📋 Status', value: `${statusEmoji[ticket.status] || '🟢'} **${ticket.status}**`, inline: true },
      { name: '📌 Subject', value: `\`${ticket.subject}\``, inline: true },
      { name: '⚡ Priority', value: getPriorityLabel(ticket.priority), inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '👤 Creator', value: `<@${ticket.creator_id}>`, inline: true },
      { name: '🎯 Assigned', value: ticket.assigned_to ? `<@${ticket.assigned_to}>` : '```Unassigned```', inline: true },
      { name: '━━━━━━━━━━━━━━━━━━━', value: '\u200B', inline: false },
      { name: '📅 Created', value: `\`${formatDate(ticket.created_at)}\``, inline: true },
    )
    .setTimestamp()
    .setFooter(brandFooter());

  if (order) {
    embed.addFields(
      { name: '📦 Order Details', value: `>>> ${order.order_details || 'N/A'}`, inline: false },
      { name: '💳 Payment', value: `\`${order.payment_method || 'N/A'}\` • **${order.payment_amount ? `$${order.payment_amount.toFixed(2)}` : 'N/A'}**`, inline: true },
      { name: '✅ Complete', value: order.is_complete ? '`YES`' : '`NO`', inline: true },
    );
  }

  return embed;
}

function userInfoEmbed(member, spamScore = null, levelData = null, warnings = []) {
  const embed = new EmbedBuilder()
    .setTitle(`👤 ${member.user.tag}`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setColor(0x5865F2)
    .setDescription(
      `>>> **${member.user.username}** — <@${member.id}>`
    )
    .addFields(
      { name: '━━━━━━━━━━━━━━━━━━━', value: '\u200B', inline: false },
      { name: '🆔 User ID', value: `\`${member.id}\``, inline: true },
      { name: '📅 Joined Server', value: `\`${formatDate(member.joinedAt)}\``, inline: true },
      { name: '🎂 Account Created', value: `\`${formatDate(member.user.createdAt)}\``, inline: true },
    )
    .setTimestamp()
    .setFooter(brandFooter());

  const roles = member.roles.cache.filter(r => r.id !== r.guild.id).map(r => r.name);
  if (roles.length > 0) {
    embed.addFields(
      { name: `🎭 Roles [${roles.length}]`, value: roles.slice(0, 15).map(r => `\`${r}\``).join(' • ').substring(0, 1024), inline: false },
    );
  }

  if (spamScore) {
    embed.addFields(
      { name: '━━━━━━━━━━━━━━━━━━━', value: '\u200B', inline: false },
      { name: '🚨 Spam Score', value: `**\`${spamScore.score.toFixed(1)}\`**`, inline: true },
      { name: '⚠️ Violations', value: `**\`${spamScore.violations}\`**`, inline: true },
    );
  }

  if (levelData) {
    embed.addFields(
      { name: '━━━━━━━━━━━━━━━━━━━', value: '\u200B', inline: false },
      { name: '⭐ Level', value: `**\`${levelData.level}\`**`, inline: true },
      { name: '💠 XP', value: `**\`${levelData.xp}\`**`, inline: true },
      { name: '💬 Messages', value: `**\`${levelData.message_count}\`**`, inline: true },
    );
  }

  if (warnings.length > 0) {
    const warningList = warnings
      .slice(0, 5)
      .map(w => `> ⚠️ **#${w.id}**: ${w.reason.substring(0, 50)} *(${formatDate(w.created_at)})*`)
      .join('\n');
    embed.addFields(
      { name: `🚨 Warnings [${warnings.length}]`, value: warningList.substring(0, 1024), inline: false },
    );
  }

  return embed;
}

function listEmbed(title, items, page = 1, totalPages = 1, color = 0x5865F2) {
  const embed = new EmbedBuilder()
    .setTitle(`📋 ${title}`)
    .setColor(color)
    .setTimestamp()
    .setFooter(brandFooter());

  if (items.length > 0) {
    embed.setDescription(items.join('\n'));
  } else {
    embed.setDescription('> _No items to display._');
  }

  if (totalPages > 1) {
    embed.setFooter({ text: `📄 Page ${page} of ${totalPages} • ${BRAND.name}`, iconURL: BRAND.icon || undefined });
  }

  return embed;
}

function premiumEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`💎 ${title}`)
    .setDescription(description)
    .setColor(0x5865F2)
    .setTimestamp()
    .setFooter(brandFooter());
}

function progressBar(current, total, width = 12) {
  const filled = Math.round((current / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function getPriorityLabel(priority) {
  const labels = {
    1: '🟢 Low',
    2: '🟡 Medium',
    3: '🟠 High',
    4: '🔴 Critical',
  };
  return labels[priority] || 'Unknown';
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

module.exports = {
  securityEmbed,
  successEmbed,
  errorEmbed,
  infoEmbed,
  warningEmbed,
  ticketEmbed,
  userInfoEmbed,
  listEmbed,
  premiumEmbed,
  progressBar,
  formatDate,
  BRAND,
};
