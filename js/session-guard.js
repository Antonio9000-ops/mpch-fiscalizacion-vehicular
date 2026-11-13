import { INACTIVIDAD_MAX_MS } from "./domain.js";
import { getSupabaseClient } from "./supabase-client.js";

const SESSION_KEY = "mpch_session";

export function obtenerSesion() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion) {
  const ahora = Date.now();
  const payload = { ...sesion, ultimaActividad: ahora };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  document.cookie = `mpch_role=${encodeURIComponent(sesion.rol)}; path=/; SameSite=Lax; max-age=900`;
}

export async function destruirSesion(motivo = "manual") {
  const sesion = obtenerSesion();
  sessionStorage.removeItem(SESSION_KEY);
  document.cookie = "mpch_role=; path=/; SameSite=Lax; max-age=0";

  if (sesion?.token) {
    try {
      const sb = await getSupabaseClient();
      if (sb) {
        await sb.rpc("cerrar_sesion", { p_token: sesion.token });
      }
    } catch {
      // Continuar cierre local incluso sin red
    }
  }
  window.location.href =
    motivo === "expirada" ? "/login?motivo=expirada" : "/login";
}

export function inicializarGuardiaSesion(rolesPermitidos = []) {
  const sesion = obtenerSesion();
  if (!sesion || !sesion.rol) {
    window.location.replace("/login?motivo=requerido");
    return null;
  }

  if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(sesion.rol)) {
    window.location.replace("/403");
    return null;
  }

  // Verificar expiración inmediata por inactividad (15 minutos = 900,000 ms)
  if (
    Date.now() - (sesion.ultimaActividad || sesion.loginTime || 0) >=
    INACTIVIDAD_MAX_MS
  ) {
    destruirSesion("expirada");
    return null;
  }

  let ultimoRefresco = Date.now();
  const registrarActividad = () => {
    const actual = obtenerSesion();
    if (!actual) return;
    if (Date.now() - (actual.ultimaActividad || 0) >= INACTIVIDAD_MAX_MS) {
      destruirSesion("expirada");
      return;
    }
    if (Date.now() - ultimoRefresco > 10000) {
      ultimoRefresco = Date.now();
      guardarSesion(actual);
    }
  };

  ["click", "keydown", "touchstart", "mousemove"].forEach((evt) => {
    document.addEventListener(evt, registrarActividad, { passive: true });
  });

  setInterval(() => {
    const actual = obtenerSesion();
    if (!actual) return;
    if (Date.now() - (actual.ultimaActividad || 0) >= INACTIVIDAD_MAX_MS) {
      destruirSesion("expirada");
    }
  }, 10000);

  // Actualizar datos visibles del inspector en el header si existen
  const lblNombre = document.getElementById("userNameLabel");
  const lblRol = document.getElementById("userRoleLabel");
  const lblAvatar = document.getElementById("userAvatar");
  if (lblNombre) lblNombre.textContent = sesion.nombre_completo;
  if (lblRol) lblRol.textContent = sesion.rol;
  if (lblAvatar && sesion.nombre_completo) {
    const partes = sesion.nombre_completo
      .replace(/[^a-zA-Z\s]/g, "")
      .trim()
      .split(/\s+/);
    lblAvatar.textContent =
      partes
        .slice(-2)
        .map((p) => p[0])
        .join("")
        .toUpperCase() || "MP";
  }

  return sesion;
}
