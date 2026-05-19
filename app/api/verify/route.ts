import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const XRPL_RPC = "https://xrplcluster.com";

const XRPL_FETCH_TIMEOUT_MS = 12_000;
const DISCORD_FETCH_TIMEOUT_MS = 10_000;
const SUPABASE_CHUNK_SIZE = 100;
const MAX_NFT_PAGES = 10;

type OwnedNft = {
  nft_id: string;
  issuer: string;
  taxon: string;
  uri?: string;
  metadata?: any;
  traits: Trait[];
};

type Trait = {
  trait_type: string;
  value: string;
};

type TokenBalance = {
  currency: string;
  issuer: string;
  balance: number;
};

type GatedCollection = {
  issuer: string;
  taxon: string;
  key: string;
  name: string;
};

type RequirementResult = {
  requirement_type: string;
  issuer: string;
  taxon: string;
  collection_name: string;
  passed: boolean;
  found_count?: number;
  required_count?: number;
  trait_type?: string;
  trait_value?: string;
  matching_trait_count?: number;

  token_currency?: string;
  token_issuer?: string;
  token_balance?: number;
  required_token_amount?: number;
};

type RuleResult = {
  role_id: string;
  role_name: string;
  passed: boolean;
  logic: "OR" | "OR_GROUPS_AND_INSIDE";
  requirements: RequirementResult[];
};

type CollectionSummary = {
  issuer: string;
  taxon: string;
  name: string;
  owned_count: number;
  indexed_count: number;
};

function normalize(value: any) {
  return String(value || "").trim().toLowerCase();
}

function collectionKey(issuer: any, taxon: any) {
  return `${normalize(issuer)}|${String(taxon || "").trim()}`;
}

function decodeHexCurrency(value: string) {
  const clean = String(value || "").trim();

  if (!/^[A-Fa-f0-9]{40}$/.test(clean)) {
    return clean;
  }

  try {
    const decoded = Buffer.from(clean, "hex")
      .toString("utf8")
      .replace(/\0/g, "")
      .trim();

    return decoded || clean;
  } catch {
    return clean;
  }
}

function normalizeCurrency(value: any) {
  const raw = String(value || "").trim();
  const decoded = decodeHexCurrency(raw);

  return decoded.toUpperCase();
}

function isTokenRequirementType(requirementType: string) {
  return ["token_count", "token_quantity", "token"].includes(requirementType);
}

function tokenKey(currency: any, issuer: any) {
  return `${normalizeCurrency(currency)}|${normalize(issuer)}`;
}

function isProjectBillingActive(project: any) {
  if (project?.admin_locked) return false;

  if (project?.billing_status === "comped") return true;

  if (project?.billing_status !== "active") return false;

  if (!project?.paid_until) return false;

  const paidUntil = new Date(project.paid_until).getTime();

  if (Number.isNaN(paidUntil)) return false;

  return paidUntil > Date.now();
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
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

function extractTraits(metadata: any): Trait[] {
  const traits: Trait[] = [];

  const attrs =
    metadata?.attributes ||
    metadata?.traits ||
    metadata?.properties?.attributes ||
    metadata?.nft?.attributes ||
    [];

  if (Array.isArray(attrs)) {
    for (const attr of attrs) {
      const traitType =
        attr?.trait_type ||
        attr?.type ||
        attr?.traitType ||
        attr?.name ||
        attr?.key ||
        "";

      const value = attr?.value || attr?.trait_value || attr?.traitValue || "";

      if (traitType || value) {
        traits.push({
          trait_type: String(traitType),
          value: String(value),
        });
      }
    }
  }

  return traits;
}

async function fetchWalletNfts(wallet: string): Promise<OwnedNft[]> {
  const owned: OwnedNft[] = [];
  let marker: any = undefined;

  for (let i = 0; i < MAX_NFT_PAGES; i++) {
    const res = await fetchWithTimeout(
      XRPL_RPC,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: "account_nfts",
          params: [
            {
              account: wallet,
              limit: 400,
              marker,
            },
          ],
        }),
        cache: "no-store",
      },
      XRPL_FETCH_TIMEOUT_MS
    );

    const data = await res.json();

    if (!res.ok || data?.result?.error) {
      throw new Error(
        data?.result?.error_message || "Failed to fetch wallet NFTs"
      );
    }

    const nfts = data?.result?.account_nfts || [];

    for (const nft of nfts) {
      owned.push({
        nft_id: nft.NFTokenID,
        issuer: nft.Issuer,
        taxon: String(nft.NFTokenTaxon),
        uri: nft.URI,
        metadata: null,
        traits: [],
      });
    }

    marker = data?.result?.marker;

    if (!marker) break;
  }

  return owned;
}


