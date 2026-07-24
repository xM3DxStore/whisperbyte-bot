const { SlashCommandBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField: PBF } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, BRAND } = require('../../utils/embedBuilder');
const db = require('../../database');
const logger = require('../../services/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Set up member verification system')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Set up verification channel')
      .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Role to give on verification')
        .setRequired(true)
      )
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel for verification (or creates one)')
      )
    )
    .addSubcommand(sub => sub
      .setName('disable')
      .setDescription('Disable verification system')
    )
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Check verification status')
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'setup') {
      const role = interaction.options.getRole('role');
      const channel = interaction.options.getChannel('channel');

      if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return interaction.reply({ embeds: [errorEmbed('Role Hierarchy Error', 'That role is positioned higher than my highest role.\nPlease reorder roles or choose a lower role.')], ephemeral: true });
      }

      let verifyChannel = channel;
      if (!verifyChannel) {
        verifyChannel = await interaction.guild.channels.create({
          name: 'verification',
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guildId, deny: [PBF.Flags.ViewChannel] },
            { id: interaction.guild.members.me.id, allow: [PBF.Flags.ViewChannel, PBF.Flags.SendMessages, PBF.Flags.ManageRoles] },
          ],
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_button')
          .setLabel('Verify')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
      );

      const embed = infoEmbed(
        'Verification Required',
        `Welcome to **${interaction.guild.name}**.\n` +
        `${BRAND.divider}\n` +
        `To gain full access to the server, please verify your account.\n` +
        `Click the button below to receive your verified role.`
      );

      await verifyChannel.send({ embeds: [embed], components: [row] });

      db.updateGuild(guildId, {
        verification_role_id: role.id,
        verification_channel_id: verifyChannel.id,
      });

      db.addAuditLog(guildId, 'VERIFICATION_SETUP', interaction.user.id, null,
        `Role: ${role.name}, Channel: ${verifyChannel.name}`
      );

      await interaction.reply({
        embeds: [successEmbed('Verification Configured',
          `Channel: ${verifyChannel}\nAssigned Role: ${role}\n\nNew members must click the verify button to access the server.`
        )],
      });
    }

    if (subcommand === 'disable') {
      db.updateGuild(guildId, { verification_role_id: null, verification_channel_id: null });

      await interaction.reply({
        embeds: [successEmbed('Verification Disabled',
          'Verification system has been **deactivated**.\n' +
          `${BRAND.divider}\n` +
          'Existing verified members keep their roles.\nNew members will have unrestricted access until re-enabled.'
        )],
      });
    }

    if (subcommand === 'status') {
      const guild = db.getGuild(guildId);
      const roleId = guild?.verification_role_id;
      const channelId = guild?.verification_channel_id;

      if (!roleId) {
        return interaction.reply({ embeds: [infoEmbed('Verification Status',
          `⚪ Verification is **not configured**.\nUse \`/verification setup\` to enable it.`
        )], ephemeral: true });
      }

      const role = interaction.guild.roles.cache.get(roleId);
      const channel = interaction.guild.channels.cache.get(channelId);

      const embed = infoEmbed('Verification Status',
        `🟢 **Status:** Active\n` +
        `${BRAND.divider}\n` +
        `\`Role\`     ${role || '**⚠️ Deleted**'}\n` +
        `\`Channel\`  ${channel || '**⚠️ Deleted**'}\n` +
        `${BRAND.divider}\n` +
        `${(!role || !channel) ? '⚠️ One or more linked resources have been deleted.\nRun `/verification setup` to reconfigure.' : 'All linked resources are intact.'}`
      );

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
