const { EmbedBuilder, Colors } = require('discord.js');

/**
 * Create a standardized security alert embed.
 */
function securityEmbed(title, description, severity = 'medium') {
  const colorMap = {
    low: Colors.Yellow,
    medium: Colors.Orange,
    high: Colors.Red,
    critical: Colors.DarkRed,
  };

  return new EmbedBuilder()
    .setTitle(`🛡️ ${title}`)
    .setDescription(description)
    .setColor(colorMap[severity] || Colors.Orange)
    .setTimestamp()
    .setFooter({ text: 'Guardian Security Bot', iconURL: null });
}

/**
 * Create a success embed.
 */
function successEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setColor(Colors.Green)
    .setTimestamp();
}

/**
 * Create an error embed.
 */
function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setColor(Colors.Red)
    .setTimestamp();
}

/**
 * Create an info embed.
 */
function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description)
    .setColor(Colors.Blue)
    .setTimestamp();
}

/**
 * Create a warning embed.
 */
function warningEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setColor(Colors.Yellow)
    .setTimestamp();
}

/**
 * Create a ticket embed with order information.
 */
function ticketEmbed(ticket, order = null) {
  const statusEmoji = {
    OPEN: '🟢',
    PENDING: '🟡',
    RESOLVED: '🔵',
    CLOSED: '🔴',
  };

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket ${ticket.ticket_id}`)
    .setColor(Colors.Purple)
    .addFields(
      { name: 'Status', value: `${statusEmoji[ticket.status] || '🟢'} ${ticket.status}`, inline: true },
      { name: 'Subject', value: ticket.subject, inline: true },
      { name: 'Priority', value: getPriorityLabel(ticket.priority), inline: true },
      { name: 'Created', value: formatDate(ticket.created_at), inline: true },
      { name: 'Creator', value: `<@${ticket.creator_id}>`, inline: true },
      { name: 'Assigned To', value: ticket.assigned_to ? `<@${ticket.assigned_to}>` : 'Unassigned', inline: true },
    )
    .setTimestamp();

  if (ticket.description) {
    embed.setDescription(ticket.description.substring(0, 1024));
  }

  if (order) {
    embed.addFields(
      { name: '📦 Order Details', value: order.order_details || 'N/A', inline: false },
      { name: '💳 Payment', value: `${order.payment_method || 'N/A'} — ${order.payment_amount ? `$${order.payment_amount.toFixed(2)}` : 'N/A'}`, inline: true },
      { name: '✅ Complete', value: order.is_complete ? 'Yes' : 'No', inline: true },
    );
  }

  return embed;
}

/**
 * Create a user info embed with spam/level stats.
 */
function userInfoEmbed(member, spamScore = null, levelData = null, warnings = []) {
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${member.user.tag}`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setColor(Colors.Blurple)
    .addFields(
      { name: 'User ID', value: member.id, inline: true },
      { name: 'Joined Server', value: formatDate(member.joinedAt), inline: true },
      { name: 'Account Created', value: formatDate(member.user.createdAt), inline: true },
      { name: 'Roles', value: member.roles.cache.size > 1 ? member.roles.cache.filter(r => r.id !== r.guild.id).map(r => r.name).join(', ').substring(0, 1024) : 'None', inline: false },
    );

  if (spamScore) {
    embed.addFields(
      { name: '🚨 Spam Score', value: `${spamScore.score.toFixed(1)}`, inline: true },
      { name: '⚠️ Violations', value: `${spamScore.violations}`, inline: true },
    );
  }

  if (levelData) {
    embed.addFields(
      { name: '⭐ Level', value: `${levelData.level}`, inline: true },
      { name: '💠 XP', value: `${levelData.xp}`, inline: true },
      { name: '💬 Messages', value: `${levelData.message_count}`, inline: true },
    );
  }

  if (warnings.length > 0) {
    const warningList = warnings
      .slice(0, 5)
      .map(w => `• Warning #${w.id}: ${w.reason.substring(0, 50)} (${formatDate(w.created_at)})`)
      .join('\n');
    embed.addFields({ name: `⚠️ Warnings (${warnings.length})`, value: warningList.substring(0, 1024), inline: false });
  }

  return embed;
}

/**
 * Create a paginated list embed.
 */
function listEmbed(title, items, page = 1, totalPages = 1, color = Colors.Blue) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();

  if (items.length > 0) {
    embed.setDescription(items.join('\n'));
  } else {
    embed.setDescription('No items to display.');
  }

  if (totalPages > 1) {
    embed.setFooter({ text: `Page ${page} of ${totalPages}` });
  }

  return embed;
}

// =============================================================================
// Helper Functions
// =============================================================================

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
  formatDate,
};
