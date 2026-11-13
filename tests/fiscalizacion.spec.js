import { test, expect } from "@playwright/test";

function fechaRelativa(dias) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function crearVehiculosSinteticos() {
  return [
    {
      placa: "V1A-309",
      placa_normalizada: "V1A309",
      marca: "Toyota",
      modelo: "Probox",
      anio_fabricacion: 2018,
      color_sunarp: "Blanco",
      titular_nombre: "Yalta Chávez, Dilmer",
      titular_dni: "40812943",
      soat_vencimiento: fechaRelativa(180),
      citv_vencimiento: fechaRelativa(240),
      sancion_vigente: false,
      discrepancia_sunarp: false,
    },
    {
      placa: "XYZ-789",
      placa_normalizada: "XYZ789",
      marca: "Nissan",
      modelo: "Sentra",
      anio_fabricacion: 2016,
      color_sunarp: "Plata",
      titular_nombre: "Rojas Medina, Carlos",
      titular_dni: "42901844",
      soat_vencimiento: fechaRelativa(15),
      citv_vencimiento: fechaRelativa(90),
      sancion_vigente: false,
      discrepancia_sunarp: false,
    },
    {
      placa: "JKL-456",
      placa_normalizada: "JKL456",
      marca: "Hyundai",
      modelo: "Elantra",
      anio_fabricacion: 2015,
      color_sunarp: "Negro",
      titular_nombre: "Vargas Pinedo, Ana",
      titular_dni: "47120938",
      soat_vencimiento: fechaRelativa(-12),
      citv_vencimiento: fechaRelativa(60),
      sancion_vigente: true,
      discrepancia_sunarp: false,
    },
    {
      placa: "ABC-123",
      placa_normalizada: "ABC123",
      marca: "Toyota",
      modelo: "Yaris",
      anio_fabricacion: 2017,
      color_sunarp: "Rojo",
      titular_nombre: "Mendoza Ruiz, Jorge",
      titular_dni: "43992110",
      soat_vencimiento: fechaRelativa(90),
      citv_vencimiento: fechaRelativa(110),
      sancion_vigente: false,
      discrepancia_sunarp: true,
      detalle_discrepancia:
        "Color físico Blanco discrepa con Registro SUNARP (Rojo)",
    },
  ];
}

