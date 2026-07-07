const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const { infoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank-card')
    .setDescription('Show a visual rank card for a user')
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('User to show rank card for')
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guild.id;

    const levelData = db.getUserLevel(guildId, targetUser.id);

    if (!levelData || levelData.message_count === 0) {
      return interaction.reply({
        embeds: [infoEmbed('📊 No Data', `${targetUser.tag} doesn't have any XP yet.`)],
        ephemeral: true,
      });
    }

    const rank = db.getUserRank(guildId, targetUser.id);
    const xpSystem = interaction.client.xpSystem;
    const progress = xpSystem.getLevelProgress(levelData);

    const filled = Math.round((progress.percentage / 100) * 20);
    const empty = 20 - filled;
    const progressBar = '█'.repeat(filled) + '░'.repeat(empty);

    const embed = new EmbedBuilder()
      .setTitle(`⭐ ${targetUser.tag}`)
      .setDescription(`**Level ${levelData.level}** — Rank #${rank}`)
      .setColor(Colors.Gold)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: 'XP Progress', value: `${progressBar} **${progress.percentage}%**\n\`${progress.current.toLocaleString()}\` / \`${progress.needed.toLocaleString()}\` XP`, inline: false },
        { name: 'Total XP', value: `\`${levelData.total_xp.toLocaleString()}\``, inline: true },
        { name: 'Messages', value: `\`${levelData.message_count.toLocaleString()}\``, inline: true },
        { name: 'Voice Time', value: `\`${Math.floor((levelData.voice_minutes || 0) / 60)}h ${(levelData.voice_minutes || 0) % 60}m\``, inline: true },
      )
      .setFooter({ text: `${interaction.guild.name} • Leveling System` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
