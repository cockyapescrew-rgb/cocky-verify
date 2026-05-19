import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AnyNft = Record<string, any>;

const MAX_PAGES = 100;
const PAGE_LIMIT = 100;
const METADATA_FETCH_TIMEOUT_MS = 6_000;
const BITHOMP_FETCH_TIMEOUT_MS = 12_000;
const METADATA_BATCH_SIZE = 10;

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

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseMaybeJson(value: any) {
  if (!value) return null;

  if (typeof value === "object") return value;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return null;
}

function pickEmbeddedMetadata(nft: AnyNft) {
  const candidates = [
    nft.metadata,
    nft.meta,
    nft.nftokenMetadata,
    nft.nftoken_metadata,
    nft.decodedMetadata,
    nft.decoded_metadata,
    nft.json,
    nft.metadataJson,
    nft.metadata_json,
    nft.metaJson,
    nft.meta_json,
    nft.data?.metadata,
    nft.data?.meta,
    nft.result?.metadata,
    nft.token?.metadata,
    nft.nft?.metadata,
  ];

  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);

    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  }

  return null;
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
    nft.nftoken_id ||
    nft.NFTokenId ||
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
    nft.nft?.taxon ??
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
    nft.nft?.issuer ||
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
    nft.nft?.uri ||
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
  const embedded = pickEmbeddedMetadata(nft);

  if (embedded) return embedded;

  const uri = normalizeIpfs(getUri(nft));

  if (!uri || !uri.startsWith("http")) {
    return null;
  }

  try {
    const res = await fetchWithTimeout(
      uri,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      },
      METADATA_FETCH_TIMEOUT_MS
    );

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

  const rawTraitType =
    trait.trait_type ||
    trait.traitType ||
    trait.type ||
    trait.name ||
    trait.key ||
    trait.label ||
    trait.property ||
    "";

  const rawTraitValue =
    trait.value ??
    trait.trait_value ??
    trait.traitValue ??
    trait.val ??
    trait.display_value ??
    trait.displayValue ??
    trait.text;

  // Handles trait objects like { Eyes: "Laser Red" }
  if (!rawTraitType && rawTraitValue === undefined) {
    const entries = Object.entries(trait).filter(([key, value]) => {
      if (!key || value === null || value === undefined) return false;
      if (typeof value === "object") return false;
      return true;
    });

    if (entries.length === 1) {
      const [key, value] = entries[0];

      return {
        trait_type: String(key).trim(),
        trait_value: cleanTraitValue(value),
      };
    }
  }

  const traitType = rawTraitType || "Trait";
  const traitValue = cleanTraitValue(rawTraitValue);

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
    metadata.nftoken?.attributes,
    metadata.nftoken?.traits,
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

  const ignoredObjectKeys = new Set([
    "name",
    "description",
    "image",
    "animation_url",
    "external_url",
    "collection",
    "collection_name",
    "collectionName",
    "project",
    "series",
    "family",
    "attributes",
    "traits",
    "files",
    "media",
  ]);

  function addObjectTraits(source: any) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return;

    for (const [key, value] of Object.entries(source)) {
      if (!key || ignoredObjectKeys.has(key)) continue;

      const traitValue = cleanTraitValue(value);

      if (traitValue) {
        traits.push({
          trait_type: String(key).trim(),
          trait_value: traitValue,
        });
      }
    }
  }

  addObjectTraits(metadata.traits);
  addObjectTraits(metadata.attributes);
  addObjectTraits(metadata.properties?.traits);
  addObjectTraits(metadata.properties?.attributes);
  addObjectTraits(metadata.metadata?.traits);
  addObjectTraits(metadata.metadata?.attributes);

  const unique = new Map<string, { trait_type: string; trait_value: string }>();

  for (const trait of traits) {
    const key = `${trait.trait_type.toLowerCase()}|||${trait.trait_value.toLowerCase()}`;
    unique.set(key, trait);
  }

  return Array.from(unique.values()).sort((a, b) => {
    const typeCompare = a.trait_type.localeCompare(b.trait_type);
    if (typeCompare !== 0) return typeCompare;
    return a.trait_value.localeCompare(b.trait_value);
  });
}

function extractNftsFromBithomp(data: any): AnyNft[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.nfts)) return data.nfts;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.data?.nfts)) return data.data.nfts;
  if (Array.isArray(data.data?.items)) return data.data.items;
  if (Array.isArray(data.result?.nfts)) return data.result.nfts;
  if (Array.isArray(data.result?.items)) return data.result.items;
  if (Array.isArray(data.result?.data)) return data.result.data;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.nftokens)) return data.nftokens;
  if (Array.isArray(data.tokens)) return data.tokens;

  return [];
}

async function fetchBithompPage(
  issuer: string,
  bithompKey: string,
  requestedTaxon = "",
  marker = "",
  offset = 0
) {
  const params = new URLSearchParams();

  params.set("issuer", issuer);
  params.set("limit", String(PAGE_LIMIT));

  if (requestedTaxon) {
    params.set("taxon", requestedTaxon);
  }

  if (marker) {
    params.set("marker", marker);
  } else if (offset > 0) {
    params.set("offset", String(offset));
  }

  const url = `https://bithomp.com/api/v2/nfts?${params.toString()}`;

  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        "x-bithomp-token": bithompKey,
      },
      cache: "no-store",
    },
    BITHOMP_FETCH_TIMEOUT_MS
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data,
      nfts: [] as AnyNft[],
      marker: "",
      totalNfts: 0,
    };
  }

  const nfts = extractNftsFromBithomp(data);

  const nextMarker =
    data.marker ||
    data.nextMarker ||
    data.result?.marker ||
    data.result?.nextMarker ||
    data.data?.marker ||
    data.data?.nextMarker ||
    "";

  const totalNfts = Number(
    data.summary?.totalNfts ||
      data.result?.summary?.totalNfts ||
      data.data?.summary?.totalNfts ||
      data.totalNfts ||
      data.total ||
      0
  );

  return {
    ok: true,
    status: res.status,
    data,
    nfts,
    marker: String(nextMarker || ""),
    totalNfts,
  };
}

