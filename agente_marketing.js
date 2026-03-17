// ═══════════════════════════════════════════════════════════════════════════════
// 🐙 AGENTE MARKETING — AQUA
// Genera estrategias semanales basadas en:
// - Rotación de inventario (qué se vende / qué no)
// - Festividades y fechas especiales de Colombia
// - Temporadas y eventos locales del Eje Cafetero
// Envía el plan cada lunes a las 7am
// ═══════════════════════════════════════════════════════════════════════════════

const axios   = require("axios");
const express = require("express");
const app     = express();
app.use(express.json());

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WHAPI_TOKEN       = "0p72NednwTdDtZgW42pZw2TPWqjGWGuL";
const WHAPI_URL         = "https://gate.whapi.cloud";

const NUMERO_ADMIN      = "573003808708"; // Keneth recibe el plan
const NUMERO_ASESOR     = "573137200415"; // también recibe el plan de marketing
const INVENTARIO_URL    = process.env.INVENTARIO_URL || "http://localhost:3002"; // URL del agente de inventario

// Lunes a las 7am Colombia (12 UTC)
const HORA_REPORTE_UTC  = 12;

// ─── FESTIVIDADES COLOMBIANAS 2026 ────────────────────────────────────────────
// Fechas fijas + fechas móviles calculadas
// Formato: { fecha: "MM-DD", nombre, tipo }
const FESTIVIDADES = [
  // Enero
  { fecha: "01-01", nombre: "Año Nuevo", tipo: "nacional" },
  { fecha: "01-06", nombre: "Reyes Magos / Día de los Reyes", tipo: "nacional" },
  // Febrero
  { fecha: "02-14", nombre: "San Valentín / Día del Amor", tipo: "comercial" },
  // Marzo
  { fecha: "03-19", nombre: "San José (festivo)", tipo: "nacional" },
  // Abril
  { fecha: "04-02", nombre: "Jueves Santo 2026", tipo: "nacional" },
  { fecha: "04-03", nombre: "Viernes Santo 2026", tipo: "nacional" },
  // Mayo
  { fecha: "05-01", nombre: "Día del Trabajo", tipo: "nacional" },
  { fecha: "05-11", nombre: "Día de la Madre 2026", tipo: "comercial" },
  // Junio
  { fecha: "06-01", nombre: "Día del Niño (Colombia)", tipo: "comercial" },
  { fecha: "06-15", nombre: "Corpus Christi 2026", tipo: "nacional" },
  { fecha: "06-29", nombre: "San Pedro y San Pablo", tipo: "regional" },
  // Julio
  { fecha: "07-20", nombre: "Día de la Independencia", tipo: "nacional" },
  { fecha: "07-04", nombre: "Festival del Joropo (Villavicencio)", tipo: "cultural" },
  // Agosto
  { fecha: "08-07", nombre: "Batalla de Boyacá", tipo: "nacional" },
  { fecha: "08-16", nombre: "Feria de Manizales (Eje Cafetero)", tipo: "regional" },
  // Septiembre
  { fecha: "09-07", nombre: "Amor y Amistad 2026", tipo: "comercial" },
  // Octubre
  { fecha: "10-12", nombre: "Día de la Raza / Fiesta Patria", tipo: "nacional" },
  { fecha: "10-31", nombre: "Halloween", tipo: "comercial" },
  // Noviembre
  { fecha: "11-02", nombre: "Día de los Difuntos", tipo: "cultural" },
  { fecha: "11-11", nombre: "Independencia de Cartagena", tipo: "nacional" },
  { fecha: "11-20", nombre: "Feria de Cali (se acerca)", tipo: "regional" },
  // Diciembre
  { fecha: "12-08", nombre: "Día de las Velitas", tipo: "nacional" },
  { fecha: "12-25", nombre: "Navidad", tipo: "nacional" },
  { fecha: "12-31", nombre: "Fin de Año", tipo: "nacional" },
];

function getFestividadesProximas(diasAntes = 14) {
  const ahora    = new Date();
  const anio     = ahora.getFullYear();
  const proximas = [];

  for (const fest of FESTIVIDADES) {
    const [mes, dia] = fest.fecha.split("-").map(Number);
    let fecha = new Date(anio, mes - 1, dia);
    if (fecha < ahora) fecha = new Date(anio + 1, mes - 1, dia);

    const diffDias = Math.ceil((fecha - ahora) / (1000 * 60 * 60 * 24));
    if (diffDias <= diasAntes) {
      proximas.push({ ...fest, diasFaltantes: diffDias, fechaCompleta: fecha.toLocaleDateString("es-CO") });
    }
  }
  return proximas.sort((a, b) => a.diasFaltantes - b.diasFaltantes);
}

// ─── OBTENER DATOS DE INVENTARIO ──────────────────────────────────────────────
async function obtenerDatosInventario() {
  try {
    const resp = await axios.get(`${INVENTARIO_URL}/inventario/stats`, { timeout: 5000 });
    return resp.data;
  } catch (err) {
    console.log("ℹ️ Agente inventario no disponible, usando datos generales");
    return null;
  }
}