async function configurarMocksSupabase(page) {
  const vehiculos = crearVehiculosSinteticos();

  await page.route("**/js/supabase-config.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        export const SUPABASE_CONFIG = {
          url: "https://demo-ci.supabase.co",
          anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.ci"
        };
        export function isSupabaseConfigured() { return true; }
      `,
    });
  });

  await page.route(
    "https://demo-ci.supabase.co/rest/v1/rpc/autenticar_usuario",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          token: "00000000-0000-4000-8000-000000000001",
          expira_en: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          usuario: {
            id: "00000000-0000-4000-8000-000000000099",
            codigo_usuario: "INSP_YALTA",
            dni: "40812901",
            nombre_completo: "Insp. Dilmer Yalta",
            rol: "INSPECTOR_CAMPO",
            codigo_empleado: "INSP-042",
            email: "insp.yalta.demo@mpch.gob.pe",
          },
        }),
      });
    },
  );

  await page.route(
    "https://demo-ci.supabase.co/rest/v1/vehiculos*",
    async (route) => {
      const url = decodeURIComponent(route.request().url());
      let payload = vehiculos;
      if (url.includes("or=")) {
        const encontrado = vehiculos.filter(
          (v) =>
            url.includes(v.placa_normalizada) || url.includes(v.titular_dni),
        );
        payload = encontrado.slice(0, 1);
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    },
  );

  await page.route(
    "https://demo-ci.supabase.co/rest/v1/actas_fiscalizacion*",
    async (route) => {
      if (route.request().method() === "POST") {
        const parsed = JSON.parse(route.request().postData() || "{}");
        const body = Array.isArray(parsed) ? parsed[0] : parsed;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "11111111-1111-4111-8111-111111111111",
            correlativo: "0483-2026-MPCH",
            emitido_en: new Date().toISOString(),
            ...body,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    },
  );

  await page.route(
    "https://demo-ci.supabase.co/rest/v1/auditoria_logs*",
    async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "{}",
      });
    },
  );

  await page.route(
    "https://demo-ci.supabase.co/rest/v1/tupa_conocimiento*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    },
  );

  await page.route(
    "https://demo-ci.supabase.co/rest/v1/chatbot_telemetria*",
    async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "{}",
      });
    },
  );
}

async function iniciarSesionInspector(page) {
  await page.goto("/login");
  await page.fill("#txtUsuario", "INSP_YALTA");
  await page.fill("#txtPassword", "Segura123!");
  await page.click("#btnIngresar");
  await expect(page).toHaveURL(/\/consulta-campo/);
}

test.describe("Suite E2E MPCH - Fiscalización Vehicular y Seguridad (TA2/TA3)", () => {
  test.beforeEach(async ({ page }) => {
    await configurarMocksSupabase(page);
  });

  test("CP-HU01-04 & 07: Validación BVA de placa (6 alfanum.) y DNI (8 dígitos)", async ({
    page,
  }) => {
    await iniciarSesionInspector(page);
    const input = page.locator("#txtPlacaDni");
    const btn = page.locator("#btnBuscar");

    await input.fill("V1A-30");
    await expect(btn).toBeDisabled();

    await input.fill("V1A@30");
    await expect(btn).toBeDisabled();

    await input.fill("M1B8901");
    await expect(btn).toBeDisabled();

    await input.fill("M1B890");
    await expect(btn).toBeEnabled();

    await input.fill("4081294");
    await expect(btn).toBeDisabled();

    await input.fill("40812943");
    await expect(btn).toBeEnabled();
  });

  test("CP-HU01-01 & HAL-UI-04: Consulta conforme V1A-309 con semáforo verde y botón deshabilitado", async ({
    page,
  }) => {
    await iniciarSesionInspector(page);
    await page.fill("#txtPlacaDni", "V1A-309");
    await page.click("#btnBuscar");

    await expect(page).toHaveURL(/\/resultado-conforme/);
    await expect(page.locator(".semaforo-verde")).toBeVisible();
    await expect(page.locator(".card-resultado")).toContainText(
      "Yalta Chávez, Dilmer",
    );
    await expect(page.locator("#btnActa")).toBeDisabled();
    await expect(
      page.locator('[data-testid="microtexto-hal-ui-04"]'),
    ).toBeVisible();
  });

  test("CP-HU01-02: Alerta ámbar XYZ-789 con texto negro #000000 sobre #F39C12", async ({
    page,
  }) => {
    await iniciarSesionInspector(page);
    await page.fill("#txtPlacaDni", "XYZ-789");
    await page.click("#btnBuscar");

    await expect(page).toHaveURL(/\/resultado-infraccion/);
    await expect(page.locator(".semaforo-ambar")).toBeVisible();
    await expect(page.locator("#btnActa")).toBeDisabled();

    const avisoAmbar = page.locator('[data-testid="microtexto-ambar"]');
    await expect(avisoAmbar).toBeVisible();
    await expect(avisoAmbar).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(avisoAmbar).toHaveCSS("background-color", "rgb(243, 156, 18)");
  });

  test("CP-HU01-03 & HAL-UI-01/02/06: Emisión completa de acta JKL-456 con vista previa obligatoria y QR", async ({
    page,
  }) => {
    await iniciarSesionInspector(page);
    await page.fill("#txtPlacaDni", "JKL-456");
    await page.click("#btnBuscar");

    await expect(page).toHaveURL(/\/resultado-infraccion/);
    await expect(page.locator(".semaforo-rojo")).toBeVisible();
    await expect(page.locator("#btnActa")).toBeEnabled();
    await page.click("#btnActa");

    await expect(page).toHaveURL(/\/emision-acta/);
    await expect(page.locator('[data-testid="modal-placa-titulo"]')).toHaveText(
      "JKL-456",
    );
    await expect(
      page.locator('[data-testid="modal-placa-resumen"]'),
    ).toHaveText("JKL-456");

    await page.keyboard.press("Escape");
    await expect(page.locator("#modalOverlay")).toBeHidden();
    await page.click("#btnReopenModal");
    await expect(page.locator("#modalOverlay")).toBeVisible();

    await expect(page.locator("#btnConfirmar")).toBeDisabled();
    await page.click("#btnTogglePreview");
    await expect(page.locator("#previewBox")).toBeVisible();
    await expect(page.locator("#btnConfirmar")).toBeEnabled();

    await page.click("#btnConfirmar");
    await expect(page).toHaveURL(/\/acta-exito/);
    await expect(page.locator("canvas.qr-code")).toBeVisible();
    await expect(page.locator('[data-testid="acta-vehiculo"]')).toContainText(
      "JKL-456",
    );
  });

  test("CP-HU01-05 (TA2 Fig. 1): Conmutación a caché local IndexedDB ante timeout > 5 s en SUNARP", async ({
    page,
  }) => {
    await iniciarSesionInspector(page);

    await page.route("**/api/v1/externo/sunarp/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          placa: "V1A-309",
          titular: "Yalta Chávez, Dilmer",
        }),
      });
    });

    await page.fill("#txtPlacaDni", "V1A-309");
    const inicio = Date.now();
    await page.click("#btnBuscar");

    const toast = page.locator(".toast-alerta-conexion");
    await expect(toast).toBeVisible({ timeout: 5800 });
    expect((Date.now() - inicio) / 1000).toBeLessThanOrEqual(5.8);

    await expect(toast).toContainText(
      "Servicio SUNARP no disponible. Consultando datos en caché local",
    );
    await expect(page.locator(".indicador-red")).toHaveClass(/offline-mode/);
    await expect(page.locator(".card-resultado")).toContainText(
      "Yalta Chávez, Dilmer",
    );
  });

  test("CP-HU01-08: Bloqueo seguro ante caída SUNARP (503) y placa Z9Z-999 sin caché", async ({
    page,
  }) => {
    await iniciarSesionInspector(page);

    await page.route("**/api/v1/externo/sunarp/**", async (route) => {
      await route.fulfill({ status: 503, body: "Service Unavailable" });
    });

    await page.fill("#txtPlacaDni", "Z9Z-999");
    await page.click("#btnBuscar");

    await expect(
      page.locator('[data-testid="alerta-sin-registro"]'),
    ).toBeVisible();
    await expect(page.locator("#btnActa")).toBeDisabled();
  });

  test("CP-SEC-01 & HU-04: RBAC HTTP 403 en /admin/configuracion y Chatbot público", async ({
    page,
  }) => {
    await iniciarSesionInspector(page);

    const respuesta403 = await page.goto("/admin/configuracion");
    expect(respuesta403?.status()).toBe(403);
    await expect(page.locator('[data-testid="rbac-403-banner"]')).toBeVisible();

    await page.goto("/chatbot");
    await page.fill(
      '[data-testid="input-chat"]',
      "¿Qué requisitos necesito para obtener mi credencial de conductor?",
    );
    await page.click('[data-testid="btn-enviar-chat"]');
    await expect(
      page.locator('[data-testid="bot-respuesta"]').last(),
    ).toContainText("S/ 17.30");
  });
});
