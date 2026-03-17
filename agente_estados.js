// ═══════════════════════════════════════════════════════════════════════════════
// 🐙 AGENTE ESTADOS — AQUA
// Sube automáticamente estados de WhatsApp desde Google Drive
// Horario: 4 estados por día (Lun–Sáb), 2 el domingo
// ═══════════════════════════════════════════════════════════════════════════════

const axios   = require("axios");
const express = require("express");
const app     = express();
app.use(express.json());

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

const WHAPI_TOKEN = "0p72NednwTdDtZgW42pZw2TPWqjGWGuL";
const WHAPI_URL   = "https://gate.whapi.cloud";

// ID de la carpeta raíz en Google Drive donde están las subcarpetas por día
// Cómo conseguirlo: abre la carpeta en Drive → mira la URL → el ID es la parte larga
// Ejemplo: https://drive.google.com/drive/folders/1ABC123XYZ → ID = 1ABC123XYZ
const DRIVE_CARPETA_RAIZ = process.env.DRIVE_CARPETA_RAIZ || "PON_AQUI_EL_ID_DE_LA_CARPETA";

// Clave de API de Google (se crea en console.cloud.google.com — instrucciones abajo)
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || null;

// Número admin para recibir confirmaciones (sin + ni espacios)
const NUMERO_ADMIN = "573003808708";

// ─── ESTRUCTURA DE CARPETAS EN DRIVE ─────────────────────────────────────────
//
//  📁 Estados AQUA/          ← carpeta raíz (su ID va en DRIVE_CARPETA_RAIZ)
//     📁 lunes/
//        imagen1.jpg          ← estado 1 (se sube a las 8am)
//        imagen2.jpg          ← estado 2 (se sube a las 11am)
//        imagen3.jpg          ← estado 3 (se sube a las 3pm)
//        imagen4.jpg          ← estado 4 (se sube a las 6pm)
//     📁 martes/
//        imagen1.jpg
//        ...
//     📁 miercoles/
//     📁 jueves/
//     📁 viernes/
//     📁 sabado/
//     📁 domingo/
//        imagen1.jpg          ← solo 2 el domingo
//        imagen2.jpg
//
// IMPORTANTE: nombra las imágenes imagen1, imagen2, imagen3, imagen4
// para que el agente sepa el orden. Pueden ser .jpg o .png
//
// ─── CAPTIONS (texto que acompaña cada estado) ───────────────────────────────
// Incluye SIEMPRE el nombre del producto en el caption.
// Así cuando alguien responda "precio?" Pulpín sabe de qué habla.
//
// Puedes personalizar los captions aquí abajo por día:

const CAPTIONS = {
  lunes:     ["🐟 Bettas machos — colores únicos desde $17k. Escríbenos! | AQUA 🐙",
               "🌿 Plantas naturales para tu acuario desde $3k | AQUA 🐙",
               "💊 ¿Tu pez tiene puntitos blancos? Tenemos White Spot $7k | AQUA 🐙",
               "🔵 Filtros sumergibles desde $37k — pregunta por el tuyo | AQUA 🐙"],
  martes:    ["🐠 Tetras neón desde $2k — van en grupo de 6+ | AQUA 🐙",
               "🖤 Monjas — HOY promo paga 2 lleva 3 🎁 | AQUA 🐙",
               "🏠 Acuarios desde $45k — asesoría gratis | AQUA 🐙",
               "🐹 Hámsters rusos y sirios disponibles $18–20k | AQUA 🐙"],
  miercoles: ["🌈 Guppys — HOY promo paga 2 lleva 3 🎁 | AQUA 🐙",
               "🎏 Koi disponibles — para estanques y acuarios | AQUA 🐙",
               "🧪 Bacterias nitrificantes $10k — esenciales para acuario nuevo | AQUA 🐙",
               "🐠 Platys de colores — HOY promo paga 2 lleva 3 🎁 | AQUA 🐙"],
  jueves:    ["👼 Escalares — el pez más elegante desde $10k | AQUA 🐙",
               "🖤 Monjas — HOY promo paga 2 lleva 3 🎁 | AQUA 🐙",
               "🦐 Camarones fantasma y cherry disponibles | AQUA 🐙",
               "💡 Luces LED para acuario desde $20k | AQUA 🐙"],
  viernes:   ["🐠 Óscares tigre — personalidad única $30k | AQUA 🐙",
               "🌊 Acuarios completos con filtro y luz | AQUA 🐙",
               "🍃 Alimento vivo — tubiflex y larvas disponibles | AQUA 🐙",
               "🎏 Goldfish bailarinas y fancy disponibles | AQUA 🐙"],
  sabado:    ["🐟 Novedades de la semana — pregunta qué llegó 🆕 | AQUA 🐙",
               "🚚 Enviamos a todo Colombia por Interrapidísimo | AQUA 🐙",
               "🐉 Arawanas y peces exóticos disponibles | AQUA 🐙",
               "🧰 Kit botiquín AQUA $15k — todo lo básico para tu acuario | AQUA 🐙"],
  domingo:   ["🐙 Domingo en AQUA — abrimos hasta la 1pm | AQUA 🐙",
               "💙 Esta semana llegan novedades — activa las notificaciones 🔔 | AQUA 🐙"],
};

