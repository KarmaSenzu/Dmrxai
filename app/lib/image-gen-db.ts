"use client";

import { getSupabaseBrowser } from "./supabase-browser";
import type { GeneratedImage } from "./types";

export interface DBImageGeneration {
  id: string;
  user_id: string;
  prompt: string;
  negative_prompt: string | null;
  model: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Pull width/height out of size strings like "1024x1024" so DB columns get
// real integers. Returns nulls when the format is unexpected.
function parseSize(size: string | undefined): { width: number | null; height: number | null } {
  if (!size) return { width: null, height: null };
  const m = size.match(/^(\d+)x(\d+)$/i);
  if (!m) return { width: null, height: null };
  return { width: Number(m[1]), height: Number(m[2]) };
}

function dbRowToGeneratedImage(row: DBImageGeneration): GeneratedImage {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const size =
    typeof meta.size === "string"
      ? (meta.size as string)
      : row.width && row.height
        ? `${row.width}x${row.height}`
        : "1024x1024";
  return {
    id: row.id,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt ?? undefined,
    url: row.image_url ?? undefined,
    b64Data: typeof meta.b64Data === "string" ? (meta.b64Data as string) : undefined,
    model: row.model ?? "",
    size,
    timestamp: new Date(row.created_at).getTime(),
  };
}

export async function getImagesFromDB(): Promise<GeneratedImage[]> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("image_generations")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    if (error) console.error("[IMAGES-DB] Load failed:", error);
    return [];
  }

  return (data as DBImageGeneration[]).map(dbRowToGeneratedImage);
}

export async function saveImageToDB(image: GeneratedImage): Promise<void> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { width, height } = parseSize(image.size);

  // We persist only the URL in image_url; raw b64 payloads (DALL-E base64
  // mode) live inside metadata to avoid blowing past row size limits when
  // they happen to be small, while still being recoverable on reload.
  const metadata: Record<string, unknown> = {};
  if (image.size) metadata.size = image.size;
  if (image.b64Data) metadata.b64Data = image.b64Data;

  const { error } = await supabase.from("image_generations").upsert(
    {
      id: image.id,
      user_id: user.id,
      prompt: image.prompt,
      negative_prompt: image.negativePrompt ?? null,
      model: image.model ?? null,
      image_url: image.url ?? null,
      width,
      height,
      metadata,
      created_at: new Date(image.timestamp).toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) console.error("[IMAGES-DB] Save failed:", error);
}

export async function deleteImageFromDB(id: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  // Authorization: scope the delete by user_id so a leaked or guessed
  // image id from another account is a no-op rather than a cross-tenant
  // delete. RLS should also enforce this, but a client-side filter keeps
  // us safe even when RLS is misconfigured.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.warn("[IMAGES-DB] No authed user, skip delete");
    return;
  }

  const { error } = await supabase
    .from("image_generations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) console.error("[IMAGES-DB] Delete failed:", error);
}

export async function clearAllImagesFromDB(): Promise<void> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("image_generations")
    .delete()
    .eq("user_id", user.id);
  if (error) console.error("[IMAGES-DB] Clear all failed:", error);
}
