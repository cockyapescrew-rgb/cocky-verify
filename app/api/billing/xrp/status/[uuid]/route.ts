import { NextResponse } from "next/server";
import { XummSdk } from "xumm-sdk";
import { supabaseAdmin as supabase } from "@/lib/supabase";

const sdk = new XummSdk(
  process.env.XUMM_API_KEY!,
  process.env.XUMM_API_SECRET!
);

function addDaysFromPaidUntil(existingPaidUntil: string | null, days: number) {
  const now = new Date();

  let base = now;

  if (existingPaidUntil) {
    const currentPaidUntil = new Date(existingPaidUntil);

    if (
      !Number.isNaN(currentPaidUntil.getTime()) &&
      currentPaidUntil.getTime() > now.getTime()
    ) {
      base = currentPaidUntil;
    }
  }

  base.setDate(base.getDate() + days);
  return base.toISOString();
}

function getSigned(payload: any) {
  return Boolean(payload?.meta?.signed);
}

function getExpired(payload: any) {
  return Boolean(payload?.meta?.expired);
}

function getPayerWallet(payload: any) {
  return (
    payload?.response?.account ||
    payload?.response?.Account ||
    payload?.request?.txjson?.Account ||
    ""
  );
}

function getTxHash(payload: any, uuid: string) {
  const response = payload?.response || {};

  return (
    response.txid ||
    response.txId ||
    response.tx_hash ||
    response.txHash ||
    response.hash ||
    response.dispatched_to ||
    response.resolved_txid ||
    response.resolvedTxid ||
    `xaman:${uuid}`
  );
}

function getDispatchResult(payload: any) {
  const response = payload?.response || {};

  return (
    response.dispatched_result ||
    response.dispatchedResult ||
    response.engine_result ||
    response.engineResult ||
    ""
  );
}

function wasRejectedOrFailed(payload: any) {
  const response = payload?.response || {};
  const dispatchResult = getDispatchResult(payload);

  if (payload?.meta?.cancelled) return true;
  if (response.cancelled) return true;

  if (dispatchResult && dispatchResult !== "tesSUCCESS") {
    return true;
  }

  return false;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;

    if (!uuid) {
      return NextResponse.json(
        { success: false, error: "Missing uuid." },
        { status: 400 }
      );
    }

    const payload = await sdk.payload.get(uuid);

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "No Xaman payload found." },
        { status: 404 }
      );
    }

    console.log("XRP BILLING STATUS META:", payload.meta);
    console.log("XRP BILLING STATUS RESPONSE:", payload.response);

    const signed = getSigned(payload);
    const expired = getExpired(payload);

    const { data: payment, error: paymentError } = await supabase
      .from("project_payments")
      .select("*")
      .eq("xaman_uuid", uuid)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        {
          success: false,
          error: paymentError?.message || "Payment record not found.",
          signed,
          expired,
        },
        { status: 404 }
      );
    }

    if (payment.status === "paid") {
      return NextResponse.json({
        success: true,
        paid: true,
        signed: true,
        expired: false,
        status: "paid",
        tx_hash: payment.tx_hash,
        paid_until: payment.paid_until,
      });
    }

    if (wasRejectedOrFailed(payload)) {
      const dispatchResult = getDispatchResult(payload);

      await supabase
        .from("project_payments")
        .update({
          status: "failed",
          raw_payload: payload,
        })
        .eq("xaman_uuid", uuid);

      return NextResponse.json({
        success: true,
        paid: false,
        signed,
        expired,
        status: "failed",
        error: dispatchResult
          ? `Xaman transaction failed: ${dispatchResult}`
          : "Xaman transaction was cancelled or failed.",
        debug: {
          meta: payload.meta,
          response: payload.response,
        },
      });
    }

    if (expired && !signed) {
      await supabase
        .from("project_payments")
        .update({
          status: "expired",
          raw_payload: payload,
        })
        .eq("xaman_uuid", uuid);

      return NextResponse.json({
        success: true,
        paid: false,
        signed: false,
        expired: true,
        status: "expired",
      });
    }

    if (!signed) {
      return NextResponse.json({
        success: true,
        paid: false,
        signed: false,
        expired: false,
        status: "pending",
        debug: {
          meta: payload.meta,
          response: payload.response,
        },
      });
    }

    const txHash = getTxHash(payload, uuid);
    const payerWallet = getPayerWallet(payload);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", payment.project_id)
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

    const paidUntil = addDaysFromPaidUntil(project.paid_until || null, 30);

    const { error: updatePaymentError } = await supabase
      .from("project_payments")
      .update({
        payer_wallet: payerWallet || null,
        tx_hash: txHash,
        destination_wallet:
          process.env.CALCO_BILLING_WALLET ||
          project.billing_wallet ||
          null,
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_until: paidUntil,
        raw_payload: payload,
      })
      .eq("xaman_uuid", uuid);

    if (updatePaymentError) {
      console.error("XRP BILLING PAYMENT UPDATE ERROR:", updatePaymentError);

      return NextResponse.json(
        {
          success: false,
          error: updatePaymentError.message,
        },
        { status: 500 }
      );
    }

    const { error: updateProjectError } = await supabase
      .from("projects")
      .update({
        billing_status: "active",
        paid_until: paidUntil,
        billing_last_tx_hash: txHash,
        billing_wallet:
          process.env.CALCO_BILLING_WALLET || project.billing_wallet,
        billing_destination_tag:
          payment.destination_tag || project.billing_destination_tag,
        monthly_xrp_amount:
          payment.amount_xrp ||
          payment.expected_amount_xrp ||
          project.monthly_xrp_amount ||
          25,
        admin_locked: false,
      })
      .eq("id", payment.project_id);

    if (updateProjectError) {
      console.error("XRP BILLING PROJECT UPDATE ERROR:", updateProjectError);

      return NextResponse.json(
        {
          success: false,
          error: updateProjectError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paid: true,
      signed: true,
      expired: false,
      status: "paid",
      tx_hash: txHash,
      payer_wallet: payerWallet,
      paid_until: paidUntil,
      debug: {
        meta: payload.meta,
        response: payload.response,
      },
    });
  } catch (error: any) {
    console.error("XRP BILLING STATUS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to check XRP payment.",
      },
      { status: 500 }
    );
  }
}