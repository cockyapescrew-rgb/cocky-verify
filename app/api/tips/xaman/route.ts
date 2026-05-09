import { NextResponse } from "next/server";
import { XummSdk } from "xumm-sdk";

export async function POST(req: Request) {
  try {
    const { amount } = await req.json();

    const apiKey = process.env.XUMM_API_KEY;
    const apiSecret = process.env.XUMM_API_SECRET;
    const destination = process.env.TIP_WALLET_ADDRESS;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "Missing XUMM_API_KEY or XUMM_API_SECRET" },
        { status: 500 }
      );
    }

    if (!destination) {
      return NextResponse.json(
        { error: "Missing TIP_WALLET_ADDRESS" },
        { status: 500 }
      );
    }

    const xrpAmount = Number(amount);

    if (!xrpAmount || xrpAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid XRP amount" },
        { status: 400 }
      );
    }

    const sdk = new XummSdk(apiKey, apiSecret);

    const payload = await sdk.payload.create({
      txjson: {
        TransactionType: "Payment",
        Destination: destination,
        Amount: String(Math.floor(xrpAmount * 1000000)),
      },
    });

    if (!payload?.uuid) {
      return NextResponse.json(
        {
          error: "Failed to create tip payload",
          payload,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      uuid: payload.uuid,
      qr: payload.refs?.qr_png || payload.refs?.qr_matrix || "",
      deepLink: payload.next?.always || "",
    });
  } catch (error: any) {
    console.error("TIP XAMAN ERROR:", error);

    return NextResponse.json(
      {
        error: "Failed to create tip transaction",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}