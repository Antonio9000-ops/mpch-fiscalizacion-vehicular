// Lógica de dominio pura del sistema MPCH (RN-01 a RN-20)
// Libre de dependencias del DOM para permitir pruebas unitarias directas.

export const TIMEOUT_SUNARP_MS = 5000;
export const INACTIVIDAD_MAX_MS = 15 * 60 * 1000; // 900 segundos (CP-SEC-01)
export const MAX_TAMANO_PDF_BYTES = 5 * 1024 * 1024; // 5 MB (CP-HU03-07)
export const ANTIGUEDAD_MAX_TAXI_ANIOS = 15; // RN-12 (CP-HU03-05)

export function limpiarAlfanumerico(valor) {
  return String(valor || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

export function validarPlaca(valor) {
  const raw = String(valor || "")
    .trim()
    .toUpperCase();
  if (/[^A-Z0-9-]/.test(raw)) {
    return { valida: false, normalizada: "", formateada: "" };
  }
  const normalizada = raw.replace(/-/g, "");
  if (!/^[A-Z0-9]{6}$/.test(normalizada)) {
    return { valida: false, normalizada, formateada: "" };
  }
  return {
    valida: true,
    normalizada,
    formateada: `${normalizada.slice(0, 3)}-${normalizada.slice(3)}`,
  };
}

export function validarDni(valor) {
  const normalizado = String(valor || "").trim();
  const valida = /^\d{8}$/.test(normalizado);
  return { valida, normalizado };
}

export function validarEntradaCampo(valor) {
  const p = validarPlaca(valor);
  if (p.valida) {
    return {
      valido: true,
      tipo: "PLACA",
      clave: p.normalizada,
      formateada: p.formateada,
    };
  }
  const d = validarDni(valor);
  if (d.valida) {
    return {
      valido: true,
      tipo: "DNI",
      clave: d.normalizado,
      formateada: d.normalizado,
    };
  }
  return { valido: false, tipo: null, clave: "", formateada: "" };
}

function parseFechaUTC(fechaInput) {
  if (fechaInput instanceof Date) {
    return new Date(
      Date.UTC(
        fechaInput.getUTCFullYear(),
        fechaInput.getUTCMonth(),
        fechaInput.getUTCDate(),
      ),
    );
  }
  const iso = String(fechaInput || "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

export function calcularDiasCalendarioRestantes(
  fechaVencimiento,
  fechaReferencia = new Date(),
) {
  const venc = parseFechaUTC(fechaVencimiento);
  const ref = parseFechaUTC(
    `${fechaReferencia.getFullYear()}-${String(fechaReferencia.getMonth() + 1).padStart(2, "0")}-${String(fechaReferencia.getDate()).padStart(2, "0")}`,
  );
  if (!venc || !ref) return null;
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.round((venc.getTime() - ref.getTime()) / msPorDia);
}

// Semáforo oficial RN-04 y BVA CP-HU01-06:
// > 30 días -> Verde | 0 a 30 días -> Ámbar | < 0 días -> Rojo
export function evaluarSemaforoVehiculo(
  vehiculo,
  fechaReferencia = new Date(),
) {
  const diasSoat = calcularDiasCalendarioRestantes(
    vehiculo.soatVence || vehiculo.soat_vencimiento,
    fechaReferencia,
  );
  const diasCitv = calcularDiasCalendarioRestantes(
    vehiculo.citvVence || vehiculo.citv_vencimiento,
    fechaReferencia,
  );

  const sancion = Boolean(vehiculo.sancionVigente ?? vehiculo.sancion_vigente);
  const discrepancia = Boolean(
    vehiculo.discrepanciaSunarp ?? vehiculo.discrepancia_sunarp,
  );

  const diasMin = Math.min(
    diasSoat !== null ? diasSoat : 999,
    diasCitv !== null ? diasCitv : 999,
  );

  if (discrepancia) {
    return {
      color: "rojo",
      estado: "infraccion",
      estadoLabel: "OBSERVADO",
      permiteActa: true,
      infraccionCod: "G.14",
      motivo:
        vehiculo.detalleDiscrepancia ||
        vehiculo.detalle_discrepancia ||
        "Discrepancia registral SUNARP",
      diasSoat,
      diasCitv,
    };
  }

  if (diasSoat !== null && diasSoat < 0) {
    return {
      color: "rojo",
      estado: "infraccion",
      estadoLabel: "INHABILITADO",
      permiteActa: true,
      infraccionCod: "M.1",
      motivo: `SOAT vencido hace ${Math.abs(diasSoat)} día(s)`,
      diasSoat,
      diasCitv,
    };
  }

  if ((diasCitv !== null && diasCitv < 0) || sancion) {
    return {
      color: "rojo",
      estado: "infraccion",
      estadoLabel: "INHABILITADO",
      permiteActa: true,
      infraccionCod: "M.27",
      motivo:
        diasCitv !== null && diasCitv < 0
          ? `CITV vencido hace ${Math.abs(diasCitv)} día(s)`
          : "Sanción municipal vigente",
      diasSoat,
      diasCitv,
    };
  }

  if (diasMin <= 30) {
    return {
      color: "ambar",
      estado: "warning",
      estadoLabel: "POR VENCER",
      permiteActa: false,
      infraccionCod: null,
      motivo: `Documentación próxima a vencer en ${diasMin} día(s)`,
      diasSoat,
      diasCitv,
    };
  }

  return {
    color: "verde",
    estado: "conforme",
    estadoLabel: "HABILITADO",
    permiteActa: false,
    infraccionCod: null,
    motivo: "Unidad formalizada con documentos vigentes",
    diasSoat,
    diasCitv,
  };
}

// Cómputo de 3 días hábiles según Arts. 144 y 145 del TUO de la Ley N.° 27444:
// Inicia el día hábil siguiente a la emisión, excluyendo sábados, domingos y feriados.
export function calcularFechaLimite3DiasHabiles(
  fechaEmisionInput,
  feriadosSet = new Set(),
) {
  const emision = new Date(fechaEmisionInput);
  const limaOffsetMs = -5 * 60 * 60 * 1000;
  const limaDate = new Date(emision.getTime() + limaOffsetMs);

  let cursor = new Date(
    Date.UTC(
      limaDate.getUTCFullYear(),
      limaDate.getUTCMonth(),
      limaDate.getUTCDate(),
    ),
  );
  let habilesContados = 0;

  while (habilesContados < 3) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const diaSemana = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (diaSemana !== 0 && diaSemana !== 6 && !feriadosSet.has(iso)) {
      habilesContados += 1;
    }
  }

  const isoLimite = cursor.toISOString().slice(0, 10);
  return new Date(`${isoLimite}T23:59:59.999-05:00`);
}

export function verificarVigenciaFicha(
  fechaEmisionInput,
  fechaConsultaInput = new Date(),
  feriadosSet = new Set(),
) {
  const fechaLimite = calcularFechaLimite3DiasHabiles(
    fechaEmisionInput,
    feriadosSet,
  );
  const consulta = new Date(fechaConsultaInput);
  const vigente = consulta.getTime() <= fechaLimite.getTime();
  return {
    vigente,
    estado: vigente ? "VIGENTE" : "CADUCADA",
    fechaLimiteISO: fechaLimite.toISOString(),
  };
}

export function validarAntiguedadTaxi(
  anioFabricacion,
  anioActual = new Date().getFullYear(),
) {
  const anio = Number(anioFabricacion);
  const antiguedad = anioActual - anio;
  return {
    valido:
      Number.isInteger(anio) &&
      antiguedad >= 0 &&
      antiguedad <= ANTIGUEDAD_MAX_TAXI_ANIOS,
    antiguedad,
    maxPermitido: ANTIGUEDAD_MAX_TAXI_ANIOS,
  };
}

export function validarCruceSunarpTaxi(declarado, sunarp) {
  const errores = [];
  if (
    declarado.color &&
    sunarp.color &&
    declarado.color.trim().toUpperCase() !== sunarp.color.trim().toUpperCase()
  ) {
    errores.push(
      `Discrepancia detectada: el color declarado (${declarado.color}) no coincide con el registro de SUNARP (${sunarp.color}).`,
    );
  }
  if (
    declarado.motor &&
    sunarp.numeroMotor &&
    declarado.motor.trim().toUpperCase() !==
      sunarp.numeroMotor.trim().toUpperCase()
  ) {
    errores.push(
      `Discrepancia detectada: el número de motor declarado (${declarado.motor}) no coincide con SUNARP (${sunarp.numeroMotor}).`,
    );
  }
  return { valido: errores.length === 0, errores };
}

export function validarArchivoPdf(archivo) {
  if (!archivo) return { valido: false, error: "Archivo faltante" };
  const nombre = String(archivo.name || "").toLowerCase();
  const esPdf = archivo.type === "application/pdf" || nombre.endsWith(".pdf");
  if (!esPdf) {
    return {
      valido: false,
      error: `Archivo inválido (${archivo.name}): solo se permiten archivos .PDF`,
    };
  }
  if (archivo.size <= 0 || archivo.size > MAX_TAMANO_PDF_BYTES) {
    return {
      valido: false,
      error: `El archivo ${archivo.name} supera el límite de 5 MB`,
    };
  }
  return { valido: true, error: null };
}

export async function generarHashSHA256(texto) {
  const data = new TextEncoder().encode(texto);
  const buffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32)
    .toUpperCase();
}

export function normalizarTextoChatbot(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bq\b/g, "que")
    .replace(/\bpa\b/g, "para")
    .replace(/\bd\b/g, "de");
}

export function evaluarConsultaChatbot(textoOriginal, catalogoTupa = []) {
  const norm = normalizarTextoChatbot(textoOriginal);

  // 1. Protección contra Prompt Injection / Jailbreak (CP-HU04-05)
  const patronesInjection = [
    /ignora\s+(las\s+)?instrucciones/i,
    /system\s*prompt/i,
    /contrase(n|ñ)as?/i,
    /base\s+de\s+datos/i,
    /select\s+\*/i,
    /drop\s+table/i,
    /<script/i,
    /jailbreak/i,
  ];
  if (patronesInjection.some((rx) => rx.test(textoOriginal))) {
    return {
      categoria: "INTENTO_INJECTION",
      resuelta: false,
      intencion: "SEGURIDAD_BLOQUEO",
      respuesta:
        "Por seguridad, solo puedo responder consultas informativas sobre trámites y requisitos TUPA de la Subgerencia de Transportes MPCH.",
      botones: [
        "Credencial de Conductor",
        "Inscripción de Taxi",
        "Ficha Técnica",
      ],
    };
  }

  // 2. Derivación segura de expedientes personales (RN-19, CP-HU04-03)
  if (
    /(expediente|estado\s+de\s+mi|numero\s+de\s+tramite|n°?\s*\d{4,})/i.test(
      norm,
    )
  ) {
    return {
      categoria: "DERIVACION_EXPEDIENTE",
      resuelta: true,
      intencion: "ESTADO_EXPEDIENTE",
      respuesta:
        "Por protección de datos personales (Ley N.° 29733), el estado de expedientes particulares se consulta ingresando con tu DNI en nuestra Mesa de Partes Digital / Módulo de Trámites.",
      enlace: "/inscripcion#consulta-expediente",
      textoEnlace: "Ir a Consulta Segura con DNI",
    };
  }

  // 3. Exclusión explícita de consultas fuera del dominio de Transportes (CP-HU04-02)
  const fueraDeDominio =
    /\b(mascota|mascotas|perro|gato|sanidad|matrimonio|divorcio|predial|arbitrios|nacimiento|defuncion|serenazgo|agua|basura)\b/i;
  if (fueraDeDominio.test(norm)) {
    return {
      categoria: "FUERA_DOMINIO",
      resuelta: false,
      intencion: "NO_RECONOCIDA",
      respuesta:
        "No entendí tu consulta o está fuera del ámbito de Transportes. Por favor selecciona una de las opciones frecuentes:",
      botones: [
        "Credencial de Conductor",
        "Inscripción de Taxi",
        "Ficha Técnica",
      ],
    };
  }

  // 4. Coincidencia semántica con catálogo TUPA (RN-18, CP-HU04-01, CP-HU04-04)
  const tieneContextoTransporte =
    /\b(chofer|conductor|taxi|transporte|vehiculo|vehicular|credencial)\b/i.test(
      norm,
    );
  let mejorCoincidencia = null;
  let mayorPuntaje = 0;

  for (const item of catalogoTupa) {
    const keywords = item.palabras_clave || [];
    const puntaje = keywords.reduce((acc, kw) => {
      const kwNorm = normalizarTextoChatbot(kw);
      if (kwNorm === "carnet" && !tieneContextoTransporte) return acc;
      return norm.includes(kwNorm) ? acc + 1 : acc;
    }, 0);
    if (puntaje > mayorPuntaje) {
      mayorPuntaje = puntaje;
      mejorCoincidencia = item;
    }
  }

  if (mejorCoincidencia && mayorPuntaje > 0) {
    return {
      categoria: "RESUELTA",
      resuelta: true,
      intencion: mejorCoincidencia.codigo_tramite,
      tramite: mejorCoincidencia,
      respuesta: `Trámite: ${mejorCoincidencia.titulo} (Costo TUPA: S/ ${Number(mejorCoincidencia.costo_soles).toFixed(2)} • Plazo: ${mejorCoincidencia.plazo_atencion}).`,
    };
  }

  // 5. Consulta no reconocida / fuera de dominio (CP-HU04-02)
  return {
    categoria: "FUERA_DOMINIO",
    resuelta: false,
    intencion: "NO_RECONOCIDA",
    respuesta:
      "No entendí tu consulta o está fuera del ámbito de Transportes. Por favor selecciona una de las opciones frecuentes:",
    botones: [
      "Credencial de Conductor",
      "Inscripción de Taxi",
      "Ficha Técnica",
    ],
  };
}
