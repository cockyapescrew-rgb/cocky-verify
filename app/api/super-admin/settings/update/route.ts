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
    return { ok: false, error: "Not logged in with Discord.", status: 401 };
  }

  if (!superAdminIds.includes(discordId)) {
    return { ok: false, error: "Not authorized.", status: 403 };
  }

  return { ok: true, error: "", status: 200 };
}

export async function POST(req: Request) {
  const admin = await requireSuperAdmin();

  if (!admin.ok) {
    return NextResponse.json(
      { success: false, error: admin.error },
      { status: admin.status }
    );
  }

  try {
    const body = await req.json();
    const monthlyXrpAmount = Number(body.monthly_xrp_amount);

    if (!Number.isFinite(monthlyXrpAmount) || monthlyXrpAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Monthly XRP amount must be greater than 0." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("platform_settings")
      .upsert(
        {
          key: "monthly_xrp_amount",
          value: monthlyXrpAmount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      monthly_xrp_amount: monthlyXrpAmount,
      setting: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to update setting." },
      { status: 500 }
    );
  }
}