// Horarios de publicación (hora Colombia = UTC-5)
// El servidor corre en UTC, así que sumamos 5 horas
const HORARIOS = {
  lunes:     [13, 16, 20, 23],  // 8am, 11am, 3pm, 6pm Colombia
  martes:    [13, 16, 20, 23],
  miercoles: [13, 16, 20, 23],
  jueves:    [13, 16, 20, 23],
  viernes:   [13, 16, 20, 23],
  sabado:    [13, 16, 20, 23],
  domingo:   [14, 19],          // 9am, 2pm Colombia
};

const DIAS = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];

// ─── OBTENER ARCHIVOS DE DRIVE ────────────────────────────────────────────────
async function obtenerArchivosDia(dia) {
  if (!GOOGLE_API_KEY) {
    console.log("⚠️ Sin GOOGLE_API_KEY — modo simulación");
    return [];
  }
  try {
    // 1. Buscar la subcarpeta del día dentro de la carpeta raíz
    const buscarCarpeta = await axios.get("https://www.googleapis.com/drive/v3/files", {
      params: {
        q: `'${DRIVE_CARPETA_RAIZ}' in parents and name='${dia}' and mimeType='application/vnd.google-apps.folder'`,
        key: GOOGLE_API_KEY,
        fields: "files(id,name)",
      }
    });

    const carpetas = buscarCarpeta.data.files;
    if (!carpetas || carpetas.length === 0) {
      console.log(`⚠️ No se encontró carpeta '${dia}' en Drive`);
      return [];
    }
    const carpetaId = carpetas[0].id;

    // 2. Listar imágenes dentro de esa carpeta, ordenadas por nombre
    const listarArchivos = await axios.get("https://www.googleapis.com/drive/v3/files", {
      params: {
        q: `'${carpetaId}' in parents and (mimeType contains 'image/')`,
        key: GOOGLE_API_KEY,
        orderBy: "name",
        fields: "files(id,name,mimeType)",
      }
    });

    return listarArchivos.data.files || [];
  } catch (err) {
    console.error("❌ Error leyendo Drive:", err.response?.data || err.message);
    return [];
  }
}

