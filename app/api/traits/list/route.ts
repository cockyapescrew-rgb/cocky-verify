import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const projectId = searchParams.get("project_id");
  const issuer = searchParams.get("issuer");
  const taxon = searchParams.get("taxon");

  if (!projectId || !issuer) {
    return NextResponse.json(
      { error: "Missing project_id or issuer" },
      { status: 400 }
    );
  }

  let query = supabase
    .from("collection_traits")
    .select("*")
    .eq("project_id", projectId)
    .eq("issuer", issuer);

  if (taxon) {
    query = query.eq("taxon", taxon);
  }

  const { data, error } = await query.order("trait_type", {
    ascending: true,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    traits: data,
  });
}