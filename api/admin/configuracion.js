// Control de acceso RBAC para /admin/configuracion (CP-SEC-01)
// Retorna HTTP 403 Forbidden real si el usuario no posee rol ADMIN.

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((acc, part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) acc[k] = decodeURIComponent(v.join("="));
    return acc;
  }, {});
}

export default function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  const rol = cookies.mpch_role || "ANONIMO";

  if (rol !== "ADMIN") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(403).send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>403 Forbidden - Acceso Restringido MPCH</title>
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body>
  <main class="mobile-frame">
    <header class="header" style="background-color: #C0392B;">
      <div class="badge-mpch">MPCH • SEGURIDAD RBAC</div>
      <h1 class="login-title">403 Forbidden — Acceso Denegado</h1>
    </header>
    <div class="content" style="justify-content:center; gap:16px;">
      <div class="alert-banner-accessible" role="alert" data-testid="rbac-403-banner">
        <span class="alert-icon">⛔</span>
        <span>Su rol actual (<strong>${rol}</strong>) no tiene autorización para acceder a la configuración administrativa del sistema (CP-SEC-01).</span>
      </div>
      <a href="/consulta-campo" class="btn btn-primary" data-testid="btn-volver-inicio">VOLVER A MÓDULO AUTORIZADO</a>
      <a href="/login" class="btn btn-secondary" data-testid="btn-ir-login">IR AL INICIO DE SESIÓN</a>
    </div>
  </main>
</body>
</html>`);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MPCH - Configuración Administrativa</title>
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body>
  <main class="mobile-frame">
    <header class="header">
      <div class="badge-mpch">MPCH • ADMINISTRACIÓN</div>
      <h1 class="login-title">Panel de Configuración TUPA y Feriados</h1>
    </header>
    <div class="content" style="gap:14px;">
      <article class="result-card status-conforme" data-testid="admin-panel">
        <h2 class="status-title">Acceso Autorizado (Rol ADMIN)</h2>
        <p class="result-footer-note">Parámetros activos: Timeout SUNARP 5.0 s • Inactividad sesión 15 min • Antigüedad máxima TUPA 15 años • Plazo ficha técnica 3 días hábiles (Ley N.° 27444).</p>
      </article>
      <a href="/fichas" class="btn btn-primary">GESTIONAR FICHAS TÉCNICAS</a>
      <a href="/consulta-campo" class="btn btn-secondary">IR A CONSULTA EN CAMPO</a>
    </div>
  </main>
</body>
</html>`);
}
