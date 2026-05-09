import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

type AnyNft = Record<string, any>;

const MAX_PAGES = 25;
const PAGE_LIMIT = 100;

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

function getNftId(nft: AnyNft) {
  return (
    nft.nftokenID ||
    nft.NFTokenID ||
    nft.nft_id ||
    nft.nftId ||
    nft.token_id ||
    nft.tokenId ||
    nft.id ||
    ""
  );
}

function getTaxon(nft: AnyNft) {
  const raw =
    nft.nftokenTaxon ??
    nft.NFTokenTaxon ??
    nft.taxon ??
    nft.nft_taxon ??
    nft.nftTaxon ??
    nft.ledger_data?.taxon ??
    nft.ledgerData?.taxon ??
    nft.ledger?.taxon ??
    nft.token?.taxon ??
    "0";

  return String(raw);
}

function getIssuer(nft: AnyNft, fallbackIssuer: string) {
  return (
    nft.issuer ||
    nft.Issuer ||
    nft.nft_issuer ||
    nft.nftIssuer ||
    nft.ledger_data?.issuer ||
    nft.ledgerData?.issuer ||
    nft.ledger?.issuer ||
    nft.token?.issuer ||
    fallbackIssuer
  );
}

function getUri(nft: AnyNft) {
  return (
    nft.uri ||
    nft.URI ||
    nft.url ||
    nft.metadata_uri ||
    nft.metadataUri ||
    nft.metadataUrl ||
    nft.meta_url ||
    nft.metaUrl ||
    nft.ledger_data?.uri ||
    nft.ledgerData?.uri ||
    nft.ledger?.uri ||
    nft.token?.uri ||
    ""
  );
}

function getCollectionNameFromMetadata(metadata: any, taxon: string) {
  const collection =
    metadata?.collection?.name ||
    metadata?.collection_name ||
    metadata?.collectionName ||
    metadata?.collection ||
    metadata?.project ||
    metadata?.series ||
    metadata?.family ||
    "";

  if (typeof collection === "string" && collection.trim()) {
    return collection.trim();
  }

  if (typeof metadata?.name === "string") {
    const name = metadata.name.trim();

    const separators = [" #", "#", " - ", " | ", ": "];

    for (const sep of separators) {
      if (name.includes(sep)) {
        const first = name.split(sep)[0]?.trim();
        if (first && first.length > 1) return first;
      }
    }
  }

  return `Taxon ${taxon}`;
}

async function fetchMetadata(nft: AnyNft) {
  const embedded =
    nft.metadata ||
    nft.meta ||
    nft.nftokenMetadata ||
    nft.decodedMetadata ||
    nft.json ||
    nft.data?.metadata ||
    nft.token?.metadata ||
    null;

  if (embedded && typeof embedded === "object") {
    return embedded;
  }

  const uri = normalizeIpfs(getUri(nft));

  if (!uri || !uri.startsWith("http")) {
    return null;
  }

  try {
    const res = await fetch(uri, { cache: "no-store" });

    if (!res.ok) {
      console.warn("METADATA FETCH FAILED:", uri, res.status);
      return null;
    }

    return await res.json();
  } catch (error) {
    console.warn("METADATA FETCH ERROR:", uri, error);
    return null;
  }
}

function cleanTraitValue(value: any) {
  if (value === null || value === undefined) return "";

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

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

  const possibleArrays = [
    metadata.attributes,
    metadata.traits,
    metadata.properties?.attributes,
    metadata.properties?.traits,
    metadata.properties?.rarity,
    metadata.metadata?.attributes,
    metadata.metadata?.traits,
    metadata.nft?.attributes,
    metadata.nft?.traits,
  ];

  const traits: { trait_type: string; trait_value: string }[] = [];

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

function extractNftsFromBithomp(data: any): AnyNft[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.nfts)) return data.nfts;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.result?.nfts)) return data.result.nfts;
  if (Array.isArray(data.result)) return data.result;
  return [];
}

