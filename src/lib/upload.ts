import { supabase } from "./supabaseClient";

const BUCKET = "order-images";

/** Uploads a garment image for an order and returns its storage path. */
export async function uploadOrderImage(orderId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${orderId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}
