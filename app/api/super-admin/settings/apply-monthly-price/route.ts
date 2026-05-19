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

export async function POST() {
  const admin = await requireSuperAdmin();

  if (!admin.ok) {
    return NextResponse.json(
      { success: false, error: admin.error },
      { status: admin.status }
    );
  }

  const { data: setting, error: settingError } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "monthly_xrp_amount")
    .single();

  if (settingError) {
    return NextResponse.json(
      { success: false, error: settingError.message },
      { status: 500 }
    );
  }

  const monthlyXrpAmount = Number(setting?.value || 15);

  if (!Number.isFinite(monthlyXrpAmount) || monthlyXrpAmount <= 0) {
    return NextResponse.json(
      { success: false, error: "Invalid global monthly XRP setting." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ monthly_xrp_amount: monthlyXrpAmount })
    .select("id,name,monthly_xrp_amount");

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    monthly_xrp_amount: monthlyXrpAmount,
    updated_count: data?.length || 0,
    projects: data || [],
  });
}
