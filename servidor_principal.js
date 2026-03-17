// ═══════════════════════════════════════════════════════════════════════════════
// 🐙 SERVIDOR PRINCIPAL — AQUA
// Arranca Pulpín + los 4 agentes en un solo proceso
// Railway solo necesita este archivo como punto de entrada
// ═══════════════════════════════════════════════════════════════════════════════

const { fork } = require("child_process");
const path     = require("path");

const procesos = [
  { nombre: "Pulpín",     archivo: "bot_pulpin_v8.js",     color: "\x1b[35m" },
  { nombre: "Estados",    archivo: "agente_estados.js",    color: "\x1b[36m" },
  { nombre: "Inventario", archivo: "agente_inventario.js", color: "\x1b[33m" },
  { nombre: "Marketing",  archivo: "agente_marketing.js",  color: "\x1b[32m" },
  { nombre: "Analista",   archivo: "agente_analista.js",   color: "\x1b[34m" },
];

const reset = "\x1b[0m";

for (const proc of procesos) {
  const child = fork(path.join(__dirname, proc.archivo), [], {
    env: { ...process.env },
    silent: false,
  });

  child.on("error", (err) => {
    console.error(`${proc.color}[${proc.nombre}]${reset} Error:`, err.message);
  });

  child.on("exit", (code) => {
    console.log(`${proc.color}[${proc.nombre}]${reset} Proceso terminó (código ${code}) — reiniciando en 5 seg...`);
    setTimeout(() => {
      fork(path.join(__dirname, proc.archivo), [], { env: { ...process.env } });
    }, 5000);
  });

  console.log(`${proc.color}[${proc.nombre}]${reset} ✅ Iniciado`);
}

console.log("\n🐙 Ecosistema AQUA v2 completo corriendo\n");
