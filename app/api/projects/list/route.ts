import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const discordId = searchParams.get("discord_id");

  if (!discordId) {
    return NextResponse.json(
      { error: "Missing discord_id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_discord_id", discordId)
    .order("created_at", { ascending: false });

  if (error) {console.error("PROJECTS LIST ERROR:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    projects: data || [],
  });
}