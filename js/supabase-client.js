import { SUPABASE_CONFIG } from "./supabase-config.js";

let clientInstance = null;
let resolvedConfig = null;

function isValidConfig(cfg) {
  return (
    typeof cfg?.url === "string" &&
    cfg.url.startsWith("https://") &&
    !cfg.url.includes("TU_SUPABASE_URL") &&
    typeof cfg?.anonKey === "string" &&
    cfg.anonKey.length > 20 &&
    !cfg.anonKey.includes("TU_SUPABASE_ANON_KEY")
  );
}

async function resolveConfig() {
  if (isValidConfig(SUPABASE_CONFIG)) {
    return SUPABASE_CONFIG;
  }
  if (resolvedConfig && isValidConfig(resolvedConfig)) {
    return resolvedConfig;
  }
  try {
    const resp = await fetch("/api/public-config", { cache: "no-store" });
    if (resp.ok) {
      const data = await resp.json();
      if (isValidConfig(data)) {
        resolvedConfig = data;
        return resolvedConfig;
      }
    }
  } catch {
    // Sin conexión o endpoint no disponible
  }
  return null;
}

export async function getSupabaseClient() {
  if (clientInstance) {
    return clientInstance;
  }
  const cfg = await resolveConfig();
  if (!cfg) {
    return null;
  }
  const { createClient } =
    await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  clientInstance = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return clientInstance;
}
