const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`Guilds: ${client.guilds.cache.size}`);
});

client.on('interactionCreate', async (interaction) => {
  console.log(`🔥 INTERACTION RECEIVED: ${interaction.commandName} from ${interaction.user.tag}`);
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'test') {
      await interaction.reply('Bot is working!');
    }
  }
});

client.on('raw', (event) => {
  if (event.t) console.log(`[RAW] ${event.t}`);
});

console.log('Logging in...');
client.login(process.env.DISCORD_BOT_TOKEN);
