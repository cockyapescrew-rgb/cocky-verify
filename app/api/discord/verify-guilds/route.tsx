import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin as supabase } from "@/lib/supabase";

type DiscordGuild = {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
};

export async function GET() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("discord_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({
        success: false,
        loggedIn: false,
        guilds: [],
        error: "Not connected to Discord.",
      });
    }

    const guildRes = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const discordGuilds = await guildRes.json().catch(() => []);

    if (!guildRes.ok || !Array.isArray(discordGuilds)) {
      return NextResponse.json(
        {
          success: false,
          loggedIn: true,
          guilds: [],
          error: "Could not load Discord servers.",
          details: discordGuilds,
        },
        { status: 500 }
      );
    }

    const guildIds = discordGuilds
      .map((guild: DiscordGuild) => String(guild.id || ""))
      .filter(Boolean);

    if (guildIds.length === 0) {
      return NextResponse.json({
        success: true,
        loggedIn: true,
        guilds: [],
      });
    }

    const { data: projects, error } = await supabase
      .from("projects")
      .select("id,name,discord_guild_id")
      .in("discord_guild_id", guildIds);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          loggedIn: true,
          guilds: [],
          error: error.message,
        },
        { status: 500 }
      );
    }

    const projectByGuildId = new Map(
      (projects || []).map((project) => [
        String(project.discord_guild_id),
        project,
      ])
    );

    const verifyGuilds = discordGuilds
      .filter((guild: DiscordGuild) => projectByGuildId.has(String(guild.id)))
      .map((guild: DiscordGuild) => {
        const project = projectByGuildId.get(String(guild.id));

        return {
          id: String(guild.id),
          name: guild.name,
          icon: guild.icon || null,
          owner: Boolean(guild.owner),
          permissions: guild.permissions || "",
          project_id: project?.id || "",
          project_name: project?.name || guild.name,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      success: true,
      loggedIn: true,
      guilds: verifyGuilds,
    });
  } catch (error: any) {
    console.error("VERIFY GUILDS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        loggedIn: false,
        guilds: [],
        error: error?.message || "Failed to load verify servers.",
      },
      { status: 500 }
    );
  }
}