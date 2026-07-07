const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embedBuilder');

const activePolls = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a reaction-based poll')
    .addStringOption(opt => opt
      .setName('question')
      .setDescription('Poll question')
      .setRequired(true)
      .setMaxLength(300)
    )
    .addStringOption(opt => opt
      .setName('options')
      .setDescription('Options separated by | (e.g., Red|Blue|Green)')
    )
    .addIntegerOption(opt => opt
      .setName('duration')
      .setDescription('Duration in minutes (default: no limit)')
      .setMinValue(1)
      .setMaxValue(1440)
    ),

  rateLimit: 'STANDARD',

  async execute(interaction) {
    const question = interaction.options.getString('question');
    const optionsStr = interaction.options.getString('options');
    const duration = interaction.options.getInteger('duration');

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

    let options = [];
    if (optionsStr) {
      options = optionsStr.split('|').map(o => o.trim()).filter(o => o.length > 0);
    }

    if (options.length > 10) {
      return interaction.reply({
        embeds: [errorEmbed('Too Many Options', 'Maximum 10 options allowed.')],
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Poll')
      .setDescription(`**${question}**`)
      .setColor(Colors.Blurple)
      .setFooter({ text: `Poll by ${interaction.user.tag}${duration ? ` • Ends in ${duration}m` : ''}` })
      .setTimestamp();

    if (options.length > 0) {
      const optionList = options.map((opt, i) => `${numberEmojis[i]} ${opt}`).join('\n');
      embed.addFields({ name: 'Options', value: optionList, inline: false });
    } else {
      embed.addFields({ name: 'React with', value: '👍 Yes / 👎 No', inline: false });
    }

    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });

    if (options.length > 0) {
      for (let i = 0; i < options.length; i++) {
        await msg.react(numberEmojis[i]);
      }
    } else {
      await msg.react('👍');
      await msg.react('👎');
    }

    if (duration) {
      const key = msg.id;
      const timeout = setTimeout(async () => {
        try {
          const fetched = await interaction.channel.messages.fetch(msg.id);
          const results = fetched.reactions.cache.map(r => ({
            emoji: r.emoji.name,
            count: r.count - 1,
          })).filter(r => r.count > 0).sort((a, b) => b.count - a.count);

          const resultText = results.length > 0
            ? results.map(r => `${r.emoji}: **${r.count}** votes`).join('\n')
            : 'No votes were cast.';

          const resultEmbed = new EmbedBuilder()
            .setTitle('📊 Poll Results')
            .setDescription(`**${question}**\n\n${resultText}`)
            .setColor(Colors.Gold)
            .setTimestamp();

          await fetched.edit({ embeds: [resultEmbed] });
        } catch (err) {}
        activePolls.delete(key);
      }, duration * 60000);

      activePolls.set(msg.id, { timeout, channelId: interaction.channel.id });
    }
  },
};
