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

export async function GET() {
  const admin = await requireSuperAdmin();

  if (!admin.ok) {
    return NextResponse.json(
      { success: false, error: admin.error },
      { status: admin.status }
    );
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .select("key,value,updated_at")
    .eq("key", "monthly_xrp_amount")
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    monthly_xrp_amount: Number(
      data?.value || process.env.COCKY_MONTHLY_XRP_AMOUNT || 15
    ),
    setting: data || null,
  });
}
