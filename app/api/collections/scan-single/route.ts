import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

function hexToString(value?: string | null) {
  if (!value) return "";

  try {
    const clean = value.trim();
    if (!/^[0-9a-fA-F]+$/.test(clean)) return clean;
    return Buffer.from(clean, "hex").toString("utf8").replace(/\0/g, "").trim();
  } catch {
    return value || "";
  }
}

function normalizeIpfs(uri?: string | null) {
  if (!uri) return "";

  let clean = uri.trim();

  if (/^[0-9a-fA-F]+$/.test(clean)) {
    clean = hexToString(clean);
  }

  clean = clean.replaceAll("#", "%23");

  if (clean.startsWith("ipfs://ipfs/")) {
    return clean.replace("ipfs://ipfs/", "https://ipfs.io/ipfs/");
  }

  if (clean.startsWith("ipfs://")) {
    return clean.replace("ipfs://", "https://ipfs.io/ipfs/");
  }

  return clean;
}

function cleanTraitValue(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function normalizeTrait(trait: any) {
  if (!trait || typeof trait !== "object") return null;

  const traitType =
    trait.trait_type ||
    trait.traitType ||
    trait.type ||
    trait.name ||
    trait.key ||
    trait.label ||
    trait.property ||
    "Trait";

  const traitValue = cleanTraitValue(
    trait.value ??
      trait.trait_value ??
      trait.traitValue ??
      trait.val ??
      trait.display_value ??
      trait.displayValue ??
      trait.text
  );

  if (!traitType || !traitValue) return null;

  return {
    trait_type: String(traitType).trim(),
    trait_value: traitValue,
  };
}

function extractTraits(metadata: any) {
  if (!metadata || typeof metadata !== "object") return [];

  const traits: { trait_type: string; trait_value: string }[] = [];

  const possibleArrays = [
    metadata.attributes,
    metadata.traits,
    metadata.properties?.attributes,
    metadata.properties?.traits,
    metadata.metadata?.attributes,
    metadata.metadata?.traits,
    metadata.nft?.attributes,
    metadata.nft?.traits,
  ];

  for (const arr of possibleArrays) {
    if (Array.isArray(arr)) {
      for (const rawTrait of arr) {
        const normalized = normalizeTrait(rawTrait);
        if (normalized) traits.push(normalized);
      }
    }
  }

  const objectTraitSources = [
    metadata.traits,
    metadata.attributes,
    metadata.properties?.traits,
    metadata.properties?.attributes,
    metadata.metadata?.traits,
    metadata.metadata?.attributes,
  ];

  for (const source of objectTraitSources) {
    if (source && typeof source === "object" && !Array.isArray(source)) {
      for (const [key, value] of Object.entries(source)) {
        const traitValue = cleanTraitValue(value);

        if (key && traitValue) {
          traits.push({
            trait_type: String(key).trim(),
            trait_value: traitValue,
          });
        }
      }
    }
  }

  const unique = new Map<string, { trait_type: string; trait_value: string }>();

  for (const trait of traits) {
    const key = `${trait.trait_type.toLowerCase()}|||${trait.trait_value.toLowerCase()}`;
    unique.set(key, trait);
  }

  return Array.from(unique.values());
}

async function fetchJson(uri: string) {
  const url = normalizeIpfs(uri);

  if (!url || !url.startsWith("http")) {
    throw new Error("Invalid metadata URI");
  }

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Metadata fetch failed: ${res.status}`);
  }

  return await res.json();
}

export async function POST(req: Request) {
  try {
    const { project_id, issuer, taxon, nft_id, metadata_uri } = await req.json();

    if (!project_id || !issuer || !taxon) {
      return NextResponse.json(
        { error: "Missing project_id, issuer, or taxon" },
        { status: 400 }
      );
    }

    if (!nft_id && !metadata_uri) {
      return NextResponse.json(
        { error: "Missing NFT Token ID or metadata URI" },
        { status: 400 }
      );
    }

    let metadataUri = metadata_uri || "";
    let nftId = nft_id || "";

    if (nftId && !metadataUri) {
      const bithompKey = process.env.BITHOMP_API_KEY;

      if (!bithompKey) {
        return NextResponse.json(
          { error: "Missing BITHOMP_API_KEY" },
          { status: 500 }
        );
      }

      const bithompRes = await fetch(
        `https://bithomp.com/api/v2/nft/${nftId}`,
        {
          headers: {
            "x-bithomp-token": bithompKey,
          },
          cache: "no-store",
        }
      );

      const bithompData = await bithompRes.json();

      if (!bithompRes.ok) {
        return NextResponse.json(
          {
            error:
              bithompData?.message ||
              bithompData?.error ||
              "Bithomp token lookup failed",
            details: bithompData,
          },
          { status: 500 }
        );
      }

      metadataUri =
        bithompData.uri ||
        bithompData.URI ||
        bithompData.metadata_uri ||
        bithompData.metadataUri ||
        bithompData.metadataUrl ||
        bithompData.url ||
        "";

      nftId =
        bithompData.nftokenID ||
        bithompData.NFTokenID ||
        bithompData.nft_id ||
        nftId;
    }

    const metadata = await fetchJson(metadataUri);
    const traits = extractTraits(metadata);

    const nftRow = {
      project_id,
      issuer,
      taxon: String(taxon),
      nft_id: nftId || `${issuer}-${taxon}-${Date.now()}`,
      name: metadata?.name || nftId || "Single NFT Scan",
      image: normalizeIpfs(metadata?.image || ""),
      metadata_uri: normalizeIpfs(metadataUri),
      traits,
      updated_at: new Date().toISOString(),
    };

    const { error: nftError } = await supabase
      .from("collection_nfts")
      .upsert(nftRow, {
        onConflict: "project_id,nft_id",
      });

    if (nftError) {
      console.error("SINGLE NFT UPSERT ERROR:", nftError);
      return NextResponse.json({ error: nftError.message }, { status: 500 });
    }

    const traitRows = traits.map((trait) => ({
      project_id,
      issuer,
      taxon: String(taxon),
      trait_type: trait.trait_type,
      trait_value: trait.trait_value,
      count: 1,
      updated_at: new Date().toISOString(),
    }));

    if (traitRows.length > 0) {
      const { error: traitError } = await supabase
        .from("collection_traits")
        .upsert(traitRows, {
          onConflict: "project_id,issuer,taxon,trait_type,trait_value",
        });

      if (traitError) {
        console.error("SINGLE TRAIT UPSERT ERROR:", traitError);
        return NextResponse.json({ error: traitError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      issuer,
      taxon: String(taxon),
      nft_id: nftRow.nft_id,
      metadata_uri: nftRow.metadata_uri,
      name: nftRow.name,
      image: nftRow.image,
      traits_found: traits.length,
      traits,
    });
  } catch (error: any) {
    console.error("SCAN SINGLE ERROR:", error);

    return NextResponse.json(
      {
        error: "Failed to scan single NFT / metadata",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}