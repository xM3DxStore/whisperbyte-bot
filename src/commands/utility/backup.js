const { SlashCommandBuilder, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Export server settings and configuration')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(opt => opt
      .setName('type')
      .setDescription('What to backup')
      .addChoices(
        { name: 'Full Settings', value: 'full' },
        { name: 'Channels Only', value: 'channels' },
        { name: 'Roles Only', value: 'roles' },
        { name: 'Bot Config Only', value: 'config' },
      )
    ),

  rateLimit: 'MODERATION',

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const type = interaction.options.getString('type') || 'full';
    const guild = interaction.guild;

    try {
      const backup = {
        guild: {
          name: guild.name,
          id: guild.id,
          createdAt: guild.createdAt.toISOString(),
          memberCount: guild.memberCount,
          owner: guild.ownerId,
        },
        timestamp: new Date().toISOString(),
      };

      if (type === 'full' || type === 'channels') {
        backup.channels = guild.channels.cache.map(ch => ({
          name: ch.name,
          type: ch.type,
          id: ch.id,
          parent: ch.parent?.name || null,
          position: ch.position,
          topic: ch.topic || null,
          nsfw: ch.nsfw || false,
          slowmode: ch.rateLimitPerUser || 0,
        })).sort((a, b) => a.position - b.position);
      }

      if (type === 'full' || type === 'roles') {
        backup.roles = guild.roles.cache
          .filter(r => r.id !== guild.id)
          .map(r => ({
            name: r.name,
            color: r.hexColor,
            position: r.position,
            permissions: r.permissions.bitfield.toString(),
            mentionable: r.mentionable,
            members: r.members.size,
          }))
          .sort((a, b) => b.position - a.position);
      }

      if (type === 'full' || type === 'config') {
        const guildConfig = db.getGuild(guild.id);
        backup.botConfig = guildConfig || {};
      }

      const json = JSON.stringify(backup, null, 2);
      const buffer = Buffer.from(json, 'utf-8');
      const filename = `backup_${guild.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
      const attachment = new AttachmentBuilder(buffer, { name: filename });

      db.addAuditLog(guild.id, 'BACKUP', interaction.user.id, null,
        `Created ${type} backup`,
        JSON.stringify({ type, filename })
      );

      await interaction.editReply({
        embeds: [successEmbed('Backup Created',
          `**Type:** ${type}\n` +
          `**File:** ${filename}\n` +
          `**Size:** ${(buffer.length / 1024).toFixed(1)} KB`
        )],
        files: [attachment],
      });
    } catch (error) {
      await interaction.editReply({
        embeds: [errorEmbed('Error', `Failed to create backup: ${error.message}`)],
      });
    }
  },
};
