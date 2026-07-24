const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
require('dotenv').config();

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = '1507882886974541845';

  // Register test command
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [{ name: 'ping', description: 'Pong!', type: 1 }],
  });
  console.log('✅ /ping registered');

  const client = new Client({ 
    intents: [GatewayIntentBits.Guilds],
  });

  client.on('ready', async () => {
    console.log(`✅ Online: ${client.user.tag}`);
    console.log(`Guilds: ${client.guilds.cache.size}`);
    
    for (const [id, guild] of client.guilds.cache) {
      console.log(`\nGuild: ${guild.name} (${id})`);
      
      const cmds = await guild.commands.fetch();
      console.log(`Guild commands: ${cmds.size}`);
      cmds.forEach(c => console.log(`  /${c.name} (id: ${c.id})`));
      
      const me = guild.members.me;
      console.log(`Bot roles: ${me.roles.cache.map(r => r.name).join(', ')}`);
      console.log(`Bot admin: ${me.permissions.has('Administrator')}`);
    }
    
    console.log('\n⏳ Waiting... type /ping in Discord NOW');
  });

  client.on('interactionCreate', async (i) => {
    console.log(`\n🔥🔥🔥 INTERACTION: ${i.commandName} from ${i.user.tag}`);
    await i.reply('Pong!');
  });

  client.on('raw', (e) => {
    if (e.t && e.t !== 'PRESENCE_UPDATE' && e.t !== 'TYPING_START') {
      console.log(`[RAW] ${e.t}`);
    }
  });

  client.on('error', (err) => console.error('CLIENT ERROR:', err));

  await client.login(token);
}

main().catch(console.error);
