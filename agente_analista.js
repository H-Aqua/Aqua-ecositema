
// ═══════════════════════════════════════════════════════════════════════════════
// 🐙 AGENTE ANALISTA NOCTURNO — AQUA
// Cada noche a las 10pm lee las conversaciones del día,
// detecta patrones, clientes insatisfechos y propone mejoras concretas
// para vender más y dar mejor asesoría
// ═══════════════════════════════════════════════════════════════════════════════

const axios   = require("axios");
const express = require("express");
const fs      = require("fs");
const path    = require("path");
const app     = express();
app.use(express.json());

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WHAPI_TOKEN       = "0p72NednwTdDtZgW42pZw2TPWqjGWGuL";
const WHAPI_URL         = "https://gate.whapi.cloud";
const NUMERO_ADMIN      = "573003808708";
const NUMERO_ASESOR     = "573137200415"; // ← recibe el análisis nocturno

// Archivo de estado de Pulpín (lo escribe el bot cada 5 min)
const ARCHIVO_ESTADO    = path.join(__dirname, "estado_pulpin.json");
// Archivo donde guardamos el historial de análisis previos
const ARCHIVO_ANALISIS  = path.join(__dirname, "historial_analisis.json");

// 10pm Colombia = 3am UTC del día siguiente
const HORA_ANALISIS_UTC = 3;

// ─── LEER CONVERSACIONES DE HOY ───────────────────────────────────────────────
function leerConversacionesHoy() {
  try {
    if (!fs.existsSync(ARCHIVO_ESTADO)) return null;
    const estado = JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, "utf8"));

    const conversaciones = estado.conversacionesResumen || {};
    const perfiles       = estado.perfilUsuario        || {};
    const compras        = estado.comprasConfirmadas   || {};
    const carritos       = estado.carritoUsuario       || {};

    // Construir resumen de cada conversación activa
    const resumenConvs = Object.entries(conversaciones).map(([num, msgs]) => {
      const nombre  = perfiles[num]?.nombre  || "Cliente";
      const ciudad  = perfiles[num]?.ciudad  || "desconocida";
      const compro  = !!compras[num];
      const carrito = (carritos[num] || []).map(i => i.nombre).join(", ");

      const dialogo = msgs
        .filter(m => m.content && !m.content.includes("COMPRA_CONFIRMADA"))
        .map(m => `${m.role === "user" ? nombre : "Pulpín"}: ${m.content}`)
        .join("\n");

      return `--- Conversación (${ciudad}) ---\nNombre: ${nombre} | ¿Compró?: ${compro ? "SÍ" : "NO"} | Carrito: ${carrito || "vacío"}\n${dialogo}`;
    });

    return {
      totalChats:   Object.keys(conversaciones).length,
      totalCompras: Object.values(compras).filter(c => Date.now() - c.fecha < 86400000).length,
      resumenConvs: resumenConvs.slice(0, 20), // máximo 20 para no exceder tokens
    };
  } catch (e) {
    console.error("❌ Error leyendo conversaciones:", e.message);
    return null;
  }
}

function cargarHistorialAnalisis() {
  try {
    if (fs.existsSync(ARCHIVO_ANALISIS)) {
      return JSON.parse(fs.readFileSync(ARCHIVO_ANALISIS, "utf8"));
    }
  } catch (e) {}
  return { analisis: [] };
}

function guardarAnalisis(nuevo) {
  const historial = cargarHistorialAnalisis();
  historial.analisis.unshift({ fecha: new Date().toISOString(), ...nuevo });
  historial.analisis = historial.analisis.slice(0, 30); // guardar últimos 30 días
  fs.writeFileSync(ARCHIVO_ANALISIS, JSON.stringify(historial, null, 2));
}

