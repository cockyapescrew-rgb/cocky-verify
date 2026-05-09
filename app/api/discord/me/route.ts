// app/api/discord/me/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();

  const discordId = cookieStore.get("discord_id")?.value;
  const username = cookieStore.get("discord_username")?.value;
  const globalName = cookieStore.get("discord_global_name")?.value;
  const avatar = cookieStore.get("discord_avatar")?.value;

  if (!discordId) {
    return NextResponse.json({
      loggedIn: false,
      user: null,
    });
  }

  return NextResponse.json({
    loggedIn: true,
    user: {
      id: discordId,
      username,
      global_name: globalName,
      avatar,
    },
  });
}