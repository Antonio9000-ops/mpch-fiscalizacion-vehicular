// Endpoint ligero Vercel para simular WebService SUNARP (RN-02, Dataset Tabla 8 TA2)
// Soporta ?delay=6000 o ?fail=503 para demostraciones manuales de resiliencia (RN-05).

function fechaRelativaISO(dias) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function obtenerRegistroSunarp(clave) {
  const c = String(clave || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();

  const registros = {
    V1A309: {
      placa: "V1A-309",
      placaNormalizada: "V1A309",
      dni: "40812943",
      titular: "Yalta Chávez, Dilmer",
      marca: "Toyota",
      modelo: "Probox",
      anioFabricacion: 2018,
      color: "Blanco",
      numeroMotor: "1NZ-778899",
      numeroSerie: "JTD12345678901234",
      soatVence: fechaRelativaISO(180),
      citvVence: fechaRelativaISO(240),
      sancionVigente: false,
      discrepanciaSunarp: false,
    },
    XYZ789: {
      placa: "XYZ-789",
      placaNormalizada: "XYZ789",
      dni: "42901844",
      titular: "Rojas Medina, Carlos",
      marca: "Nissan",
      modelo: "Sentra",
      anioFabricacion: 2016,
      color: "Plata",
      numeroMotor: "MR20-445566",
      numeroSerie: "3N1AB7AP7GL000789",
      soatVence: fechaRelativaISO(15),
      citvVence: fechaRelativaISO(90),
      sancionVigente: false,
      discrepanciaSunarp: false,
    },
    JKL456: {
      placa: "JKL-456",
      placaNormalizada: "JKL456",
      dni: "47120938",
      titular: "Vargas Pinedo, Ana",
      marca: "Hyundai",
      modelo: "Elantra",
      anioFabricacion: 2015,
      color: "Negro",
      numeroMotor: "G4NB-332211",
      numeroSerie: "KMHDH41DBFU000456",
      soatVence: fechaRelativaISO(-12),
      citvVence: fechaRelativaISO(60),
      sancionVigente: true,
      discrepanciaSunarp: false,
    },
    M1B890: {
      placa: "M1B-890",
      placaNormalizada: "M1B890",
      dni: "44112233",
      titular: "Quispe Huamán, Luis",
      marca: "Chevrolet",
      modelo: "Sail",
      anioFabricacion: 2019,
      color: "Gris",
      numeroMotor: "L2B-889001",
      numeroSerie: "LSGSA52M0KY000890",
      soatVence: fechaRelativaISO(120),
      citvVence: fechaRelativaISO(150),
      sancionVigente: false,
      discrepanciaSunarp: false,
    },
    P2C554: {
      placa: "P2C-554",
      placaNormalizada: "P2C554",
      dni: "45892147",
      titular: "Tuesta Mori, Pedro",
      marca: "Kia",
      modelo: "Rio",
      anioFabricacion: 2020,
      color: "Azul",
      numeroMotor: "1NZ-1234",
      numeroSerie: "KNADN412BL6000554",
      soatVence: fechaRelativaISO(200),
      citvVence: fechaRelativaISO(210),
      sancionVigente: false,
      discrepanciaSunarp: false,
    },
    ABC123: {
      placa: "ABC-123",
      placaNormalizada: "ABC123",
      dni: "43992110",
      titular: "Mendoza Ruiz, Jorge",
      marca: "Toyota",
      modelo: "Yaris",
      anioFabricacion: 2017,
      color: "Rojo",
      numeroMotor: "2NR-556677",
      numeroSerie: "MR2BT9F3XH1000123",
      soatVence: fechaRelativaISO(90),
      citvVence: fechaRelativaISO(110),
      sancionVigente: false,
      discrepanciaSunarp: true,
      detalleDiscrepancia:
        "Color físico Blanco discrepa con Registro SUNARP (Rojo)",
    },
    T1A999: {
      placa: "T1A-999",
      placaNormalizada: "T1A999",
      dni: "41223344",
      titular: "Chávez Trigoso, Marco",
      marca: "Nissan",
      modelo: "Tsuru",
      anioFabricacion: 2008,
      color: "Blanco",
      numeroMotor: "GA16-998877",
      numeroSerie: "3N1EB31S98K000999",
      soatVence: fechaRelativaISO(60),
      citvVence: fechaRelativaISO(60),
      sancionVigente: false,
      discrepanciaSunarp: false,
    },
    Z3X112: {
      placa: "Z3X-112",
      placaNormalizada: "Z3X112",
      dni: "46778899",
      titular: "Gómez Pizango, Raúl",
      marca: "Suzuki",
      modelo: "Alto",
      anioFabricacion: 2019,
      color: "Blanco",
      numeroMotor: "F8D-112233",
      numeroSerie: "MA3FB42S0K0000112",
      soatVence: fechaRelativaISO(100),
      citvVence: fechaRelativaISO(100),
      sancionVigente: false,
      discrepanciaSunarp: false,
    },
  };

  if (registros[c]) return registros[c];

  // Búsqueda por DNI (8 dígitos)
  const porDni = Object.values(registros).find((r) => r.dni === c);
  return porDni || null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  const delayMs = Math.min(Number(req.query.delay || 0), 10000);
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (req.query.fail === "503") {
    return res.status(503).json({
      ok: false,
      error: "Servicio SUNARP temporalmente no disponible",
    });
  }

  const placa = req.query.placa || "";
  const data = obtenerRegistroSunarp(placa);

  if (!data) {
    return res.status(404).json({
      ok: false,
      error: "Vehículo o conductor no encontrado en SUNARP",
    });
  }

  return res.status(200).json({
    ok: true,
    fuente: "SUNARP_WS",
    ...data,
  });
}
