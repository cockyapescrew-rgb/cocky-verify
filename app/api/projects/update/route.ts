import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { collection_id, name } = await req.json();

    if (!collection_id || !name) {
      return NextResponse.json(
        { error: "Missing collection_id or name" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("project_collections")
      .update({ name })
      .eq("id", collection_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      collection: data,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to update collection" },
      { status: 500 }
    );
  }
}