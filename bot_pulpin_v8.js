const express = require("express");
const axios   = require("axios");
const fs      = require("fs");
const path    = require("path");

const app = express();
app.use(express.json());

// ─── PERSISTENCIA EN DISCO ────────────────────────────────────────────────────
const ARCHIVO_ESTADO = path.join(__dirname, "estado_pulpin.json");

function cargarEstado() {
  try {
    if (fs.existsSync(ARCHIVO_ESTADO)) {
      const d = JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, "utf8"));
      console.log(`💾 Estado cargado: ${Object.keys(d.perfilUsuario||{}).length} perfiles, ${Object.keys(d.comprasConfirmadas||{}).length} compras`);
      return d;
    }
  } catch (e) { console.error("⚠️ Error cargando estado:", e.message); }
  return {};
}

function guardarEstado() {
  try {
    fs.writeFileSync(ARCHIVO_ESTADO, JSON.stringify({
      perfilUsuario,
      comprasConfirmadas,
      carritoUsuario,
      conversacionesResumen: Object.fromEntries(
        Object.entries(conversationMemory).map(([n, h]) => [n, h.slice(-8)])
      ),
    }));
  } catch (e) { console.error("⚠️ Error guardando estado:", e.message); }
}

setInterval(guardarEstado, 5 * 60 * 1000);
process.on("SIGTERM", () => { guardarEstado(); process.exit(0); });
process.on("SIGINT",  () => { guardarEstado(); process.exit(0); });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WHAPI_TOKEN = "0p72NednwTdDtZgW42pZw2TPWqjGWGuL";
const WHAPI_URL = "https://gate.whapi.cloud";

// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️  VARIABLES DE CONFIGURACIÓN — edita aquí sin tocar el resto del bot
// ═══════════════════════════════════════════════════════════════════════════════

// ── GRUPOS ──────────────────────────────────────────────────────────────────
// Los chat_id de grupos terminan en @g.us
// MODO: "ninguno"   → Pulpín ignora TODOS los grupos
//       "permitidos" → Pulpín solo responde en los grupos de la lista
//       "todos"      → Pulpín responde en todos los grupos
const GRUPOS_MODO = "permitidos"; // ← configurado: solo "Personal Aqua"

// PASO IMPORTANTE: la primera vez que escriban en "Personal Aqua",
// el log mostrará: 🔍 Grupo desconocido: 120363XXXXXXXX@g.us — "Personal Aqua"
// Copia ese ID y pégalo aquí abajo, o deja vacío y Pulpín filtrará por nombre.
const GRUPOS_PERMITIDOS = [
  // "120363XXXXXXXX@g.us",  // ← pega aquí el ID de "DF Pereira" cuando lo veas en logs
  // "120363YYYYYYYY@g.us",  // ← pega aquí el ID de "Dead Fish (DF)" cuando lo veas en logs
];

// Pulpín acepta estos grupos por nombre (plan B mientras consigues los IDs)
// DF = grupo Pereira | Dead Fish (DF) = grupo Toro — solo para registro de muertes
const NOMBRES_GRUPOS_PERMITIDOS = ["DF", "Dead Fish (DF)", "dead fish (df)", "dead fish", "Personal Aqua"];

// ── ETIQUETAS BLOQUEADAS ─────────────────────────────────────────────────────
// Pulpín NO responde a contactos con estas etiquetas de WhatsApp Business
// Deben coincidir EXACTAMENTE con los nombres de tus etiquetas
const ETIQUETAS_BLOQUEADAS = [
  "proveedores",  // ← ignora proveedores
  "excluidos",    // ← ignora excluidos
];

// ── MENSAJES MAYORISTAS ──────────────────────────────────────────────────────
// Nombre EXACTO de la etiqueta en WhatsApp Business para clientes al por mayor
const ETIQUETA_MAYORISTA = "clientes por mayor"; // ← ajusta si tu etiqueta se llama distinto

// Número que tiene autorización para disparar el envío masivo
// Envía "enviar mayoristas" a tu propio número de WhatsApp Business
// ── ADMINISTRADOR PRINCIPAL ──────────────────────────────────────────────────
const NUMERO_ADMIN   = "573137200415"; // ← Administrador principal — tiene todos los comandos

// ── COLABORADORES TORO ────────────────────────────────────────────────────────
// Reciben: motivación diaria, plan marketing, seguimiento clientes que iban a ir a la tienda
const COLABORADORES_TORO = [
  "573003808708", // Keneth
  // "57XXXXXXXXXX", // ← agregar más colaboradores Toro aquí
];

// ── COLABORADORES PEREIRA ─────────────────────────────────────────────────────
// Reciben: motivación diaria, plan marketing, seguimiento clientes Pereira
const COLABORADORES_PEREIRA = [
  // "57XXXXXXXXXX", // ← agregar colaboradores Pereira aquí
];

// ── CATÁLOGO PDF / IMÁGENES / VIDEO PARA MAYORISTAS ─────────────────────────
// Sube tu catálogo PDF a Google Drive → Compartir → "Cualquiera con el enlace"
// Luego copia el enlace directo de descarga abajo.
// Para video: sube a Google Drive igual y pega el enlace. WhatsApp solo acepta .mp4
// Si dejas en null, no se envía archivo (solo texto).
const CATALOGO_MAYORISTAS = {
  // Opciones — activa solo UNA poniendo su URL, deja las otras en null:

  pdf: null,
  // pdf: "https://drive.google.com/uc?export=download&id=TU_ID_AQUI",
  // Ejemplo real: "https://drive.google.com/uc?export=download&id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"

  imagen: null,
  // imagen: "https://drive.google.com/uc?export=view&id=TU_ID_AQUI",

  video: null,
  // video: "https://drive.google.com/uc?export=download&id=TU_ID_AQUI",
  // ⚠️ El video debe ser .mp4 y pesar menos de 16MB para WhatsApp

  // Pie de mensaje que acompaña al archivo (aplica a pdf, imagen y video)
  caption: "📋 Catálogo AQUA — precios al por mayor. Escríbenos para cotizar 🐙",
};

// Mensajes rotativos que se envían cada semana (alterna entre ellos)
// Puedes agregar o quitar mensajes de esta lista
const MENSAJES_MAYORISTAS = [
  `🐙 *Novedades AQUA esta semana* 🌊

Hola! Te traemos las novedades para reabastecer tu tienda:

🐟 Bettas machos nuevos — colores de temporada
🌈 Guppys de línea — stock completo  
🐠 Tetras neón y rubí — lote fresco

Escríbenos para confirmar cantidades y precios al por mayor. ¡Los mejores peces del Eje Cafetero! 💪`,

  `🐙 *Oferta mayorista semana* 🔥

Buenos días! Esta semana tenemos disponible:

✅ Goldfish — varias tallas
✅ Escalares — parejas y sueltos
✅ Mollys y Platys — todos los colores

Aprovecha el descuento de temporada. ¿Cuánto necesitas? 📦`,

  `🐙 *AQUA Mayoristas — actualización de inventario* 📋

Hola! Queremos que seas el primero en saber:

🆕 Llegaron Ramirezis de velo
🆕 Corydoras en cantidad
🆕 Plantas naturales surtidas

Cotiza antes de que se agoten. ¡Recuerda que hacemos domicilio para mayoristas! 🚚`,
];

// ─── ESTADO POR USUARIO ───────────────────────────────────────────────────────
const conversationMemory = {};
const pendingMessages    = {};
const pendingTimers      = {};
const pausedChats        = {};

// Cargamos desde disco si existe (persiste entre reinicios del servidor)
const _estado            = cargarEstado();
const carritoUsuario     = _estado.carritoUsuario     || {};
const perfilUsuario      = _estado.perfilUsuario      || {};
const comprasConfirmadas = _estado.comprasConfirmadas || {};
// Restaurar últimos mensajes de conversaciones activas
if (_estado.conversacionesResumen) {
  Object.assign(conversationMemory, _estado.conversacionesResumen);
}

const DELAY_MS           = 8000;
const MAX_MESSAGES       = 10;   // 10 mensajes = buen contexto + menor costo API
const PAUSA_DURACION_MS  = 30 * 60 * 1000;
const DIAS_SEGUIMIENTO   = 3;    // días después de compra para el seguimiento

// Números del equipo AQUA (para notificaciones internas)
const NUMERO_KENETH_TORO    = "573003808708"; // Toro - Keneth (colaborador)
const NUMERO_PEREIRA        = "573157260804"; // Pereira (sede)

// ── MÉTODOS DE PAGO ──────────────────────────────────────────────────────────
// Imagen de métodos de pago (sube a Drive y pega el ID aquí)
const PAGO_IMAGEN_URL = "https://drive.google.com/uc?export=view&id=10OGt5AezcOJZwTA0B9K9kSlUlGeSLcCX";
// ↑ Sube la imagen a Drive → compartir → copiar enlace → pegar el ID aquí
// Formato: https://drive.google.com/uc?export=view&id=TU_ID

const PAGO_TEXTO = `💳 *Métodos de pago AQUA*

🔑 Llave Nequi / Daviplata: *313 720 0415*

🏦 Nequi: 313 720 0415
🏦 Daviplata: 313 720 0415
🏦 BBVA: 094 200 1072
🏦 Banco Agrario: 4697 4008 0637

Por favor envía el comprobante de pago 🧾 y en seguida confirmamos tu pedido 🐙`;

// ── UBICACIONES CON GOOGLE MAPS ──────────────────────────────────────────────
// Cómo conseguir tu link corto de Google Maps:
//   1. Abre Google Maps → busca tu tienda → clic en "Compartir" → "Copiar enlace"
//   2. Pega el enlace aquí abajo
const UBICACION_TORO = {
  texto:  `📍 *AQUA Toro*
Calle 11 con Cra. 5a, Toro (Valle del Cauca)
🕐 Lun-Sáb 9am-12:30 / 3pm-7pm | Dom 9am-1pm`,
  mapa:   "https://www.google.com/maps/dir//Aqualife,+Calle+11+con,+Cra.+5a,+Toro,+Valle+del+Cauca/@4.6116736,-76.0781136,17z",
};
const UBICACION_PEREIRA = {
  texto:  `📍 *AQUA Pereira*
Calle 26 #7-65, Pereira (Risaralda)
🕐 Lun-Sáb 10am-12:30 / 1:30pm-7pm | Dom 10am-1pm`,
  mapa:   "https://www.google.com/maps?q=Cl.+26+%237-65,+Pereira,+Risaralda",
};

// ── CLAUDE VISION (análisis de fotos de peces enfermos) ──────────────────────
// Si está en true, Pulpín analiza las fotos que mandan los clientes
// Si la foto es de un pez enfermo → detecta síntomas y recomienda medicamento
// Si es comprobante de pago → lo procesa como antes
const VISION_ACTIVO = true;

// Contador para rotar los mensajes mayoristas
let indicesMensajeMayorista = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// 📸 CATÁLOGO COMPLETO AQUA — CON IMÁGENES Y DESCRIPCIONES DE VENTA
// ═══════════════════════════════════════════════════════════════════════════════
//
// 📌 CÓMO AGREGAR TUS PROPIAS FOTOS:
//    1. Sube la foto a Google Drive → Compartir → "Cualquiera con el enlace"
//    2. Copia el ID del enlace (la parte larga entre /d/ y /view)
//    3. Reemplaza la URL con: https://drive.google.com/uc?export=view&id=TU_ID
//
//    Tus fotos reales venden MUCHO más que imágenes genéricas.
//
// 📌 CÓMO AGREGAR NUEVOS PRODUCTOS:
//    Copia un bloque existente y cambia: keywords, imagen, nombre, descripcion, precio
//
// ═══════════════════════════════════════════════════════════════════════════════