async function fetchBithompPage(
  issuer: string,
  page: number,
  bithompKey: string,
  requestedTaxon = ""
) {
  const taxonParam = requestedTaxon
    ? `&taxon=${encodeURIComponent(requestedTaxon)}`
    : "";

  const urls = [
    `https://bithomp.com/api/v2/nfts?issuer=${issuer}${taxonParam}&limit=${PAGE_LIMIT}&page=${page}`,
    `https://bithomp.com/api/v2/nfts?issuer=${issuer}${taxonParam}&limit=${PAGE_LIMIT}&offset=${(page - 1) * PAGE_LIMIT}`,
  ];

  for (const url of urls) {
    const res = await fetch(url, {
      headers: {
        "x-bithomp-token": bithompKey,
      },
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        nfts: [],
      };
    }

    const nfts = extractNftsFromBithomp(data);

    if (nfts.length > 0 || page === 1) {
      return {
        ok: true,
        status: res.status,
        data,
        nfts,
      };
    }
  }

  return {
    ok: true,
    status: 200,
    data: {},
    nfts: [],
  };
}

export async function POST(req: Request) {
  try {
    const { project_id, issuer, taxon } = await req.json();

    if (!project_id || !issuer) {
      return NextResponse.json(
        { error: "Missing project_id or issuer" },
        { status: 400 }
      );
    }

    const requestedTaxon =
      taxon !== undefined && taxon !== null && String(taxon).trim() !== ""
        ? String(taxon).trim()
        : "";

    const bithompKey = process.env.BITHOMP_API_KEY;

    if (!bithompKey) {
      return NextResponse.json(
        { error: "Missing BITHOMP_API_KEY" },
        { status: 500 }
      );
    }

    const allNfts: AnyNft[] = [];
    const seenNfts = new Set<string>();
    let pagesScanned = 0;
    let lastBithompResponse: any = null;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const pageResult = await fetchBithompPage(issuer, page, bithompKey, requestedTaxon);
      pagesScanned = page;
      lastBithompResponse = pageResult.data;

      if (!pageResult.ok) {
        console.error("BITHOMP ERROR:", pageResult.data);

        return NextResponse.json(
          {
            error:
              pageResult.data?.message ||
              pageResult.data?.error ||
              "Bithomp request failed",
            details: pageResult.data,
          },
          { status: 500 }
        );
      }

      if (pageResult.nfts.length === 0) break;

      let newCount = 0;

      for (const nft of pageResult.nfts) {
        const nftId = getNftId(nft) || JSON.stringify(nft).slice(0, 120);

        if (!seenNfts.has(nftId)) {
          seenNfts.add(nftId);
          allNfts.push(nft);
          newCount++;
        }
      }

      if (pageResult.nfts.length < PAGE_LIMIT) break;
      if (newCount === 0) break;
    }

    const collectionMap = new Map<
      string,
      {
        issuer: string;
        taxon: string;
        name: string;
        count: number;
      }
    >();

    const traitCounts = new Map<string, number>();
    const nftRows: any[] = [];

    let metadataFound = 0;
    let traitsFound = 0;
    let failedMetadata = 0;
    let matchedNfts = 0;

    for (const nft of allNfts) {
      const nftId = getNftId(nft);
      const detectedIssuer = getIssuer(nft, issuer);
      const taxon = getTaxon(nft);

      if (requestedTaxon && String(taxon) !== requestedTaxon) {
        continue;
      }

      matchedNfts++;

      const uri = normalizeIpfs(getUri(nft));
      const metadata = await fetchMetadata(nft);
      const traits = metadata ? extractTraits(metadata) : [];
      const collectionName = metadata
        ? getCollectionNameFromMetadata(metadata, taxon)
        : `Taxon ${taxon}`;

      if (metadata) metadataFound++;
      if (!metadata && uri) failedMetadata++;
      if (traits.length > 0) traitsFound += traits.length;

      const collectionKey = `${detectedIssuer}|${taxon}`;

      const existing = collectionMap.get(collectionKey);

      if (existing) {
        existing.count += 1;

        if (existing.name.startsWith("Taxon ") && !collectionName.startsWith("Taxon ")) {
          existing.name = collectionName;
        }
      } else {
        collectionMap.set(collectionKey, {
          issuer: detectedIssuer,
          taxon,
          name: collectionName,
          count: 1,
        });
      }

      nftRows.push({
        project_id,
        issuer: detectedIssuer,
        taxon,
        nft_id: nftId || `${detectedIssuer}-${taxon}-${nftRows.length}`,
        name: metadata?.name || nft.name || nftId || "Unnamed NFT",
        image: normalizeIpfs(metadata?.image || nft.image || ""),
        metadata_uri: uri,
        traits,
        updated_at: new Date().toISOString(),
      });

      for (const trait of traits) {
        const key = `${detectedIssuer}|||${taxon}|||${trait.trait_type}|||${trait.trait_value}`;
        traitCounts.set(key, (traitCounts.get(key) || 0) + 1);
      }
    }

    const { data: existingCollections } = await supabase
      .from("project_collections")
      .select("issuer, taxon, name")
      .eq("project_id", project_id);

    const existingNameMap = new Map(
      (existingCollections || []).map((collection) => [
        `${collection.issuer}|${collection.taxon}`,
        collection.name,
      ])
    );

    const collectionRows = Array.from(collectionMap.values()).map(
      (collection) => ({
        project_id,
        issuer: collection.issuer,
        taxon: collection.taxon,
        name:
          existingNameMap.get(`${collection.issuer}|${collection.taxon}`) ||
          collection.name ||
          `Taxon ${collection.taxon}`,
        nft_count: collection.count,
        selected: false,
        last_scanned_at: new Date().toISOString(),
      })
    );

    let savedCollections: any[] = [];

    if (collectionRows.length > 0) {
      const { data, error: collectionError } = await supabase
        .from("project_collections")
        .upsert(collectionRows, {
          onConflict: "project_id,issuer,taxon",
        })
        .select();

      if (collectionError) {
        console.error("COLLECTION UPSERT ERROR:", collectionError);
        return NextResponse.json(
          { error: collectionError.message },
          { status: 500 }
        );
      }

      savedCollections = data || [];
    }

    if (nftRows.length > 0) {
      const { error: nftError } = await supabase
        .from("collection_nfts")
        .upsert(nftRows, {
          onConflict: "project_id,nft_id",
        });

      if (nftError) {
        console.error("NFT UPSERT ERROR:", nftError);
        return NextResponse.json({ error: nftError.message }, { status: 500 });
      }
    }

    const traitRows = Array.from(traitCounts.entries()).map(([key, count]) => {
      const [traitIssuer, taxon, trait_type, trait_value] = key.split("|||");

      return {
        project_id,
        issuer: traitIssuer,
        taxon,
        trait_type,
        trait_value,
        count,
        updated_at: new Date().toISOString(),
      };
    });

    if (traitRows.length > 0) {
      const { error: traitError } = await supabase
        .from("collection_traits")
        .upsert(traitRows, {
          onConflict: "project_id,issuer,taxon,trait_type,trait_value",
        });

      if (traitError) {
        console.error("TRAIT UPSERT ERROR:", traitError);
        return NextResponse.json({ error: traitError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      issuer,
      requested_taxon: requestedTaxon || null,
      pages_scanned: pagesScanned,
      total_nfts_scanned: allNfts.length,
      total_nfts: matchedNfts,
      collections: savedCollections,
      metadata_found: metadataFound,
      failed_metadata: failedMetadata,
      traits_found: traitsFound,
      trait_types_found: traitRows.length,
      raw_hint: {
        first_response_keys:
          lastBithompResponse && typeof lastBithompResponse === "object"
            ? Object.keys(lastBithompResponse)
            : [],
      },
    });
  } catch (error: any) {
    console.error("SCAN ISSUER ERROR:", error);

    return NextResponse.json(
      {
        error: "Failed to scan issuer",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}