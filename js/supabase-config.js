// Las credenciales reales se leen desde .env (local) o Variables de Entorno (Vercel) vía /api/public-config.
export const SUPABASE_CONFIG = {
  url: "",
  anonKey: "",
};

export function isSupabaseConfigured(cfg = SUPABASE_CONFIG) {
  return (
    typeof cfg?.url === "string" &&
    cfg.url.startsWith("https://") &&
    !cfg.url.includes("TU_SUPABASE_URL") &&
    typeof cfg?.anonKey === "string" &&
    cfg.anonKey.length > 20 &&
    !cfg.anonKey.includes("TU_SUPABASE_ANON_KEY")
  );
}
