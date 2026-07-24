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
    await interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('🧠 Initializing IQ Calculation Protocol...')
        .setColor(Colors.Blurple)
        .setDescription(`> Preparing quantum neural matrix...\n\n─────────────────────────\n> Difficulty: **${level.toUpperCase()}**`)
        .setTimestamp(),
    ] });
    
    await sleep(2000);
    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle('⚙️ Calibrating...')
        .setColor(Colors.Blurple)
        .setDescription(`> Setting difficulty to **${level.toUpperCase()}**\n> Loading AI models...\n\n─────────────────────────\n> Status: **Warming up processors**`)
        .setTimestamp(),
    ] });
    
    await sleep(2000);
    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle('🧮 Quantum Calculations In Progress...')
        .setColor(Colors.Blurple)
        .setDescription(`> Running quantum calculations on Discord's algorithm\n> Searching multidimensional space for a valid code\n\n─────────────────────────\n> Status: **Scanning gift code matrix**`)
        .setTimestamp(),
    ] });
    
    await sleep(2500);
    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle('🧩 Collision Detected!')
        .setColor(Colors.Gold)
        .setDescription(`> Bypassing entropy... extracting collision\n> Identified **1** guaranteed valid payload\n\n─────────────────────────\n> Status: **Finalizing extraction**`)
        .setTimestamp(),
    ] });
    
    await sleep(2000);
    
    const code = generateFakeCode();
    
    const embed = new EmbedBuilder()
      .setTitle('🎉 VALID GIFT LINK FOUND — IQ Bypass')
      .setColor(Colors.Green)
      .setDescription(
        `Through intense **${level.toUpperCase()}** intelligence calculations, we forced a collision!\n\n` +
        `🔗 **https://discord.gift/${code}**\n\n` +
        `─────────────────────────\n` +
        `> Type: **Nitro Premium**\n` +
        `> Method: **Quantum IQ Bypass**`
      )
      .setFooter({ text: 'Enjoy your successfully calculated nitro!' })
      .setTimestamp();

    await interaction.editReply({ content: `<@${interaction.user.id}> CALCULATION COMPLETE!`, embeds: [embed] });
  }
};