// ─── GENERAR PLAN SEMANAL ─────────────────────────────────────────────────────
async function generarPlanMarketing() {
  console.log("🎯 Generando plan de marketing semanal...");

  const festivos   = getFestividadesProximas(14);
  const inventario = await obtenerDatosInventario();
  const semana     = new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  let contextoInventario = "";
  if (inventario) {
    const top5 = inventario.topProductos?.slice(0, 5).map(p => `${p.producto} (${p.consultas} consultas)`).join(", ");
    const bajoStock = inventario.sinStock?.slice(0, 3).map(p => `${p.producto}`).join(", ");
    if (top5)      contextoInventario += `\nPRODUCTOS MÁS CONSULTADOS ESTA SEMANA: ${top5}`;
    if (bajoStock) contextoInventario += `\nPRODUCTOS CON DEMANDA SIN STOCK: ${bajoStock}`;
  }

  let contextoFestivos = "";
  if (festivos.length > 0) {
    contextoFestivos = "\nFECHAS IMPORTANTES PRÓXIMAS:\n" +
      festivos.map(f => `- ${f.nombre} (en ${f.diasFaltantes} días, ${f.fechaCompleta})`).join("\n");
  } else {
    contextoFestivos = "\nSemana sin festividades próximas — foco en catálogo general";
  }

  // Identificar productos menos rotados (los que menos consultas tuvieron esta semana)
  let contextoMenosRotados = "";
  if (inventario) {
    const todos = inventario.topProductos || [];
    const menosRotados = todos.slice(-3).map(p => p.producto);
    if (menosRotados.length > 0) {
      contextoMenosRotados = `\nPRODUCTOS CON MENOS MOVIMIENTO ESTA SEMANA: ${menosRotados.join(", ")} (impulsar para rotación uniforme)`;
    }
  }

  const prompt = `Eres el estratega de marketing de AQUA, tienda de peces ornamentales, acuariofilia y hámsteres en Toro (Valle) y Pereira (Risaralda), Colombia.

CONTEXTO DE LA SEMANA: ${semana}
${contextoInventario}${contextoMenosRotados}
${contextoFestivos}

NUESTROS CANALES: WhatsApp Business (chatbot Pulpín), Estados de WhatsApp (4/día), Instagram @aqualife.co, Facebook

GENERA UN PLAN DE MARKETING PARA ESTA SEMANA con:

1. TEMA DE LA SEMANA: Una idea central que conecte con lo que está pasando (festividades, temporada, lo más pedido)

2. ESTADOS SUGERIDOS (4 por día, brevísimos — el texto va en el caption de la imagen):
   Lunes, Martes, Miércoles, Jueves, Viernes, Sábado (4 cada uno)
   Domingo (2)
   Prioriza en los estados: primero los productos más pedidos, segundo los menos rotados para equilibrar ventas.

3. PRODUCTO A IMPULSAR ESTA SEMANA: Elige UN producto que tenga menos rotación y sugiere cómo presentarlo para que se venda más (foto sugerida, caption, horario ideal de estado).

4. PRODUCTO ESTRELLA: El que más consultas tuvo — cómo seguir aprovechando ese momentum.

5. PROMO ESPECIAL (si aplica por festividad o producto sin rotar): qué producto, qué descuento o combo, por qué tiene sentido esta semana.

6. MENSAJE PARA MAYORISTAS: Una línea para el mensaje de mayoristas del lunes, enfocada en lo más disponible.

El plan debe sonar NATURAL para Colombia, no forzado. Si hay festividad → conéctala creativamente. Si no hay → equilibra rotación de inventario.
Precios siempre en pesos colombianos completos ($17.000, no $17k).
Máximo 30 líneas. Directo y accionable.`;

  try {
    const resp = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }]
      },
      { headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } }
    );

    const plan    = resp.data.content[0].text;
    const mensaje = `🎯 Plan Marketing AQUA — Semana del ${semana}\n\n${plan}`;

    await axios.post(`${WHAPI_URL}/messages/text`,
      { to: `${NUMERO_ADMIN}@s.whatsapp.net`, body: mensaje },
      { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
    );

    // Enviar también al asesor
    await axios.post(`${WHAPI_URL}/messages/text`,
      { to: `${NUMERO_ASESOR}@s.whatsapp.net`, body: mensaje },
      { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
    );

    console.log("✅ Plan de marketing enviado al equipo y al asesor");
    return plan;
  } catch (err) {
    console.error("❌ Error generando plan:", err.response?.data || err.message);
    return null;
  }
}

// ─── CRON: lunes a las 7am Colombia ──────────────────────────────────────────
let ultimoMarketingClave = null;

setInterval(() => {
  const ahora = new Date();
  const dia   = ahora.getUTCDay();
  const hora  = ahora.getUTCHours();
  const clave = ahora.toISOString().slice(0, 10);

  if (dia === 1 && hora === HORA_REPORTE_UTC && ultimoMarketingClave !== clave) {
    ultimoMarketingClave = clave;
    generarPlanMarketing().catch(console.error);
  }
}, 5 * 60 * 1000);

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────
app.get("/marketing", (req, res) => res.send("Agente Marketing AQUA activo 🐙"));

// POST /marketing/generar → genera el plan ahora mismo
app.post("/marketing/generar", async (req, res) => {
  const plan = await generarPlanMarketing();
  res.json({ ok: !!plan, plan });
});

// GET /marketing/festividades → ver qué festividades vienen
app.get("/marketing/festividades", (req, res) => {
  const proximas = getFestividadesProximas(30);
  res.json({ proximas });
});

const PORT = process.env.PORT_MARKETING || 3003;
app.listen(PORT, () => {
  console.log(`🐙 Agente Marketing corriendo en puerto ${PORT}`);
  console.log(`📅 Plan semanal: lunes 7am Colombia`);
});
