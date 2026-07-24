const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const { rateLimiter, RateLimitConfig } = require('../../utils/rateLimiter');
const logger = require('../../services/logger');

const activeGiveaways = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveawaycreate')
    .setDescription('Create a giveaway with role-based entry weights')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(opt => opt
      .setName('prize')
      .setDescription('What are you giving away?')
      .setMaxLength(200)
      .setRequired(true)
    )
    .addIntegerOption(opt => opt
      .setName('duration')
      .setDescription('Duration in minutes')
      .setMinValue(1)
      .setMaxValue(10080)
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('description')
      .setDescription('Description / rules for the giveaway')
      .setMaxLength(1000)
    )
    .addIntegerOption(opt => opt
      .setName('winners')
      .setDescription('Number of winners (default: 1)')
      .setMinValue(1)
      .setMaxValue(20)
    )
    .addRoleOption(opt => opt
      .setName('role-1')
      .setDescription('First role for bonus entries')
    )
    .addIntegerOption(opt => opt
      .setName('entries-1')
      .setDescription('Entries for role-1 (default: 2)')
      .setMinValue(1)
      .setMaxValue(50)
    )
    .addRoleOption(opt => opt
      .setName('role-2')
      .setDescription('Second role for bonus entries')
    )
    .addIntegerOption(opt => opt
      .setName('entries-2')
      .setDescription('Entries for role-2 (default: 3)')
      .setMinValue(1)
      .setMaxValue(50)
    )
    .addRoleOption(opt => opt
      .setName('role-3')
      .setDescription('Third role for bonus entries')
    )
    .addIntegerOption(opt => opt
      .setName('entries-3')
      .setDescription('Entries for role-3 (default: 5)')
      .setMinValue(1)
      .setMaxValue(50)
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    const prize = interaction.options.getString('prize');
    const description = interaction.options.getString('description') || 'No description provided.';
    const duration = interaction.options.getInteger('duration');
    const winnerCount = interaction.options.getInteger('winners') || 1;

    const roleWeights = [];
    for (let i = 1; i <= 3; i++) {
      const role = interaction.options.getRole(`role-${i}`);
      if (role) {
        const entries = interaction.options.getInteger(`entries-${i}`) || (i === 1 ? 2 : i === 2 ? 3 : 5);
        roleWeights.push({ roleId: role.id, roleName: role.name, entries });
      }
    }

    const endTimestamp = Math.floor((Date.now() + duration * 60000) / 1000);
    const durationText = formatDuration(duration);

    let roleText = 'Everyone: **1** entry';
    if (roleWeights.length > 0) {
      roleText = roleWeights.map(r => `> <@&${r.roleId}> → **${r.entries}** entries`).join('\n') + '\n> Everyone else → **1** entry';
    }

    const embed = new EmbedBuilder()
      .setTitle('✦ GIVEAWAY ✦')
      .setColor(Colors.Gold)
      .setDescription(
        `> ${description}\n\n` +
        `─────────────────────────`
      )
      .addFields(
        { name: '🏆  Prize', value: `**${prize}**`, inline: false },
        { name: '\u200B', value: '\u200B', inline: false },
        { name: '⚙  Configuration', value: [
          `> Winners: **${winnerCount}**`,
          `> Duration: **${durationText}**`,
          `> Ends: <t:${endTimestamp}:R>  •  <t:${endTimestamp}:f>`,
        ].join('\n'), inline: false },
        { name: '\u200B', value: '\u200B', inline: false },
        { name: '📊  Entry Weights', value: roleText, inline: false },
      )
      .setFooter({ text: '✦ Click a button below to participate ✦' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('giveaway_enter')
        .setLabel('Enter Giveaway')
        .setEmoji('🎟️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('giveaway_entries')
        .setLabel('My Entries')
        .setEmoji('📊')
        .setStyle(ButtonStyle.Secondary),
    );

    const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    const giveawayData = {
      messageId: msg.id,
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
      prize,
      description,
      winnerCount,
      roleWeights,
      endTime: Date.now() + duration * 60000,
      entries: new Map(),
      ended: false,
      createdBy: interaction.user.id,
    };

    activeGiveaways.set(msg.id, giveawayData);

    logger.info('GIVEAWAY_CREATED', {
      user: interaction.user.tag,
      guild: interaction.guild.id,
      prize,
      duration,
      winners: winnerCount,
      roles: roleWeights.map(r => `${r.roleName}:${r.entries}`),
    });

    setTimeout(async () => {
      const giveaway = activeGiveaways.get(msg.id);
      if (!giveaway || giveaway.ended) return;
      giveaway.ended = true;
      await endGiveaway(giveaway, interaction.client);
    }, duration * 60000);
  },
};

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

async function endGiveaway(giveaway, client) {
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(giveaway.messageId);

    const entries = giveaway.entries;
    if (entries.size === 0) {
      const noWinnerEmbed = new EmbedBuilder()
        .setTitle('✦ GIVEAWAY ENDED ✦')
        .setColor(Colors.Grey)
        .setDescription(
          `> **${giveaway.prize}**\n\n` +
          `─────────────────────────\n` +
          `> No one entered this giveaway.\n` +
          `> Better luck next time!`
        )
        .setFooter({ text: 'No winners to announce' })
        .setTimestamp();

      await message.edit({ embeds: [noWinnerEmbed], components: [] });
      return;
    }

    const weightedPool = [];
    for (const [userId, weight] of entries) {
      for (let i = 0; i < weight; i++) {
        weightedPool.push(userId);
      }
    }

    const winners = [];
    const used = new Set();
    const count = Math.min(giveaway.winnerCount, Math.floor(entries.size / 1));
    while (winners.length < count && weightedPool.length > 0) {
      const idx = Math.floor(Math.random() * weightedPool.length);
      const userId = weightedPool[idx];
      if (!used.has(userId)) {
        used.add(userId);
        winners.push(userId);
      }
      weightedPool.splice(idx, 1);
      if (weightedPool.length === 0 && winners.length < count) break;
    }

    const winnerText = winners.length > 0
      ? winners.map(id => `<@${id}>`).join(', ')
      : 'No winner selected';

    const endedEmbed = new EmbedBuilder()
      .setTitle('✦ GIVEAWAY ENDED ✦')
      .setColor(Colors.Gold)
      .setDescription(
        `> **${giveaway.prize}**\n\n` +
        `─────────────────────────`
      )
      .addFields(
        { name: '🏆  Winner(s)', value: winners.length > 0 ? winners.map(id => `> <@${id}>`).join('\n') : '> No winner selected', inline: false },
        { name: '\u200B', value: '\u200B', inline: false },
        { name: '📊  Statistics', value: [
          `> Unique Entries: **${entries.size}**`,
          `> Total Weighted: **${weightedPool.length + winners.length}**`,
        ].join('\n'), inline: false },
      )
      .setFooter({ text: '✦ Congratulations to the winner(s) ✦' })
      .setTimestamp();

    await message.edit({ embeds: [endedEmbed], components: [] });

    if (winners.length > 0) {
      await channel.send({
        content: `🎉 Congratulations ${winnerText}! You won **${giveaway.prize}**!\n─────────────────────────\nClaim your prize now!`,
      });
    }

    logger.info('GIVEAWAY_ENDED', {
      guild: giveaway.guildId,
      prize: giveaway.prize,
      winners: winners.length,
      totalEntries: entries.size,
    });

    activeGiveaways.delete(giveaway.messageId);
  } catch (error) {
    logger.error('Failed to end giveaway', { error: error.message, giveawayId: giveaway.messageId });
  }
}