async function fetchWalletTokenBalances(wallet: string): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = [];
  let marker: any = undefined;

  for (let i = 0; i < 10; i++) {
    const res = await fetchWithTimeout(
      XRPL_RPC,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: "account_lines",
          params: [
            {
              account: wallet,
              limit: 400,
              marker,
            },
          ],
        }),
        cache: "no-store",
      },
      XRPL_FETCH_TIMEOUT_MS
    );

    const data = await res.json();

    if (!res.ok || data?.result?.error) {
      throw new Error(
        data?.result?.error_message || "Failed to fetch wallet token balances"
      );
    }

    const lines = data?.result?.lines || [];

    for (const line of lines) {
      balances.push({
        currency: String(line.currency || ""),
        issuer: String(line.account || ""),
        balance: Number(line.balance || 0),
      });
    }

    marker = data?.result?.marker;

    if (!marker) break;
  }

  return balances;
}

async function loadProjectCollectionNames(projectId: string) {
  const namesByKey = new Map<string, string>();

  try {
    const { data } = await supabase
      .from("collections")
      .select("issuer,taxon,name")
      .eq("project_id", projectId);

    for (const row of data || []) {
      const key = collectionKey(row.issuer, row.taxon);
      const name = String(row.name || "").trim();

      if (key && name) {
        namesByKey.set(key, name);
      }
    }
  } catch {
    // If this table/query is unavailable, do not block verification.
  }

  return namesByKey;
}

