import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const clientId = process.env.DISCORD_CLIENT_ID!;
  const redirectUri = process.env.DISCORD_REDIRECT_URI!;

  const url = new URL(req.url);

  // Where to send user after Discord login finishes
  const returnTo =
    url.searchParams.get("return_to") ||
    url.searchParams.get("returnTo") ||
    "/";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds",
    prompt: "consent",

    // This carries the return page through Discord OAuth
    state: Buffer.from(
      JSON.stringify({
        returnTo,
      })
    ).toString("base64url"),
  });

  return NextResponse.redirect(
    `https://discord.com/oauth2/authorize?${params.toString()}`
  );
}