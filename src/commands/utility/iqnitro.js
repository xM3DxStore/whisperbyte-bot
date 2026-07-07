'use strict';

const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function generateFakeCode() {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let res = '';
  for (let i = 0; i < 16; i++) res += charset[Math.floor(Math.random() * charset.length)];
  return res;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('iqnitro')
    .setDescription('🧠 Use high IQ calculations to generate a 100% valid Nitro code')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(opt => opt
      .setName('level')
      .setDescription('Calculation difficulty level')
      .setRequired(true)
      .addChoices(
        { name: 'Hard', value: 'hard' },
        { name: 'Extreme', value: 'extreme' },
        { name: 'GodMode', value: 'god' }
      )
    ),

  async execute(interaction) {
    const level = interaction.options.getString('level');
    await interaction.reply({ content: '🧠 **Initializing IQ Calculation Protocol...**' });
    
    await sleep(2000);
    await interaction.editReply(`⚙️ **Setting difficulty to:** \`[${level.toUpperCase()}]\`\nLoading AI models...`);
    
    await sleep(2000);
    await interaction.editReply(`🧮 **Running quantum calculations on Discord's algorithm...**\n*Searching multidimensional space for a valid code...*`);
    
    await sleep(2500);
    await interaction.editReply(`🧩 **Bypassing entropy... extracting collision...**\n*Identified 1 guaranteed valid payload!*`);
    
    await sleep(2000);
    
    const code = generateFakeCode();
    
    const embed = new EmbedBuilder()
      .setTitle('🎉 VALID GIFT LINK FOUND (IQ Bypass)')
      .setColor(Colors.Green)
      .setDescription(
        `Through intense \`${level.toUpperCase()}\` intelligence calculations, we forced a collision!\n\n` +
        `🔗 **https://discord.gift/${code}**\n` +
        `↳ *Type: Nitro Premium*\n` +
        `↳ *Method: Quantum IQ Bypass*`
      )
      .setFooter({ text: 'Enjoy your successfully calculated nitro! 💎' })
      .setTimestamp();

    await interaction.editReply({ content: `<@${interaction.user.id}> CALCULATION COMPLETE! 💎`, embeds: [embed] });
  }
};
