const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, BRAND } = require('../../utils/embedBuilder');
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
        return interaction.reply({ embeds: [errorEmbed('Already Whitelisted',
          `${user.tag} (\`${user.id}\`) is already on the whitelist.\nNo changes were made.`
        )], ephemeral: true });
      }

      whitelist.push(user.id);
      db.updateGuild(guildId, { whitelist_users: JSON.stringify(whitelist) });

      db.addAuditLog(guildId, 'WHITELIST_ADD', interaction.user.id, user.id, 'Added to spam/raid whitelist');

      await interaction.reply({
        embeds: [successEmbed('User Whitelisted',
          `${user.tag} has been added to the whitelist.\nSpam and raid detection will no longer apply to this user.`
        )],
      });
    }

    if (subcommand === 'remove') {
      const user = interaction.options.getUser('user');

      if (!whitelist.includes(user.id)) {
        return interaction.reply({ embeds: [errorEmbed('Not Whitelisted',
          `${user.tag} (\`${user.id}\`) is not currently whitelisted.\nNo changes were made.`
        )], ephemeral: true });
      }

      whitelist = whitelist.filter(id => id !== user.id);
      db.updateGuild(guildId, { whitelist_users: JSON.stringify(whitelist) });

      db.addAuditLog(guildId, 'WHITELIST_REMOVE', interaction.user.id, user.id, 'Removed from spam/raid whitelist');

      await interaction.reply({
        embeds: [successEmbed('User Removed',
          `${user.tag} has been removed from the whitelist.\nSpam and raid detection will now apply to this user.`
        )],
      });
    }

    if (subcommand === 'list') {
      if (whitelist.length === 0) {
        return interaction.reply({ embeds: [infoEmbed('Whitelist',
          `⚪ No users are currently whitelisted.\nUse \`/whitelist add\` to exempt a user from spam and raid detection.`
        )], ephemeral: true });
      }

      const entries = whitelist.map((id, i) => `\`${i + 1}.\` <@${id}> — \`${id}\``).join('\n');

      const embed = infoEmbed(
        `Whitelisted Users (${whitelist.length})`,
        entries +
        `${BRAND.divider}\n` +
        `_Whitelisted users bypass spam and raid detection._`
      );

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
