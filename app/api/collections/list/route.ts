import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const projectId = searchParams.get("project_id");

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing project_id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("project_collections")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    collections: data,
  });
}