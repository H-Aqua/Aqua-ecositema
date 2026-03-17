// ═══════════════════════════════════════════════════════════════════════════════
// 🐙 AGENTE INVENTARIO — AQUA
// Rastrea qué piden los clientes, detecta productos sin stock frecuentes,
// genera reportes 2x por semana y alerta a Keneth
// Listo para conectar con Loyverse cuando tengas la API
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

// Cuando tengas Loyverse, pon aquí tu API key
// La consigues en: Loyverse → Ajustes → API de Acceso
const LOYVERSE_API_KEY  = process.env.LOYVERSE_API_KEY || null;

const NUMERO_KENETH     = "573003808708";
const NUMERO_PEREIRA    = "573157260804";

// Archivo donde se guarda el registro de demanda (persistente entre reinicios)
const ARCHIVO_DEMANDA   = path.join(__dirname, "datos_demanda.json");

// ─── DÍAS Y HORAS DE REPORTE ──────────────────────────────────────────────────
// Reporte los lunes a las 8am y los jueves a las 8am (Colombia = UTC-5, son las 13 UTC)
const REPORTE_DIA_1  = 1;  // lunes
const REPORTE_DIA_2  = 4;  // jueves
const REPORTE_HORA   = 13; // 8am Colombia en UTC

// ─── FUNCIONES DE PERSISTENCIA ────────────────────────────────────────────────
function cargarDemanda() {
  try {
    if (fs.existsSync(ARCHIVO_DEMANDA)) {
      return JSON.parse(fs.readFileSync(ARCHIVO_DEMANDA, "utf8"));
    }
  } catch (e) { console.error("Error cargando demanda:", e.message); }
  return { productos: {}, sinStock: {}, ultimoReporte: null };
}

function guardarDemanda(datos) {
  try {
    fs.writeFileSync(ARCHIVO_DEMANDA, JSON.stringify(datos, null, 2));
  } catch (e) { console.error("Error guardando demanda:", e.message); }
}

// ─── ESTADO INTERNO ───────────────────────────────────────────────────────────
let demanda = cargarDemanda();
let ultimoReporteClave = demanda.ultimoReporte || null;

// ─── REGISTRAR CONSULTA DE PRODUCTO ──────────────────────────────────────────
// Este endpoint lo llama Pulpín internamente cada vez que alguien pregunta por algo
// Se llama desde bot_pulpin_v7.js con un POST /inventario/registro
app.post("/inventario/registro", (req, res) => {
  const { producto, disponible = true, ciudad } = req.body;
  if (!producto) return res.status(400).json({ error: "Falta producto" });

  const hoy = new Date().toISOString().slice(0, 10);

  // Registrar consulta general
  if (!demanda.productos[producto]) {
    demanda.productos[producto] = { total: 0, dias: {} };
  }
  demanda.productos[producto].total++;
  demanda.productos[producto].dias[hoy] = (demanda.productos[producto].dias[hoy] || 0) + 1;

  // Si el producto no estaba disponible, registrarlo como demanda insatisfecha
  if (!disponible) {
    if (!demanda.sinStock[producto]) {
      demanda.sinStock[producto] = { total: 0, dias: {} };
    }
    demanda.sinStock[producto].total++;
    demanda.sinStock[producto].dias[hoy] = (demanda.sinStock[producto].dias[hoy] || 0) + 1;
    console.log(`📦 Sin stock registrado: ${producto} (${hoy})`);
  }

  guardarDemanda(demanda);
  res.json({ ok: true });
});

// ─── CONSULTAR STOCK EN LOYVERSE ──────────────────────────────────────────────
async function obtenerStockLoyverse(nombreProducto) {
  if (!LOYVERSE_API_KEY) return null; // Loyverse no conectado aún

  try {
    const resp = await axios.get("https://api.loyverse.com/v1.0/items", {
      headers: { Authorization: `Bearer ${LOYVERSE_API_KEY}` },
      params: { limit: 50 }
    });
    const items = resp.data.items || [];
    const item  = items.find(i => i.item_name.toLowerCase().includes(nombreProducto.toLowerCase()));
    if (!item) return null;

    // Obtener nivel de stock
    const stockResp = await axios.get(`https://api.loyverse.com/v1.0/inventory`, {
      headers: { Authorization: `Bearer ${LOYVERSE_API_KEY}` },
      params: { item_ids: item.id }
    });
    const stocks = stockResp.data.inventory_levels || [];
    const total  = stocks.reduce((s, l) => s + (l.in_stock || 0), 0);
    return { nombre: item.item_name, stock: total, id: item.id };
  } catch (err) {
    console.error("❌ Error Loyverse:", err.response?.data || err.message);
    return null;
  }
}