function buildGatedCollectionsFromRules(
  rules: any[],
  collectionNamesByKey: Map<string, string>
) {
  const gated = new Map<string, GatedCollection>();

  for (const rule of rules || []) {
    const requirements = rule.role_rule_requirements || [];

    for (const requirement of requirements) {
      const requirementType = normalize(requirement.requirement_type);

      if (isTokenRequirementType(requirementType)) continue;

      const issuer = String(requirement.issuer || "").trim();
      const taxon = String(requirement.taxon || "").trim();

      if (!issuer) continue;

      const key = collectionKey(issuer, taxon);

      if (gated.has(key)) continue;

      const name =
        collectionNamesByKey.get(key) ||
        String(requirement.collection_name || requirement.name || "").trim() ||
        (taxon ? `Taxon ${taxon}` : "Any Taxon");

      gated.set(key, {
        issuer,
        taxon,
        key,
        name,
      });
    }
  }

  return Array.from(gated.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

function nftMatchesGatedCollection(nft: OwnedNft, gated: GatedCollection) {
  const issuerMatches = normalize(nft.issuer) === normalize(gated.issuer);
  const taxonMatches = !gated.taxon || String(nft.taxon) === String(gated.taxon);

  return issuerMatches && taxonMatches;
}

function rowMatchesGatedCollection(row: any, gated: GatedCollection) {
  const rowIssuer = String(row.issuer || row.nft_issuer || "");
  const rowTaxon = String(row.taxon || row.nft_taxon || "");

  const issuerMatches = normalize(rowIssuer) === normalize(gated.issuer);
  const taxonMatches = !gated.taxon || String(rowTaxon) === String(gated.taxon);

  return issuerMatches && taxonMatches;
}

function filterOwnedNftsToGatedCollections(
  ownedNfts: OwnedNft[],
  gatedCollections: GatedCollection[]
) {
  if (gatedCollections.length === 0) return ownedNfts;

  return ownedNfts.filter((nft) =>
    gatedCollections.some((gated) => nftMatchesGatedCollection(nft, gated))
  );
}

function filterSavedRowsToGatedCollections(
  savedRows: any[],
  gatedCollections: GatedCollection[]
) {
  if (gatedCollections.length === 0) return savedRows;

  return savedRows.filter((row) =>
    gatedCollections.some((gated) => rowMatchesGatedCollection(row, gated))
  );
}

function countMatchingCollectionNfts(requirement: any, ownedNfts: OwnedNft[]) {
  const issuer = normalize(requirement.issuer);
  const taxon = String(requirement.taxon || "").trim();

  return ownedNfts.filter((nft) => {
    const issuerMatches = !issuer || normalize(nft.issuer) === issuer;
    const taxonMatches = !taxon || String(nft.taxon) === taxon;

    return issuerMatches && taxonMatches;
  });
}

function evaluateRequirement(
  requirement: any,
  ownedNfts: OwnedNft[],
  tokenBalances: TokenBalance[],
  collectionNamesByKey: Map<string, string>
): RequirementResult {
  const requirementType = normalize(requirement.requirement_type);
  const matchingCollectionNfts = countMatchingCollectionNfts(
    requirement,
    ownedNfts
  );

  const issuer = String(requirement.issuer || "");
  const taxon = String(requirement.taxon || "");
  const key = collectionKey(issuer, taxon);

  const resultBase: RequirementResult = {
    requirement_type: String(requirement.requirement_type || ""),
    issuer,
    taxon,
    collection_name:
      collectionNamesByKey.get(key) ||
      String(requirement.collection_name || requirement.name || "") ||
      (taxon ? `Taxon ${taxon}` : "Any Taxon"),
    passed: false,
  };

  if (requirementType === "nft_count") {
    const min = Number(requirement.min_nft_count || 1);
    const found = matchingCollectionNfts.length;

    return {
      ...resultBase,
      passed: found >= min,
      found_count: found,
      required_count: min,
    };
  }

  if (requirementType === "trait") {
    const traitType = normalize(requirement.trait_type);
    const traitValue = normalize(requirement.trait_value);

    let matchingTraitCount = 0;

    for (const nft of matchingCollectionNfts) {
      const hasTrait = nft.traits.some((trait) => {
        const typeMatches =
          !traitType || normalize(trait.trait_type) === traitType;
        const valueMatches =
          !traitValue || normalize(trait.value) === traitValue;

        return typeMatches && valueMatches;
      });

      if (hasTrait) matchingTraitCount += 1;
    }

    return {
      ...resultBase,
      passed: matchingTraitCount > 0,
      trait_type: String(requirement.trait_type || ""),
      trait_value: String(requirement.trait_value || ""),
      matching_trait_count: matchingTraitCount,
      found_count: matchingCollectionNfts.length,
    };
  }

  if (requirementType === "trait_count") {
    const traitType = normalize(requirement.trait_type);
    const traitValue = normalize(requirement.trait_value);
    const min = Number(requirement.min_nft_count || 1);

    let matchingTraitCount = 0;

    for (const nft of matchingCollectionNfts) {
      const hasTrait = nft.traits.some((trait) => {
        const typeMatches =
          !traitType || normalize(trait.trait_type) === traitType;
        const valueMatches =
          !traitValue || normalize(trait.value) === traitValue;

        return typeMatches && valueMatches;
      });

      if (hasTrait) matchingTraitCount += 1;
    }

    return {
      ...resultBase,
      passed: matchingTraitCount >= min,
      trait_type: String(requirement.trait_type || ""),
      trait_value: String(requirement.trait_value || ""),
      matching_trait_count: matchingTraitCount,
      required_count: min,
      found_count: matchingCollectionNfts.length,
    };
  }

  if (isTokenRequirementType(requirementType)) {
    const currency = normalizeCurrency(requirement.token_currency);
    const issuer = normalize(requirement.token_issuer);
    const min = Number(requirement.min_token_amount || 0);

    const matchingTokens = tokenBalances.filter((token) => {
      const currencyMatches =
        !currency || normalizeCurrency(token.currency) === currency;
      const issuerMatches =
        !issuer || normalize(token.issuer) === issuer;

      return currencyMatches && issuerMatches;
    });

    const balance = matchingTokens.reduce(
      (sum, token) => sum + Number(token.balance || 0),
      0
    );

    return {
      ...resultBase,
      issuer: "",
      taxon: "",
      collection_name: currency || "Any token from issuer",
      passed: balance >= min,
      token_currency: String(requirement.token_currency || ""),
      token_issuer: String(requirement.token_issuer || ""),
      token_balance: balance,
      required_token_amount: min,
      found_count: matchingTokens.length,
    };
  }

  return resultBase;
}

async function loadSavedMetadataForOwnedNfts(
  projectId: string,
  ownedNfts: OwnedNft[]
) {
  const nftIds = ownedNfts.map((nft) => nft.nft_id).filter(Boolean);

  if (nftIds.length === 0) {
    return {
      ownedNfts,
      savedRows: [] as any[],
    };
  }

  const savedRows: any[] = [];
  const nftIdChunks = chunkArray(nftIds, SUPABASE_CHUNK_SIZE);

  for (const nftIdChunk of nftIdChunks) {
    const { data, error } = await supabase
      .from("collection_nfts")
      .select("*")
      .eq("project_id", projectId)
      .in("nft_id", nftIdChunk);

    if (error) {
      throw new Error(error.message);
    }

    if (data?.length) {
      savedRows.push(...data);
    }
  }

  const savedById = new Map<string, any>();

  for (const row of savedRows) {
    savedById.set(String(row.nft_id), row);
  }

  for (const nft of ownedNfts) {
    const saved = savedById.get(nft.nft_id);

    if (!saved) continue;

    const metadata =
      saved.metadata ||
      saved.metadata_json ||
      saved.raw_metadata ||
      saved.json ||
      saved;

    nft.metadata = metadata;
    nft.traits = extractTraits(metadata);

    if (nft.traits.length === 0 && Array.isArray(saved.traits)) {
      nft.traits = extractTraits({ attributes: saved.traits });
    }
  }

  return {
    ownedNfts,
    savedRows,
  };
}

function buildCollectionSummary(
  ownedNfts: OwnedNft[],
  savedRows: any[],
  gatedCollections: GatedCollection[]
) {
  const collectionMap = new Map<string, CollectionSummary>();

  for (const gated of gatedCollections) {
    collectionMap.set(gated.key, {
      issuer: gated.issuer,
      taxon: gated.taxon,
      name: gated.name,
      owned_count: 0,
      indexed_count: 0,
    });
  }

  for (const nft of ownedNfts) {
    const matchingGated = gatedCollections.find((gated) =>
      nftMatchesGatedCollection(nft, gated)
    );

    const key = matchingGated?.key || collectionKey(nft.issuer, nft.taxon);

    const existing =
      collectionMap.get(key) ||
      ({
        issuer: nft.issuer,
        taxon: nft.taxon,
        name: matchingGated?.name || `Taxon ${nft.taxon}`,
        owned_count: 0,
        indexed_count: 0,
      } satisfies CollectionSummary);

    existing.owned_count += 1;
    collectionMap.set(key, existing);
  }

  for (const row of savedRows) {
    const matchingGated = gatedCollections.find((gated) =>
      rowMatchesGatedCollection(row, gated)
    );

    const issuer = String(
      row.issuer || row.nft_issuer || matchingGated?.issuer || ""
    );
    const taxon = String(
      row.taxon || row.nft_taxon || matchingGated?.taxon || ""
    );
    const key = matchingGated?.key || collectionKey(issuer, taxon);

    const existing =
      collectionMap.get(key) ||
      ({
        issuer,
        taxon,
        name:
          matchingGated?.name ||
          row.collection_name ||
          row.name ||
          `Taxon ${taxon || "Unknown"}`,
        owned_count: 0,
        indexed_count: 0,
      } satisfies CollectionSummary);

    existing.indexed_count += 1;

    if (matchingGated?.name) {
      existing.name = matchingGated.name;
    } else if (row.collection_name || row.name) {
      existing.name = row.collection_name || row.name;
    }

    collectionMap.set(key, existing);
  }

  return Array.from(collectionMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

function buildTraitSummary(ownedNfts: OwnedNft[]) {
  const traitMap = new Map<
    string,
    { trait_type: string; value: string; count: number }
  >();

  for (const nft of ownedNfts) {
    for (const trait of nft.traits) {
      const key = `${normalize(trait.trait_type)}|${normalize(trait.value)}`;

      const existing =
        traitMap.get(key) ||
        ({
          trait_type: trait.trait_type,
          value: trait.value,
          count: 0,
        });

      existing.count += 1;
      traitMap.set(key, existing);
    }
  }

  return Array.from(traitMap.values()).sort((a, b) => {
    const typeCompare = a.trait_type.localeCompare(b.trait_type);
    if (typeCompare !== 0) return typeCompare;
    return a.value.localeCompare(b.value);
  });
}

async function addDiscordRole(guildId: string, userId: string, roleId: string) {
  const res = await fetchWithTimeout(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
    },
    DISCORD_FETCH_TIMEOUT_MS
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));

    throw new Error(
      data?.message ||
        `Failed to add Discord role ${roleId}. Make sure Cocky Bot role is above this role.`
    );
  }
}

async function removeDiscordRole(
  guildId: string,
  userId: string,
  roleId: string
) {
  const res = await fetchWithTimeout(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
    },
    DISCORD_FETCH_TIMEOUT_MS
  );

  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));

    throw new Error(
      data?.message ||
        `Failed to remove Discord role ${roleId}. Make sure Cocky Bot role is above this role.`
    );
  }
}

