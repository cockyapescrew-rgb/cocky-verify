import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const response = NextResponse.redirect(new URL("/", req.url));

  const cookieOptions = {
    path: "/",
    maxAge: 0,
  };

  response.cookies.set("discord_id", "", cookieOptions);
  response.cookies.set("discord_username", "", cookieOptions);
  response.cookies.set("discord_global_name", "", cookieOptions);
  response.cookies.set("discord_avatar", "", cookieOptions);
  response.cookies.set("discord_access_token", "", cookieOptions);

  return response;
}