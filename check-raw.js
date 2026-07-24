const { REST, Routes } = require('discord.js');
require('dotenv').config();

async function check() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = '1507882886974541845';

  const cmds = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
  console.log(JSON.stringify(cmds[0], null, 2));
}

check();
