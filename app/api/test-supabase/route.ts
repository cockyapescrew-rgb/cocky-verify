import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase.from("test").select("*");

  return NextResponse.json({
    success: !error,
    data,
    error,
  });
}