module.exports.handleButton = async function handleButton(interaction) {
  const giveaway = activeGiveaways.get(interaction.message.id);
  if (!giveaway || giveaway.ended) {
    return interaction.reply({ embeds: [errorEmbed('Giveaway Ended', 'This giveaway has ended.')], ephemeral: true });
  }

  if (interaction.customId === 'giveaway_entries') {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const weight = getEntryWeight(member, giveaway.roleWeights);
    const entries = giveaway.entries.get(interaction.user.id) || 0;

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✦ Your Entry Info ✦')
          .setColor(Colors.Blurple)
          .setDescription(
            `─────────────────────────`
          )
          .addFields(
            { name: '🎟️  Your Weight', value: `> **${weight}** entries`, inline: true },
            { name: '📋  Status', value: entries > 0 ? '> ✅ Entered' : '> ❌ Not Entered', inline: true },
            { name: '⏰  Time Left', value: `> <t:${Math.floor(giveaway.endTime / 1000)}:R>`, inline: true },
          )
          .setFooter({ text: '✦ Toggle entry with the button below ✦' })
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (interaction.customId === 'giveaway_enter') {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const weight = getEntryWeight(member, giveaway.roleWeights);

    if (giveaway.entries.has(interaction.user.id)) {
      giveaway.entries.delete(interaction.user.id);
      return interaction.reply({
        embeds: [successEmbed('Entry Removed', `You have been removed from ${giveaway.prize}.\nClick the button again to re-enter.`)],
        ephemeral: true,
      });
    }

    giveaway.entries.set(interaction.user.id, weight);

    const roleInfo = weight > 1 ? `\n\nBonus: You receive ${weight} entries due to your role!` : '';

    return interaction.reply({
      embeds: [successEmbed('Entered!', `You have entered ${giveaway.prize} with ${weight} entries.\nTime left: <t:${Math.floor(giveaway.endTime / 1000)}:R>${roleInfo}`)],
      ephemeral: true,
    });
  }
};

function getEntryWeight(member, roleWeights) {
  for (const rw of roleWeights) {
    if (member.roles.cache.has(rw.roleId)) {
      return rw.entries;
    }
  }
  return 1;
}
