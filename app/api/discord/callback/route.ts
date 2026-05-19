import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

function getReturnTo(req: Request) {
  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state");

  if (!state) return "/dashboard";

  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    const returnTo = String(decoded.returnTo || "/dashboard");

    // Prevent open redirect abuse. Only allow internal paths.
    if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
      return "/dashboard";
    }

    return returnTo;
  } catch {
    return "/dashboard";
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  try {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI!,
    });

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Discord token error:", tokenData);
      return NextResponse.json(
        { error: "Discord token exchange failed" },
        { status: 500 }
      );
    }

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const user = await userRes.json();

    if (!userRes.ok || !user.id) {
      console.error("Discord user error:", user);
      return NextResponse.json(
        { error: "Discord user fetch failed" },
        { status: 500 }
      );
    }

    await supabase.from("admin_users").upsert(
      {
        discord_id: user.id,
        username: user.username,
        global_name: user.global_name,
        avatar: user.avatar,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "discord_id" }
    );

    const returnTo = getReturnTo(req);
    const response = NextResponse.redirect(new URL(returnTo, req.url));

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    };

    response.cookies.set("discord_id", user.id, cookieOptions);
    response.cookies.set("discord_username", user.username || "", cookieOptions);
    response.cookies.set("discord_global_name", user.global_name || "", cookieOptions);
    response.cookies.set("discord_avatar", user.avatar || "", cookieOptions);

    response.cookies.set("discord_access_token", tokenData.access_token, {
      ...cookieOptions,
      maxAge: tokenData.expires_in || 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Discord OAuth failed" }, { status: 500 });
  }
}