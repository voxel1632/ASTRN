import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_CODE = Deno.env.get("ADMIN_CODE")!;
const BUCKET = "mods";
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function cors(origin: string | null): Headers {
  const h = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Vary": "Origin",
  });
  if (ALLOWED_ORIGIN === "*") h.set("Access-Control-Allow-Origin", "*");
  else if (origin === ALLOWED_ORIGIN) h.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  return h;
}

function secureEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const length = Math.max(x.length, y.length);
  for (let i = 0; i < length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function text(form: FormData, key: string, max = 10000): string | null {
  const value = form.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, `${key} is too long.`);
  return trimmed || null;
}

function getFile(form: FormData, key: string): File | null {
  const value = form.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

function extension(name: string): string {
  const match = name.toLowerCase().match(/\.(mcpack|mcaddon|zip)$/);
  if (!match) throw new HttpError(400, "Mod file must be .mcpack, .mcaddon, or .zip.");
  return `.${match[1]}`;
}

async function storeFile(file: File, path: string, allowed: "mod" | "image"): Promise<string> {
  if (file.size > MAX_FILE_SIZE) throw new HttpError(413, "Each file must be no larger than 100 MB.");
  let finalPath = path;
  if (allowed === "mod") finalPath += extension(file.name);
  else {
    if (!file.type.startsWith("image/")) throw new HttpError(400, "Icon and banner files must be images.");
    const ext = file.name.toLowerCase().match(/\.(png|jpe?g|webp|gif|avif)$/)?.[0] ?? ".img";
    finalPath += ext;
  }
  const { error } = await db.storage.from(BUCKET).upload(finalPath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    console.error("Storage upload error:", error.message);
    throw new HttpError(500, "Could not upload file to Storage.");
  }
  return finalPath;
}

function publicUrl(path: string): string {
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function cleanup(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await db.storage.from(BUCKET).remove(paths);
  if (error) console.error("Storage cleanup error:", error.message);
}

function recordFields(form: FormData): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, max] of [["name", 120], ["description", 10000], ["category", 80], ["version", 40], ["author", 120]] as const) {
    const value = text(form, key, max);
    if (value !== null || key === "description") fields[key] = value;
  }
  return fields;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  if (ALLOWED_ORIGIN !== "*" && origin && origin !== ALLOWED_ORIGIN) {
    return Response.json({ error: "Origin not allowed." }, { status: 403, headers });
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405, headers });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_CODE) {
    console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ADMIN_CODE function secrets.");
    return Response.json({ error: "Admin function is not configured." }, { status: 500, headers });
  }

  const uploaded: string[] = [];
  let createdModId: string | null = null;
  try {
    const form = await request.formData();
    const code = text(form, "admin_code", 500) ?? "";
    if (!secureEqual(code, ADMIN_CODE)) throw new HttpError(401, "Incorrect admin code.");
    const action = text(form, "action", 40);
    const id = text(form, "id", 100);

    if (action === "upload") {
      const modFile = getFile(form, "mod_file");
      if (!modFile) throw new HttpError(400, "Choose a .mcpack, .mcaddon, or .zip mod file.");
      extension(modFile.name);
      const payload = recordFields(form);
      if (!payload.name) throw new HttpError(400, "Mod name is required.");
      const { data: created, error: insertError } = await db.from("mods").insert({ ...payload, downloads: 0 }).select("id").single();
      if (insertError) {
        console.error("Insert error:", insertError.message);
        throw new HttpError(500, "Could not create mod record. Check the mods table schema.");
      }
      createdModId = String(created.id);
      const filePath = await storeFile(modFile, `${createdModId}/${crypto.randomUUID()}`, "mod");
      uploaded.push(filePath);
      const updates: Record<string, unknown> = { file_path: filePath, file_url: publicUrl(filePath) };
      for (const [key, col] of [["icon_file", "icon_url"], ["banner_file", "banner_url"]] as const) {
        const file = getFile(form, key);
        if (file) {
          const path = await storeFile(file, `${createdModId}/${crypto.randomUUID()}`, "image");
          uploaded.push(path);
          updates[col] = publicUrl(path);
          updates[key === "icon_file" ? "icon_path" : "banner_path"] = path;
        }
      }
      const { data, error } = await db.from("mods").update(updates).eq("id", created.id).select("*").single();
      if (error) throw new HttpError(500, "Files uploaded but mod record could not be finalized.");
      return Response.json({ ok: true, mod: data }, { headers });
    }

    if (action === "edit") {
      if (!id) throw new HttpError(400, "Mod id is required.");
      const { data: old, error: readError } = await db.from("mods").select("id,file_path,icon_path,banner_path").eq("id", id).maybeSingle();
      if (readError) throw new HttpError(500, "Could not load mod for editing.");
      if (!old) throw new HttpError(404, "Mod not found.");
      const updates = recordFields(form);
      const priorPaths: string[] = [];
      const modFile = getFile(form, "mod_file");
      if (modFile) {
        const path = await storeFile(modFile, `${id}/${crypto.randomUUID()}`, "mod");
        uploaded.push(path);
        updates.file_path = path;
        updates.file_url = publicUrl(path);
        if (old.file_path) priorPaths.push(old.file_path);
      }
      for (const [key, col, pathCol, oldPath] of [["icon_file", "icon_url", "icon_path", old.icon_path], ["banner_file", "banner_url", "banner_path", old.banner_path]] as const) {
        const file = getFile(form, key);
        if (file) {
          const path = await storeFile(file, `${id}/${crypto.randomUUID()}`, "image");
          uploaded.push(path);
          updates[col] = publicUrl(path);
          updates[pathCol] = path;
          if (oldPath) priorPaths.push(oldPath);
        }
      }
      const { data, error } = await db.from("mods").update(updates).eq("id", id).select("*").single();
      if (error) {
        console.error("Update error:", error.message);
        throw new HttpError(500, "Could not save mod changes. Check the mods table schema.");
      }
      await cleanup(priorPaths);
      return Response.json({ ok: true, mod: data }, { headers });
    }

    if (action === "delete") {
      if (!id) throw new HttpError(400, "Mod id is required.");
      const { data: mod, error: readError } = await db.from("mods").select("id,file_path,icon_path,banner_path,file_url,icon_url,banner_url").eq("id", id).maybeSingle();
      if (readError) throw new HttpError(500, "Could not load mod for deletion.");
      if (!mod) throw new HttpError(404, "Mod not found.");
      const { error } = await db.from("mods").delete().eq("id", id);
      if (error) throw new HttpError(500, "Could not delete mod. Check database relationships.");
      const paths = [mod.file_path, mod.icon_path, mod.banner_path].filter((p): p is string => typeof p === "string" && !!p);
      await cleanup(paths);
      return Response.json({ ok: true }, { headers });
    }

    throw new HttpError(400, "Unknown action. Use upload, edit, or delete.");
  } catch (error) {
    if (createdModId) {
      await cleanup(uploaded);
      await db.from("mods").delete().eq("id", createdModId);
    } else if (uploaded.length) {
      await cleanup(uploaded);
    }
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status, headers });
    console.error("Admin function error:", error);
    return Response.json({ error: "Request failed. Check Edge Function logs." }, { status: 500, headers });
  }
});
