const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
require('dotenv').config();

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = '1507882886974541845';

  // Step 1: Register a test command
  console.log('[1] Registering /test command...');
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [{ name: 'test', description: 'Test command', type: 1 }],
  });
  console.log('[1] ✅ /test command registered');

  // Step 2: Create client with minimal intents
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on('ready', () => {
    console.log(`[2] ✅ Bot online as ${client.user.tag}`);
  });

  client.on('interactionCreate', async (interaction) => {
    console.log(`[3] 🔥 INTERACTION: ${interaction.commandName}`);
    await interaction.reply('It works!');
  });

  // Step 3: Also listen for raw events
  client.on('raw', (event) => {
    console.log(`[RAW] ${event.t}`);
  });

  console.log('[0] Logging in...');
  await client.login(token);
}

main().catch(console.error);