// ─── GENERAR ANÁLISIS CON CLAUDE ─────────────────────────────────────────────
async function generarAnalisisNocturno() {
  console.log("🔍 Iniciando análisis nocturno...");

  const datos = leerConversacionesHoy();
  if (!datos || datos.totalChats === 0) {
    console.log("ℹ️ Sin conversaciones para analizar hoy");
    return;
  }

  const convTexto = datos.resumenConvs.join("\n\n");

  const prompt = `Eres el analista de ventas y calidad de AQUA, tienda de peces ornamentales en Colombia (Toro Valle y Pereira Risaralda).

DATOS DEL DÍA:
- Total conversaciones: ${datos.totalChats}
- Compras confirmadas: ${datos.totalCompras}
- Tasa de conversión: ${datos.totalChats > 0 ? Math.round((datos.totalCompras/datos.totalChats)*100) : 0}%

CONVERSACIONES DE HOY:
${convTexto}

Analiza estas conversaciones y genera el reporte nocturno con estas 7 secciones:

1. RESUMEN DEL DÍA (2 líneas): tasa de conversión, productos más pedidos, ciudad con más actividad

2. LO QUE FUNCIONÓ BIEN: 2-3 momentos donde Pulpín vendió bien, dio una buena asesoría o cerró un pedido. Cita el ejemplo real de la conversación.

3. OPORTUNIDADES PERDIDAS: Conversaciones donde el cliente se fue sin comprar. Para cada una: ¿qué pasó?, ¿fue el precio, una respuesta incompleta, demora, o algo que Pulpín no supo responder? Sé específico.

4. CLIENTES PARA HACER SEGUIMIENTO MAÑANA: Lista los números/nombres de clientes que mostraron interés serio pero no compraron. El equipo los contactará mañana. Incluye qué les interesaba para que el asesor sepa de qué hablar.

5. MEJORAS PARA PULPÍN (máximo 3, muy concretas):
   - Frases exactas que debería decir diferente
   - Información o productos que le faltan en el catálogo
   - Palabras clave que no está detectando bien

6. PRODUCTO ESTRELLA MAÑANA: El que más interés generó hoy. Sugiere el caption exacto para el estado de mañana y el horario ideal.

7. ALERTA (si aplica): Algo urgente que el equipo debe saber hoy mismo (queja seria, producto muy pedido sin stock, cliente molesto, etc.)

Precios siempre en pesos colombianos ($17.000 no $17k). Sé directo y específico. Sin flores. Máximo 35 líneas. En español colombiano natural.`;

  try {
    const resp = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }]
      },
      { headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } }
    );

    const analisis = resp.data.content[0].text;
    const fecha    = new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday:"long", day:"numeric", month:"long" });
    const mensaje  = `🔍 *Análisis Nocturno AQUA*\n_${fecha}_\n\n${analisis}`;

    // Enviar al admin (Keneth)
    await axios.post(`${WHAPI_URL}/messages/text`,
      { to: `${NUMERO_ADMIN}@s.whatsapp.net`, body: mensaje },
      { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
    );

    // Enviar al asesor (3137200415)
    await axios.post(`${WHAPI_URL}/messages/text`,
      { to: `${NUMERO_ASESOR}@s.whatsapp.net`, body: mensaje },
      { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
    );

    // Guardar en historial local
    guardarAnalisis({ totalChats: datos.totalChats, totalCompras: datos.totalCompras, analisis });

    console.log(`✅ Análisis nocturno enviado (${datos.totalChats} chats, ${datos.totalCompras} compras)`);
  } catch (err) {
    console.error("❌ Error generando análisis:", err.response?.data || err.message);
  }
}

// ─── CRON: todos los días a las 10pm Colombia (3am UTC) ──────────────────────
let ultimoAnalisisClave = null;

setInterval(() => {
  const ahora = new Date();
  const hora  = ahora.getUTCHours();
  const clave = ahora.toISOString().slice(0, 10);

  if (hora === HORA_ANALISIS_UTC && ultimoAnalisisClave !== clave) {
    ultimoAnalisisClave = clave;
    generarAnalisisNocturno().catch(console.error);
  }
}, 5 * 60 * 1000);

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────
app.get("/analisis", (req, res) => res.send("Agente Analista AQUA activo 🐙"));

// POST /analisis/generar → fuerza el análisis ahora
app.post("/analisis/generar", async (req, res) => {
  try {
    await generarAnalisisNocturno();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /analisis/historial → últimos análisis guardados
app.get("/analisis/historial", (req, res) => {
  const h = cargarHistorialAnalisis();
  res.json(h.analisis.slice(0, 7)); // últimos 7 días
});

const PORT = process.env.PORT_ANALISIS || 3004;
app.listen(PORT, () => {
  console.log(`🐙 Agente Analista corriendo en puerto ${PORT}`);
  console.log(`📊 Análisis nocturno: todos los días a las 10pm Colombia`);
});
