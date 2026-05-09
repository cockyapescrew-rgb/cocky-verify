import { NextResponse } from "next/server";

const DANGEROUS_PERMISSION_BITS = {
  ADMINISTRATOR: BigInt(0x0000000000000008),
  KICK_MEMBERS: BigInt(0x0000000000000002),
  BAN_MEMBERS: BigInt(0x0000000000000004),
  MANAGE_CHANNELS: BigInt(0x0000000000000010),
  MANAGE_GUILD: BigInt(0x0000000000000020),
  MANAGE_ROLES: BigInt(0x0000000010000000),
  MANAGE_WEBHOOKS: BigInt(0x0000000020000000),
  MENTION_EVERYONE: BigInt(0x0000000000020000),
};

function getRoleSafety(role: any) {
  const warnings: string[] = [];

  if (role.name === "@everyone") {
    warnings.push("@everyone cannot be automated");
  }

  if (role.managed) {
    warnings.push("Bot/app-managed role");
  }

  const permissions = BigInt(role.permissions || "0");

  for (const [label, bit] of Object.entries(DANGEROUS_PERMISSION_BITS)) {
    if ((permissions & bit) === bit) {
      warnings.push(label);
    }
  }

  return {
    safe: warnings.length === 0,
    warnings,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const guildId = searchParams.get("guild_id");

  if (!guildId) {
    return NextResponse.json(
      { error: "Missing guild_id" },
      { status: 400 }
    );
  }

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/roles`,
    {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
    }
  );

  const roles = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      {
        success: false,
        error: roles?.message || "Failed to fetch Discord roles",
        roles,
      },
      { status: res.status }
    );
  }

  const safeRoles = roles
    .map((role: any) => {
      const safety = getRoleSafety(role);

      return {
        ...role,
        safe: safety.safe,
        safety_warnings: safety.warnings,
      };
    })
    .filter((role: any) => role.safe)
    .sort((a: any, b: any) => b.position - a.position);

  return NextResponse.json({
    success: true,
    roles: safeRoles,
  });
}