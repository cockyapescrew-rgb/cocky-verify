import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, owner_discord_id, discord_guild_id } = body;

    if (!name || !owner_discord_id) {
      return NextResponse.json(
        { error: "Missing name or owner_discord_id" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        owner_discord_id,
        discord_guild_id: discord_guild_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error("PROJECT CREATE ERROR:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      project: data,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}