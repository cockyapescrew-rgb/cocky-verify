import { NextResponse } from "next/server";
import { XummSdk } from "xumm-sdk";

const sdk = new XummSdk(
  process.env.XUMM_API_KEY!,
  process.env.XUMM_API_SECRET!
);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;

    const payload = await sdk.payload.get(uuid);

    if (!payload) {
      return NextResponse.json(
        { error: "No Xaman payload found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      signed: payload.meta.signed,
      expired: payload.meta.expired,
      wallet: payload.response.account || null,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to check Xaman payload" },
      { status: 500 }
    );
  }
}