const CATALOGO = {

  // ─── PECES POPULARES ────────────────────────────────────────────────────────

  betta: {
    keywords: ["betta","beta","pez betta","pez beta","luchador","bettas machos","betta macho","betta hembra","betta fluorescente","betta dumbo","betta pequeño"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Betta_fish_%28Betta_splendens%29.jpg/800px-Betta_fish_%28Betta_splendens%29.jpg",
    nombre: "Betta 🐟",
    descripcion: "El pez más popular del mundo por sus colores únicos e irrepetibles. Vive solo en su propio acuario, no necesita filtro potente ni compañía. Ideal para principiantes, escritorios o salas. Tenemos machos, hembras, dumbos y fluorescentes.",
    precio: "Macho $17k | Dumbo $20k | Pequeño $15k | Fluorescente $22k | Hembra $8k | Hembra Dumbo $12k",
  },

  goldfish: {
    keywords: ["goldfish","gold fish","pez dorado","pez de colores","goldfish bronce","goldfish mediano","goldfish grande"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Goldfish3.jpg/800px-Goldfish3.jpg",
    nombre: "Goldfish 🐠",
    descripcion: "Los peces más queridos del mundo con más de 1000 años como mascotas. Aguantan agua fría sin calefactor, perfectos para acuarios decorativos de sala o jardín. Sociables, reconocen a su dueño y van bien en grupos.",
    precio: "Bronce $4k | Mediano $9k | Grande $30k",
  },

  bailarina: {
    keywords: ["bailarina","oranda","ranchu","red cap","bailarina burbuja","bailarina perla","goldfish velo","pez cola larga"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Goldfish_Oranda_Red_Cap.jpg/640px-Goldfish_Oranda_Red_Cap.jpg",
    nombre: "Bailarina / Fancy Goldfish 🎀",
    descripcion: "Las bailarinas son goldfish con colas largas y fluidas — pura elegancia en movimiento. La Oranda tiene el pompón en la cabeza, la Ranchu es redonda y la Burbuja tiene los ojos más curiosos del mundo acuático. Cada una es única.",
    precio: "Burbuja $7k | Red Cap $8k | Pequeña #1 $8k | Mediana #2 $13k | Grande #3 $18k | Grande #4 $22k | Oranda grande $30-70k | Perla $25k | Ranchu $15-20k",
  },

  telescopio: {
    keywords: ["telescopio","pez telescopio","ojos de burbuja","ojo telescopio"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/thirty/Black_telescope_goldfish.jpg/640px-Black_telescope_goldfish.jpg",
    nombre: "Telescopio 🔭",
    descripcion: "El goldfish más llamativo por sus enormes ojos saltones. Son un poco más delicados que otros goldfish — necesitan acuario sin decoraciones con bordes afilados. Su visión reducida los hace más tranquilos y fáciles de atrapar a la hora de alimentar.",
    precio: "#1 pequeño $7k | Mediano #2 $12k | Grande #3 $15k",
  },

  koi: {
    keywords: ["koi","koy","pez koi","carpa koi","koi pequeño","koi mediano","koi grande","koi de velo","estanque"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Koi_fish_%28Cyprinus_carpio%29_in_a_public_aquarium.jpg/800px-Koi_fish_%28Cyprinus_carpio%29_in_a_public_aquarium.jpg",
    nombre: "Koi 🎏",
    descripcion: "El pez más majestuoso para estanques y acuarios grandes. Pueden vivir más de 30 años y cada uno tiene un patrón de color único como huella dactilar. Simbolizan prosperidad y buena suerte en la cultura oriental.",
    precio: "Pequeño $8-9k | De velo $18k | Mediano 14cm $25k | Grande $65k",
  },

  tetra_neon: {
    keywords: ["tetra neón","tetra neon","neón","neon","pez neón","tetras","tetra rojo","tetra rubí","tetra diamante","tetra brillante","tetra verde","tetra cola de fuego","tetra dos puntos","tetra emperador","rodostomus","corazón sangrante"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Paracheirodon_innesi.jpg/800px-Paracheirodon_innesi.jpg",
    nombre: "Tetras 🔵",
    descripcion: "Los peces de banco más hermosos del mundo. Van en grupos de mínimo 6 — crean un efecto visual espectacular en el acuario. Pacíficos y compatibles con casi todo. Tenemos neón, rojo, rubí, diamante, brillante, cola de fuego, verde, rodostomus y más.",
    precio: "Neón/Rojo/Rubí/Verde $2k | Brillante $2k | Emperador $5k | Diamante $8k | Cola de fuego $15k | Rodostomus $3-4k",
  },

  guppy: {
    keywords: ["guppy","guppys","guppies","pez millones","guppy de línea","guppy grande","guppy alevín"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Poecilia_reticulata_male.jpg/800px-Poecilia_reticulata_male.jpg",
    nombre: "Guppy 🌈",
    descripcion: "El pez más colorido para acuarios comunitarios. Cada macho tiene un diseño de cola diferente. Son vivíparos — tienen crías vivas. Muy resistentes, ideales para principiantes. Los miércoles tenemos promo paga 2 lleva 3.",
    precio: "Grandes $3k | De línea $8k | Alevines $2k",
  },

  molly: {
    keywords: ["molly","mollys","molly balón","molly dalmata","molly negro","molly naranja","molly marmol","molly lira"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Poecilia_sphenops.jpg/640px-Poecilia_sphenops.jpg",
    nombre: "Molly 🖤",
    descripcion: "Los mollys son peces vivíparos muy robustos y coloridos. El Balón tiene el cuerpo redondeado muy llamativo, el Dálmata tiene manchas blancas y negras únicas. Son perfectos para acuarios comunitarios con guppys y platys.",
    precio: "Dalmata $3k | Balón naranja $6k | Balón negro $6k | Balón marmol $7k | Balón lira $7k",
  },

  platy: {
    keywords: ["platy","platys","platy azul","platy embarazada","pez platy"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Xiphophorus_maculatus.jpg/640px-Xiphophorus_maculatus.jpg",
    nombre: "Platy 🟠",
    descripcion: "Peces vivíparos muy coloridos y fáciles de cuidar. Perfectos para principiantes. Los miércoles tenemos promo paga 2 lleva 3 en platys. Son pacíficos y van bien con guppys, mollys y tetras.",
    precio: "Platy $3k | Azul $6k | Embarazada $5k",
  },

  pez_espada: {
    keywords: ["pez espada","espada","barbudos"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Xiphophorus_hellerii.jpg/640px-Xiphophorus_hellerii.jpg",
    nombre: "Pez Espada ⚔️",
    descripcion: "El pez espada tiene una cola en forma de espada que lo hace inconfundible. Son activos, saltarines — necesitan tapa en el acuario. Muy resistentes y coloridos, van bien en comunidades.",
    precio: "$3k",
  },

  escalar: {
    keywords: ["escalar","escalares","angel fish","angelfish","pez ángel","escalar negro","escalar golden","escalar velo","escalar mediano"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Pterophyllum_scalare.jpg/800px-Pterophyllum_scalare.jpg",
    nombre: "Escalar 👼",
    descripcion: "El pez más elegante del acuario tropical. Su forma triangular y aletas largas lo hacen inconfundible. Son cíclidos pacíficos que conviven bien con tetras grandes y corydoras. Ideales para acuarios desde 80L.",
    precio: "Pequeño $10k | Mediano $15k | Grande de velo $25k | Pareja $50k",
  },

  oscar: {
    keywords: ["oscar","óscar","pez oscar","oscar tigre","oscar cobre","oscar tigre mediano","oscar albino","oscar velo"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Astronotus_ocellatus.jpg/800px-Astronotus_ocellatus.jpg",
    nombre: "Óscar 🐠",
    descripcion: "El perro del mundo acuático — te reconoce, pide comida y tiene personalidad propia. Crece hasta 30cm, necesita acuario grande mínimo 200L. Va solo o en pareja de la misma especie. Cíclido con mucho carácter.",
    precio: "Tigre pequeño $30k | Tigre de velo $40k | Mediano $75k | Cobre mediano $40-55k",
  },

  ciclido: {
    keywords: ["cíclido","ciclido","polar blue","texano","delfín","soldado","vampiro","terror verde","ciclidos comerciales","acara blue","ciclido cabro"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Cichlasoma_nigrofasciatum.jpg/640px-Cichlasoma_nigrofasciatum.jpg",
    nombre: "Cíclidos 🔵",
    descripcion: "Gran familia de peces con personalidad fuerte. Los Polar Blue son pequeños y coloridos; los Texanos son más rústicos; los Soldados y Vampiros son para acuarios de especies grandes. El Terror Verde es uno de los más buscados.",
    precio: "Comercial $8k | Polar blue pequeño $3-4k | Grande $7k | Texano $5-6k | Soldado $10k | Vampiro $10k | Terror verde $20k | Acara Blue $25k",
  },

  arawana: {
    keywords: ["arawana","arahuana","arowana","pez dragón","dragon fish","arawana grande","arawana pequeña"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Silver_Arowana.jpg/800px-Silver_Arowana.jpg",
    nombre: "Arawana 🐉",
    descripcion: "El rey del acuario — puede saltar fuera del agua, siempre necesita tapa. Crece hasta 90cm en acuarios, requiere mínimo 500L de adulto. Muy territorial, va solo. En muchas culturas asiáticas simboliza buena suerte y prosperidad.",
    precio: "Pequeña $80k | Grande $110k",
  },

  raya: {
    keywords: ["raya","raya motoro","pez raya","mantarraya"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Potamotrygon_motoro.jpg/640px-Potamotrygon_motoro.jpg",
    nombre: "Raya Motoro 🎯",
    descripcion: "Una de las especies más exóticas y deseadas del mundo acuático. La Raya Motoro tiene un patrón de círculos dorados sobre fondo café oscuro único. Necesita acuario amplio y bajo. Animal de exhibición premium.",
    precio: "$130k",
  },

  ramirezis: {
    keywords: ["ramirezi","ramirezis","ramirezi de velo","ramirezi pequeño","pez mariposa","butterfl cichlid"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Mikrogeophagus_ramirezi.jpg/640px-Mikrogeophagus_ramirezi.jpg",
    nombre: "Ramirezi 🦋",
    descripcion: "El cíclido enano más bello del mundo. Sus colores azules eléctricos con toques rojos y amarillos son espectaculares. A pesar de ser cíclidos son pacíficos y van bien en acuarios comunitarios bien plantados. Muy buscado por coleccionistas.",
    precio: "Pequeño $3k | De velo $15k",
  },

  monja: {
    keywords: ["monja","monjas","monja albina","monja de colores","monja tigre","monja hibrida","pez monja"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Gymnocorymbus_ternetzi.jpg/640px-Gymnocorymbus_ternetzi.jpg",
    nombre: "Monja 🖤",
    descripcion: "Las monjas son tetras de cuerpo plano muy elegantes, en blanco y negro. Las tenemos de colores, albinas y tigre. Muy fáciles de cuidar y van bien en grupos. Los martes y jueves tenemos promo paga 2 lleva 3 en monjas.",
    precio: "De colores $7k | Albina $3k | Tigre/Hibrida $9k",
  },

  corroncho: {
    keywords: ["corroncho","pleco","limpiador","corroncho piña","corroncho cebra","corroncho lápiz","lapicero","corroncho albino","cucha real","loricaria","lorycaria","otocinclus","dora","dora puntos","dora raya"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Hypostomus_plecostomus.jpg/800px-Hypostomus_plecostomus.jpg",
    nombre: "Corronchos y Limpiadores 🪨",
    descripcion: "El conserje del acuario — limpia algas del vidrio y come los restos del fondo. Pacíficos y compatibles con todo tipo de peces. El Otocinclus es el más pequeño y delicado para acuarios plantados; la Cucha Real es la más grande y elegante.",
    precio: "Comercial $6k | Piña $5k | Lápiz/Lapicero $4-5k | Cebra $14k | Punto de oro $32k | Otocinclus $2k | Cucha real $50k | Dora puntos/raya $6k",
  },

  corydoras: {
    keywords: ["corydora","corydoras","cory","pez fondo","corydora con color"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Corydoras_aeneus.jpg/640px-Corydoras_aeneus.jpg",
    nombre: "Corydoras 🐾",
    descripcion: "Los corydoras son los limpiadores de fondo más populares del mundo. Van en grupos mínimo de 4, exploran el sustrato en busca de alimento. Pacíficos con todo, no dañan plantas y son muy activos durante el día.",
    precio: "$6k | Promo 2 x $10k",
  },

  camaron: {
    keywords: ["camarón","camarones","camarón fantasma","gambas","gambas fantasmas","gambas cherry","camarones fantasmas","cherry"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Ghost_shrimp.jpg/640px-Ghost_shrimp.jpg",
    nombre: "Camarones 🦐",
    descripcion: "Los camarones son animales fascinantes que limpian el acuario naturalmente. Los Fantasmas son transparentes — puedes ver todo su interior. Las Cherry son rojas brillantes y muy decorativas. Van bien con tetras y rasboras pequeños.",
    precio: "Fantasmas $4k | Cherry variable",
  },

  caracol: {
    keywords: ["caracol","caracol manzano","caracol morado","snail"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Pomacea_bridgesii.jpg/640px-Pomacea_bridgesii.jpg",
    nombre: "Caracoles 🐌",
    descripcion: "Los caracoles manzano son los favoritos del acuario — limpian algas, detritos y sobras de comida. Los morados son más escasos y llamativos. Son pacíficos con todos los peces y plantas.",
    precio: "Manzano $3k | 2x $5k | Morado $6k",
  },

  cangrejo: {
    keywords: ["cangrejo","cangrejos","crustáceo"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Freshwater_crab.jpg/640px-Freshwater_crab.jpg",
    nombre: "Cangrejos 🦀",
    descripcion: "Los cangrejos de agua dulce son uno de los animales más curiosos y entretenidos para el acuario. Son territoriales, así que mejor uno por acuario o acuarios bien divididos con escondites.",
    precio: "$18k | 2 x $24k",
  },

  hamster: {
    keywords: ["hamster","hámster","hamsters","hámsters","ruso","sirio","angora","hamster ruso","hamster sirio","hamster angora","roedor","pareja hamster"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Hamster_blanc.jpg/800px-Hamster_blanc.jpg",
    nombre: "Hámster 🐹",
    descripcion: "La mascota perfecta para apartamento. Son independientes, limpios y activos en la noche. El Ruso es el más pequeño y sociable; el Sirio el más fácil de manipular; el Angora el más peludo y llamativo. Los tenemos en pareja también.",
    precio: "Ruso $18k | Pareja rusos $50k | Sirio $20k | Angora $25k",
  },

  tiburon: {
    keywords: ["tiburón","tiburon","tiburon colombiano","tiburon tigrillo","tiburones 4 rayas","tiburón 4 rayas"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Balantiocheilus_melanopterus.jpg/640px-Balantiocheilus_melanopterus.jpg",
    nombre: "Tiburón de agua dulce 🦈",
    descripcion: "Llamados tiburones por su forma aerodinámica y su nado veloz. El de 4 Rayas es el más popular — sus líneas negras sobre plateado son elegantísimas. El Colombiano es más robusto. Necesitan espacio para nadar.",
    precio: "Colombiano $7k | 4 rayas pequeño $7k | 4 rayas mediano $8k | Tigrillo $14k",
  },

  cebrita: {
    keywords: ["cebrita","cebritas","danio","danio malabaricus","pez cebra"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Danio_rerio_-_side_%28aka%29.jpg/640px-Danio_rerio_-_side_%28aka%29.jpg",
    nombre: "Cebritas / Danio 🦓",
    descripcion: "Las cebritas son de los peces más resistentes y activos del acuario. Sus rayas horizontales y su velocidad de nado las hacen muy llamativas en grupos. Soportan variaciones de temperatura y son perfectas para principiantes.",
    precio: "Cebrita $3-4k | Danio Malabaricus $7k",
  },

  barbus: {
    keywords: ["barbus","barbo","barbus sumatrano","barbus rojo"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Puntigrus_tetrazona_-_side_%28aka%29.jpg/640px-Puntigrus_tetrazona_-_side_%28aka%29.jpg",
    nombre: "Barbus 🐠",
    descripcion: "Los barbus sumatranos son peces ágiles y coloridos que nadan en bancos. El rojo fluorescente es especialmente llamativo bajo luz LED. Son algo activos y pueden molestar peces con aletas largas — mejor con especies similares.",
    precio: "Sumatrano $7k | Rojo $8-10k",
  },

  pez_globo: {
    keywords: ["pez globo","globo amazónico","peces globo","pez globo amazónico"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Carinotetraodon_travancoricus.jpg/640px-Carinotetraodon_travancoricus.jpg",
    nombre: "Pez Globo Amazónico 🎈",
    descripcion: "Uno de los peces más curiosos y con más personalidad del acuario. Puede inflar su cuerpo cuando se asusta y tiene dientes que usa para comer caracoles y crustáceos. Va mejor solo o con peces de tamaño similar.",
    precio: "$18k | 2 x $24k",
  },

  falso_disco: {
    keywords: ["falso disco","disco","falsos discos","disco albino"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Symphysodon_discus.jpg/640px-Symphysodon_discus.jpg",
    nombre: "Falso Disco 💿",
    descripcion: "El falso disco tiene la forma característica circular del disco verdadero pero es más fácil de cuidar y resistente. Pez de exhibición por excelencia. Sus colores y forma redonda lo hacen el centro de atención de cualquier acuario.",
    precio: "$18k | Albino $20k",
  },

  apistograma: {
    keywords: ["apistograma","apistogramas","apostograma"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Apistogramma_cacatuoides.jpg/640px-Apistogramma_cacatuoides.jpg",
    nombre: "Apistograma 🦜",
    descripcion: "Cíclido enano con colores espectaculares — amarillos, rojos y azules combinados en un pez pequeño. Son territoriales pero manejables en acuarios bien plantados con escondites. Muy apreciados por acuaristas con experiencia.",
    precio: "$18k | 2 x $26k",
  },

  // ─── QUÍMICOS E IMPLEMENTOS ─────────────────────────────────────────────────

  ich_tratamiento: {
    keywords: ["ich","ick","punto blanco","puntitos blancos","white spot","puntos blancos","sal en el pez","gotero white spot","tarro white spot","anti hongo"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Ichthyophthirius_multifiliis.jpg/640px-Ichthyophthirius_multifiliis.jpg",
    nombre: "Tratamiento Ich / Punto Blanco 💊",
    descripcion: "El Ich o Punto Blanco es el parásito más común — esos granitos blancos como sal en el cuerpo del pez. Se trata con White Spot o Verde de Malaquita. Hay que subir temperatura a 28°C y tratar todo el acuario durante 7 días.",
    precio: "Anti hongo ICK $5k | Gotero White Spot $7k | Tarro White Spot $30k | Verde malaquita $5k",
  },

  bacterias_nitrificantes: {
    keywords: ["bacterias nitrificantes","bacterias","ciclar","acuario nuevo","ciclado","amoniaco alto","amoniaco","nitrificantes","nitratos"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Aquarium_with_plants_and_fish.jpg/800px-Aquarium_with_plants_and_fish.jpg",
    nombre: "Bacterias Nitrificantes 🧫",
    descripcion: "La inversión más importante al comprar un acuario nuevo. Sin bacterias nitrificantes el amoniaco sube y los peces mueren en días. Una botella siembra el filtro en 24-48h y hace el trabajo que normalmente toma 4-6 semanas.",
    precio: "$10k — imprescindible para todo acuario nuevo",
  },

  paraguard: {
    keywords: ["paraguard","pez enfermo","pez apagado","no come","enfermedad","medicamento","no sé qué tiene"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Sick_fish.jpg/640px-Sick_fish.jpg",
    nombre: "Paraguard — Todo en Uno 🛡️",
    descripcion: "El comodín cuando no sabes exactamente qué tiene tu pez. Ataca parásitos, hongos y bacterias al mismo tiempo. Ideal cuando ves al pez apagado, sin apetito o con comportamiento raro pero sin síntoma claro.",
    precio: "$12k",
  },

  furan_green: {
    keywords: ["furan","furan green","aletas","fin rot","aletas deshilachadas","aleta podrida","aleta cortada","pudrición aleta"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Fish_with_fin_rot.jpg/640px-Fish_with_fin_rot.jpg",
    nombre: "Furan Green — Fin Rot 🌿",
    descripcion: "El tratamiento específico para Fin Rot o pudrición de aletas — cuando ves las aletas deshilachadas, con bordes blancos o que se van 'comiendo'. Antibacteriano que actúa rápido. Tratar todo el acuario durante 5-7 días.",
    precio: "$8k",
  },

  eliminador_amoniaco: {
    keywords: ["amoniaco","boquea","boquear","superficie","gasping","pez boquea","amoniaco alto","emergencia"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Aquarium_fish_gasping.jpg/640px-Aquarium_fish_gasping.jpg",
    nombre: "Eliminador de Amoniaco ⚠️",
    descripcion: "EMERGENCIA: Si tu pez boquea en la superficie es señal de amoniaco alto — actúa ya. Haz un cambio de agua del 30-50% inmediatamente y agrega eliminador de amoniaco. Revisa que el filtro esté funcionando y no sobrealimentes.",
    precio: "$10k",
  },

  anticloro: {
    keywords: ["anticloro","cloro","agua del grifo","dechlorinador","acondicionador de agua","cambio de agua"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/thirty/Water_drop_small.jpg/640px-Water_drop_small.jpg",
    nombre: "Anticloro 💧",
    descripcion: "Obligatorio en cada cambio de agua. El cloro del grifo mata las bacterias benéficas del filtro y quema las branquias de los peces. Solo unas gotas neutralizan el cloro de todo el agua nueva en segundos.",
    precio: "$2k — el producto que nunca debe faltar",
  },

  azul_metileno: {
    keywords: ["azul de metileno","metileno","cuarentena","antiséptico","antifungico","hongo","fungus"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Methylene_blue_solution.jpg/640px-Methylene_blue_solution.jpg",
    nombre: "Azul de Metileno 💙",
    descripcion: "El desinfectante clásico del acuario. Ideal para cuarentena de peces nuevos durante 7-14 días antes de introducirlos al acuario principal. También funciona contra hongos superficiales. Tiñe el agua de azul temporalmente.",
    precio: "$2-3k",
  },

  refloxacina: {
    keywords: ["refloxacina","antibiótico","infección grave","bacteria grave","refloxacin"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Pills_antibiotics.jpg/640px-Pills_antibiotics.jpg",
    nombre: "Refloxacina — Antibiótico 💉",
    descripcion: "El antibiótico de amplio espectro más potente que tenemos. Para infecciones bacterianas graves cuando otros tratamientos no funcionan. No usar sin diagnóstico claro — destruye bacterias benéficas del filtro, luego agregar bacterias nitrificantes.",
    precio: "$10k",
  },

  stres_guard: {
    keywords: ["stres guard","estrés","stress","transporte","aclimatación","antiestrés","stresguar"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Aquarium_fish_acclimation.jpg/640px-Aquarium_fish_acclimation.jpg",
    nombre: "Stres Guard — Antiestrés 🧘",
    descripcion: "Reduce el estrés al transportar peces, al aclimatar nuevas especies o luego de tratamientos. Recubre las escamas con una capa protectora. Imprescindible al comprar peces nuevos y mezclar con los del acuario.",
    precio: "$10k",
  },

  fertiplan: {
    keywords: ["fertiplan","fertilizante","plantas naturales","fertilizar","plantas acuáticas","nutrientes plantas"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Planted_aquarium.jpg/800px-Planted_aquarium.jpg",
    nombre: "Fertiplan — Fertilizante 🌱",
    descripcion: "El fertilizante líquido para plantas naturales del acuario. Aporta los nutrientes que el agua sola no puede dar. Las plantas crecen más rápido, con colores más intensos y absorben mejor los nitratos — beneficiando también a los peces.",
    precio: "$6k",
  },

  test_ph: {
    keywords: ["test ph","ph","medir ph","medidor ph","acidez","alcalinidad","test","tiras ph","amoniaco test"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/PH_strip.jpg/640px-PH_strip.jpg",
    nombre: "Tests y Medidores 🧪",
    descripcion: "Monitorear el agua es la clave para que los peces estén sanos. El pH ideal es 6.5-7.5, el amoniaco y nitritos deben estar en 0. Las tiras son rápidas para revisión diaria; el test líquido es más preciso; el electrónico el más exacto.",
    precio: "Tiras $700 c/u | Paquete 10 tiras $5k | Test pH líquido $12k | Test amoniaco $20k | Electrónico $60k",
  },

  kit_botiquin: {
    keywords: ["kit botiquín","kit botiquin","botiquín","primeros auxilios acuario","kit básico","principiante"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/First_aid_kit.jpg/640px-First_aid_kit.jpg",
    nombre: "Kit Botiquín AQUA 🧰",
    descripcion: "El kit de primeros auxilios para acuaristas principiantes. Incluye los químicos esenciales para los problemas más comunes. La mejor inversión para quien está empezando — todo lo básico en un solo paquete a precio especial.",
    precio: "$15-18k",
  },

  verde_malaquita: {
    keywords: ["verde de malaquita","malaquita","velvet","terciopelo","puntos dorados"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Malachite_green_solution.jpg/640px-Malachite_green_solution.jpg",
    nombre: "Verde de Malaquita 🟢",
    descripcion: "Antiparasitario potente contra Ich, Velvet (puntos dorados como polvo) y algunos hongos. Más agresivo que el White Spot, usar con cuidado en la dosis indicada. Muy efectivo cuando el Ich no responde a otros tratamientos.",
    precio: "$5k",
  },

  sal_marina: {
    keywords: ["sal marina","sal","special sal","sal acuario"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Salt.jpg/640px-Salt.jpg",
    nombre: "Sal Marina 🧂",
    descripcion: "La sal marina para acuario reduce el estrés, ayuda contra enfermedades leves y mejora la producción de moco protector. Útil en tratamientos de Ich y Fin Rot como complemento. La Special Sal T es la versión premium con más minerales.",
    precio: "Marina $1k | Special Sal T $16k",
  },

  // ─── ALIMENTOS / CUIDO ──────────────────────────────────────────────────────

  hojuelas_claras: {
    keywords: ["hojuelas claras","hojuela clara","comida tropical","alimento tropical","cuido tropical","alimento peces","comida peces"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Fish_flakes.jpg/640px-Fish_flakes.jpg",
    nombre: "Hojuelas Claras 🟡",
    descripcion: "El alimento base para peces tropicales de superficie: tetras, guppys, mollys, platys, escalares. Fórmula balanceada con proteínas, vitaminas y minerales. Pequeñas para bocas chicas, grandes para peces medianos.",
    precio: "Pequeñas $1k | Grandes $3k",
  },

  hojuelas_oscuras: {
    keywords: ["hojuelas oscuras","hojuela oscura","cuido cíclido","alimento cíclido","comida agresivos"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Cichlid_pellets.jpg/640px-Fish_flakes.jpg",
    nombre: "Hojuelas Oscuras 🟤",
    descripcion: "Alimento para peces carnívoros y cíclidos. Mayor contenido proteico que las hojuelas claras. Para oscares, cíclidos, peces agresivos y todos los que necesitan más proteína en su dieta.",
    precio: "Pequeñas $2k | Grandes $10k",
  },

  tetracolor: {
    keywords: ["tetracolor","tetra color","potenciador de color","realzar colores","intensificar colores"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Colorful_tropical_fish.jpg/640px-Colorful_tropical_fish.jpg",
    nombre: "Tetracolor — Potenciador de Color 🌈",
    descripcion: "Alimento con carotenoides que intensifica los colores rojos, naranjas y amarillos de los peces. Alimentar 2-3 veces por semana junto al alimento habitual. Resultados visibles en 2-3 semanas. Para guppys, platys, betas y todos los peces de colores.",
    precio: "Pequeño $2k | Grande $10k",
  },

  flotante: {
    keywords: ["flotante","laguna","cuido goldfish","cuido koi","alimento goldfish","comida koi","flotante goldfish"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/k/kf/Koi_pellets.jpg/640px-Fish_flakes.jpg",
    nombre: "Flotante / Laguna — Goldfish y Koi 🐟",
    descripcion: "Alimento flotante especial para goldfish, koi, bailarinas y telescopios. Formulado para la digestión de peces de agua fría con menor temperatura corporal. Los pellets flotan para que los peces los vean y los coman fácil.",
    precio: "Pequeño $1k | Grande $3k",
  },

  fin_semana: {
    keywords: ["fin de semana","weekend","bloque","vacaciones","ausentarse","2 días","3 días","me voy"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Weekend_feeder_block.jpg/640px-Fish_flakes.jpg",
    nombre: "Fin de Semana 📅",
    descripcion: "Bloque de alimento de liberación lenta para cuando te ausentas 2-3 días. Se disuelve gradualmente y alimenta los peces sin que nadie tenga que estar presente. No sobrealimenta ni ensucia el agua.",
    precio: "$3.5k | 2 x $5k",
  },

  cuido_fondo: {
    keywords: ["cuido de fondo","alimento fondo","tabletas","pastillas","corydoras","pleco","fondo","pellets fondo"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Sinking_pellets.jpg/640px-Fish_flakes.jpg",
    nombre: "Cuido de Fondo / Tabletas 🪨",
    descripcion: "Tabletas que se hunden al fondo para alimentar corydoras, corronchos y todos los peces que comen en el sustrato. Las hojuelas flotantes nunca llegan al fondo — estos peces necesitan su propio alimento.",
    precio: "Pequeño $6k | Tarro $25k",
  },

  cuido_cíclidos: {
    keywords: ["cuido cíclidos","alimento cíclidos","pellets cíclidos","cuido oscar","cuido para oscares","cuido agresivos","tarro agresivos","cuido discos"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Cichlid_food.jpg/640px-Fish_flakes.jpg",
    nombre: "Cuido para Cíclidos y Agresivos 🦁",
    descripcion: "Pellets de alta proteína para cíclidos, oscares, arawanas y peces agresivos grandes. Más duros y nutritivos que las hojuelas. El Tarro Premium para Agresivos tiene la mejor fórmula del mercado para peces grandes.",
    precio: "Cíclidos pequeño $3k | Mediano $10k | Tarro $35k | Oscares $6k | Tarro agresivos $70-80k | Tarro discos $50k",
  },

  alimento_vivo: {
    keywords: ["alimento vivo","tubiflex","gusano","gusano de avena","larvas","larvas secas","vivo"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Tubifex_worms.jpg/640px-Fish_flakes.jpg",
    nombre: "Alimento Vivo y Natural 🪱",
    descripcion: "El alimento que hace que los peces enloquezcan — estimula el instinto de caza y mejora los colores. El Tubiflex lo comen casi todos los peces. El Gusano de Avena es ideal para hámsters. Las larvas secas son convenientes y duraderas.",
    precio: "Alimento vivo 5und $3k | 10und $5k | Tubiflex $5-6k | Gusano avena $8k | Larvas secas $10-12k | Camarones disecados $32k",
  },

  cuido_hamster: {
    keywords: ["cuido hámster","cuido hamster","comida hámster","alimento hámster","semillas hamster","moritas"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Hamster_food_mix.jpg/640px-Fish_flakes.jpg",
    nombre: "Cuido para Hámster 🌾",
    descripcion: "Mezcla balanceada de semillas, granos y pellets para hámsters. El Cuido Hámster es la dieta base; las Moritas son el snack favorito. Una dieta variada mantiene al hámster activo, sano y con pelo brillante.",
    precio: "Cuido hámster $5k | Moritas $12k",
  },

  cuido_tortuga: {
    keywords: ["cuido tortuga","alimento tortuga","comida tortuga","pellets tortuga"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Turtle_food.jpg/640px-Fish_flakes.jpg",
    nombre: "Cuido para Tortuga 🐢",
    descripcion: "Pellets especialmente formulados para tortugas acuáticas con la proporción correcta de proteínas y calcio para el caparazón. Las tortugas no pueden digerir bien los alimentos para peces — necesitan su propio alimento.",
    precio: "$8k",
  },

  color_fish: {
    keywords: ["color fish","colorfish","bonus color","potenciador premium"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Colorful_tropical_fish.jpg/640px-Colorful_tropical_fish.jpg",
    nombre: "Color Fish — Premium 🏆",
    descripcion: "El alimento premium de AQUA con el mayor contenido de carotenoides del mercado. Intensifica todos los colores de los peces — rojos más rojos, azules más brillantes, amarillos más vivos. Resultados notables en menos de un mes.",
    precio: "Pequeño $6k | Tarro $85k",
  },

  // ─── ACUARIOS ───────────────────────────────────────────────────────────────

  acuario: {
    keywords: ["acuario","pecera","tanque","bettera","acuario pequeño","acuario mediano","acuario grande","acuario con tapa","tortugario"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Aquarium_-_melbourne_zoo.jpg/800px-Aquarium_-_melbourne_zoo.jpg",
    nombre: "Acuarios AQUA 🌊",
    descripcion: "Desde betteras para escritorio hasta acuarios grandes para sala. Todos en vidrio de calidad. Un acuario más grande es más fácil de mantener — el agua se estabiliza mejor y los peces tienen más espacio. Te asesoramos según los peces que quieras.",
    precio: "Bettera plástica $20k | Bettera vidrio $45k | Pequeño $55-60k | Mediano $75k | Con tapa $122k | Grande largo $150k | Grande alto $200k | Tortugario $95k",
  },

  // ─── FILTROS ────────────────────────────────────────────────────────────────
  // 📌 PENDIENTE: reemplaza las URLs de imagen con tus enlaces de Google Drive
  //    cuando los tengas. Formato: https://drive.google.com/uc?export=view&id=TU_ID

  filtro_pequeno: {
    keywords: ["filtro pequeño","filtro para bettera","filtro 30 litros","filtro 40 litros","filtro 50 litros","filtro 60 litros","filtro 70 litros","filtro barato","filtro económico","filtro wp-377","sobo 400","filtro 400 litros"],
    imagen: "https://drive.google.com/uc?export=view&id=1eJPdU0CL5eStFVeCPPywCRE5CNQcEXdn",
    // ↑ reemplaza con tu URL de Drive cuando la tengas
    nombre: "Filtro Sumergible 400 L/h 🌀",
    descripcion: "Filtro sumergible SOBO WP-377F — ideal para acuarios de 30 a 70 litros. Agua cristalina, más oxígeno y peces más sanos. Compacto, silencioso y fácil de instalar. Perfecto para bettas, goldfish pequeños y acuarios de sala.",
    precio: "$37.000",
  },

  filtro_mediano: {
    keywords: ["filtro mediano","filtro 600","filtro 80 litros","filtro 100 litros","filtro 120 litros","filtro 150 litros","filtro 3 en 1","filtro aireación","filtro circulación","sobo 600"],
    imagen: "https://drive.google.com/uc?export=view&id=1MvyeUPCgQWrOpUimcJnLxqLPhGIthLHe",
    // ↑ reemplaza con tu URL de Drive cuando la tengas
    nombre: "Filtro Sumergible 600 L/h 3 en 1 💧",
    descripcion: "Filtro sumergible 600 L/h para acuarios de 60 a 150 litros. Triple función: filtra, airea y circula el agua en un solo equipo. Silencioso, eficiente y muy fácil de usar. El más vendido para acuarios medianos.",
    precio: "$60.000",
  },

  filtro_grande: {
    keywords: ["filtro grande","filtro potente","filtro 1500","filtro 200 litros","filtro 300 litros","filtro oscar","filtro arawana","filtro para peces grandes","sobo 1500","filtro cíclidos"],
    imagen: "https://drive.google.com/uc?export=view&id=1QfuG2CQ6ITcnFS-XllQuMOnWq3M7Hm3v",
    // ↑ reemplaza con tu URL de Drive cuando la tengas
    nombre: "Filtro Sumergible 1500 L/h 🔱",
    descripcion: "Filtro sumergible SOBO 1500 L/h — para acuarios grandes con oscares, arawanas, cíclidos o comunidades numerosas. Alta potencia, bajo consumo de energía. Agua limpia y saludable para peces exigentes.",
    precio: "$95.000",
  },

  filtro_general: {
    keywords: ["filtro","filtración","cascada","filtro espuma","filtro cascada","motor","bomba","necesito filtro","qué filtro","cuál filtro"],
    imagen: "https://drive.google.com/uc?export=view&id=1eJPdU0CL5eStFVeCPPywCRE5CNQcEXdn",
    nombre: "Filtros AQUA 💧",
    descripcion: "Tenemos filtros para todos los tamaños de acuario. El tamaño correcto depende de los litros que tenga tu acuario — cuéntame cuántos litros tiene o las medidas (largo x ancho x alto en cm) y te digo cuál es el ideal.",
    precio: "400 L/h (30-70L) $37k | 600 L/h (60-150L) $60k | 1500 L/h (150L+) $95k",
  },

  termostato: {
    keywords: ["termostato","calefactor","calentar agua","temperatura","agua fría","calentador"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Aquarium_heater.jpg/640px-Aquarium_filter.jpg",
    nombre: "Termostato / Calefactor 🌡️",
    descripcion: "Los peces tropicales necesitan temperatura estable entre 24-27°C. Sin calefactor el agua baja en las noches y los peces se enferman. El de 25W es para acuarios hasta 60L; el de 50W para hasta 100L.",
    precio: "25W $32-35k | 50W $38-40k",
  },

  luz_acuario: {
    keywords: ["luz","luces","iluminación","t4","t6","luz sumergible","mini light","t-2","led acuario"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Aquarium_lighting.jpg/640px-Aquarium_filter.jpg",
    nombre: "Luces para Acuario 💡",
    descripcion: "Una buena iluminación hace que los colores de los peces brillen y permite tener plantas naturales. La T-4 es perfecta para acuarios medianos; la T-6 para grandes. Las plantas naturales necesitan al menos 8 horas de luz al día.",
    precio: "Mini Light $25k | T-2 $32-38k | T-4 $46k | T-6 $58k | Bicolor sumergible $20k",
  },

  // ─── PLANTAS NATURALES ──────────────────────────────────────────────────────

  plantas_naturales: {
    keywords: ["planta natural","plantas naturales","ambulia","cabomba","anubia","vallisneria","hygrophila","rótala","alternanthera","ludwigia","bacopa","sagitaria","eligeria","planta flotante","planta con raiz"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Planted_aquarium.jpg/800px-Planted_aquarium.jpg",
    nombre: "Plantas Naturales 🌿",
    descripcion: "Las plantas naturales oxigenan, absorben nitratos y crean un ecosistema vivo. La Ambulia y Cabomba son fáciles para principiantes; la Anubia Barteri Nana es prácticamente indestructible y se ata a rocas; la Rótala da un toque de color rojo espectacular.",
    precio: "Ambulia $3-5k | Cabomba $6-12k | Anubia nana $38k | Hygrophila $12k | Vallisneria $15k | Rótala $3-12k | Alternanthera roja $12k | Ludwigia $15-17k | Flotantes $3-5k",
  },

  // ─── ACCESORIOS HÁMSTER ─────────────────────────────────────────────────────

  accesorios_hamster: {
    keywords: ["jaula hamster","jaula hámster","rueda hamster","rueda hámster","bola hamster","bebedero hamster","comedero hamster","viruta","arena chinchilla","nido","transportadora hamster"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Hamster_cage.jpg/640px-Aquarium_filter.jpg",
    nombre: "Accesorios para Hámster 🏠",
    descripcion: "Todo lo que necesita tu hámster para estar feliz: jaula con espacio para correr, rueda para ejercicio nocturno, bola para explorar fuera de la jaula, bebedero que no moje la viruta, y nido para dormir cómodo.",
    precio: "Jaula pequeña $60k | Mediana $95-180k | Transportadora $56k | Rueda $15-24k | Bola $15-20k | Bebedero $9-22k | Viruta $4-5k | Arena chinchilla $5-25k | Nido peluche $20k",
  },

  // ─── IMPLEMENTOS DE LIMPIEZA ────────────────────────────────────────────────

  limpieza: {
    keywords: ["sifón","aspiradora","limpia vidrios","limpia vidrio","kit limpieza","nasa","nasa red","red atrapar","limpiar acuario"],
    imagen: "https://upload.wikimedia.org/wikipedia/commons/thumb/s/s3/Aquarium_maintenance.jpg/640px-Aquarium_filter.jpg",
    nombre: "Implementos de Limpieza 🧹",
    descripcion: "El mantenimiento semanal del acuario es clave para la salud de los peces. El sifón limpia el fondo aspirando desechos; el limpiador de vidrio elimina algas sin rayar; las nasas (redes) permiten atrapar peces sin lastimarlos.",
    precio: "Sifón $20k | Limpia vidrios pequeño $15k | Grande $20k | Kit limpieza completo $40-42k | Nasas desde $5k",
  },

};

// ═══════════════════════════════════════════════════════════════════════════════
// 🔍 DETECTAR PRODUCTOS EN EL MENSAJE
// ═══════════════════════════════════════════════════════════════════════════════

function detectarProductos(texto) {
  const lower = texto.toLowerCase();
  const encontrados = [];

  for (const [clave, producto] of Object.entries(CATALOGO)) {
    if (producto.keywords.some((kw) => lower.includes(kw))) {
      encontrados.push(clave);
    }
  }

  return encontrados;
}

// ─── ENVIAR IMAGEN CON DESCRIPCIÓN ───────────────────────────────────────────
async function enviarImagenProducto(userNumber, claveProducto) {
  // Imágenes desactivadas temporalmente — Pulpín responde solo con texto y precios
  // Para reactivar: sube tus propias fotos a Google Drive, pega los IDs en el catálogo
  // y quita este return
  return;
}

// ─── MEJORA B: UPSELL INTELIGENTE ───────────────────────────────────────────
// Cuando alguien compra X, Pulpín sugiere Y de forma natural
// Se activa justo después de anotar el primer producto en el carrito
const UPSELL_MAP = {
  // Peces → necesitan su kit de inicio
  betta:          { producto: "bettera de vidrio",         motivo: "para que tu betta esté cómodo y luzca increíble" },
  goldfish:       { producto: "bacterias nitrificantes y anticloro", motivo: "esenciales para que el agua esté lista desde el primer día" },
  koi:            { producto: "alimento flotante Laguna y bacterias nitrificantes", motivo: "los koi los necesitan desde el inicio" },
  escalar:        { producto: "termostato 25W",            motivo: "los escalares necesitan agua a 26°C estable" },
  oscar:          { producto: "cuido para óscares y filtro 1500L/h", motivo: "los óscares comen mucho y ensucian rápido" },
  tetra_neon:     { producto: "tetracolor para intensificar sus colores", motivo: "con este alimento sus colores brillan el doble" },
  guppy:          { producto: "tetracolor",                motivo: "potencia los colores de los machos notablemente" },
  ciclido:        { producto: "cuido para cíclidos",       motivo: "tienen necesidades proteicas específicas" },
  arawana:        { producto: "filtro 1500L/h",            motivo: "las arawanas necesitan filtración potente" },
  // Acuarios → necesitan el kit básico
  acuario:        { producto: "bacterias nitrificantes + anticloro + termómetro", motivo: "son el kit esencial para arrancar bien cualquier acuario nuevo" },
  // Filtros → necesitan acondicionamiento
  filtro_pequeno: { producto: "bacterias nitrificantes",   motivo: "ayudan al filtro nuevo a funcionar desde el día 1" },
  filtro_mediano: { producto: "bacterias nitrificantes",   motivo: "aceleran el ciclo del filtro y protegen los peces" },
  filtro_grande:  { producto: "bacterias nitrificantes",   motivo: "esenciales para arrancar cualquier filtro nuevo" },
  // Químicos de tratamiento → sugieren el combo
  ich_tratamiento:    { producto: "sal marina Special Sal T", motivo: "potencia el tratamiento y reduce el estrés del pez" },
  bacterias_nitrificantes: { producto: "test de amoniaco", motivo: "así confirmas que el ciclo está completo" },
  // Hámster → necesitan el kit
  hamster:        { producto: "jaula mediana + rueda + viruta", motivo: "el combo esencial para que esté feliz desde el inicio" },
};

// Se llama cuando Claude anota algo en el carrito por primera vez
function getUpsell(productosDetectados) {
  for (const clave of productosDetectados) {
    if (UPSELL_MAP[clave]) return UPSELL_MAP[clave];
  }
  return null;
}

// ─── ENVIAR MÉTODOS DE PAGO ──────────────────────────────────────────────────
async function enviarMetodosPago(userNumber) {
  try {
    // Primero enviar el texto con los datos
    await axios.post(`${WHAPI_URL}/messages/text`,
      { to: userNumber, body: PAGO_TEXTO },
      { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
    );

    // Luego enviar la imagen si está configurada
    if (PAGO_IMAGEN_URL && PAGO_IMAGEN_URL !== "PENDIENTE_URL_METODOS_PAGO") {
      await new Promise(r => setTimeout(r, 800)); // pequeña pausa entre mensajes
      await axios.post(`${WHAPI_URL}/messages/image`,
        {
          to:      userNumber,
          image:   PAGO_IMAGEN_URL,
          caption: "📱 Escanea el QR de Nequi o usa los datos de arriba 🐙",
        },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );
    }
    console.log(`💳 Métodos de pago enviados → ${userNumber}`);
  } catch (err) {
    console.error("❌ Error enviando métodos de pago:", err.response?.data || err.message);
  }
}

// ─── FRASES QUE ACTIVAN LA PAUSA ─────────────────────────────────────────────
const FRASES_PAUSA = [
  "quiero hablar con una persona","quiero hablar con alguien",
  "hablar con un humano","hablar con un asesor","asesor real",
  "persona real","operador","asistente real","hablar con estevan",
  "hablar con keneth","me comunicas","comunícame",
  "comunicame con un asesor","quiero un asesor","necesito un asesor",
  "con una persona","asesor por favor","necesito ayuda humana",
  "hablar con alguien","quiero hablar","me puedes comunicar",
];

function debePonerEnPausa(texto) {
  return FRASES_PAUSA.some((f) => texto.toLowerCase().includes(f));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🐙 SYSTEM PROMPT OPTIMIZADO (~750 tokens)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── MEJORA 4: RESPUESTAS RÁPIDAS SIN LLAMAR A CLAUDE ───────────────────────
// Estas preguntas se responden directamente — ahorra hasta 50% de llamadas a la API
const RESPUESTAS_RAPIDAS = [
  {
    keywords: ["hora","horario","abren","cierran","atienden","están abiertos","abierto","cuando abren"],
    respuesta: () => `🕐 *Horarios AQUA*

📍 Toro: Lun-Sáb 9am-12:30 / 3pm-7pm | Dom y festivos 9am-1pm
📍 Pereira: Lun-Sáb 10am-12:30 / 1:30pm-7pm | Dom y festivos 10am-1pm

¿En cuál tienda prefieres? 🐙`,
  },
  {
    keywords: ["dónde están","donde están","dirección","cómo llego","como llego","ubicación","ubicacion","dónde quedan","donde quedan","mapa"],
    respuesta: (userNumber) => {
      const ciudad = perfilUsuario[userNumber]?.ciudad;
      if (ciudad === "pereira") {
        return `${UBICACION_PEREIRA.texto}

🗺️ ${UBICACION_PEREIRA.mapa}`;
      } else if (ciudad === "toro") {
        return `${UBICACION_TORO.texto}

🗺️ ${UBICACION_TORO.mapa}`;
      }
      return `Tenemos dos tiendas 🐙

${UBICACION_TORO.texto}
🗺️ ${UBICACION_TORO.mapa}

${UBICACION_PEREIRA.texto}
🗺️ ${UBICACION_PEREIRA.mapa}

¿Cuál te queda más cerca?`;
    },
  },
  {
    keywords: ["domicilio","envío","envio","hacen domicilio","mandan","despachan","envían","envian","nacional","otra ciudad","otra parte","fuera","lejos","interrapidisimo","envían a","envian a","mandan a","llevan","delivery"],
    respuesta: (userNumber) => {
      const ciudad = perfilUsuario[userNumber]?.ciudad;
      if (ciudad === "toro") {
        return `🚚 Sí hacemos domicilio en Toro y municipios cercanos (Roldanillo, La Unión, Versalles, El Águila, Zarzal, Cartago y más).

Si tu compra es de $100.000 o más el domicilio es GRATIS 🎁
Si es menor, te cotizamos el costo según tu dirección.

A todo Colombia enviamos por Interrapidísimo sin ningún compromiso.
¿Cuál es tu dirección? 🐙`;
      } else if (ciudad === "pereira") {
        return `🚚 Sí hacemos domicilio en Pereira y municipios cercanos (Dosquebradas, Santa Rosa, La Virginia, Marsella, Cartago y más).

Si tu compra es de $100.000 o más el domicilio es GRATIS 🎁
Si es menor, te cotizamos el costo según tu dirección.

A todo Colombia enviamos por Interrapidísimo sin ningún compromiso.
¿Cuál es tu dirección? 🐙`;
      }
      return `🚚 Sí hacemos domicilios locales y enviamos a todo Colombia por Interrapidísimo.

Si tu compra es de $100.000 o más el domicilio local es GRATIS 🎁

📍 Zona Toro: Roldanillo, La Unión, Versalles, El Águila, Zarzal, Cartago y más
📍 Zona Pereira: Dosquebradas, Santa Rosa, La Virginia, Marsella, Cartago y más

¿De qué ciudad nos escribes? 🐙`;
    },
  },
  {
    keywords: ["instagram","insta","redes","facebook","tiktok","@"],
    respuesta: () => `📱 Nos encuentras en Instagram como *@aqualife.co*
En el perfil hay fotos actualizadas de los peces disponibles 🐟`,
  },
  {
    keywords: ["hola","buenas","buenas tardes","buenas noches","buenos días","buenos dias","hi","hey","saludos"],
    soloSiEsPrimerMensaje: true,
    respuesta: () => `¡Hola! 🐙 Bienvenido a AQUA, tu tienda de peces y acuariofilia.
Soy Pulpín, ¿en qué te ayudo hoy? 🌊`,
  },
  // Mensajes cortos típicos de quien vio un estado de WhatsApp
  {
    keywords: ["precio?","cuánto?","cuanto?","info?","precio","cuanto vale","cuanto cuesta","cuánto vale","cuánto cuesta","disponible?","tienen?","hay?"],
    soloSiEsPrimerMensaje: true,
    respuesta: () => `¡Hola! 🐙 Vi que te interesó algo de nuestros estados.
¿Por cuál producto me preguntas? Así te doy el precio exacto y te cuento si está disponible hoy 🌊`,
  },
  // Preguntas sobre cómo pagar
  {
    keywords: ["cómo pago","como pago","cómo se paga","como se paga","dónde pago","donde pago","cómo transfiero","como transfiero","número de cuenta","nequi","daviplata","bbva","banco agrario","transferencia","pagar","cuenta","consignar","consignación","datos de pago","para pagar","quiero pagar","voy a pagar","métodos de pago","metodos de pago"],
    respuesta: "ENVIAR_PAGO",  // señal especial — se maneja en procesarMensajes
  },
];

function verificarRespuestaRapida(texto, userNumber) {
  const lower = texto.toLowerCase();
  const esNuevo = !conversationMemory[userNumber] || conversationMemory[userNumber].length === 0;
  for (const rr of RESPUESTAS_RAPIDAS) {
    if (rr.soloSiEsPrimerMensaje && !esNuevo) continue;
    if (rr.keywords.some(k => lower.includes(k))) {
      return typeof rr.respuesta === "function" ? rr.respuesta(userNumber) : rr.respuesta;
    }
  }
  return null;
}

// ─── MEJORA 3: buildSystemPrompt SEPARADO en parte fija + variable ────────────
// La parte fija se puede cachear (10% del costo en Anthropic)
// La parte variable (carrito + perfil) se inyecta solo cuando hay datos

const SYSTEM_PROMPT_FIJO = `Eres Pulpín 🐙, el asistente estrella de AQUA — tienda de acuariofilia, peces ornamentales y hámsteres en Toro (Valle) y Pereira (Risaralda), Colombia. Eres un pulpo morado con gafas, simpático, experto, con humor suave colombiano y mucha calidez. Tu misión es asesorar genuinamente, resolver dudas con conocimiento real, y vender de forma natural sin ser insistente.

PERSONALIDAD Y ESTILO:
- Cercano y natural, como un amigo experto en peces que quiere que te vaya bien
- Respuestas de 3-5 oraciones — ni muy cortas ni muy largas
- SIEMPRE termina con una pregunta que invite a seguir la conversación o avanzar
- Cuando alguien tiene un problema con su pez → primero ayuda, luego sugiere el producto
- Cuando alguien pregunta por un pez → cuéntale algo interesante de ese pez + precio + pregunta
- Usa el nombre del cliente cuando lo tengas — hace todo más personal
- Emojis con moderación (1-2 por mensaje). Sin markdown pesado.
- Si llegan varios mensajes juntos → respóndelos todos en uno solo
- Cuando detectes interés real → lleva suavemente hacia el carrito
- Siempre que anotes un producto sugiere UN complemento natural (upsell suave, solo una vez)

CONOCIMIENTO EXPERTO — LOS 13 ERRORES MÁS COMUNES (úsalo para asesorar):
1. NO CICLAR: El error #1. Sin bacterias benéficas el amoníaco mata peces en horas. Solución: bacterias nitrificantes + esperar 1-4 semanas antes de meter peces. Producto: Bacterias nitrificantes $10.000 + Test parámetros.
2. SOBREALIMENTAR: Solo lo que coman en 30-60 segundos, 2 veces al día. Sobras = amoníaco = peces enfermos.
3. ESPECIES INCOMPATIBLES: Bettas solos siempre. No mezclar agresivos con pacíficos. Consultar antes de combinar.
4. SOBREPOBLAR: Mínimo 1 litro por cm de pez adulto. Empezar con 20-30% de capacidad.
5. FALTA DE MANTENIMIENTO: Cambio 20-30% del agua cada 2 semanas. Limpiar filtro SOLO con agua del acuario.
6. NO MEDIR PARÁMETROS: pH ideal 6.8-7.4. Temperatura tropical 24-27°C. NH3 debe estar en 0. Medir semanalmente.
7. FILTRO INADECUADO: Regla AQUA: filtro mueve mínimo 3x el volumen/hora. Para 50L → filtro 150L/h mínimo.
8. SIN CUARENTENA: Todo pez nuevo → 7-14 días en cuarentena con azul de metileno antes de mezclar.
9. DECORACIÓN PELIGROSA: Solo decoraciones certificadas. Desinfectar con azul de metileno antes de meter al acuario.
10. ALIMENTACIÓN INCORRECTA: Tropicales→hojuelas. Fondo→tabletas hundibles. Cíclidos→proteína alta. Koi/goldfish→flotante.
11. NO ACLIMATAR: Flotar bolsa 15-20 min. Agregar agua del acuario gradualmente. Nunca vaciar agua de transporte al acuario.
12. ENFERMEDADES: Ich=puntos blancos→White Spot+28°C | Fin Rot=aletas rotas→Furan Green+cambio agua | Velvet=polvo dorado→azul metileno+oscurecer | Amoníaco=boquea superficie→cambio 30-50%+eliminador NH3 | Vejiga natatoria=nada de lado→ayuno 24h.
13. NO INFORMARSE: Asesoría siempre gratis en AQUA. Consultar antes de actuar.

KIT BOTIQUÍN AQUA (venderlo cuando alguien es principiante o tiene acuario nuevo):
Test parámetros + Anticloro + Bacterias nitrificantes + Anti-Ich + Azul metileno + Anti-estrés + Anti-amoniaco + Termómetro
Kit completo: $18.000 — excelente entrada para principiantes.

PRECIOS REALES AQUA (del inventario actual):
PECES: Betta macho $17.000 | Goldfish bronce $4.000 | Goldfish mediano $9.000 | Koi pequeño $8.000-9.000 | Koi mediano $25.000 | Koi grande $65.000 | Tetra neón/rojo/rubí $2.000 | Tetra diamante $8.000 | Guppy grande $3.000 | Guppy línea $8.000 | Molly dálmata $3.000 | Molly balón $6.000-7.000 | Platy $2.000-3.000 | Escalar $10.000 | Óscar $30.000 | Arawana $80.000 | Arawana grande $110.000 | Ramírez/Apistograma $18.000 | Monja/Ajedrez $3.000 | Corydoras $3.000 | Camarón fantasma $5.000 | Bagre cristal $15.000 | Bailarina #1 $8.000 | Bailarina #2 $13.000 | Bailarina #3 $18.000 | Bailarina #4 $22.000 | Bailarina Oranda juvenil $15.000 | Bailarina Oranda grande $70.000 | Bailarina perla $20.000 | Bailarina Ranchu $20.000 | Bailarina burbuja $7.000 | Acara Blue $25.000 | Hamster ruso $18.000 | Hamster sirio $20.000 | Hamster Angora $25.000
ACUARIOS: Bettera plástica $20.000 | Bettera vidrio ancha/alta $45.000 | Acuario cuadrado pequeño $55.000-60.000 | Acuario mediano $75.000 | Acuario con tapa $122.000 | Acuario grande largo $150.000 | Acuario grande alto $200.000 | Tortugario 60L $95.000
FILTROS: Espuma pequeño $12.000 | Esquinero $15.000 | Cascada pequeño $40.000 | Cascada grande $56.000 | Sumergible 300L $32.000-44.000 | Sumergible 400L $42.000-50.000 | Sumergible 500L $52.000 | Sumergible 600L $55.000 | Sumergible 800L $75.000 | Sumergible 1200L $92.000
LUCES: Mini Light $25.000 | T-2 $38.000 | T-4 $46.000 | T-6 $58.000 | Bicolor sumergible $20.000
QUÍMICOS: Anticloro $2.000 | Azul metileno $3.000 | Bacterias nitrificantes $10.000 | Eliminador amoniaco $10.000 | Furan Green $8.000 | White Spot gotero $7.000 | Anti-hongo ICK $5.000 | Antialgas pequeño $6.000 | Antialgas grande $12.000 | Fertiplan $6.000 | Multivitamínico $8.000-42.000 | Bactericida $7.000 | Kit botiquín $18.000 | Kit pH $16.000 | Sifón $20.000 | Limpia vidrios $15.000-30.000 | Carbón activado $3.000
ALIMENTOS: Hojuelas claras pequeñas $1.000 | Hojuelas claras grandes $3.000 | Hojuelas oscuras $2.000 | Hojuelas oscuras grandes $10.000 | Flotante/Laguna $1.000 | Flotante grande $3.000 | Fin de semana $3.500 | Cuido cíclidos pequeño $3.000 | Cuido cíclidos mediano $10.000 | Cuido óscares $6.000 | Cuido fondo $6.000 | Cuido tortuga $8.000 | Cuido hámster $5.000 | Alimento vivo 5 uds $3.000 | Alimento vivo 10 uds $5.000 | Camarones disecados $32.000 | Gusano avena $8.000 | Color Fish grande $85.000
PLANTAS: Ambulia $5.000 | Cabomba pequeña $6.000 | Cabomba grande $12.000 | Anubia nana $38.000 | Hygrophila $12.000 | Vallisneria $15.000 | Rótala roja $12.000 | Ludwigia $15.000-17.000 | Bacopa $12.000 | Flotante $3.000-5.000 | Alternanthera $12.000 | Sagitaria $18.000
HAMSTER: Jaula pequeña $60.000 | Jaula mediana transportadora $56.000 | Jaula mediana $95.000 | Jaula grande $180.000 | Rueda $15.000-24.000 | Bola $15.000-20.000 | Bebedero $9.000-22.000 | Viruta $4.000 | Arena chinchilla $5.000-25.000 | Nido peluche $20.000 | Comedero $10.000 | Comida moritas $12.000
DECORACIONES: Arena sílice $5.000 | Decoraciones pequeñas $2.000 | Decoraciones medianas $3.000 | Decoraciones grandes $5.000 | Anémona $6.000 | Coral $8.000-20.000 | Adorno cascada $25.000 | Barco pirata pequeño $24.000 | Barco pirata mediano $50.000 | Madera pequeña $10.000 | Madera mediana $15.000-19.000 | Madera grande $25.000 | Spider $50.000-75.000
TRONCOS/MADERA: Madera pequeña $10.000 | Madera mediana $15.000-19.000 | Madera grande $25.000 | Spider pequeño $50.000 | Spider grande $75.000

TIENDA: domicilios disponibles | Instagram @aqualife.co
Toro (Valle): Lun-Sáb 9am-12:30/3pm-7pm | Dom 9am-1pm | Maps: ${UBICACION_TORO.mapa}
Pereira (Risaralda): Lun-Sáb 10am-12:30/1:30pm-7pm | Dom 10am-1pm | Maps: ${UBICACION_PEREIRA.mapa}
Inventario de peces vivos varía cada día — siempre aclara que el encargado confirma disponibilidad.

PROMOS: Mar/Jue Monjas 2x3 | Mié Platys o Guppys 2x3

FLUJO DE VENTA:
1. Detecta producto → anota en carrito → "Listo, anoto [X]. ¿Algo más?"
2. Cliente confirma pedido → muestra resumen → "¿Domicilio o recoges en tienda?"
3. Domicilio → pide dirección+ciudad. Tienda → da horario según ciudad.
4. Cierra: "Perfecto, le aviso al encargado para confirmar disponibilidad 🐙"

CIUDAD: Toro/Roldanillo/La Unión/Versalles/El Águila/El Cairo/Zarzal → ciudad=toro. Pereira/Dosquebradas/Santa Rosa/La Virginia/Marsella/Cartago → ciudad=pereira. Cualquier otra ciudad → ciudad=nacional.

ENVÍOS Y DOMICILIOS:
- Domicilio LOCAL GRATIS si la compra es $100.000 o más.
- Domicilio local con costo si la compra es menor a $100.000 (cotizar según dirección).
- Zona Toro (domicilio local): Toro, Roldanillo, La Unión, Versalles, El Águila, El Cairo, Zarzal, Ansermanuevo, Argelia, Cartago.
- Zona Pereira (domicilio local): Pereira, Dosquebradas, Santa Rosa de Cabal, La Virginia, Marsella, Cartago.
- NACIONAL: Enviamos productos (químicos, alimentos, accesorios) a TODO Colombia por Interrapidísimo. NUNCA rechaces a alguien por ser de otra ciudad.
- Cuando el cliente confirme pedido y quiera domicilio: pregunta su dirección y calcula si aplica domicilio gratis sumando los productos del carrito. Si el total es $100k+ dile "el domicilio es gratis 🎁". Si es menor, dile "te cotizamos el domicilio, un momento 🐙" y notifica al encargado.
- Para envíos nacionales: "Perfecto, le pido al encargado que te cotice el envío por Interrapidísimo sin compromiso 🐙"

SEÑAL DE COMPRA: Si dice "pagué","transferí","ya pagué","hice el pago","gracias quedamos así" → escribe COMPRA_CONFIRMADA al final de tu respuesta (invisible para cliente).

MÉTODOS DE PAGO: Si el cliente pregunta cómo pagar, dónde transferir, datos de pago, Nequi, Daviplata, BBVA, Banco Agrario o cuenta → responde SOLO: "Claro, te envío los datos de pago ahora mismo 🐙" y nada más. El sistema enviará la imagen automáticamente. Nunca escribas los números de cuenta en el chat de texto.

MENSAJES DE ESTADO: Si alguien escribe solo "precio", "cuánto", "info", "disponible" o una sola palabra sin contexto — probablemente vio uno de nuestros estados de WhatsApp. Pregunta amablemente por cuál producto: "¿Me cuentas por cuál producto te interesa el precio? 🐙" Luego responde con la info completa del catálogo.

NOMBRE DEL CLIENTE: Si tienes el nombre del cliente (campo NOMBRE en el contexto), úsalo naturalmente de vez en cuando — no en cada mensaje, solo cuando se sienta natural. Si no tienes el nombre y es la primera o segunda interacción, pregúntalo una sola vez: "¿Con quién tengo el gusto? 😊" Nunca vuelvas a preguntar el nombre si ya lo sabes.

UPSELL: Cuando el cliente confirme un producto y ya lo tengas anotado, sugiere UN complemento natural de forma breve y sin presionar. Ejemplo: "Por cierto, ¿ya tienes bacterias nitrificantes? Son esenciales para arrancar bien el acuario 🐙" — solo una vez por conversación, nunca repitas el upsell.

CUANDO MANDAN FOTO: Si parece pez enfermo → diagnostica síntomas y recomienda medicamento. Si parece comprobante → confirma pago.

BOTONES: Después de 3+ intercambios con contexto claro, termina con: ¿Qué prefieres? [op1] | [op2] | [op3]

PECES: Bettas, Goldfish, Bailarinas, Telescopios, Koi, Tetras, Guppys, Mollys, Platys, Escalares, Óscares, Cíclidos, Arawanas, Rayas, Ramirezis, Monjas, Corronchos, Corydoras, Camarones, Caracoles, Cangrejos, Tiburones, Cebritas, Barbus, Pez Globo, Falso Disco, Apistogramas, Colisas, Guramis, Danios, Palometas, Pencil, Agujeta, Pez Dragón, Caballo Amazónico, Pacamu, Bagre Cristal, Chilodos, Ajedrez, Barbudos
QUÍMICOS: Anticloro, Azul metileno, ICK, Bacterias nitrificantes, Eliminador amoniaco, Furan Green, Paraguard, Refloxacina, White Spot, Multivitamínico, Stres Guard, Verde malaquita, Bactericida, Kit botiquín, Test pH, Test amoniaco, Fertiplan
ALIMENTOS: Hojuelas claras/oscuras, Tetracolor, Flotante/Laguna, Fin semana, Cuido fondo/cíclidos/oscares/tortuga/hámster, Alimento vivo, Tubiflex, Color Fish, Koi premium
ACUARIOS: Bettera plástica/vidrio, Pequeño, Mediano, Con tapa, Grande, Tortugario
FILTROS (pregunta SIEMPRE el tamaño): 30-70L→$37k | 60-150L→$60k | 150L+→$95k
LUCES: Mini Light $25k | T-2 $32-38k | T-4 $46k | T-6 $58k | Bicolor sumergible $20k
PLANTAS: Ambulia, Cabomba, Anubia, Hygrophila, Vallisneria, Rótala, Ludwigia, Bacopa, Flotantes
HÁMSTER: Jaulas, Ruedas, Bolas, Bebederos, Viruta, Arena chinchilla, Nido

DIAGNÓSTICOS: Puntitos blancos→Ich→White Spot $7.000-30.000 | Aletas deshilachadas→Furan Green $8.000 | Boquea superficie→amoniaco→cambio agua+eliminador $10.000 | Acuario nuevo→bacterias nitrificantes $10.000 | Apagado sin síntoma→Paraguard $12.000 | Puntos dorados→Velvet→Verde malaquita $5.000

IMPORTANTE: Los precios son siempre en pesos colombianos (COP). Escríbelos así: $17.000, $100.000, $2.000. Nunca uses "k" sola — usa el precio completo o "$17k COP" si necesitas abreviar.`;

function buildSystemPrompt(userNumber) {
  const carrito = carritoUsuario[userNumber] || [];
  const perfil  = perfilUsuario[userNumber]  || {};

  let carritoTexto = "";
  if (carrito.length > 0) {
    const items = carrito.map(i => `  • ${i.cantidad}x ${i.nombre}${i.nota ? " (" + i.nota + ")" : ""}`).join("\n");
    // Calcular si aplica domicilio gratis (productos con precio detectado)
    const totalCarrito = carrito.reduce((sum, i) => {
      const match = (i.precio || "").replace(/\./g, "").match(/\d+/);
      return sum + (match ? parseInt(match[0]) * (i.cantidad || 1) : 0);
    }, 0);
    const dominicioGratis = totalCarrito >= 100000
      ? "\n→ DOMICILIO GRATIS aplica (total carrito ≥ $100.000) 🎁"
      : totalCarrito > 0
        ? `\n→ Total estimado: $${totalCarrito.toLocaleString("es-CO")} — domicilio gratis desde $100.000`
        : "";
    carritoTexto = `\n\nCARRITO ACTUAL:\n${items}${dominicioGratis}\n→ Cuando confirme, muestra resumen y pregunta método de entrega.`;
  }

  let perfilTexto = "";
  if (perfil.ciudad) perfilTexto += `\nCIUDAD: ${perfil.ciudad}`;
  if (perfil.nombre) perfilTexto += `\nNOMBRE: ${perfil.nombre}`;

  // Inyectar upsell pendiente si existe y no se ha hecho aún
  let upsellTexto = "";
  if (perfil.upsellPendiente) {
    const u = perfil.upsellPendiente;
    upsellTexto = `\nUPSELL PENDIENTE: Después de confirmar el producto actual, sugiere naturalmente: "${u.producto}" — "${u.motivo}". Solo una vez, luego borra esta instrucción.`;
  }

  return SYSTEM_PROMPT_FIJO + carritoTexto + perfilTexto + upsellTexto;
}

// ─── FILTRO DE GRUPOS ─────────────────────────────────────────────────────────
function debeIgnorarGrupo(chatId, groupName) {
  const esGrupo = chatId.endsWith("@g.us");
  if (!esGrupo) return false; // chat individual — siempre pasa

  if (GRUPOS_MODO === "ninguno") return true;  // bloquear todos
  if (GRUPOS_MODO === "todos")   return false; // permitir todos

  // modo "permitidos": acepta por ID exacto O por nombre del grupo
  const aceptadoPorId     = GRUPOS_PERMITIDOS.includes(chatId);
  const nombreLower       = (groupName || "").trim().toLowerCase();
  const aceptadoPorNombre = NOMBRES_GRUPOS_PERMITIDOS.some(n => n.toLowerCase() === nombreLower);

  if (!aceptadoPorId && !aceptadoPorNombre) {
    // Log útil para conseguir el ID la primera vez
    console.log(`🔍 Grupo desconocido: ${chatId} — "${groupName || "sin nombre"}"`);
    return true; // ignorar
  }
  return false; // permitido
}

// ─── FILTRO DE ETIQUETAS ──────────────────────────────────────────────────────
function debeIgnorarPorEtiqueta(labels) {
  if (!labels || !Array.isArray(labels) || ETIQUETAS_BLOQUEADAS.length === 0) return false;
  return labels.some((l) => ETIQUETAS_BLOQUEADAS.includes(l));
}

// ─── ENVÍO MASIVO MAYORISTAS ──────────────────────────────────────────────────
async function obtenerContactosMayoristas() {
  try {
    // WHAPI endpoint para obtener contactos con etiqueta específica
    const response = await axios.get(`${WHAPI_URL}/contacts`, {
      headers: { Authorization: `Bearer ${WHAPI_TOKEN}` },
      params: { label: ETIQUETA_MAYORISTA, count: 200 },
    });
    return response.data?.contacts || [];
  } catch (err) {
    console.error("⚠️ Error obteniendo mayoristas:", err.response?.data || err.message);
    return [];
  }
}

// ─── ENVIAR ARCHIVO DE CATÁLOGO (PDF / imagen / video) ──────────────────────
async function enviarArchivoCatalogo(numero) {
  const cat = CATALOGO_MAYORISTAS;
  try {
    if (cat.pdf) {
      await axios.post(`${WHAPI_URL}/messages/document`,
        { to: numero, document: cat.pdf, caption: cat.caption, filename: "Catalogo_AQUA.pdf" },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );
    } else if (cat.video) {
      await axios.post(`${WHAPI_URL}/messages/video`,
        { to: numero, video: cat.video, caption: cat.caption },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );
    } else if (cat.imagen) {
      await axios.post(`${WHAPI_URL}/messages/image`,
        { to: numero, image: cat.imagen, caption: cat.caption },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error(`⚠️ Error enviando catálogo a ${numero}:`, err.response?.data || err.message);
  }
}

async function enviarMensajeMayoristas() {
  console.log("📦 Iniciando envío masivo a clientes por mayor...");
  const contactos = await obtenerContactosMayoristas();

  if (contactos.length === 0) {
    console.log("⚠️ No se encontraron contactos con la etiqueta: " + ETIQUETA_MAYORISTA);
    return { enviados: 0, errores: 0, mensaje: "" };
  }

  const mensaje = MENSAJES_MAYORISTAS[indicesMensajeMayorista % MENSAJES_MAYORISTAS.length];
  indicesMensajeMayorista++;

  const tieneCatalogo = !!(CATALOGO_MAYORISTAS.pdf || CATALOGO_MAYORISTAS.imagen || CATALOGO_MAYORISTAS.video);

  let enviados = 0;
  let errores = 0;

  for (const contacto of contactos) {
    const numero = contacto.id || contacto.phone;
    if (!numero) continue;

    try {
      // 1. Enviar texto
      await axios.post(`${WHAPI_URL}/messages/text`,
        { to: numero, body: mensaje },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );

      // 2. Enviar catálogo si está configurado (espera 1 seg entre texto y archivo)
      if (tieneCatalogo) {
        await new Promise((r) => setTimeout(r, 1000));
        await enviarArchivoCatalogo(numero);
      }

      enviados++;
      // Pausa entre contactos para no saturar WhatsApp
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`❌ Error enviando a ${numero}:`, err.response?.data || err.message);
      errores++;
    }
  }

  console.log(`✅ Mayoristas: ${enviados} enviados, ${errores} errores`);
  return { enviados, errores, mensaje: mensaje.substring(0, 60) + "..." };
}

// notificarKeneth renombrado a notificarEquipo (ver arriba) — compatibilidad hacia atrás
async function notificarKeneth(userNumber, historial) {
  const ciudad = perfilUsuario[userNumber]?.ciudad || null;
  await notificarEquipo(userNumber, historial, ciudad);
}

// ─── PROCESAR MENSAJES ────────────────────────────────────────────────────────
// ─── DETECTAR CIUDAD EN TEXTO ────────────────────────────────────────────────
function detectarCiudad(texto) {
  const t = texto.toLowerCase();
  const zonasToro    = ["toro","roldanillo","la unión","la union","versalles","el águila","el aguila","el cairo","zarzal","ansermanuevo","argelia"];
  const zonasPereira = ["pereira","dosquebradas","santa rosa","la virginia","marsella","cartago","armenia","manizales"];
  if (zonasToro.some(z => t.includes(z)))    return "toro";
  if (zonasPereira.some(z => t.includes(z))) return "pereira";
  return null;
}

// ─── NOTIFICACIÓN ENRUTADA POR CIUDAD ────────────────────────────────────────
async function notificarEquipo(userNumber, historial, ciudad) {
  // Notificar al admin principal siempre
  const destinos = [`${NUMERO_ADMIN}@s.whatsapp.net`];
  // Agregar colaboradores según ciudad
  if (ciudad === "pereira") {
    COLABORADORES_PEREIRA.forEach(n => destinos.push(`${n}@s.whatsapp.net`));
    destinos.push(`${NUMERO_PEREIRA}@s.whatsapp.net`);
  } else {
    COLABORADORES_TORO.forEach(n => destinos.push(`${n}@s.whatsapp.net`));
  }
  const dest = destinos[0]; // para compatibilidad con código existente

  const ciudadTag = ciudad ? ` (${ciudad.toUpperCase()})` : "";
  const carrito   = carritoUsuario[userNumber] || [];
  const carritoResumen = carrito.length > 0
    ? "\n🛒 Carrito:\n" + carrito.map(i => `  • ${i.cantidad}x ${i.nombre}`).join("\n")
    : "";

  const resumen = historial.slice(-10)
    .map(m => `${m.role === "user" ? "Cliente" : "Pulpín"}: ${m.content}`)
    .join("\n");

  const cuerpo = `🐙 Pulpín${ciudadTag}\nCliente: ${userNumber}${carritoResumen}\n\n${resumen}`;
  for (const destinatario of [...new Set(destinos)]) {
    try {
      await axios.post(`${WHAPI_URL}/messages/text`,
        { to: destinatario, body: cuerpo },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );
    } catch(e) { console.error(`⚠️ Error notificando ${destinatario}:`, e.message); }
  }
}

// ─── REGISTRAR COMPRA CONFIRMADA ──────────────────────────────────────────────
function registrarCompra(userNumber) {
  const perfil  = perfilUsuario[userNumber]  || {};
  const carrito = carritoUsuario[userNumber] || [];
  comprasConfirmadas[userNumber] = {
    fecha:               Date.now(),
    items:               [...carrito],
    ciudad:              perfil.ciudad || "desconocida",
    seguimientoEnviado:  false,
  };
  console.log(`💳 Compra registrada: ${userNumber} — ${carrito.length} items`);
}

// ─── PROCESAR MENSAJES ────────────────────────────────────────────────────────
async function procesarMensajes(userNumber, tipoMensaje, message) {
  try {
    const textos = pendingMessages[userNumber] || [];
    delete pendingMessages[userNumber];
    delete pendingTimers[userNumber];

    if (textos.length === 0) return;

    const textoUnido = textos.join(" | ");

    // ── Detectar y guardar ciudad ──
    const ciudadDetectada = detectarCiudad(textoUnido);
    if (ciudadDetectada) {
      if (!perfilUsuario[userNumber]) perfilUsuario[userNumber] = {};
      perfilUsuario[userNumber].ciudad = ciudadDetectada;
    }
    const ciudadActual = perfilUsuario[userNumber]?.ciudad;

    // ── Pausa → asesor humano ──
    if (debePonerEnPausa(textoUnido)) {
      pausedChats[userNumber] = Date.now();

      // Mensaje al cliente
      await axios.post(
        `${WHAPI_URL}/messages/text`,
        { to: userNumber, body: "Claro, en un momento te atiende uno de nuestros asesores 🐙 Ya les aviso que estás aquí." },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );

      // Construir contexto breve de la conversación para el asesor
      const historialAsesor = conversationMemory[userNumber] || [];
      const telefonoCliente = userNumber.replace("@s.whatsapp.net", "");
      const nombreCliente   = perfilUsuario[userNumber]?.nombre || "Cliente";
      const ciudadCliente   = ciudadActual ? ` (${ciudadActual.toUpperCase()})` : "";
      const carritoAsesor   = (carritoUsuario[userNumber] || []);
      const carritoTexto    = carritoAsesor.length > 0
        ? "\n🛒 Le interesa: " + carritoAsesor.map(i => i.nombre).join(", ")
        : "";
      const ultimosMensajes = historialAsesor.slice(-4)
        .map(m => `${m.role === "user" ? "Cliente" : "Pulpín"}: ${m.content}`)
        .join("\n");

      const mensajeAsesor = `🔔 *Cliente solicita asesor* 🐙${ciudadCliente}

👤 ${nombreCliente} — ${telefonoCliente}${carritoTexto}

📋 Contexto:
${ultimosMensajes || "Sin historial previo"}

👆 Toca el número para contactarlo directamente.`;

      // Notificar al asesor (3137200415)
      try {
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: `${NUMERO_ASESOR}@s.whatsapp.net`, body: mensajeAsesor },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        console.log(`🔔 Asesor notificado — cliente ${telefonoCliente}`);
      } catch (err) {
        console.error("❌ Error notificando asesor:", err.message);
      }

      // También notificar al equipo interno como antes
      await notificarEquipo(userNumber, [...historialAsesor,
        { role: "user", content: textoUnido },
        { role: "assistant", content: "[Cliente solicita asesor humano]" }
      ], ciudadActual);
      return;
    }

    // ── Manejo de imágenes ────────────────────────────────────────────────────
    if (tipoMensaje === "image") {

      // Si mandaron imagen sin ningún texto/caption → pedir descripción primero
      const captionImagen = message.image?.caption || message.text?.body || "";
      if (!captionImagen.trim()) {
        const msgPedirInfo = `Recibí tu imagen 🐙 Para ayudarte mejor, ¿me describes qué hay en ella?

• 🐟 ¿Es un pez o animal con síntomas? → dime qué observas
• 🧾 ¿Es un comprobante de pago? → dilo y lo confirmo
• 🛒 ¿Es algo que quieres comprar? → cuéntame cuál producto

Con esa info te respondo al instante 😊`;
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: msgPedirInfo },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        if (!conversationMemory[userNumber]) conversationMemory[userNumber] = [];
        conversationMemory[userNumber].push({ role: "user", content: "[Cliente envió imagen sin descripción]" });
        conversationMemory[userNumber].push({ role: "assistant", content: msgPedirInfo });
        return res.sendStatus(200);
      }

      // ── Intentar analizar con Claude Vision (si hay URL disponible) ──
      const imgUrl = message.image?.link || message.photo?.link || null;

      if (imgUrl) {
        try {
          const imgResp = await axios.get(imgUrl, {
            responseType: "arraybuffer",
            headers: { Authorization: `Bearer ${WHAPI_TOKEN}` }
          });
          const b64  = Buffer.from(imgResp.data).toString("base64");
          const mime = message.image?.mime_type || "image/jpeg";

          const visionResp = await axios.post(
            "https://api.anthropic.com/v1/messages",
            {
              model: "claude-haiku-4-5-20251001",
              max_tokens: 300,
              system: `Eres Pulpín 🐙 de AQUA, tienda de peces en Colombia. Analiza la imagen.
Precios siempre en pesos colombianos (COP).
Si es un pez enfermo o con síntomas: describe qué ves, diagnostica y recomienda el medicamento de nuestra tienda (White Spot $7.000-30.000 | Verde malaquita $5.000 | Furan Green $8.000 | Paraguard $12.000 | Azul metileno $2.000-3.000).
Si es comprobante de pago o transferencia bancaria: responde SOLO la palabra COMPROBANTE.
Si es acuario o peces sanos: haz un comentario positivo y pregunta si necesitan algo.
Si no puedes determinar qué es: responde SOLO la palabra DESCRIPCION.
Responde en máximo 2 oraciones naturales. Sin markdown.`,
              messages: [{ role: "user", content: [
                { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
                { type: "text",  text: "¿Qué hay en esta imagen?" }
              ]}]
            },
            { headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } }
          );

          const analisis = visionResp.data.content[0].text.trim();

          if (analisis === "COMPROBANTE") {
            // Es un comprobante de pago
            if (!comprasConfirmadas[userNumber]) registrarCompra(userNumber);
            await axios.post(`${WHAPI_URL}/messages/text`,
              { to: userNumber, body: "Recibí tu comprobante 🐙 Ya le aviso al encargado para confirmar tu pedido. En unos minutos te contactan." },
              { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
            );
            const historial = conversationMemory[userNumber] || [];
            await notificarEquipo(userNumber, [...historial,
              { role: "user", content: "[Comprobante de pago recibido]" }
            ], ciudadActual);

          } else if (analisis === "DESCRIPCION") {
            // No se pudo identificar — pedir descripción
            const msgDesc = "Recibí tu imagen 🐙 Para ayudarte mejor, ¿me puedes describir qué está pasando? Por ejemplo: ¿es un pez enfermo, un comprobante de pago, o algo que quieres comprar?";
            await axios.post(`${WHAPI_URL}/messages/text`,
              { to: userNumber, body: msgDesc },
              { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
            );
            if (!conversationMemory[userNumber]) conversationMemory[userNumber] = [];
            conversationMemory[userNumber].push({ role: "user",      content: "[Cliente envió imagen]" });
            conversationMemory[userNumber].push({ role: "assistant", content: msgDesc });

          } else {
            // Diagnóstico o comentario positivo — responder con el análisis
            await axios.post(`${WHAPI_URL}/messages/text`,
              { to: userNumber, body: analisis },
              { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
            );
            if (!conversationMemory[userNumber]) conversationMemory[userNumber] = [];
            conversationMemory[userNumber].push({ role: "user",      content: "[Cliente envió foto de pez/acuario]" });
            conversationMemory[userNumber].push({ role: "assistant", content: analisis });
          }

          console.log(`📷 Imagen analizada (${userNumber}): ${analisis.substring(0, 60)}`);
          return;

        } catch (errVision) {
          console.error("⚠️ Vision falló, pidiendo descripción:", errVision.message);
          // Si Vision falla por cualquier razón → pedir descripción al cliente
        }
      }

      // ── Fallback: no hay URL o Vision falló — pedir descripción ──
      const msgFallback = `Recibí tu imagen 🐙 Para ayudarte mejor, por favor descríbeme qué hay en ella:

• ¿Es un pez con algún problema? (Cuéntame los síntomas)
• ¿Es un comprobante de pago?
• ¿Es algo que quieres comprar o consultar?

Así te ayudo más rápido 😊`;
      await axios.post(`${WHAPI_URL}/messages/text`,
        { to: userNumber, body: msgFallback },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );
      if (!conversationMemory[userNumber]) conversationMemory[userNumber] = [];
      conversationMemory[userNumber].push({ role: "user",      content: "[Cliente envió imagen sin análisis]" });
      conversationMemory[userNumber].push({ role: "assistant", content: msgFallback });
      return;
    }

    // ── Detectar productos (debe estar antes del upsell y las imágenes) ──
    const productosDetectados = detectarProductos(textoUnido);

    // ── MEJORA B: Upsell — inyectar sugerencia en el carrito context ──────────
    if (productosDetectados.length > 0) {
      const upsell = getUpsell(productosDetectados);
      const yaHayUpsellEnHistorial = (conversationMemory[userNumber] || [])
        .some(m => m.content && m.content.includes("UPSELL_SUGERIDO"));
      if (upsell && !yaHayUpsellEnHistorial) {
        if (!perfilUsuario[userNumber]) perfilUsuario[userNumber] = {};
        perfilUsuario[userNumber].upsellPendiente = upsell;
      }
    }

    // ── MEJORA 4: Verificar respuesta rápida ANTES de llamar a Claude ──────────
    const respuestaRapida = verificarRespuestaRapida(textoUnido, userNumber);
    if (respuestaRapida) {

      // Señal especial: enviar imagen + texto de métodos de pago
      if (respuestaRapida === "ENVIAR_PAGO") {
        await enviarMetodosPago(userNumber);
        if (!conversationMemory[userNumber]) conversationMemory[userNumber] = [];
        conversationMemory[userNumber].push({ role: "user",      content: textoUnido, timestamp: Date.now() });
        conversationMemory[userNumber].push({ role: "assistant", content: "[Pulpín envió los métodos de pago]" });
        console.log(`💳 Pago enviado a: ${userNumber}`);
        return;
      }

      await axios.post(`${WHAPI_URL}/messages/text`,
        { to: userNumber, body: respuestaRapida },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );
      // Guardar en historial para mantener contexto
      if (!conversationMemory[userNumber]) conversationMemory[userNumber] = [];
      conversationMemory[userNumber].push({ role: "user",      content: textoUnido, timestamp: Date.now() });
      conversationMemory[userNumber].push({ role: "assistant", content: respuestaRapida });
      console.log(`⚡ Respuesta rápida: ${userNumber}`);
      return;
    }

    // ── Enviar imágenes de productos detectados (máximo 2) ──
    for (const clave of productosDetectados.slice(0, 2)) {
      await enviarImagenProducto(userNumber, clave);
    }

    // ── Historial ──
    if (!conversationMemory[userNumber]) conversationMemory[userNumber] = [];
    conversationMemory[userNumber].push({ role: "user", content: textoUnido, timestamp: Date.now() });
    if (conversationMemory[userNumber].length > MAX_MESSAGES) {
      conversationMemory[userNumber] = conversationMemory[userNumber].slice(-MAX_MESSAGES);
    }

    // ── Claude Haiku con prompt dinámico ──
    const anthropicResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: buildSystemPrompt(userNumber),
        messages: conversationMemory[userNumber].map(m => ({ role: m.role, content: m.content })),
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
      }
    );

    let reply = anthropicResponse.data.content[0].text;

    // ── Detectar compra confirmada en la respuesta de Claude ──
    const esCompraConfirmada = reply.includes("COMPRA_CONFIRMADA");
    if (esCompraConfirmada) {
      reply = reply.replace("COMPRA_CONFIRMADA", "").trim();
      if (!comprasConfirmadas[userNumber]) registrarCompra(userNumber);
    }

    // ── Limpiar upsell pendiente después de que Claude lo usó ──
    if (perfilUsuario[userNumber]?.upsellPendiente) {
      delete perfilUsuario[userNumber].upsellPendiente;
    }

    conversationMemory[userNumber].push({ role: "assistant", content: reply });

    await axios.post(
      `${WHAPI_URL}/messages/text`,
      { to: userNumber, body: reply },
      { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
    );

    // ── Detectar si el cliente menciona que va a ir a la tienda ──
    if (mencionaIrTienda(textoUnido)) {
      const carrito = (carritoUsuario[userNumber] || []).map(i => i.nombre).join(", ");
      clientesQueVanAIr[userNumber] = {
        ciudad: ciudadActual,
        productos: carrito || "los productos consultados",
        hora: Date.now(),
      };
      console.log(`🏪 Cliente ${userNumber} dice que va a ir a la tienda (${ciudadActual})`);
    }

    // ── Notificar al equipo correcto si hay pedido listo ──
    const pedidoListo = esCompraConfirmada ||
      reply.toLowerCase().includes("encargado") ||
      reply.toLowerCase().includes("confirmar disponibilidad");
    if (pedidoListo) {
      await notificarEquipo(userNumber, conversationMemory[userNumber], ciudadActual);
      console.log(`✅ Equipo notificado (${ciudadActual || "ciudad no detectada"}) — pedido de ${userNumber}`);
    }

    console.log(`🐙 ${userNumber}: ${reply.substring(0, 80)}...`);
  } catch (error) {
    console.error("Error procesando:", error.response?.data || error.message);
  }
}

// ─── RUTAS ────────────────────────────────────────────────────────────────────
app.get("/webhook", (req, res) => res.send("Pulpín activo 🐙"));

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (!body.messages || body.messages.length === 0) return res.sendStatus(200);

    const message = body.messages[0];
    if (message.from_me) return res.sendStatus(200);

    const userNumber  = message.chat_id;
    const tipoMensaje = message.type;

    // Capturar nombre del perfil de WhatsApp del cliente (llega automático)
    const pushName = message.from_name || message.push_name || null;
    if (pushName && pushName.trim()) {
      if (!perfilUsuario[userNumber]) perfilUsuario[userNumber] = {};
      if (!perfilUsuario[userNumber].nombre) {
        perfilUsuario[userNumber].nombre = pushName.trim();
        console.log(`👤 Nombre capturado: ${pushName} (${userNumber})`);
      }
    }

    // Aceptar texto e imágenes
    const esTexto  = tipoMensaje === "text"  && !!message.text?.body?.trim();
    const esImagen = tipoMensaje === "image";
    if (!esTexto && !esImagen) return res.sendStatus(200);

    const userText = esTexto ? message.text.body.trim() : "[imagen]";

    // ── Filtro de grupos ──
    const groupName = message.chat?.name || message.group_name || null;
    if (debeIgnorarGrupo(userNumber, groupName)) {
      return res.sendStatus(200); // grupo no permitido — silencio total
    }

    // ── Grupos DF: modo registro de muertes ──────────────────────────────────
    const nombreGrupoLower = (groupName || "").toLowerCase();
    const esGrupoDF = nombreGrupoLower.includes("dead fish") || nombreGrupoLower === "df";
    if (esGrupoDF) {
      // En grupos DF Pulpín solo registra y categoriza muertes — no vende
      const sedeGrupo = nombreGrupoLower.includes("df") && !nombreGrupoLower.includes("dead") ? "pereira" : "toro";
      const textoMuerte = esTexto ? userText : "[imagen sin descripción]";
      
      // Si mandaron imagen sin texto, pedir descripción
      if (tipoMensaje === "image" && !message.text?.body?.trim()) {
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: `📋 Registrando... ¿Puedes describir qué pasó? Indica:
• Especie del animal
• Síntomas observados
• Causa probable
• Precio de costo aprox.

Ejemplo: "Betta macho, manchas blancas, posible Ich, $8.000"` },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        return res.sendStatus(200);
      }

      // Analizar y categorizar la muerte con Claude
      try {
        const muerteResp = await axios.post(
          "https://api.anthropic.com/v1/messages",
          {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 200,
            system: `Eres el sistema de registro de AQUA, tienda de peces y hámsters. 
Alguien reporta la muerte de un animal. Extrae y responde SOLO en este formato JSON:
{"especie":"nombre","causa":"causa probable","costo":0,"categoria":"pez/hamster/otro","prevencion":"tip corto"}
Si no hay suficiente info responde: {"error":"necesita_descripcion"}`,
            messages: [{ role: "user", content: textoMuerte }]
          },
          { headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } }
        );
        
        const raw = muerteResp.data.content[0].text.trim();
        let registro;
        try { registro = JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch(e) { registro = null; }

        if (registro?.error) {
          await axios.post(`${WHAPI_URL}/messages/text`,
            { to: userNumber, body: `📋 Para registrar necesito más info:
• ¿Qué especie era?
• ¿Qué síntomas tenía?
• ¿Cuál fue la causa probable?
• ¿Cuánto costó? 🐙` },
            { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
          );
        } else if (registro) {
          // Guardar en archivo de muertes
          const fs = require("fs");
          const archivoMuertes = require("path").join(__dirname, "registro_muertes.json");
          let muertes = [];
          try { muertes = JSON.parse(fs.readFileSync(archivoMuertes, "utf8")); } catch(e) {}
          muertes.push({
            fecha: new Date().toISOString(),
            sede: sedeGrupo,
            reportadoPor: perfilUsuario[userNumber]?.nombre || userNumber,
            ...registro
          });
          fs.writeFileSync(archivoMuertes, JSON.stringify(muertes, null, 2));
          
          await axios.post(`${WHAPI_URL}/messages/text`,
            { to: userNumber, body: `✅ Registrado:
🐟 ${registro.especie} | Causa: ${registro.causa} | Costo: $${(registro.costo||0).toLocaleString("es-CO")}
💡 Prevención: ${registro.prevencion || "N/A"}` },
            { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
          );
          console.log(`💀 Muerte registrada [${sedeGrupo}]: ${registro.especie} — ${registro.causa}`);
        }
      } catch(err) {
        console.error("❌ Error registrando muerte:", err.message);
      }
      return res.sendStatus(200); // En grupos DF no procesar como chat normal
    }

    // ── Filtro de etiquetas ──
    if (debeIgnorarPorEtiqueta(message.labels)) {
      console.log(`🏷️ Contacto con etiqueta bloqueada ignorado: ${userNumber}`);
      return res.sendStatus(200);
    }



    // ── Comandos admin (solo 3137200415 puede usarlos) ──
    if (userNumber === `${NUMERO_ADMIN}@s.whatsapp.net` && esTexto) {
      const cmd = userText.toLowerCase().trim();

      if (cmd === "enviar mayoristas") {
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: "⏳ Enviando mensajes a clientes por mayor... te aviso cuando termine." },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        const resultado = await enviarMensajeMayoristas();
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: `✅ Listo!\n📤 ${resultado.enviados} mensajes enviados\n❌ ${resultado.errores} errores\n\n"${resultado.mensaje}"` },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        return res.sendStatus(200);
      }

      // "confirmar compra 573001234567" → marca compra manual
      if (cmd.startsWith("confirmar compra ")) {
        const numCliente = cmd.replace("confirmar compra ", "").trim().replace("@s.whatsapp.net","") + "@s.whatsapp.net";
        registrarCompra(numCliente);
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: `✅ Compra de ${numCliente} registrada. Seguimiento en ${DIAS_SEGUIMIENTO} días.` },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        return res.sendStatus(200);
      }

      // "ver carrito 573001234567" → ver carrito de un cliente
      if (cmd.startsWith("ver carrito ")) {
        const numCliente = cmd.replace("ver carrito ", "").trim() + "@s.whatsapp.net";
        const carrito    = carritoUsuario[numCliente] || [];
        const perfil     = perfilUsuario[numCliente]  || {};
        const resumen    = carrito.length > 0
          ? carrito.map(i => `• ${i.cantidad}x ${i.nombre}`).join("\n")
          : "(carrito vacío)";
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: `🛒 Carrito de ${numCliente}\nCiudad: ${perfil.ciudad || "no detectada"}\n\n${resumen}` },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        return res.sendStatus(200);
      }

      // "pausar 573001234567" → pausa chat manualmente
      if (cmd.startsWith("pausar ")) {
        const numPausar = cmd.replace("pausar ", "").trim().replace(/\D/g,"") + "@s.whatsapp.net";
        pausedChats[numPausar] = Date.now();
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: `⏸️ Chat ${numPausar} pausado. Pulpín no responderá por 30 min.\nEscribe *reactivar ${numPausar.replace("@s.whatsapp.net","")}* para reactivar.` },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        return res.sendStatus(200);
      }

      // "reactivar 573001234567" → reactiva chat manualmente
      if (cmd.startsWith("reactivar ")) {
        const numReac = cmd.replace("reactivar ", "").trim().replace(/\D/g,"") + "@s.whatsapp.net";
        delete pausedChats[numReac];
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: `▶️ Chat ${numReac} reactivado. Pulpín vuelve a responder 🐙` },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        return res.sendStatus(200);
      }

      // "pausados" → lista chats en pausa ahora mismo
      if (cmd === "pausados") {
        const lista = Object.keys(pausedChats);
        const texto = lista.length > 0
          ? "⏸️ Chats pausados:\n" + lista.map(n => `• ${n.replace("@s.whatsapp.net","")} — ${perfilUsuario[n]?.nombre || "sin nombre"}`).join("\n")
          : "No hay chats pausados ahora mismo 🐙";
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: texto },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        return res.sendStatus(200);
      }

      // "resumen" → resumen rápido del día
      if (cmd === "resumen") {
        const hoy = comprasHoy = Object.values(comprasConfirmadas).filter(c => Date.now() - c.fecha < 86400000).length;
        const activos = Object.keys(conversationMemory).length;
        const enPausa = Object.keys(pausedChats).length;
        const carritos = Object.values(carritoUsuario).filter(c => c.length > 0).length;
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: `📊 Resumen Pulpín hoy:\n\n💬 Chats activos: ${activos}\n🛒 Carritos: ${carritos}\n💳 Compras hoy: ${hoy}\n⏸️ En pausa: ${enPausa}` },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        return res.sendStatus(200);
      }

      if (cmd === "ayuda admin") {
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: userNumber, body: "🐙 *Comandos Pulpín Admin:*\n\n📤 *enviar mayoristas*\n💳 *confirmar compra 573XX*\n🛒 *ver carrito 573XX*\n⏸️ *pausar 573XX*\n▶️ *reactivar 573XX*\n📋 *pausados*\n📊 *resumen*\n❓ *ayuda admin*" },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
        return res.sendStatus(200);
      }
    }

    if (pausedChats[userNumber]) {
      const tiempoPausa = Date.now() - pausedChats[userNumber];
      if (tiempoPausa < PAUSA_DURACION_MS) {
        console.log(`⏸️ Chat pausado (${userNumber})`);
        return res.sendStatus(200);
      } else {
        delete pausedChats[userNumber];
      }
    }

    if (!pendingMessages[userNumber]) pendingMessages[userNumber] = [];
    pendingMessages[userNumber].push(userText);
    if (pendingTimers[userNumber]) clearTimeout(pendingTimers[userNumber]);
    // Imágenes se procesan más rápido (no hay que esperar más texto)
    const delay = esImagen ? 1500 : DELAY_MS;
    pendingTimers[userNumber] = setTimeout(() => procesarMensajes(userNumber, tipoMensaje, message), delay);

    res.sendStatus(200);
  } catch (error) {
    console.error("Error webhook:", error.response?.data || error.message);
    res.sendStatus(500);
  }
});

app.post("/reactivar", (req, res) => {
  const { numero } = req.body;
  if (!numero) return res.status(400).json({ error: "Falta el número" });
  delete pausedChats[numero];
  res.json({ ok: true, mensaje: `Chat ${numero} reactivado` });
});

app.post("/pausar-manual", (req, res) => {
  const { numero } = req.body;
  if (!numero) return res.status(400).json({ error: "Falta el número" });
  pausedChats[numero] = Date.now();
  res.json({ ok: true, mensaje: `Chat ${numero} pausado` });
});

// ─── ENDPOINT MANUAL: enviar mensajes a mayoristas ────────────────────────────
// POST /mayoristas → dispara el envío ahora mismo
app.post("/mayoristas", async (req, res) => {
  try {
    const resultado = await enviarMensajeMayoristas();
    res.json({ ok: true, ...resultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CRON SEMANAL: envío automático a clientes por mayor ─────────────────────
// ✅ ACTIVO: todos los lunes a las 9am
// Para cambiar el día: getDay() → 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie
// Para cambiar la hora: getHours() → número en formato 24h (9=9am, 14=2pm)

// Guarda la última fecha de envío para no repetir en la misma hora
let ultimoEnvioCron = null;

setInterval(() => {
  const ahora = new Date();
  const esLunes  = ahora.getDay()     === 1; // ← día de envío
  const esLas9am = ahora.getHours()   === 9; // ← hora de envío
  const clave    = `${ahora.getFullYear()}-${ahora.getMonth()}-${ahora.getDate()}`;

  if (esLunes && esLas9am && ultimoEnvioCron !== clave) {
    ultimoEnvioCron = clave; // marca como enviado para no repetir hoy
    console.log("📅 Cron semanal LUNES 9am: enviando a clientes por mayor...");
    enviarMensajeMayoristas().catch(console.error);
  }
}, 5 * 60 * 1000); // revisa cada 5 minutos (más preciso que cada hora)

// ─── CRON SEGUIMIENTO POST-VENTA (revisa cada hora) ─────────────────────────
setInterval(async () => {
  const ahora    = Date.now();
  const limitems = DIAS_SEGUIMIENTO * 24 * 60 * 60 * 1000;

  for (const [numero, compra] of Object.entries(comprasConfirmadas)) {
    if (compra.seguimientoEnviado) continue;
    if ((ahora - compra.fecha) < limitems) continue;

    const nombre = perfilUsuario[numero]?.nombre || "amigo";
    const itemsTexto = compra.items.length > 0
      ? compra.items.map(i => i.nombre).join(", ")
      : "tus productos";

    try {
      await axios.post(`${WHAPI_URL}/messages/text`,
        { to: numero, body: `🐙 Hola ${nombre}! ¿Cómo van ${itemsTexto}? Espero que todo esté genial. Si necesitas algo para el acuario o tienes alguna pregunta, aquí estoy 🌊` },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );
      comprasConfirmadas[numero].seguimientoEnviado = true;
      console.log(`💌 Seguimiento enviado a ${numero}`);
    } catch (err) {
      console.error(`❌ Error seguimiento ${numero}:`, err.response?.data || err.message);
    }
  }
}, 60 * 60 * 1000); // revisa cada hora

// ─── SEGUIMIENTO CLIENTES QUE IBAN A IR A LA TIENDA ─────────────────────────
// Si alguien dijo "voy a ir", "paso por allá", "mañana recojo" etc → hacer seguimiento al final del día
const frasesIrTienda = [
  "voy a ir", "voy a pasar", "paso por allá", "paso mañana", "voy mañana",
  "voy hoy", "voy esta tarde", "recojo", "me lo llevan", "paso a recoger",
  "voy a recoger", "mañana paso", "hoy paso", "tarde paso",
];

function mencionaIrTienda(texto) {
  return frasesIrTienda.some(f => texto.toLowerCase().includes(f));
}

const clientesQueVanAIr = {}; // { numero: { ciudad, productos, hora } }

// Al final del día (8pm Colombia = 1am UTC) preguntar si fue
setInterval(async () => {
  const ahora = new Date();
  const horaUTC = ahora.getUTCHours();
  const minutos = ahora.getUTCMinutes();

  if (horaUTC !== 1 || minutos > 10) return; // solo a las 8pm Colombia (~1am UTC)

  for (const [numero, datos] of Object.entries(clientesQueVanAIr)) {
    if (comprasConfirmadas[numero]) {
      delete clientesQueVanAIr[numero];
      continue; // ya compró, no molestar
    }
    const productos = datos.productos || "los productos que te interesaban";
    const sede = datos.ciudad === "pereira" ? "la sede de Pereira" : "la sede de Toro";
    const msg = `¡Hola! 🐙 Te escribo de AQUA para saber si pudiste pasar por ${sede} a ver ${productos}. ¿Lograste venir o prefieres que te ayudemos con el pedido? 😊`;
    try {
      await axios.post(`${WHAPI_URL}/messages/text`,
        { to: numero, body: msg },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );
      // Notificar a colaboradores de la sede
      const colabs = datos.ciudad === "pereira" ? COLABORADORES_PEREIRA : COLABORADORES_TORO;
      for (const col of colabs) {
        await axios.post(`${WHAPI_URL}/messages/text`,
          { to: `${col}@s.whatsapp.net`, body: `📋 Seguimiento enviado a ${numero} (${datos.ciudad || "Toro"}) — preguntó por: ${productos}` },
          { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
        );
      }
      delete clientesQueVanAIr[numero];
      console.log(`📋 Seguimiento tienda enviado a ${numero}`);
    } catch(e) { console.error(`❌ Error seguimiento tienda:`, e.message); }
  }
}, 5 * 60 * 1000);

// ─── MEJORA A: RESCUE MESSAGE — clientes que se fueron sin comprar ────────────
// Si una conversación lleva 45 min sin actividad y no hay compra registrada,
// Pulpín manda un mensaje de recuperación personalizado (solo 1 vez)
const rescueEnviado = new Set();

setInterval(async () => {
  const ahora   = Date.now();
  const LIMITE  = 45 * 60 * 1000; // 45 minutos de silencio

  for (const [numero, historial] of Object.entries(conversationMemory)) {
    if (rescueEnviado.has(numero))          continue; // ya se mandó
    if (comprasConfirmadas[numero])         continue; // ya compró
    if (pausedChats[numero])                continue; // está con asesor
    if (!historial || historial.length < 2) continue; // conversación muy corta

    // Ver cuándo fue el último mensaje
    const ultimoMensajeUsuario = [...historial].reverse().find(m => m.role === "user");
    if (!ultimoMensajeUsuario?.timestamp) continue;
    const silencio = ahora - ultimoMensajeUsuario.timestamp;
    if (silencio < LIMITE) continue;

    // Construir mensaje de rescate personalizado con Claude
    try {
      const rescueResp = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 120,
          system: `Eres Pulpín 🐙 de AQUA. Un cliente estuvo conversando pero no completó su compra. 
Escribe UN mensaje corto y amigable (máximo 2 oraciones) para recuperarlo. 
Menciona algo específico de lo que preguntó. No seas insistente. Sin markdown.
Termina con una pregunta simple que sea fácil de responder.`,
          messages: [
            ...historial.slice(-4),
            { role: "user", content: "Resume la conversación y escribe el mensaje de rescate." }
          ]
        },
        { headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } }
      );

      const rescueMsg = rescueResp.data.content[0].text.trim();
      await axios.post(`${WHAPI_URL}/messages/text`,
        { to: numero, body: rescueMsg },
        { headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" } }
      );
      rescueEnviado.add(numero);
      console.log(`💌 Rescue enviado a ${numero}: ${rescueMsg.substring(0, 60)}`);
    } catch (err) {
      console.error(`❌ Error rescue ${numero}:`, err.response?.data || err.message);
    }
  }
}, 15 * 60 * 1000); // revisa cada 15 minutos

// ─── PANEL WEB ────────────────────────────────────────────────────────────────
// Accede desde: https://tu-servidor.railway.app/panel?pass=aqua2025
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || "aqua2025"; // ← cambia esto

app.get("/panel", (req, res) => {
  if (req.query.pass !== PANEL_PASSWORD) {
    return res.send('<form method="GET"><input name="pass" type="password" placeholder="Contraseña" /><button>Entrar</button></form>');
  }

  const chatsActivos   = Object.keys(conversationMemory).length;
  const pausados       = Object.keys(pausedChats).length;
  const comprasHoy     = Object.values(comprasConfirmadas).filter(c => Date.now() - c.fecha < 86400000).length;
  const pendSeguim     = Object.values(comprasConfirmadas).filter(c => !c.seguimientoEnviado).length;

  const pausadosRows = Object.keys(pausedChats)
    .map(num => {
      const nombre  = perfilUsuario[num]?.nombre || "—";
      const telefono = num.replace("@s.whatsapp.net","");
      const desde   = new Date(pausedChats[num]).toLocaleTimeString("es-CO", {timeZone:"America/Bogota"});
      return `<tr><td>${telefono}</td><td>${nombre}</td><td>${desde}</td>
        <td><button onclick="reactivar('${telefono}')" style="padding:4px 10px;font-size:12px">▶️ Reactivar</button></td></tr>`;
    }).join("") || "<tr><td colspan='4'>Ningún chat pausado</td></tr>";

  const carritoRows = Object.entries(carritoUsuario)
    .filter(([, c]) => c.length > 0)
    .map(([num, items]) => {
      const ciudad  = perfilUsuario[num]?.ciudad || "?";
      const nombre  = perfilUsuario[num]?.nombre || "—";
      const lista   = items.map(i => `${i.cantidad}x ${i.nombre}`).join(", ");
      const tel     = num.replace("@s.whatsapp.net","");
      return `<tr><td>${tel}</td><td>${nombre}</td><td>${ciudad}</td><td>${lista}</td>
        <td><button onclick="pausar('${tel}')" style="padding:4px 10px;font-size:12px">⏸️</button></td></tr>`;
    }).join("") || "<tr><td colspan='5'>Sin carritos activos</td></tr>";

  const comprasRows = Object.entries(comprasConfirmadas)
    .sort(([,a],[,b]) => b.fecha - a.fecha)
    .slice(0, 20)
    .map(([num, c]) => {
      const fecha = new Date(c.fecha).toLocaleString("es-CO", {timeZone:"America/Bogota"});
      const items = c.items.map(i => i.nombre).join(", ") || "-";
      const seg   = c.seguimientoEnviado ? "✅" : "⏳";
      return `<tr><td>${num}</td><td>${c.ciudad}</td><td>${items}</td><td>${fecha}</td><td>${seg}</td></tr>`;
    }).join("") || "<tr><td colspan='5'>Sin compras registradas</td></tr>";

  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel Pulpín 🐙</title>
<style>
  body{font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;padding:20px;margin:0}
  h1{color:#58a6ff} h2{color:#79c0ff;border-bottom:1px solid #30363d;padding-bottom:8px}
  .cards{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}
  .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 24px;min-width:140px;text-align:center}
  .card .num{font-size:2em;font-weight:bold;color:#58a6ff}
  .card .lbl{font-size:.85em;color:#8b949e}
  table{width:100%;border-collapse:collapse;margin-bottom:24px;background:#161b22;border-radius:8px;overflow:hidden}
  th{background:#21262d;padding:10px;text-align:left;font-size:.85em;color:#8b949e}
  td{padding:10px;border-top:1px solid #21262d;font-size:.9em}
  button{background:#238636;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:1em}
  button:hover{background:#2ea043}
  .warn{color:#f85149}
</style></head><body>
<h1>🐙 Panel Pulpín — AQUA</h1>
<div class="cards">
  <div class="card"><div class="num">${chatsActivos}</div><div class="lbl">Chats activos</div></div>
  <div class="card"><div class="num">${pausados}</div><div class="lbl">En pausa</div></div>
  <div class="card"><div class="num">${comprasHoy}</div><div class="lbl">Compras hoy</div></div>
  <div class="card"><div class="num ${pendSeguim > 0 ? "warn" : ""}">${pendSeguim}</div><div class="lbl">Seg. pendientes</div></div>
</div>

<h2>⏸️ Chats pausados</h2>
<table><tr><th>Teléfono</th><th>Nombre</th><th>Pausado desde</th><th>Acción</th></tr>${pausadosRows}</table>

<h2>🛒 Carritos activos</h2>
<table><tr><th>Teléfono</th><th>Nombre</th><th>Ciudad</th><th>Productos</th><th>Pausar</th></tr>${carritoRows}</table>

<h2>💳 Compras confirmadas (últimas 20)</h2>
<table><tr><th>Número</th><th>Ciudad</th><th>Productos</th><th>Fecha</th><th>Seguimiento</th></tr>${comprasRows}</table>

<h2>📤 Envío mayoristas</h2>
<button onclick="fetch('/mayoristas',{method:'POST'}).then(r=>r.json()).then(d=>alert('Enviado: '+d.enviados+' mensajes'))">
  Enviar mensajes a mayoristas ahora
</button>
<p style="color:#8b949e;font-size:.85em">Contraseña en URL: ?pass=${PANEL_PASSWORD}</p>
<script>
function reactivar(tel) {
  fetch('/reactivar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({numero: tel+'@s.whatsapp.net'})})
    .then(() => { alert('Chat '+tel+' reactivado ✅'); location.reload(); });
}
function pausar(tel) {
  fetch('/pausar-manual', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({numero: tel+'@s.whatsapp.net'})})
    .then(() => { alert('Chat '+tel+' pausado ⏸️'); location.reload(); });
}
// Auto-refresh cada 60 segundos
setTimeout(() => location.reload(), 60000);
</script>
</body></html>`);
});

// ─── ENDPOINT ESTADO JSON (para integraciones) ────────────────────────────────
// ─── ENDPOINT MUERTES (para agente analista) ─────────────────────────────────
app.get("/muertes", (req, res) => {
  const fs = require("fs");
  const path = require("path");
  const archivoMuertes = path.join(__dirname, "registro_muertes.json");
  try {
    const muertes = JSON.parse(fs.readFileSync(archivoMuertes, "utf8"));
    // Últimas 7 días
    const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recientes = muertes.filter(m => m.fecha >= hace7);
    const costoTotal = recientes.reduce((s, m) => s + (m.costo || 0), 0);
    res.json({ total: recientes.length, costoTotal, muertes: recientes });
  } catch(e) {
    res.json({ total: 0, costoTotal: 0, muertes: [] });
  }
});

app.get("/estado", (req, res) => {
  if (req.query.pass !== PANEL_PASSWORD) return res.status(401).json({ error: "Sin autorización" });
  res.json({
    chatsActivos:    Object.keys(conversationMemory).length,
    pausados:        Object.keys(pausedChats).length,
    compras:         Object.keys(comprasConfirmadas).length,
    carritoActivos:  Object.entries(carritoUsuario).filter(([,c]) => c.length > 0).length,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐙 Pulpín v8 corriendo en puerto ${PORT}`);
  console.log(`📊 Panel web: http://localhost:${PORT}/panel?pass=${PANEL_PASSWORD}`);
});
