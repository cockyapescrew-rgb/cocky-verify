import { NextResponse } from "next/server";
import { XummSdk } from "xumm-sdk";

const sdk = new XummSdk(
  process.env.XUMM_API_KEY!,
  process.env.XUMM_API_SECRET!
);

export async function GET() {
  try {
    const payload = await sdk.payload.create({
      txjson: {
        TransactionType: "SignIn",
      },
    });

    if (!payload) {
      return NextResponse.json(
        { error: "No Xaman payload returned" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      uuid: payload.uuid,
      qr: payload.refs.qr_png,
      deepLink: payload.next.always,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to create Xaman payload" },
      { status: 500 }
    );
  }
}