const { SlashCommandBuilder } = require('discord.js');
const { listEmbed, infoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the server XP leaderboard')
    .addIntegerOption(opt => opt
      .setName('page')
      .setDescription('Page number')
      .setMinValue(1)
      .setMaxValue(50)
    ),

  rateLimit: 'XP',

  async execute(interaction) {
    const page = interaction.options.getInteger('page') || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const guildId = interaction.guild.id;

    // Get total user count
    const totalStmt = db.getDb().prepare(
      'SELECT COUNT(*) as count FROM user_levels WHERE guild_id = ?'
    );
    const totalCount = totalStmt.get(guildId).count;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    if (totalCount === 0) {
      return interaction.reply({
        embeds: [infoEmbed('🏆 Leaderboard', 'No XP data yet. Start chatting to earn XP!')],
      });
    }

    // Get leaderboard data with pagination
    const leaderboard = db.getDb().prepare(
      'SELECT * FROM user_levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ? OFFSET ?'
    ).all(guildId, limit, offset);

    // Build leaderboard items
    const medals = ['🥇', '🥈', '🥉'];
    const items = leaderboard.map((entry, index) => {
      const globalRank = offset + index + 1;
      const medal = globalRank <= 3 ? medals[globalRank - 1] : `${globalRank}.`;
      const user = interaction.client.users.cache.get(entry.user_id);
      const username = user ? user.tag : entry.user_id;
      const progress = interaction.client.xpSystem.getLevelProgress(entry);

      return `${medal} **${username}** — Level **${entry.level}** (${entry.xp.toLocaleString()} XP) | ${progress.percentage}% to next level`;
    });

    const embed = listEmbed(
      `🏆 XP Leaderboard — ${interaction.guild.name}`,
      items,
      page,
      totalPages,
    );

    // Add total stats
    embed.addFields({
      name: '📊 Server Stats',
      value: `• Total tracked users: ${totalCount}\n` +
             `• Users on this page: ${leaderboard.length}`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
