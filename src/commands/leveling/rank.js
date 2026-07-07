const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed, userInfoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your or another user\'s level and XP')
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('User to check rank for')
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guild.id;
    const targetMember = interaction.guild.members.cache.get(targetUser.id);

    const levelData = db.getUserLevel(guildId, targetUser.id);

    if (!levelData || levelData.message_count === 0) {
      return interaction.reply({
        embeds: [infoEmbed('📊 No Data',
          targetUser.id === interaction.user.id
            ? 'You don\'t have any XP yet. Start chatting in XP-enabled channels to earn XP!'
            : `${targetUser.tag} doesn't have any XP yet.`
        )],
        ephemeral: targetUser.id !== interaction.user.id,
      });
    }

    // Calculate rank and progress
    const rank = db.getUserRank(guildId, targetUser.id);
    const xpSystem = interaction.client.xpSystem;
    const progress = xpSystem.getLevelProgress(levelData);

    // Create progress bar
    const progressBar = this.createProgressBar(progress.percentage);

    const embed = infoEmbed(
      `⭐ ${targetUser.tag} — Level ${levelData.level}`,
      `**Rank:** #${rank} on this server\n\n` +
      `**XP:** ${levelData.xp} total\n` +
      `**Level Progress:**\n` +
      `${progressBar} **${progress.percentage}%**\n` +
      `${progress.current.toLocaleString()} / ${progress.needed.toLocaleString()} XP to next level\n\n` +
      `**Stats:**\n` +
      `• Messages: ${levelData.message_count.toLocaleString()}\n` +
      `• Voice Time: ${Math.floor((levelData.voice_minutes || 0) / 60)}h ${(levelData.voice_minutes || 0) % 60}m`
    );

    embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));

    await interaction.reply({ embeds: [embed] });
  },

  createProgressBar(percentage, length = 12) {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  },
};
