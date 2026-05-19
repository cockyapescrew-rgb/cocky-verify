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
      discordId: "",
      error: "Not logged in with Discord.",
      status: 401,
    };
  }

  if (!superAdminIds.includes(discordId)) {
    return {
      ok: false,
      discordId,
      error: "Not authorized.",
      status: 403,
    };
  }

  return {
    ok: true,
    discordId,
    error: "",
    status: 200,
  };
}

function cleanNullableText(value: unknown) {
  const clean = String(value || "").trim();
  return clean || null;
}

function cleanNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function POST(req: Request) {
  const admin = await requireSuperAdmin();

  if (!admin.ok) {
    return NextResponse.json(
      {
        success: false,
        error: admin.error,
      },
      { status: admin.status },
    );
  }

  try {
    const body = await req.json();

    const projectId = String(body.project_id || "").trim();

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing project_id.",
        },
        { status: 400 },
      );
    }

    const updates: Record<string, any> = {
      billing_status: cleanNullableText(body.billing_status) || "inactive",
      paid_until: cleanNullableText(body.paid_until),
      monthly_xrp_amount: cleanNumber(body.monthly_xrp_amount, 25),
      billing_wallet: cleanNullableText(body.billing_wallet),
      billing_destination_tag:
        body.billing_destination_tag === "" ||
        body.billing_destination_tag === null ||
        body.billing_destination_tag === undefined
          ? null
          : cleanNumber(body.billing_destination_tag, 0),
      billing_last_tx_hash: cleanNullableText(body.billing_last_tx_hash),
      admin_locked: Boolean(body.admin_locked),
      admin_notes: cleanNullableText(body.admin_notes),

      tenant_image_url: cleanNullableText(body.tenant_image_url),
      tenant_image_path: cleanNullableText(body.tenant_image_path),
      tenant_image_removed_by_admin: Boolean(body.tenant_image_removed_by_admin),
      tenant_image_admin_note: cleanNullableText(body.tenant_image_admin_note),
      tenant_image_updated_at: body.tenant_image_url ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", projectId)
      .select()
      .single();

    if (error) {
      console.error("SUPER ADMIN PROJECT UPDATE ERROR:", error);

      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      project: data,
    });
  } catch (error: any) {
    console.error("SUPER ADMIN UPDATE ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to update project.",
      },
      { status: 500 },
    );
  }
}
