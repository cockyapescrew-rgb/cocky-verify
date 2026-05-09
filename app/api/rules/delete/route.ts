import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { rule_id } = await req.json();

    if (!rule_id) {
      return NextResponse.json(
        { error: "Missing rule_id" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("role_rules")
      .delete()
      .eq("id", rule_id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to delete rule" },
      { status: 500 }
    );
  }
}