async function sendUserDm(userId: string, message: string) {
  try {
    const dmRes = await fetchWithTimeout(
      "https://discord.com/api/v10/users/@me/channels",
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient_id: userId,
        }),
      },
      DISCORD_FETCH_TIMEOUT_MS
    );

    const dm = await dmRes.json();

    if (!dmRes.ok || !dm?.id) return;

    await fetchWithTimeout(
      `https://discord.com/api/v10/channels/${dm.id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: message,
        }),
      },
      DISCORD_FETCH_TIMEOUT_MS
    );
  } catch {
    // DMs can fail if user has DMs disabled. Do not block verification.
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const wallet = String(body.wallet || "").trim();
    const provider = String(body.provider || "").trim();
    const discordUserId = String(body.discord_user_id || "").trim();
    const discordGuildId = String(body.discord_guild_id || "").trim();

    console.log("VERIFY START", {
      wallet,
      discordUserId,
      discordGuildId,
    });

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: "Missing wallet." },
        { status: 400 }
      );
    }

    if (!discordUserId || !discordGuildId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing Discord context. Open the portal from /verifyportal inside Discord.",
        },
        { status: 400 }
      );
    }

    if (!process.env.DISCORD_BOT_TOKEN) {
      return NextResponse.json(
        { success: false, error: "Missing DISCORD_BOT_TOKEN." },
        { status: 500 }
      );
    }

    console.time("loadProject");

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("discord_guild_id", discordGuildId)
      .single();

    console.timeEnd("loadProject");

    if (projectError || !project) {
      return NextResponse.json(
        {
          success: false,
          error: "No Cocky Bot project is configured for this Discord server.",
        },
        { status: 404 }
      );
    }

    if (!isProjectBillingActive(project)) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          billing_locked: true,
          error:
            "This Discord server's Cocky Portal subscription is inactive. Ask the server manager to renew hosting from the dashboard.",
          scan_summary: {
            project_id: project.id,
            project_name: project.name,
            discord_guild_id: discordGuildId,
            billing_status: project.billing_status || "inactive",
            paid_until: project.paid_until || null,
            admin_locked: Boolean(project.admin_locked),
          },
        },
        { status: 402 }
      );
    }

    console.time("loadRules");

    const { data: rules, error: rulesError } = await supabase
      .from("role_rules")
      .select(
        `
        *,
        role_rule_requirements (*)
      `
      )
      .eq("project_id", project.id);

    console.timeEnd("loadRules");

    if (rulesError) {
      return NextResponse.json(
        { success: false, error: rulesError.message },
        { status: 500 }
      );
    }

    if (!rules || rules.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No role rules are configured for this Discord server yet.",
        },
        { status: 404 }
      );
    }

    const collectionNamesByKey = await loadProjectCollectionNames(project.id);
    const gatedCollections = buildGatedCollectionsFromRules(
      rules,
      collectionNamesByKey
    );

    console.log("GATED COLLECTIONS", gatedCollections);

    console.time("fetchWalletNfts");

    const allOwnedNfts = await fetchWalletNfts(wallet);

    console.timeEnd("fetchWalletNfts");
    console.log("OWNED NFT COUNT", allOwnedNfts.length);

    console.time("fetchWalletTokenBalances");

    const tokenBalances = await fetchWalletTokenBalances(wallet);

    console.timeEnd("fetchWalletTokenBalances");
    console.log("TOKEN BALANCE COUNT", tokenBalances.length);

    let ownedNfts = filterOwnedNftsToGatedCollections(
      allOwnedNfts,
      gatedCollections
    );

    console.log("GATED OWNED NFT COUNT", ownedNfts.length);

    console.time("loadSavedMetadataForOwnedNfts");

    const metadataResult = await loadSavedMetadataForOwnedNfts(
      project.id,
      ownedNfts
    );

    ownedNfts = metadataResult.ownedNfts;

    const gatedSavedRows = filterSavedRowsToGatedCollections(
      metadataResult.savedRows,
      gatedCollections
    );

    console.timeEnd("loadSavedMetadataForOwnedNfts");

    const collectionSummary = buildCollectionSummary(
      ownedNfts,
      gatedSavedRows,
      gatedCollections
    );

    const traitSummary = buildTraitSummary(ownedNfts);

    const rolesToAdd = new Set<string>();
    const rolesToRemove = new Set<string>();
    const matchedRoleNames: string[] = [];
    const failedRoleNames: string[] = [];
    const ruleResults: RuleResult[] = [];

    console.time("checkRules");

    for (const rule of rules) {
      const roleId = String(rule.discord_role_id || "").trim();
      const roleName = String(rule.role_name || roleId || "Discord Role").trim();
      const requirements = rule.role_rule_requirements || [];

      if (!roleId) continue;

      const requirementResults = requirements.map((requirement: any) =>
        evaluateRequirement(
          requirement,
          ownedNfts,
          tokenBalances,
          collectionNamesByKey
        )
      );

      const groups = new Map<number, RequirementResult[]>();

      requirementResults.forEach((result: RequirementResult, index: number) => {
        const sourceRequirement = requirements[index] || {};
        const groupId = Number(sourceRequirement.group_id || index + 1);

        if (!groups.has(groupId)) {
          groups.set(groupId, []);
        }

        groups.get(groupId)!.push(result);
      });

      const passes =
        requirementResults.length > 0 &&
        Array.from(groups.values()).some(
          (groupRequirements) =>
            groupRequirements.length > 0 &&
            groupRequirements.every(
              (requirement: RequirementResult) => requirement.passed
            )
        );

      ruleResults.push({
        role_id: roleId,
        role_name: roleName,
        passed: passes,
        logic: "OR_GROUPS_AND_INSIDE",
        requirements: requirementResults,
      });

      if (passes) {
        rolesToAdd.add(roleId);
        matchedRoleNames.push(roleName);
      } else {
        rolesToRemove.add(roleId);
        failedRoleNames.push(roleName);
      }
    }

    console.timeEnd("checkRules");

    console.log("ROLE DECISION", {
      add: Array.from(rolesToAdd),
      remove: Array.from(rolesToRemove),
      matchedRoleNames,
      failedRoleNames,
    });

    console.time("discordRoleUpdates");

    for (const roleId of rolesToAdd) {
      await addDiscordRole(discordGuildId, discordUserId, roleId);
      rolesToRemove.delete(roleId);
    }

    for (const roleId of rolesToRemove) {
      await removeDiscordRole(discordGuildId, discordUserId, roleId);
    }

    console.timeEnd("discordRoleUpdates");

    const scanSummary = {
      wallet,
      discord_user_id: discordUserId,
      discord_guild_id: discordGuildId,
      project_id: project.id,
      project_name: project.name,

      wallet_total_nfts_owned: allOwnedNfts.length,
      total_nfts_owned: ownedNfts.length,
      indexed_nfts_found: gatedSavedRows.length,

      gated_collections_count: gatedCollections.length,
      gated_collections: gatedCollections,

      collections: collectionSummary,
      traits: traitSummary,
      tokens: tokenBalances,
      rules: ruleResults,
    };

    console.time("upsertVerifiedWallet");

    const { error: upsertError } = await supabase.from("verified_wallets").upsert(
      {
        project_id: project.id,
        discord_guild_id: discordGuildId,
        discord_user_id: discordUserId,
        wallet_address: wallet,
        wallet_provider: provider || null,
        matched_roles: matchedRoleNames,
        scan_summary: scanSummary,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "project_id,discord_user_id,wallet_address",
      }
    );

    console.timeEnd("upsertVerifiedWallet");

    if (upsertError) {
      throw new Error(`Verified wallet save failed: ${upsertError.message}`);
    }

    if (matchedRoleNames.length > 0) {
      const message = `✅ Verified! Wallet linked and Discord roles updated: ${matchedRoleNames.join(
        ", "
      )}`;

      void sendUserDm(discordUserId, message);

      return NextResponse.json({
        success: true,
        verified: true,
        matched_roles: matchedRoleNames,
        removed_roles: failedRoleNames,
        message,
        scan_summary: scanSummary,
      });
    }

    const failMessage =
      "❌ Verification checked, but no matching NFT, trait, or token requirement was found for this wallet.";

    void sendUserDm(discordUserId, failMessage);

    return NextResponse.json({
      success: false,
      verified: false,
      matched_roles: [],
      removed_roles: failedRoleNames,
      error: failMessage,
      scan_summary: scanSummary,
    });
  } catch (error: any) {
    console.error("VERIFY ROUTE ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Verification failed.",
      },
      { status: 500 }
    );
  }
}