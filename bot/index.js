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

const VERIFY_URL =
  process.env.VERIFY_URL || "https://cocky-verify.vercel.app";

client.once(Events.ClientReady, (bot) => {
  console.log(`Cocky Bot is online as ${bot.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "verifyportal") {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "Open this command inside a Discord server, not DMs.",
        ephemeral: true,
      });
      return;
    }

    const verifyUrl =
      `${VERIFY_URL}` +
      `?discord_id=${encodeURIComponent(interaction.user.id)}` +
      `&guild_id=${encodeURIComponent(interaction.guildId)}`;

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