// ─── GENERAR REPORTE CON CLAUDE ───────────────────────────────────────────────
async function generarReporte() {
  console.log("📊 Generando reporte de inventario...");

  // Top 10 más consultados esta semana
  const ahora    = new Date();
  const hace7    = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const diasSemana = [];
  for (let d = new Date(hace7); d <= ahora; d.setDate(d.getDate() + 1)) {
    diasSemana.push(d.toISOString().slice(0, 10));
  }

  const consultasSemana = {};
  for (const [prod, datos] of Object.entries(demanda.productos)) {
    const total = diasSemana.reduce((s, dia) => s + (datos.dias[dia] || 0), 0);
    if (total > 0) consultasSemana[prod] = total;
  }

  const sinStockSemana = {};
  for (const [prod, datos] of Object.entries(demanda.sinStock)) {
    const total = diasSemana.reduce((s, dia) => s + (datos.dias[dia] || 0), 0);
    if (total > 0) sinStockSemana[prod] = total;
  }

  const topConsultas = Object.entries(consultasSemana)
    .sort(([,a],[,b]) => b - a).slice(0, 10)
    .map(([p, n]) => `${p}: ${n} consultas`).join("\n");

  const topSinStock = Object.entries(sinStockSemana)
    .sort(([,a],[,b]) => b - a).slice(0, 5)
    .map(([p, n]) => `${p}: ${n} veces sin stock`).join("\n");

  if (!topConsultas) {
    console.log("📊 Sin datos suficientes para reporte esta semana");
    return;
  }

  // Verificar stock en Loyverse para los sin-stock (si está conectado)
  let stockInfo = "";
  if (LOYVERSE_API_KEY && Object.keys(sinStockSemana).length > 0) {
    const checks = [];
    for (const prod of Object.keys(sinStockSemana).slice(0, 3)) {
      const stock = await obtenerStockLoyverse(prod);
      if (stock) checks.push(`${stock.nombre}: ${stock.stock} unidades`);
    }
    if (checks.length > 0) stockInfo = "\nSTOCK ACTUAL LOYVERSE:\n" + checks.join("\n");
  }

  // Generar análisis con Claude
  const prompt = `Eres el asistente de inventario de AQUA, tienda de peces en Colombia.

DATOS DE LA SEMANA:
Productos más consultados:
${topConsultas}

Productos que pidieron y no había:
${topSinStock || "Ninguno registrado"}
${stockInfo}

Genera un reporte corto (máximo 8 líneas) para Keneth con:
1. Qué reponer urgente
2. Qué se está vendiendo bien y conviene tener más stock
3. Una recomendación de compra para esta semana

Sin markdown. Directo y útil.`;

  try {
    const resp = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }]
      },
      { headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } }
    );

    const reporte = resp.data.content[0].text;
    const mensaje = `📦 Reporte Inventario AQUA\n${new Date().toLocaleDateString("es-CO")}\n\n${reporte}`;

    // Enviar a Keneth (Toro)
    await axios.post(`${WHAPI_URL}/messages/text`,
      { to: `${NUMERO_KENETH}@s.whatsapp.net`, body: mensaje },
      { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
    );

    // Enviar a Pereira también
    await axios.post(`${WHAPI_URL}/messages/text`,
      { to: `${NUMERO_PEREIRA}@s.whatsapp.net`, body: mensaje },
      { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
    );

    console.log("✅ Reporte enviado al equipo");
  } catch (err) {
    console.error("❌ Error generando reporte:", err.response?.data || err.message);
  }
}

// ─── CRON: reporte 2x por semana ─────────────────────────────────────────────
setInterval(() => {
  const ahora = new Date();
  const dia   = ahora.getUTCDay();
  const hora  = ahora.getUTCHours();
  const clave = `${dia}-${ahora.toISOString().slice(0,10)}`;

  const esReporte = (dia === REPORTE_DIA_1 || dia === REPORTE_DIA_2) && hora === REPORTE_HORA;

  if (esReporte && ultimoReporteClave !== clave) {
    ultimoReporteClave        = clave;
    demanda.ultimoReporte     = clave;
    guardarDemanda(demanda);
    generarReporte().catch(console.error);
  }
}, 5 * 60 * 1000);

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────
app.get("/inventario", (req, res) => res.send("Agente Inventario AQUA activo 🐙"));

// GET /inventario/stats → ver estadísticas actuales
app.get("/inventario/stats", (req, res) => {
  const top = Object.entries(demanda.productos)
    .sort(([,a],[,b]) => b.total - a.total)
    .slice(0, 15)
    .map(([p, d]) => ({ producto: p, consultas: d.total }));

  const sinStock = Object.entries(demanda.sinStock)
    .sort(([,a],[,b]) => b.total - a.total)
    .slice(0, 10)
    .map(([p, d]) => ({ producto: p, veces: d.total }));

  res.json({ topProductos: top, sinStock });
});

// POST /inventario/reporte → forzar reporte ahora
app.post("/inventario/reporte", async (req, res) => {
  try {
    await generarReporte();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT_INVENTARIO || 3002;
app.listen(PORT, () => {
  console.log(`🐙 Agente Inventario corriendo en puerto ${PORT}`);
  console.log(`📊 Reportes: lunes y jueves a las 8am Colombia`);
  if (!LOYVERSE_API_KEY) console.log(`ℹ️  Loyverse no conectado aún — agrega LOYVERSE_API_KEY cuando tengas la API`);
});
