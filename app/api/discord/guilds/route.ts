import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

function canManageGuild(permissions: string) {
  const perms = BigInt(permissions);
  return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
}

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("discord_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Not connected to Discord", guilds: [] },
      { status: 401 }
    );
  }

  const res = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const guilds = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to load Discord servers", details: guilds, guilds: [] },
      { status: 500 }
    );
  }

  const manageableGuilds = guilds
    .filter((guild: DiscordGuild) => guild.owner || canManageGuild(guild.permissions))
    .map((guild: DiscordGuild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      owner: guild.owner,
    }));

  return NextResponse.json({
    success: true,
    guilds: manageableGuilds,
  });
}