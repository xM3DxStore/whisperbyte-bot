const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  console.log(`Guilds: ${client.guilds.cache.size}`);
  
  for (const [id, guild] of client.guilds.cache) {
    console.log(`\nGuild: ${guild.name} (ID: ${id})`);
    console.log(`Members: ${guild.memberCount}`);
    
    // Check registered commands
    try {
      const commands = await guild.commands.fetch();
      console.log(`Registered commands: ${commands.size}`);
      commands.forEach(cmd => console.log(`  - /${cmd.name}`));
    } catch (e) {
      console.log(`Error fetching commands: ${e.message}`);
    }
  }
  
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
