require("dotenv").config({ path: ".env.local" });

const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (bot) => {
  console.log(`Cocky Bot is online as ${bot.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "verifyportal") {
    const verifyUrl =
      `https://cocky-verify.vercel.app` +
      `?discord_id=${interaction.user.id}` +
      `&guild_id=${interaction.guildId}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Open Cocky Portal")
        .setStyle(ButtonStyle.Link)
        .setURL(verifyUrl)
    );

    await interaction.reply({
      content:
        "🐵 **Cocky Portal**\nVerify your XRPL wallet to unlock Discord access.",
      components: [row],
      ephemeral: true,
    });
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);