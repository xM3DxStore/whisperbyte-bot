const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('xp-reset')
    .setDescription('Reset a user\'s XP and level')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('User to reset')
      .setRequired(true)
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const guildId = interaction.guild.id;

    const levelData = db.getUserLevel(guildId, targetUser.id);

    if (!levelData) {
      return interaction.reply({
        embeds: [errorEmbed('Error', `${targetUser.tag} has no XP data.`)],
        ephemeral: true,
      });
    }

    db.upsertUserLevel(guildId, targetUser.id, {
      xp: 0,
      level: 1,
      total_xp: 0,
    });

    db.addAuditLog(guildId, 'XP_RESET', interaction.user.id, targetUser.id,
      `Reset XP (was level ${levelData.level}, ${levelData.total_xp} XP)`
    );

    await interaction.reply({
      embeds: [successEmbed('XP Reset',
        `${targetUser.tag}'s XP has been reset.\n` +
        `**Was:** Level ${levelData.level} (${levelData.total_xp.toLocaleString()} XP)\n` +
        `**Now:** Level 1 (0 XP)`
      )],
    });
  },
};
