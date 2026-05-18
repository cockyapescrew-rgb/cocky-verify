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

function normalize(value: any) {
  return String(value || "").trim().toLowerCase();
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

function decodeHexUri(uri?: string) {
  if (!uri) return "";

  try {
    const clean = uri.trim();

    if (clean.startsWith("http") || clean.startsWith("ipfs://")) return clean;

    if (/^[0-9a-fA-F]+$/.test(clean)) {
      return Buffer.from(clean, "hex").toString("utf8");
    }

    return clean;
  } catch {
    return uri || "";
  }
}

function toHttpUri(uri?: string) {
  const decoded = decodeHexUri(uri);

  if (!decoded) return "";

  if (decoded.startsWith("ipfs://")) {
    return decoded
      .replace("ipfs://", "https://ipfs.io/ipfs/")
      .replaceAll("#", "%23");
  }

  return decoded.replaceAll("#", "%23");
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

async function fetchJsonMetadata(uri?: string) {
  const url = toHttpUri(uri);

  if (!url) return null;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      },
      8_000
    );

    if (!res.ok) return null;

    return await res.json();
  } catch {
    return null;
  }
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

function requirementMatchesNfts(requirement: any, ownedNfts: OwnedNft[]) {
  const requirementType = normalize(requirement.requirement_type);
  const issuer = normalize(requirement.issuer);
  const taxon = String(requirement.taxon || "").trim();

  const matchingCollectionNfts = ownedNfts.filter((nft) => {
    const issuerMatches = !issuer || normalize(nft.issuer) === issuer;
    const taxonMatches = !taxon || String(nft.taxon) === taxon;

    return issuerMatches && taxonMatches;
  });

  if (requirementType === "nft_count") {
    const min = Number(requirement.min_nft_count || 1);
    return matchingCollectionNfts.length >= min;
  }

  if (requirementType === "trait") {
    const traitType = normalize(requirement.trait_type);
    const traitValue = normalize(requirement.trait_value);

    return matchingCollectionNfts.some((nft) =>
      nft.traits.some((trait) => {
        const typeMatches =
          !traitType || normalize(trait.trait_type) === traitType;

        const valueMatches =
          !traitValue || normalize(trait.value) === traitValue;

        return typeMatches && valueMatches;
      })
    );
  }

  if (requirementType === "trait_count") {
    const traitType = normalize(requirement.trait_type);
    const traitValue = normalize(requirement.trait_value);
    const min = Number(requirement.min_nft_count || 1);

    const count = matchingCollectionNfts.filter((nft) =>
      nft.traits.some((trait) => {
        const typeMatches =
          !traitType || normalize(trait.trait_type) === traitType;

        const valueMatches =
          !traitValue || normalize(trait.value) === traitValue;

        return typeMatches && valueMatches;
      })
    ).length;

    return count >= min;
  }

  return false;
}

async function loadSavedMetadataForOwnedNfts(
  projectId: string,
  ownedNfts: OwnedNft[]
) {
  const nftIds = ownedNfts.map((nft) => nft.nft_id).filter(Boolean);

  if (nftIds.length === 0) return ownedNfts;

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

    /*
      IMPORTANT:
      Do NOT fetch live IPFS/metadata here.

      This route must be fast because it runs when a user clicks
      "Refresh Discord Roles." Metadata should already be indexed
      from the dashboard scan tools.
    */
  }

  return ownedNfts;
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

    console.time("fetchWalletNfts");

    let ownedNfts = await fetchWalletNfts(wallet);

    console.timeEnd("fetchWalletNfts");
    console.log("OWNED NFT COUNT", ownedNfts.length);

    console.time("loadSavedMetadataForOwnedNfts");

    ownedNfts = await loadSavedMetadataForOwnedNfts(project.id, ownedNfts);

    console.timeEnd("loadSavedMetadataForOwnedNfts");

    const rolesToAdd = new Set<string>();
    const rolesToRemove = new Set<string>();
    const matchedRoleNames: string[] = [];
    const failedRoleNames: string[] = [];

    console.time("checkRules");

    for (const rule of rules) {
      const roleId = String(rule.discord_role_id || "").trim();
      const roleName = String(rule.role_name || roleId || "Discord Role").trim();
      const requirements = rule.role_rule_requirements || [];

      if (!roleId) continue;

      const passes =
        requirements.length > 0 &&
        requirements.every((requirement: any) =>
          requirementMatchesNfts(requirement, ownedNfts)
        );

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

    console.time("upsertVerifiedWallet");

    await supabase.from("verified_wallets").upsert(
      {
        project_id: project.id,
        discord_guild_id: discordGuildId,
        discord_user_id: discordUserId,
        wallet_address: wallet,
        wallet_provider: provider || null,
        matched_roles: matchedRoleNames,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "project_id,discord_user_id,wallet_address",
      }
    );

    console.timeEnd("upsertVerifiedWallet");

    if (matchedRoleNames.length > 0) {
      const message = `✅ Verified! Wallet linked and Discord roles updated: ${matchedRoleNames.join(
        ", "
      )}`;

      // Do not await DMs during verification. This keeps the API fast.
      void sendUserDm(discordUserId, message);

      return NextResponse.json({
        success: true,
        verified: true,
        matched_roles: matchedRoleNames,
        removed_roles: failedRoleNames,
        message,
      });
    }

    const failMessage =
      "❌ Verification checked, but no matching NFT, trait, or token requirement was found for this wallet.";

    // Do not await DMs during verification. This keeps the API fast.
    void sendUserDm(discordUserId, failMessage);

    return NextResponse.json({
      success: false,
      verified: false,
      matched_roles: [],
      removed_roles: failedRoleNames,
      error: failMessage,
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