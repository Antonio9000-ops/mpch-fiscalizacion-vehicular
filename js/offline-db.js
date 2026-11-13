import { TIMEOUT_SUNARP_MS, limpiarAlfanumerico } from "./domain.js";
import { getSupabaseClient } from "./supabase-client.js";

const DB_NAME = "mpch_fiscalizacion_db";
const DB_VERSION = 1;
const STORE_VEHICULOS = "vehiculos_cache";

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_VEHICULOS)) {
        const store = db.createObjectStore(STORE_VEHICULOS, {
          keyPath: "placaNormalizada",
        });
        store.createIndex("dni", "dni", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function guardarVehiculosEnCache(lista = []) {
  try {
    const db = await abrirDB();
    const tx = db.transaction(STORE_VEHICULOS, "readwrite");
    const store = tx.objectStore(STORE_VEHICULOS);
    for (const v of lista) {
      const normalizado = {
        placa: v.placa,
        placaNormalizada:
          v.placaNormalizada ||
          v.placa_normalizada ||
          limpiarAlfanumerico(v.placa),
        dni: v.dni || v.titular_dni,
        titular: v.titular || v.titular_nombre,
        marca: v.marca,
        modelo: v.modelo,
        anioFabricacion: v.anioFabricacion || v.anio_fabricacion,
        color: v.color || v.color_sunarp,
        soatVence: v.soatVence || v.soat_vencimiento,
        citvVence: v.citvVence || v.citv_vencimiento,
        sancionVigente: Boolean(v.sancionVigente ?? v.sancion_vigente),
        discrepanciaSunarp: Boolean(
          v.discrepanciaSunarp ?? v.discrepancia_sunarp,
        ),
        detalleDiscrepancia:
          v.detalleDiscrepancia || v.detalle_discrepancia || null,
        sincronizadoEn: new Date().toISOString(),
      };
      store.put(normalizado);
    }
    return await new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function obtenerVehiculoDeCache(clave) {
  const c = limpiarAlfanumerico(clave);
  try {
    const db = await abrirDB();
    const tx = db.transaction(STORE_VEHICULOS, "readonly");
    const store = tx.objectStore(STORE_VEHICULOS);

    // 1. Intentar por placa
    const porPlaca = await new Promise((resolve) => {
      const r = store.get(c);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
    if (porPlaca) return porPlaca;

    // 2. Intentar por DNI
    const idx = store.index("dni");
    return await new Promise((resolve) => {
      const r = idx.get(c);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function sincronizarCacheDesdeSupabase() {
  try {
    const sb = await getSupabaseClient();
    if (!sb) return false;
    const { data, error } = await sb.from("vehiculos").select("*");
    if (error || !data) return false;
    return await guardarVehiculosEnCache(data);
  } catch {
    return false;
  }
}

async function registrarEventoFallback(clave, motivo) {
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    await sb.from("auditoria_logs").insert({
      modulo: "HU01_CAMPO",
      accion: "FALLBACK_CACHE_LOCAL",
      detalle: { clave, motivo },
    });
  } catch {
    // Silencioso en modo sin conexión
  }
}

export async function consultarVehiculoConResiliencia(claveInput) {
  const clave = limpiarAlfanumerico(claveInput);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_SUNARP_MS);

  try {
    const resp = await fetch(
      `/api/v1/externo/sunarp/${encodeURIComponent(clave)}`,
      {
        method: "GET",
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    if (resp.status === 404) {
      return {
        ok: false,
        offline: false,
        sinRegistroLocal: true,
        mensaje:
          "Vehículo o conductor no encontrado en SUNARP ni en padrón local.",
      };
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const sunarpData = await resp.json();
    let vehiculoFinal = {
      placa:
        sunarpData.placa ||
        (clave.length === 6 ? `${clave.slice(0, 3)}-${clave.slice(3)}` : clave),
      placaNormalizada: sunarpData.placaNormalizada || clave,
      dni: sunarpData.dni || "",
      titular: sunarpData.titular || "Titular Registral",
      marca: sunarpData.marca || "Vehículo",
      modelo: sunarpData.modelo || "",
      anioFabricacion: sunarpData.anioFabricacion || 2020,
      color: sunarpData.color || "No especificado",
      soatVence: sunarpData.soatVence || "",
      citvVence: sunarpData.citvVence || "",
      sancionVigente: Boolean(sunarpData.sancionVigente),
      discrepanciaSunarp: Boolean(sunarpData.discrepanciaSunarp),
      detalleDiscrepancia: sunarpData.detalleDiscrepancia || null,
    };

    // Cruce local con Supabase si está configurado (RN-03)
    const sb = await getSupabaseClient();
    if (sb) {
      const { data: localData } = await sb
        .from("vehiculos")
        .select("*")
        .or(`placa_normalizada.eq.${clave},titular_dni.eq.${clave}`)
        .limit(1)
        .maybeSingle();

      if (localData) {
        vehiculoFinal = {
          ...vehiculoFinal,
          placa: localData.placa,
          placaNormalizada: localData.placa_normalizada,
          dni: localData.titular_dni,
          titular: sunarpData.titular || localData.titular_nombre,
          marca: localData.marca,
          modelo: localData.modelo,
          anioFabricacion: localData.anio_fabricacion,
          soatVence: localData.soat_vencimiento,
          citvVence: localData.citv_vencimiento,
          sancionVigente: localData.sancion_vigente,
          discrepanciaSunarp: localData.discrepancia_sunarp,
          detalleDiscrepancia: localData.detalle_discrepancia,
        };
      }
    }

    await guardarVehiculosEnCache([vehiculoFinal]);
    return {
      ok: true,
      offline: false,
      fuente: "SUNARP_EN_LINEA",
      vehiculo: vehiculoFinal,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const motivo = err.name === "AbortError" ? "TIMEOUT_5S" : err.message;
    registrarEventoFallback(clave, motivo);

    const enCache = await obtenerVehiculoDeCache(clave);
    if (enCache) {
      return {
        ok: true,
        offline: true,
        fuente: "CACHE_LOCAL",
        toast:
          "Servicio SUNARP no disponible. Consultando datos en caché local",
        vehiculo: enCache,
      };
    }

    // CP-HU01-08: bloqueo seguro si falla SUNARP y caché está vacía
    return {
      ok: false,
      offline: true,
      sinRegistroLocal: true,
      toast: "Servicio no disponible y sin registro local",
      mensaje:
        "Servicio SUNARP no disponible y la unidad no figura en la caché local. No procede emitir acta.",
    };
  }
}