async function processNftForScan({
  nft,
  project_id,
  fallbackIssuer,
  requestedTaxon,
  rowIndex,
}: {
  nft: AnyNft;
  project_id: string;
  fallbackIssuer: string;
  requestedTaxon: string;
  rowIndex: number;
}) {
  const nftId = getNftId(nft);
  const detectedIssuer = getIssuer(nft, fallbackIssuer);
  const taxon = getTaxon(nft);

  if (requestedTaxon && String(taxon) !== requestedTaxon) {
    return null;
  }

  const uri = normalizeIpfs(getUri(nft));
  const metadata = await fetchMetadata(nft);
  const traits = metadata ? extractTraits(metadata) : [];
  const collectionName = metadata
    ? getCollectionNameFromMetadata(metadata, taxon)
    : `Taxon ${taxon}`;

  const nftRow = {
    project_id,
    issuer: detectedIssuer,
    taxon,
    nft_id: nftId || `${detectedIssuer}-${taxon}-${rowIndex}`,
    name: metadata?.name || nft.name || nftId || "Unnamed NFT",
    image: normalizeIpfs(metadata?.image || nft.image || ""),
    metadata_uri: uri,
    traits,
    updated_at: new Date().toISOString(),
  };

  return {
    nftId,
    detectedIssuer,
    taxon,
    uri,
    metadata,
    traits,
    collectionName,
    nftRow,
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
    let marker = "";
    let offset = 0;
    let expectedTotalNfts = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const pageResult = await fetchBithompPage(
        issuer,
        bithompKey,
        requestedTaxon,
        marker,
        offset
      );

      pagesScanned = page;
      lastBithompResponse = pageResult.data;

      if (pageResult.totalNfts > 0) {
        expectedTotalNfts = pageResult.totalNfts;
      }

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

      if (pageResult.marker) {
        marker = pageResult.marker;
      } else {
        offset += PAGE_LIMIT;

        if (expectedTotalNfts > 0 && offset >= expectedTotalNfts) {
          break;
        }
      }

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

    let globalRowIndex = 0;

    for (const batch of chunkNfts(allNfts, METADATA_BATCH_SIZE)) {
      const processedBatch = await Promise.all(
        batch.map((nft, index) =>
          processNftForScan({
            nft,
            project_id,
            fallbackIssuer: issuer,
            requestedTaxon,
            rowIndex: globalRowIndex + index,
          })
        )
      );

      globalRowIndex += batch.length;

      for (const processed of processedBatch) {
        if (!processed) continue;

        matchedNfts++;

        const {
          detectedIssuer,
          taxon,
          uri,
          metadata,
          traits,
          collectionName,
          nftRow,
        } = processed;

        if (metadata) metadataFound++;
        if (!metadata && uri) failedMetadata++;
        if (traits.length > 0) traitsFound += traits.length;

        const collectionKey = `${detectedIssuer}|${taxon}`;

        const existing = collectionMap.get(collectionKey);

        if (existing) {
          existing.count += 1;

          if (
            existing.name.startsWith("Taxon ") &&
            !collectionName.startsWith("Taxon ")
          ) {
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

        nftRows.push(nftRow);

        for (const trait of traits) {
          const key = `${detectedIssuer}|||${taxon}|||${trait.trait_type}|||${trait.trait_value}`;
          traitCounts.set(key, (traitCounts.get(key) || 0) + 1);
        }
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

    for (const nftRowChunk of chunkNfts(nftRows, 500)) {
      const { error: nftError } = await supabase
        .from("collection_nfts")
        .upsert(nftRowChunk, {
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
      for (const traitRowChunk of chunkNfts(traitRows, 500)) {
        const { error: traitError } = await supabase
          .from("collection_traits")
          .upsert(traitRowChunk, {
            onConflict: "project_id,issuer,taxon,trait_type,trait_value",
          });

        if (traitError) {
          console.error("TRAIT UPSERT ERROR:", traitError);
          return NextResponse.json(
            { error: traitError.message },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      issuer,
      requested_taxon: requestedTaxon || null,
      pages_scanned: pagesScanned,
      expected_total_nfts: expectedTotalNfts || null,
      total_nfts_scanned: allNfts.length,
      total_nfts: matchedNfts,
      collections: savedCollections,
      metadata_found: metadataFound,
      failed_metadata: failedMetadata,
      traits_found: traitsFound,
      trait_types_found: traitRows.length,
      raw_hint: {
        expected_total_nfts: expectedTotalNfts || null,
        first_response_keys:
          lastBithompResponse && typeof lastBithompResponse === "object"
            ? Object.keys(lastBithompResponse)
            : [],
        first_nft_keys:
          allNfts[0] && typeof allNfts[0] === "object"
            ? Object.keys(allNfts[0])
            : [],
        first_nft_metadata_keys:
          allNfts[0]?.metadata && typeof allNfts[0].metadata === "object"
            ? Object.keys(allNfts[0].metadata)
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

function chunkNfts<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}