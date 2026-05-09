import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { project_id } = await req.json();

    if (!project_id) {
      return NextResponse.json(
        { error: "Missing project_id" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", project_id);

    if (error) {
      console.error("PROJECT DELETE ERROR:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}