import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin as supabase } from "@/lib/supabase";

function getSuperAdminIds() {
  return String(process.env.SUPER_ADMIN_DISCORD_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const discordId = cookieStore.get("discord_id")?.value || "";
  const superAdminIds = getSuperAdminIds();

  if (!discordId) {
    return {
      ok: false,
      error: "Not logged in with Discord.",
      status: 401,
    };
  }

  if (!superAdminIds.includes(discordId)) {
    return {
      ok: false,
      error: "Not authorized.",
      status: 403,
    };
  }

  return {
    ok: true,
    error: "",
    status: 200,
  };
}

async function fetchDiscordGuildName(guildId: string) {
  if (!guildId || !process.env.DISCORD_BOT_TOKEN) return "";

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.name) return "";

    return String(data.name);
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const admin = await requireSuperAdmin();

  if (!admin.ok) {
    return NextResponse.json(
      {
        success: false,
        error: admin.error,
        payments: [],
      },
      { status: admin.status }
    );
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");

  let paymentsQuery = supabase
    .from("project_payments")
    .select("*")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (projectId) {
    paymentsQuery = paymentsQuery.eq("project_id", projectId);
  }

  const { data: paymentsData, error: paymentsError } = await paymentsQuery;

  if (paymentsError) {
    console.error("SUPER ADMIN PAYMENTS LIST ERROR:", paymentsError);

    return NextResponse.json(
      {
        success: false,
        error: paymentsError.message,
        payments: [],
      },
      { status: 500 }
    );
  }

  const projectIds = Array.from(
    new Set(
      (paymentsData || [])
        .map((payment) => String(payment.project_id || ""))
        .filter(Boolean)
    )
  );

  let projectsById = new Map<string, any>();

  if (projectIds.length > 0) {
    const { data: projectsData, error: projectsError } = await supabase
      .from("projects")
      .select(
        "id,name,discord_guild_id,owner_discord_id,tenant_image_url,billing_status,paid_until"
      )
      .in("id", projectIds);

    if (projectsError) {
      console.error("SUPER ADMIN PAYMENTS PROJECT LOOKUP ERROR:", projectsError);
    } else {
      projectsById = new Map(
        (projectsData || []).map((project) => [String(project.id), project])
      );
    }
  }

  const guildIds = Array.from(
    new Set(
      (paymentsData || [])
        .map((payment: any) => {
          const project = projectsById.get(String(payment.project_id || "")) || {};
          return String(payment.discord_guild_id || project.discord_guild_id || "");
        })
        .filter(Boolean)
    )
  );

  const discordNamesByGuildId = new Map<string, string>();

  await Promise.all(
    guildIds.map(async (guildId) => {
      const name = await fetchDiscordGuildName(guildId);
      if (name) discordNamesByGuildId.set(guildId, name);
    })
  );

  const payments = (paymentsData || []).map((payment: any) => {
    const project = projectsById.get(String(payment.project_id || "")) || {};
    const guildId = payment.discord_guild_id || project.discord_guild_id || null;
    const liveDiscordName = guildId
      ? discordNamesByGuildId.get(String(guildId))
      : "";

    return {
      id: payment.id,
      status: payment.status || "pending",

      paid_at: payment.paid_at,
      created_at: payment.created_at,
      paid_until: payment.paid_until,

      project_id: payment.project_id,

      // Always prefer live Discord name.
      server_name:
        liveDiscordName ||
        project.name ||
        payment.server_name ||
        "Unknown Server",

      discord_guild_id: guildId,
      owner_discord_id: project.owner_discord_id || null,
      server_image_url:
        payment.server_image_url || project.tenant_image_url || null,

      payer_wallet: payment.payer_wallet,
      destination_wallet: payment.destination_wallet,
      tx_hash: payment.tx_hash,
      xaman_uuid: payment.xaman_uuid,

      amount_xrp: Number(payment.amount_xrp || payment.expected_amount_xrp || 0),
      xrp_usd_price:
        payment.xrp_usd_price === null || payment.xrp_usd_price === undefined
          ? null
          : Number(payment.xrp_usd_price),
      amount_usd:
        payment.amount_usd === null || payment.amount_usd === undefined
          ? null
          : Number(payment.amount_usd),

      destination_tag: payment.destination_tag,
      memo: payment.memo,
    };
  });

  const paidPayments = payments.filter((payment) => payment.status === "paid");

  const totals = {
    total_records: payments.length,
    paid_count: paidPayments.length,
    pending_count: payments.filter((payment) => payment.status === "pending")
      .length,
    failed_or_expired_count: payments.filter((payment) =>
      ["failed", "expired"].includes(String(payment.status || ""))
    ).length,
    total_xrp_paid: paidPayments.reduce(
      (sum, payment) => sum + Number(payment.amount_xrp || 0),
      0
    ),
    total_usd_paid: paidPayments.reduce(
      (sum, payment) => sum + Number(payment.amount_usd || 0),
      0
    ),
  };

  return NextResponse.json({
    success: true,
    payments,
    totals,
  });
}