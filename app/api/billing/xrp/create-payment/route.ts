import { NextResponse } from "next/server";
import { XummSdk } from "xumm-sdk";
import { supabaseAdmin as supabase } from "@/lib/supabase";

const sdk = new XummSdk(
  process.env.XUMM_API_KEY!,
  process.env.XUMM_API_SECRET!
);

const BILLING_WALLET = process.env.CALCO_BILLING_WALLET || "";
const DEFAULT_MONTHLY_XRP = Number(process.env.COCKY_MONTHLY_XRP_AMOUNT || 25);

function xrpToDrops(amount: number) {
  return String(Math.round(amount * 1_000_000));
}

function makeDestinationTag(projectId: string) {
  let hash = 0;

  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) >>> 0;
  }

  return Math.max(1, hash % 2_000_000_000);
}

function isValidXrpAddress(address: string) {
  return /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address);
}

function cleanXrpAmount(value: unknown) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return DEFAULT_MONTHLY_XRP;
  }

  return amount;
}

export async function POST(req: Request) {
  try {
    const { project_id } = await req.json();

    if (!project_id) {
      return NextResponse.json(
        { success: false, error: "Missing project_id." },
        { status: 400 }
      );
    }

    if (!BILLING_WALLET) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing CALCO_BILLING_WALLET env variable.",
        },
        { status: 500 }
      );
    }

    if (!isValidXrpAddress(BILLING_WALLET)) {
      return NextResponse.json(
        {
          success: false,
          error: "CALCO_BILLING_WALLET is not a valid XRPL r-address.",
          debug: {
            billing_wallet: BILLING_WALLET,
          },
        },
        { status: 500 }
      );
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        {
          success: false,
          error: projectError?.message || "Project not found.",
        },
        { status: 404 }
      );
    }

    const { data: globalPriceSetting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "monthly_xrp_amount")
      .single();

    const globalMonthlyXrp = cleanXrpAmount(
      globalPriceSetting?.value || DEFAULT_MONTHLY_XRP
    );

    // Project price still acts as an override if set.
    // If project.monthly_xrp_amount is null/empty, global setting is used.
    const amountXrp = cleanXrpAmount(
      project.monthly_xrp_amount || globalMonthlyXrp
    );

    const amountDrops = xrpToDrops(amountXrp);

    const destinationTag =
      Number(project.billing_destination_tag || 0) ||
      makeDestinationTag(project.id);

    const memo = `COCKY-HOSTING:${project.id}`;

    const txjson = {
      TransactionType: "Payment",
      Destination: BILLING_WALLET,
      Amount: amountDrops,
    };

    console.log("XAMAN BILLING TXJSON:", txjson);

    let payload: any = null;

    try {
      payload = await sdk.payload.create(
        {
          txjson,
        } as any,
        true
      );
    } catch (xamanError: any) {
      console.error("XAMAN PAYLOAD CREATE FAILED:", xamanError);

      return NextResponse.json(
        {
          success: false,
          error:
            xamanError?.message ||
            xamanError?.error ||
            xamanError?.response?.message ||
            JSON.stringify(xamanError),
          debug: {
            billing_wallet: BILLING_WALLET,
            amount_xrp: amountXrp,
            amount_drops: amountDrops,
            destination_tag: destinationTag,
            memo,
          },
        },
        { status: 500 }
      );
    }

    console.log("XAMAN BILLING PAYLOAD:", payload);

    if (!payload?.uuid) {
      return NextResponse.json(
        {
          success: false,
          error: "No Xaman payload returned.",
          debug: {
            billing_wallet: BILLING_WALLET,
            amount_xrp: amountXrp,
            amount_drops: amountDrops,
            destination_tag: destinationTag,
            memo,
            payload,
          },
        },
        { status: 500 }
      );
    }

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    const { error: paymentError } = await supabase
      .from("project_payments")
      .insert({
        project_id: project.id,
        discord_guild_id: project.discord_guild_id || null,
        xaman_uuid: payload.uuid,
        amount_xrp: amountXrp,
        expected_amount_xrp: amountXrp,
        destination_wallet: BILLING_WALLET,
        destination_tag: destinationTag,
        memo,
        status: "pending",
        expires_at: expiresAt.toISOString(),
      });

    if (paymentError) {
      console.error("PROJECT PAYMENT INSERT ERROR:", paymentError);

      return NextResponse.json(
        {
          success: false,
          error: paymentError.message,
        },
        { status: 500 }
      );
    }

    const { error: projectUpdateError } = await supabase
      .from("projects")
      .update({
        billing_wallet: BILLING_WALLET,
        billing_destination_tag: destinationTag,
      })
      .eq("id", project.id);

    if (projectUpdateError) {
      console.error("PROJECT BILLING UPDATE ERROR:", projectUpdateError);

      return NextResponse.json(
        {
          success: false,
          error: projectUpdateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      uuid: payload.uuid,
      qr: payload.refs?.qr_png || "",
      deepLink: payload.next?.always || "",
      amount_xrp: amountXrp,
      amount_drops: amountDrops,
      destination: BILLING_WALLET,
      destination_tag: destinationTag,
      memo,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("CREATE XRP BILLING PAYMENT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to create XRP payment.",
      },
      { status: 500 }
    );
  }
}