// ─── SUBIR ESTADO A WHATSAPP ──────────────────────────────────────────────────
async function subirEstado(archivoId, caption, mimeType) {
  const urlImagen = `https://drive.google.com/uc?export=view&id=${archivoId}`;

  try {
    const endpoint = mimeType.includes("video") ? "statuses/video" : "statuses/image";
    await axios.post(
      `${WHAPI_URL}/${endpoint}`,
      {
        media: urlImagen,
        caption: caption,
      },
      { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
    );
    console.log(`✅ Estado subido: ${caption.substring(0, 50)}...`);
    return true;
  } catch (err) {
    console.error("❌ Error subiendo estado:", err.response?.data || err.message);
    return false;
  }
}

// ─── LÓGICA PRINCIPAL ─────────────────────────────────────────────────────────
async function verificarYPublicar() {
  const ahora    = new Date();
  const horaUTC  = ahora.getUTCHours();
  const diaNum   = ahora.getUTCDay();
  const dia      = DIAS[diaNum];
  const horarios = HORARIOS[dia] || [];

  if (!horarios.includes(horaUTC)) return; // no es hora de publicar

  const indice = horarios.indexOf(horaUTC);
  const claveRastro = `${dia}-${indice}-${ahora.toISOString().slice(0,10)}`;

  // Evitar doble publicación en la misma hora
  if (publicacionesHoy.has(claveRastro)) return;

  console.log(`📅 Hora de publicar estado ${indice + 1} del ${dia}...`);
  publicacionesHoy.add(claveRastro);

  const archivos = await obtenerArchivosDia(dia);
  const archivo  = archivos[indice];

  if (!archivo) {
    console.log(`⚠️ No hay imagen ${indice + 1} para el ${dia} en Drive`);
    await notificarAdmin(`⚠️ Pulpín Estados: no encontré la imagen ${indice + 1} del ${dia} en Drive. Revisa la carpeta 🐙`);
    return;
  }

  const captions = CAPTIONS[dia] || [];
  const caption  = captions[indice] || `AQUA 🐙 — ${dia}`;

  const ok = await subirEstado(archivo.id, caption, archivo.mimeType || "image/jpeg");

  if (ok) {
    await notificarAdmin(`✅ Estado ${indice + 1}/${horarios.length} subido (${dia}) 🐙`);
  }
}

// ─── NOTIFICAR ADMIN ──────────────────────────────────────────────────────────
async function notificarAdmin(mensaje) {
  try {
    await axios.post(`${WHAPI_URL}/messages/text`,
      { to: `${NUMERO_ADMIN}@s.whatsapp.net`, body: mensaje },
      { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ Error notificando admin:", err.message);
  }
}

// ─── ESTADO INTERNO ───────────────────────────────────────────────────────────
const publicacionesHoy = new Set();

// Limpiar el registro a medianoche UTC
setInterval(() => {
  const ahora = new Date();
  if (ahora.getUTCHours() === 0 && ahora.getUTCMinutes() < 5) {
    publicacionesHoy.clear();
    console.log("🔄 Registro de publicaciones reiniciado");
  }
}, 5 * 60 * 1000);

// Verificar cada 5 minutos si es hora de publicar
setInterval(verificarYPublicar, 5 * 60 * 1000);

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────
app.get("/estados", (req, res) => res.send("Agente Estados AQUA activo 🐙"));

// POST /estados/publicar-ahora  →  fuerza publicar el próximo estado manualmente
app.post("/estados/publicar-ahora", async (req, res) => {
  const { dia, indice } = req.body;
  const diaFinal    = dia    || DIAS[new Date().getUTCDay()];
  const indiceFinal = indice !== undefined ? indice : 0;

  const archivos = await obtenerArchivosDia(diaFinal);
  const archivo  = archivos[indiceFinal];

  if (!archivo) return res.status(404).json({ error: `No hay imagen ${indiceFinal + 1} para ${diaFinal}` });

  const caption = (CAPTIONS[diaFinal] || [])[indiceFinal] || `AQUA 🐙`;
  const ok      = await subirEstado(archivo.id, caption, archivo.mimeType);

  res.json({ ok, dia: diaFinal, indice: indiceFinal, caption });
});

const PORT = process.env.PORT_ESTADOS || 3001;
app.listen(PORT, () => {
  console.log(`🐙 Agente Estados corriendo en puerto ${PORT}`);
  console.log(`📅 Horarios activos: L–S 4 estados/día | Dom 2 estados`);
});
