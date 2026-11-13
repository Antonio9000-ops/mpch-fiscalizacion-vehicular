import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 4173);

function cargarEnvLocal() {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) return;
  const contenido = fs.readFileSync(envPath, "utf8");
  for (const linea of contenido.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const eqIdx = limpia.indexOf("=");
    if (eqIdx === -1) continue;
    const clave = limpia.slice(0, eqIdx).trim();
    const valor = limpia
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (clave && !(clave in process.env)) {
      process.env[clave] = valor;
    }
  }
}
cargarEnvLocal();

const REWRITES = {
  "/": "login.html",
  "/login": "login.html",
  "/consulta-campo": "index1.html",
  "/resultado-conforme": "index2.html",
  "/resultado-infraccion": "index3.html",
  "/emision-acta": "index4.html",
  "/acta-exito": "acta-exito.html",
  "/fichas": "fichas.html",
  "/inscripcion": "inscripcion.html",
  "/chatbot": "chatbot.html",
  "/403": "403.html",
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function wrapResponse(rawRes) {
  let statusCode = 200;
  return {
    setHeader: (k, v) => rawRes.setHeader(k, v),
    status: (code) => {
      statusCode = code;
      return {
        send: (body) => {
          rawRes.statusCode = statusCode;
          rawRes.end(body);
        },
        json: (obj) => {
          rawRes.statusCode = statusCode;
          rawRes.setHeader("Content-Type", "application/json; charset=utf-8");
          rawRes.end(JSON.stringify(obj));
        },
      };
    },
  };
}

async function runApiHandler(relPath, rawReq, rawRes, extraQuery = {}) {
  const fullPath = path.join(ROOT_DIR, relPath);
  const mod = await import(pathToFileURL(fullPath).href);
  const urlObj = new URL(rawReq.url, `http://127.0.0.1:${PORT}`);
  const query = Object.fromEntries(urlObj.searchParams.entries());
  const reqShim = {
    method: rawReq.method,
    headers: rawReq.headers,
    query: { ...query, ...extraQuery },
  };
  await mod.default(reqShim, wrapResponse(rawRes));
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const pathname = urlObj.pathname;

    if (pathname === "/api/public-config") {
      await runApiHandler("api/public-config.js", req, res);
      return;
    }

    if (
      pathname === "/admin/configuracion" ||
      pathname === "/api/admin/configuracion"
    ) {
      await runApiHandler("api/admin/configuracion.js", req, res);
      return;
    }

    if (pathname.startsWith("/api/v1/externo/sunarp/")) {
      const placa = decodeURIComponent(
        pathname.replace("/api/v1/externo/sunarp/", ""),
      );
      await runApiHandler("api/v1/externo/sunarp/[placa].js", req, res, {
        placa,
      });
      return;
    }

    let relFile = REWRITES[pathname] || pathname.replace(/^\/+/, "");
    if (
      !path.extname(relFile) &&
      fs.existsSync(path.join(ROOT_DIR, `${relFile}.html`))
    ) {
      relFile = `${relFile}.html`;
    }

    const resolved = path.resolve(ROOT_DIR, relFile);
    if (
      !resolved.startsWith(ROOT_DIR) ||
      !fs.existsSync(resolved) ||
      fs.statSync(resolved).isDirectory()
    ) {
      res.statusCode = 404;
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(resolved);
    res.setHeader(
      "Content-Type",
      MIME_TYPES[ext] || "application/octet-stream",
    );
    fs.createReadStream(resolved).pipe(res);
  } catch (err) {
    res.statusCode = 500;
    res.end(`Error interno: ${err.message}`);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Servidor MPCH listo en http://127.0.0.1:${PORT}`);
});
