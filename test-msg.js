const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('ready', () => {
  console.log(`✅ Online: ${client.user.tag}`);
  console.log('Type anything in a channel the bot can see...');
});

client.on('messageCreate', (msg) => {
  if (msg.author.bot) return;
  console.log(`[MSG] ${msg.author.tag}: ${msg.content}`);
});

client.on('interactionCreate', async (i) => {
  console.log(`[INTERACTION] ${i.commandName}`);
  await i.reply('pong');
});

client.on('raw', (e) => {
  console.log(`[RAW] ${e.t}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
