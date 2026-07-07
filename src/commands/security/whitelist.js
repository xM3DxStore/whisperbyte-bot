const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embedBuilder');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage anti-spam/raid whitelist')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Whitelist a user from spam/raid detection')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to whitelist')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a user from whitelist')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to remove')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('View whitelisted users')
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const guild = db.ensureGuild(guildId);

    let whitelist = [];
    try {
      whitelist = JSON.parse(guild.whitelist_users || '[]');
    } catch { whitelist = []; }

    if (subcommand === 'add') {
      const user = interaction.options.getUser('user');

      if (whitelist.includes(user.id)) {
        return interaction.reply({ embeds: [errorEmbed('Already Whitelisted', `${user.tag} is already whitelisted.`)], ephemeral: true });
      }

      whitelist.push(user.id);
      db.updateGuild(guildId, { whitelist_users: JSON.stringify(whitelist) });

      db.addAuditLog(guildId, 'WHITELIST_ADD', interaction.user.id, user.id, 'Added to spam/raid whitelist');

      await interaction.reply({
        embeds: [successEmbed('Whitelisted', `${user.tag} has been whitelisted from spam/raid detection.`)],
      });
    }

    if (subcommand === 'remove') {
      const user = interaction.options.getUser('user');

      if (!whitelist.includes(user.id)) {
        return interaction.reply({ embeds: [errorEmbed('Not Whitelisted', `${user.tag} is not whitelisted.`)], ephemeral: true });
      }

      whitelist = whitelist.filter(id => id !== user.id);
      db.updateGuild(guildId, { whitelist_users: JSON.stringify(whitelist) });

      db.addAuditLog(guildId, 'WHITELIST_REMOVE', interaction.user.id, user.id, 'Removed from spam/raid whitelist');

      await interaction.reply({
        embeds: [successEmbed('Removed', `${user.tag} has been removed from the whitelist.`)],
      });
    }

    if (subcommand === 'list') {
      if (whitelist.length === 0) {
        return interaction.reply({ embeds: [infoEmbed('Whitelist', 'No users are currently whitelisted.')], ephemeral: true });
      }

      const list = whitelist.map(id => `<@${id}>`).join('\n');
      await interaction.reply({
        embeds: [infoEmbed(`Whitelist (${whitelist.length})`, list)],
        ephemeral: true,
      });
    }
  },
};
