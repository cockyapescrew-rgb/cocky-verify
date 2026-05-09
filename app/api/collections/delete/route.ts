import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { project_id, issuer, taxon, collection_id } = await req.json();

    if (!project_id || !issuer || taxon === undefined || taxon === null) {
      return NextResponse.json(
        { error: "Missing project_id, issuer, or taxon" },
        { status: 400 }
      );
    }

    const taxonValue = String(taxon);

    const { error: traitError } = await supabase
      .from("collection_traits")
      .delete()
      .eq("project_id", project_id)
      .eq("issuer", issuer)
      .eq("taxon", taxonValue);

    if (traitError) {
      console.error("COLLECTION TRAITS DELETE ERROR:", traitError);
      return NextResponse.json({ error: traitError.message }, { status: 500 });
    }

    const { error: nftError } = await supabase
      .from("collection_nfts")
      .delete()
      .eq("project_id", project_id)
      .eq("issuer", issuer)
      .eq("taxon", taxonValue);

    if (nftError) {
      console.error("COLLECTION NFTS DELETE ERROR:", nftError);
      return NextResponse.json({ error: nftError.message }, { status: 500 });
    }

    let deleteQuery = supabase
      .from("project_collections")
      .delete()
      .eq("project_id", project_id)
      .eq("issuer", issuer)
      .eq("taxon", taxonValue);

    if (collection_id) {
      deleteQuery = deleteQuery.eq("id", collection_id);
    }

    const { error: collectionError } = await deleteQuery;

    if (collectionError) {
      console.error("PROJECT COLLECTION DELETE ERROR:", collectionError);
      return NextResponse.json(
        { error: collectionError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("COLLECTION DELETE ROUTE ERROR:", error);

    return NextResponse.json(
      {
        error: "Failed to delete collection",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
