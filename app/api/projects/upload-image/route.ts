import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const BUCKET_NAME = "tenant-images";
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function getSuperAdminIds() {
  return String(process.env.SUPER_ADMIN_DISCORD_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function safeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function extensionFromMime(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "";
}

async function getDiscordIdFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get("discord_id")?.value || "";
}

export async function POST(req: Request) {
  try {
    const discordId = await getDiscordIdFromCookies();

    if (!discordId) {
      return NextResponse.json(
        {
          success: false,
          error: "Connect Discord before uploading a server image.",
        },
        { status: 401 },
      );
    }

    const formData = await req.formData();
    const projectId = String(formData.get("project_id") || "").trim();
    const image = formData.get("image");

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Missing project_id." },
        { status: 400 },
      );
    }

    if (!(image instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Missing image file." },
        { status: 400 },
      );
    }

    if (image.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "Image is too large. Max size is 2MB.",
        },
        { status: 400 },
      );
    }

    const ext = extensionFromMime(image.type);

    if (!ext) {
      return NextResponse.json(
        {
          success: false,
          error: "Only PNG, JPG, WEBP, or GIF images are allowed.",
        },
        { status: 400 },
      );
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id,owner_discord_id,tenant_image_path,tenant_image_removed_by_admin")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        {
          success: false,
          error: projectError?.message || "Project not found.",
        },
        { status: 404 },
      );
    }

    const isSuperAdmin = getSuperAdminIds().includes(discordId);
    const isOwner = String(project.owner_discord_id || "") === String(discordId);

    if (!isOwner && !isSuperAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "You do not own this project.",
        },
        { status: 403 },
      );
    }

    if (project.tenant_image_removed_by_admin && !isSuperAdmin) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This server image was removed by super admin. Ask admin to allow a new image first.",
        },
        { status: 403 },
      );
    }

    const bytes = Buffer.from(await image.arrayBuffer());
    const originalName = safeFileName(image.name || `server-image.${ext}`);
    const path = `${projectId}/${Date.now()}-${originalName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, bytes, {
        contentType: image.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          success: false,
          error: uploadError.message,
        },
        { status: 500 },
      );
    }

    const { data: publicData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(path);

    const publicUrl = publicData.publicUrl;

    const { error: updateError } = await supabase
      .from("projects")
      .update({
        tenant_image_url: publicUrl,
        tenant_image_path: path,
        tenant_image_updated_at: new Date().toISOString(),
        tenant_image_removed_by_admin: false,
        tenant_image_admin_note: null,
      })
      .eq("id", projectId);

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: updateError.message,
        },
        { status: 500 },
      );
    }

    if (project.tenant_image_path) {
      await supabase.storage
        .from(BUCKET_NAME)
        .remove([project.tenant_image_path])
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      tenant_image_url: publicUrl,
      tenant_image_path: path,
    });
  } catch (error: any) {
    console.error("PROJECT IMAGE UPLOAD ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to upload server image.",
      },
      { status: 500 },
    );
  }
}
