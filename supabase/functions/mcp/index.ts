// Generado por npm run mcp:build desde mcp/. No se edita a mano.
// @ts-nocheck

// src/format.ts
var hoy = () => {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function dinero(monto2, moneda = "COP") {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: moneda,
      maximumFractionDigits: moneda === "COP" ? 0 : 2
    }).format(monto2);
  } catch {
    return `${moneda} ${Math.round(monto2).toLocaleString("es-CO")}`;
  }
}
function sumar(nums) {
  return nums.reduce((a, b) => a + b, 0);
}
function pct(parte, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(parte / total * 100)));
}
function mesAnterior(yyyymm) {
  const [y, m] = yyyymm.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
function mesesEntre(desde, hasta) {
  const [y1, m1] = desde.split("-").map(Number);
  const [y2, m2] = hasta.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) + 1);
}

// src/caja.ts
var ambitoDe = (g) => g.compartido ? "hogar" : g.pagadoPor;
var existeEn = (b, mes2) => mes2 >= b.desde;
var candidatos = (ambito, bolsillos) => bolsillos.filter((b) => b.ambito === ambito);
function bolsilloDe(g, bolsillos) {
  if (g.bolsilloId) {
    const fijo = bolsillos.find((b) => b.id === g.bolsilloId);
    if (fijo) return fijo;
  }
  const propios = candidatos(ambitoDe(g), bolsillos);
  return propios.find((b) => b.categorias.includes(g.categoria)) ?? (g.categoria === "fuera" ? null : propios.find((b) => b.categorias.length === 0)) ?? null;
}
var esFueraDeCasa = (b) => b.categorias.includes("fuera");
var cajaDe = (g, bolsillos) => {
  if (g.categoria === "fuera") return "fuera";
  const b = bolsilloDe(g, bolsillos);
  return b && esFueraDeCasa(b) ? "fuera" : "vivir";
};
function gastosDe(b, gastos, bolsillos, mes2) {
  return gastos.filter((g) => g.fecha.startsWith(mes2) && bolsilloDe(g, bolsillos)?.id === b.id);
}
var gastadoEn = (b, gastos, bolsillos, mes2) => sumar(gastosDe(b, gastos, bolsillos, mes2).map((g) => g.monto));
function disponible(b, gastos, bolsillos, mes2) {
  if (!existeEn(b, mes2)) return 0;
  const ajustes = (filtro) => sumar(b.ajustes.filter((a) => filtro(a.fecha.slice(0, 7))).map((a) => a.monto));
  if (!b.acumula) {
    return b.asignacion + ajustes((m) => m === mes2) - gastadoEn(b, gastos, bolsillos, mes2);
  }
  const enRango = (m) => m >= b.desde && m <= mes2;
  const gastadoHasta = sumar(
    gastos.filter((g) => enRango(g.fecha.slice(0, 7)) && bolsilloDe(g, bolsillos)?.id === b.id).map((g) => g.monto)
  );
  return b.saldoInicial + b.asignacion * mesesEntre(b.desde, mes2) + ajustes(enRango) - gastadoHasta;
}
var semaforo = (gastado, disponible2, tope) => disponible2 < 0 ? "rojo" : tope > 0 && gastado / tope >= 0.8 ? "amarillo" : "bien";
function vistaBolsillo(b, e, mes2) {
  const gastado = gastadoEn(b, e.gastos, e.bolsillos, mes2);
  const disp = disponible(b, e.gastos, e.bolsillos, mes2);
  const tope = gastado + disp;
  return { bolsillo: b, gastado, disponible: disp, tope, avance: disp < 0 ? 100 : pct(gastado, tope), estado: semaforo(gastado, disp, tope) };
}
var vigentes = (e, mes2) => e.bolsillos.filter((b) => existeEn(b, mes2));
var saldoDe = (d) => Math.max(0, d.montoInicial - sumar(d.abonos.map((a) => a.monto)));
var abonosDelMes = (e, mes2) => e.deudas.flatMap((d) => d.abonos.filter((a) => a.fecha.startsWith(mes2)));
var aportesDelMes = (e, mes2) => e.metas.flatMap((m) => m.aportes.filter((a) => a.fecha.startsWith(mes2)));
var minimosMensuales = (deudas) => sumar(deudas.filter((d) => saldoDe(d) > 0).map((d) => d.pagoMinimo));
function resumenMes(e, mes2) {
  const delMes = (fecha2) => fecha2.startsWith(mes2);
  const ingresos = e.ingresos.filter((i) => delMes(i.fecha));
  const ingresosReales = sumar(ingresos.map((i) => i.monto));
  const esperado = e.perfil.ingresoEsperado ?? { a: 0, b: 0 };
  const ingresosEsperados = (esperado.a || 0) + (esperado.b || 0);
  const usaEsperado = ingresosReales === 0 && ingresosEsperados > 0;
  const base = usaEsperado ? ingresosEsperados : ingresosReales;
  const gastado = sumar(e.gastos.filter((g) => delMes(g.fecha)).map((g) => g.monto));
  const abonos = sumar(abonosDelMes(e, mes2).map((a) => a.monto));
  const aportes = sumar(aportesDelMes(e, mes2).map((a) => a.monto));
  const salidas = gastado + abonos + aportes;
  const queda = base - salidas;
  const facturasPendientes = sumar(
    e.facturas.filter((f) => f.activa && !f.pagadaEn.includes(mes2)).map((f) => f.monto)
  );
  const minimosDeuda = sumar(
    e.deudas.filter((d) => saldoDe(d) > 0 && !d.abonos.some((a) => delMes(a.fecha))).map((d) => d.pagoMinimo)
  );
  const comprometido = facturasPendientes + minimosDeuda;
  const asignado = sumar(vigentes(e, mes2).map((b) => b.asignacion));
  return {
    ingresosReales,
    ingresosEsperados,
    usaEsperado,
    base,
    porPersona: {
      a: sumar(ingresos.filter((i) => i.de === "a").map((i) => i.monto)),
      b: sumar(ingresos.filter((i) => i.de === "b").map((i) => i.monto))
    },
    gastado,
    abonos,
    aportes,
    salidas,
    queda,
    facturasPendientes,
    minimosDeuda,
    comprometido,
    libre: queda - comprometido,
    asignado,
    sinAsignar: ingresosEsperados - asignado
  };
}
function comparacion(e, mes2, hastaDia) {
  const prev = mesAnterior(mes2);
  const cabe = (fecha2) => hastaDia === void 0 || Number(fecha2.slice(8, 10)) <= hastaDia;
  const gastosDe2 = (m) => e.gastos.filter((g) => g.fecha.startsWith(m) && cabe(g.fecha));
  const actual = gastosDe2(mes2);
  const anterior = gastosDe2(prev);
  const porCat = (lista) => {
    const mapa = /* @__PURE__ */ new Map();
    lista.forEach((g) => mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + g.monto));
    return mapa;
  };
  const catActual = porCat(actual);
  const catAnterior = porCat(anterior);
  const categorias = /* @__PURE__ */ new Set([...catActual.keys(), ...catAnterior.keys()]);
  let subio = null;
  let bajo = null;
  for (const c of categorias) {
    const d = (catActual.get(c) ?? 0) - (catAnterior.get(c) ?? 0);
    if (d > 0 && (!subio || d > subio.delta)) subio = { categoria: c, delta: d };
    if (d < 0 && (!bajo || d < bajo.delta)) bajo = { categoria: c, delta: d };
  }
  const gastadoActual = sumar(actual.map((g) => g.monto));
  const gastadoAnterior = sumar(anterior.map((g) => g.monto));
  const delta = gastadoActual - gastadoAnterior;
  const ingresosEn = (m) => sumar(e.ingresos.filter((i) => i.fecha.startsWith(m) && cabe(i.fecha)).map((i) => i.monto));
  return {
    hayAnterior: e.gastos.some((g) => g.fecha.startsWith(prev)),
    gastadoActual,
    gastadoAnterior,
    delta,
    deltaPct: gastadoAnterior > 0 ? Math.round(delta / gastadoAnterior * 100) : null,
    ingresosDelta: ingresosEn(mes2) - ingresosEn(prev),
    subio,
    bajo,
    parcial: hastaDia !== void 0
  };
}
function fraseComparacion(c, nombreCat, dinero2) {
  if (!c.hayAnterior) return null;
  const cola = c.parcial ? " a esta altura" : "";
  let frase;
  if (c.deltaPct === null) {
    frase = c.delta === 0 ? `Van igual que el mes pasado${cola}.` : `Llevan ${dinero2(Math.abs(c.delta))} ${c.delta < 0 ? "menos" : "más"} que el mes pasado${cola}.`;
  } else if (Math.abs(c.deltaPct) <= 3) {
    frase = `Van igual que el mes pasado${cola}.`;
  } else {
    frase = `Van ${Math.abs(c.deltaPct)}% por ${c.delta < 0 ? "debajo" : "encima"} del mes pasado${cola}.`;
  }
  if (c.subio && c.subio.delta >= Math.max(1, c.gastadoAnterior) * 0.1) {
    frase += ` Subió ${nombreCat(c.subio.categoria)} (+${dinero2(c.subio.delta)}).`;
  }
  return frase;
}
function sueldoParaVivir(perfil) {
  const esperado = perfil.ingresoEsperado ?? { a: 0, b: 0 };
  const a = esperado.a || 0;
  const b = esperado.b || 0;
  const elegido = perfil.plan?.sueldoVivir ?? "menor";
  if (elegido !== "menor") return { persona: elegido, monto: esperado[elegido] || 0 };
  if (a <= 0 && b <= 0) return { persona: null, monto: 0 };
  if (a <= 0) return { persona: "b", monto: b };
  if (b <= 0) return { persona: "a", monto: a };
  return a <= b ? { persona: "a", monto: a } : { persona: "b", monto: b };
}
var gastadoParaVivir = (e, mes2) => sumar(e.gastos.filter((g) => g.fecha.startsWith(mes2) && cajaDe(g, e.bolsillos) === "vivir").map((g) => g.monto));
function vistaUnSueldo(e, mes2) {
  const { persona: persona2, monto: tope } = sueldoParaVivir(e.perfil);
  const gastado = gastadoParaVivir(e, mes2);
  const disp = tope - gastado;
  return { persona: persona2, tope, gastado, disponible: disp, avance: disp < 0 ? 100 : pct(gastado, tope), estado: semaforo(gastado, disp, tope) };
}
function reparto(e, mes2) {
  const esperado = e.perfil.ingresoEsperado ?? { a: 0, b: 0 };
  const entra = (esperado.a || 0) + (esperado.b || 0);
  const activos = vigentes(e, mes2);
  const delMes = e.gastos.filter((g) => g.fecha.startsWith(mes2));
  const porPersona = { a: { plan: 0, real: 0 }, b: { plan: 0, real: 0 } };
  for (const p of ["a", "b"]) {
    porPersona[p].plan = sumar(activos.filter((b) => b.ambito === p && esFueraDeCasa(b)).map((b) => b.asignacion));
    porPersona[p].real = sumar(delMes.filter((g) => g.pagadoPor === p && cajaDe(g, e.bolsillos) === "fuera").map((g) => g.monto));
  }
  const fueraPlan = porPersona.a.plan + porPersona.b.plan;
  const fueraReal = sumar(delMes.filter((g) => cajaDe(g, e.bolsillos) === "fuera").map((g) => g.monto));
  const tope = sueldoParaVivir(e.perfil).monto;
  const asignado = sumar(activos.filter((b) => !esFueraDeCasa(b)).map((b) => b.asignacion));
  const gastado = gastadoParaVivir(e, mes2);
  const avanzarPlan = entra - fueraPlan - tope;
  const av = e.perfil.plan?.avanzar ?? { deudas: 0, ahorro: 0 };
  const real = sumar(abonosDelMes(e, mes2).map((a) => a.monto)) + sumar(aportesDelMes(e, mes2).map((a) => a.monto));
  return {
    entra,
    fuera: { plan: fueraPlan, real: fueraReal, porPersona },
    vivir: { tope, asignado, gastado, colchon: tope - asignado },
    avanzar: { plan: avanzarPlan, deudas: av.deudas, ahorro: av.ahorro, real, sinRepartir: avanzarPlan - av.deudas - av.ahorro }
  };
}
function avanceAvanzar(e, mes2) {
  const av = e.perfil.plan?.avanzar ?? { deudas: 0, ahorro: 0 };
  const abonos = abonosDelMes(e, mes2);
  const aportes = aportesDelMes(e, mes2);
  const por = (lista, p) => sumar(lista.filter((x) => x.por === p).map((x) => x.monto));
  return {
    metaDeudas: av.deudas,
    abonos: sumar(abonos.map((a) => a.monto)),
    abonosPor: { a: por(abonos, "a"), b: por(abonos, "b") },
    metaAhorro: av.ahorro,
    aportes: sumar(aportes.map((a) => a.monto)),
    aportesPor: { a: por(aportes, "a"), b: por(aportes, "b") }
  };
}
function mesesParaLibres(deudas, ataqueMensual) {
  const saldo2 = sumar(deudas.map(saldoDe));
  if (saldo2 <= 0) return 0;
  if (ataqueMensual <= 0) return null;
  return Math.ceil(saldo2 / ataqueMensual);
}

// src/categorias.ts
var CATEGORIAS = [
  { id: "mercado", nombre: "Mercado", emoji: "🛒" },
  { id: "comida", nombre: "Salidas y comida", emoji: "🍕" },
  { id: "transporte", nombre: "Transporte", emoji: "🚕" },
  { id: "hogar", nombre: "Hogar", emoji: "🏠" },
  { id: "servicios", nombre: "Servicios", emoji: "💡" },
  { id: "salud", nombre: "Salud", emoji: "💊" },
  { id: "diversion", nombre: "Planes", emoji: "🎬" },
  { id: "ropa", nombre: "Ropa", emoji: "👗" },
  { id: "regalos", nombre: "Regalos", emoji: "🎁" },
  { id: "viajes", nombre: "Viajes", emoji: "✈️" },
  { id: "fuera", nombre: "Fuera de casa", emoji: "📤" },
  { id: "otros", nombre: "Otros", emoji: "📦" }
];
var catInfo = (id) => CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[CATEGORIAS.length - 1];

// src/comercios.ts
var MAPA = [
  // Mercado
  ["EXITO", "mercado"],
  ["CARULLA", "mercado"],
  ["OLIMPICA", "mercado"],
  ["JUMBO", "mercado"],
  ["SURTIMAX", "mercado"],
  ["SURTIFRUVER", "mercado"],
  ["SUPERINTER", "mercado"],
  ["MAKRO", "mercado"],
  ["ZAPATOCA", "mercado"],
  ["LA 14", "mercado"],
  ["MERCADO", "mercado"],
  ["SUPERMERCADO", "mercado"],
  ["D1", "mercado"],
  ["ARA", "mercado"],
  ["ISIMO", "mercado"],
  // Salidas y comida
  ["RAPPI", "comida"],
  ["DIDI FOOD", "comida"],
  ["MCDONALD", "comida"],
  ["BURGER KING", "comida"],
  ["KFC", "comida"],
  ["DOMINO", "comida"],
  ["PAPA JOHN", "comida"],
  ["FRISBY", "comida"],
  ["EL CORRAL", "comida"],
  ["CREPES", "comida"],
  ["JUAN VALDEZ", "comida"],
  ["TOSTAO", "comida"],
  ["STARBUCKS", "comida"],
  ["DUNKIN", "comida"],
  ["SUBWAY", "comida"],
  ["ARCHIES", "comida"],
  ["PRESTO", "comida"],
  ["SIERRA NEVADA", "comida"],
  ["RESTAURANTE", "comida"],
  ["PANADERIA", "comida"],
  ["PIZZA", "comida"],
  ["SUSHI", "comida"],
  ["CAFE", "comida"],
  ["HELADER", "comida"],
  // Transporte
  ["UBER", "transporte"],
  ["DIDI", "transporte"],
  ["CABIFY", "transporte"],
  ["INDRIVE", "transporte"],
  ["TERPEL", "transporte"],
  ["PRIMAX", "transporte"],
  ["BIOMAX", "transporte"],
  ["ESSO", "transporte"],
  ["MOBIL", "transporte"],
  ["TEXACO", "transporte"],
  ["PEAJE", "transporte"],
  ["PARQUEADERO", "transporte"],
  ["TRANSMILENIO", "transporte"],
  ["TULLAVE", "transporte"],
  ["TAXI", "transporte"],
  ["ESTACION DE SERVICIO", "transporte"],
  ["GASOLINA", "transporte"],
  // Servicios
  ["CLARO", "servicios"],
  ["MOVISTAR", "servicios"],
  ["TIGO", "servicios"],
  ["ETB", "servicios"],
  ["WOM", "servicios"],
  ["EPM", "servicios"],
  ["ENEL", "servicios"],
  ["CODENSA", "servicios"],
  ["VANTI", "servicios"],
  ["GAS NATURAL", "servicios"],
  ["ACUEDUCTO", "servicios"],
  ["EMCALI", "servicios"],
  ["AFINIA", "servicios"],
  ["AIR-E", "servicios"],
  ["DIRECTV", "servicios"],
  ["INTERNET", "servicios"],
  // Salud
  ["FARMATODO", "salud"],
  ["CRUZ VERDE", "salud"],
  ["LA REBAJA", "salud"],
  ["DROGUERIA", "salud"],
  ["LOCATEL", "salud"],
  ["COLSANITAS", "salud"],
  ["COMPENSAR", "salud"],
  ["CLINICA", "salud"],
  ["ODONTO", "salud"],
  ["OPTICA", "salud"],
  ["LABORATORIO", "salud"],
  // Planes
  ["NETFLIX", "diversion"],
  ["SPOTIFY", "diversion"],
  ["DISNEY", "diversion"],
  ["HBO", "diversion"],
  ["PRIME VIDEO", "diversion"],
  ["YOUTUBE", "diversion"],
  ["CINE COLOMBIA", "diversion"],
  ["CINEMARK", "diversion"],
  ["ROYAL FILMS", "diversion"],
  ["PROCINAL", "diversion"],
  ["PLAYSTATION", "diversion"],
  ["XBOX", "diversion"],
  ["STEAM", "diversion"],
  ["NINTENDO", "diversion"],
  ["TICKETMASTER", "diversion"],
  ["TUBOLETA", "diversion"],
  ["APPLE.COM", "diversion"],
  // Ropa
  ["FALABELLA", "ropa"],
  ["ZARA", "ropa"],
  ["H&M", "ropa"],
  ["PULL&BEAR", "ropa"],
  ["BERSHKA", "ropa"],
  ["ARTURO CALLE", "ropa"],
  ["TENNIS", "ropa"],
  ["KOAJ", "ropa"],
  ["STUDIO F", "ropa"],
  ["ADIDAS", "ropa"],
  ["NIKE", "ropa"],
  ["VELEZ", "ropa"],
  ["BOSI", "ropa"],
  ["TOTTO", "ropa"],
  // Hogar
  ["HOMECENTER", "hogar"],
  ["SODIMAC", "hogar"],
  ["EASY", "hogar"],
  ["ALKOSTO", "hogar"],
  ["KTRONIX", "hogar"],
  ["IKEA", "hogar"],
  ["FERRETERIA", "hogar"],
  ["ADMINISTRACION", "hogar"],
  ["ARRIENDO", "hogar"],
  // Viajes
  ["AVIANCA", "viajes"],
  ["LATAM", "viajes"],
  ["WINGO", "viajes"],
  ["VIVA AIR", "viajes"],
  ["COPA AIRLINES", "viajes"],
  ["BOOKING", "viajes"],
  ["AIRBNB", "viajes"],
  ["DESPEGAR", "viajes"],
  ["EXPEDIA", "viajes"],
  ["HOTEL", "viajes"],
  ["HOSTAL", "viajes"]
];
function claveComercio(comercio) {
  const limpio = comercio.replace(/[^A-Z0-9 ]/gi, " ").replace(/\s+/g, " ").trim().toUpperCase();
  const primera = limpio.split(" ").find((p) => p.length >= 4 && !/^\d+$/.test(p));
  return primera ?? limpio;
}
var PALABRAS = MAPA.map(([palabra, categoria2]) => {
  const clave = palabra.trim();
  const escapada = clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = clave.length <= 4 ? new RegExp(`(^|[^A-Z0-9])${escapada}([^A-Z0-9]|$)`) : new RegExp(`(^|[^A-Z0-9])${escapada}`);
  return [re, categoria2];
});
function categoriaDe(comercio, aprendidos = {}) {
  const nombre = comercio.toUpperCase().trim();
  if (!nombre) return null;
  const aprendido = aprendidos[nombre] ?? aprendidos[claveComercio(comercio)];
  if (aprendido) return aprendido;
  return PALABRAS.find(([re]) => re.test(nombre))?.[1] ?? null;
}

// src/mensajes.ts
var esLectura = (r) => !("error" in r);
var esIngreso = (l) => l.tipo === "ingreso";
var MOTIVOS = {
  "sin-monto": "No encontré un valor en el mensaje.",
  "no-es-gasto": "Ese mensaje no parece un gasto.",
  "es-ingreso": "Parece plata que entró, pero no encontré el valor."
};
function normalizar(texto2) {
  return texto2.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}
function huella(texto2) {
  const t = normalizar(texto2);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${t.length.toString(36)}${h.toString(36)}`;
}
var BANCOS = [
  [/BANCOLOMBIA/, "Bancolombia"],
  [/NEQUI/, "Nequi"],
  [/DAVIPLATA/, "Daviplata"],
  [/DAVIVIENDA/, "Davivienda"],
  [/RAPPICARD|RAPPI CARD|RAPPIPAY/, "RappiCard"],
  [/\bCMR\b|BANCO FALABELLA/, "Falabella"],
  [/LULO/, "Lulo Bank"],
  [/SCOTIABANK|COLPATRIA/, "Scotiabank"],
  [/BBVA/, "BBVA"],
  [/BANCO DE BOGOTA/, "Banco de Bogotá"],
  [/BANCO DE OCCIDENTE/, "Occidente"],
  [/NUBANK|\bNU\b/, "Nu"]
];
var VERBOS = [
  { tipo: "compra", re: /\bCOMPR(A|ASTE|O|AS)\b/ },
  { tipo: "retiro", re: /\bRETIR(O|ASTE|OS)\b|\bAVANCE\b/ },
  { tipo: "transferencia", re: /\bTRANSFER(ISTE|ENCIA)\b|\bENVIASTE\b/ },
  { tipo: "pago", re: /\bPAG(O|ASTE|OS|UE)\b/ }
];
var RE_INGRESO = /\bRECIBISTE\b|\bTE CONSIGNARON\b|\bCONSIGNACION\b|\bTE ENVIO\b|\bTE TRANSFIRIO\b|\bABONO A TU\b|\bDEVOLUCION\b|\bREVERSION\b|\bTE LLEGARON\b|\bNOMINA\b/;
var RE_NO_TX = /CLAVE DINAMICA|NO COMPARTAS|NUNCA COMPARTAS|CODIGO DE (VERIFICACION|SEGURIDAD|ACCESO)|\bOTP\b|CONTRASENA|ACTUALIZA TUS DATOS|APROVECHA|PROMOCION|FELICITACIONES|SORTEO|INTENTO DE|BLOQUE(O|AMOS)|TU CLAVE/;
var MESES = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SEP: 9,
  SET: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12
};
function aNumero(bruto) {
  const t = bruto.replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
  if (!t) return 0;
  const ultimo = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if (ultimo === -1) return Number(t) || 0;
  const decimales = t.length - ultimo - 1;
  if (decimales === 1 || decimales === 2) {
    const entero = t.slice(0, ultimo).replace(/[.,]/g, "");
    return Number(`${entero || "0"}.${t.slice(ultimo + 1)}`) || 0;
  }
  return Number(t.replace(/[.,]/g, "")) || 0;
}
function importesEn(t) {
  const out = [];
  const conSigno = /(?:\$|COP\s?\$?|USD\s?\$?)\s?([\d][\d.,]*)/g;
  let m;
  while (m = conSigno.exec(t)) {
    const valor = aNumero(m[1]);
    if (valor > 0) out.push({ valor, desde: m.index, hasta: m.index + m[0].length });
  }
  if (out.length) return out;
  const sinSigno = /\b(?:POR|DE)\s+([\d][\d.,]{2,})/g;
  while (m = sinSigno.exec(t)) {
    const valor = aNumero(m[1]);
    if (valor > 0) out.push({ valor, desde: m.index, hasta: m.index + m[0].length });
  }
  return out;
}
var CORTES = /[,;:!?]|\.(?=\s|$)|\s\d{1,2}[/-]\d{1,2}|\sT\.?\s?(?:CRED|DEB)|\sTARJETA|\sDESDE|\sCUPO|\sSALDO|\sHORA\b|\sCON\s|\sPRODUCTO|\sREF\b|\sSI NO\b|\sINQUIETUDES|\sPOR\b|\sVALOR\b|\s\*\d|\sA LAS\b/;
function comercioDe(t, desde) {
  let resto = t.slice(desde);
  const conector = resto.match(/^\s*(?:EN LA|EN EL|EN|A|CON|PARA)\s+/);
  resto = conector ? resto.slice(conector[0].length) : resto.replace(/^\s+/, "");
  const corte = resto.search(CORTES);
  const bruto = corte >= 0 ? resto.slice(0, corte) : resto;
  return bruto.replace(/\*+\d*/g, " ").replace(/[^A-Z0-9&.\- ]/g, " ").replace(/\s+/g, " ").trim().replace(/\s+(EL|LA|DE|DEL|Y|EN)$/, "").trim().slice(0, 40);
}
function remitenteDe(t, desde) {
  let resto = t.slice(desde);
  const conector = resto.match(/^\s*(?:POR CONCEPTO DE|POR PARTE DE|DESDE|DE)\s+/);
  resto = conector ? resto.slice(conector[0].length) : resto.replace(/^\s+/, "");
  const corte = resto.search(/\sA TU\b|\sEN TU\b|\sA LA\b/);
  const acotado = corte >= 0 ? resto.slice(0, corte) : resto;
  return comercioDe(acotado, 0);
}
var fuenteIngresoDe = (t) => /NOMINA|SALARIO|SUELDO|QUINCENA/.test(t) ? "nomina" : /DEVOLUCION|REVERSION|REEMBOLSO/.test(t) ? "devolucion" : "otro";
var iso = (a, m, d) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
var valida = (d, m, a) => d >= 1 && d <= 31 && m >= 1 && m <= 12 && a >= 2e3 && a <= 2100;
function fechaDe(t) {
  const anio = Number(hoy().slice(0, 4));
  const candidatos2 = [];
  const numerica = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numerica) {
    const d = Number(numerica[1]);
    const m = Number(numerica[2]);
    let a = numerica[3] ? Number(numerica[3]) : anio;
    if (a < 100) a += 2e3;
    if (valida(d, m, a)) candidatos2.push(iso(a, m, d));
    if (valida(m, d, a)) candidatos2.push(iso(a, d, m));
  }
  const conMes = t.match(/\b(\d{1,2})[ -](?:DE[ -])?([A-Z]{3})[A-Z]*\.?(?:[ -](?:DE[ -])?(\d{2,4}))?/);
  if (conMes && MESES[conMes[2]]) {
    const d = Number(conMes[1]);
    const m = MESES[conMes[2]];
    let a = conMes[3] ? Number(conMes[3]) : anio;
    if (a < 100) a += 2e3;
    if (valida(d, m, a)) candidatos2.unshift(iso(a, m, d));
  }
  const limite = hoy();
  return candidatos2.find((f) => f <= limite) ?? limite;
}
function leerMensaje(texto2, aprendidos = {}) {
  const t = normalizar(texto2);
  if (t.length < 8) return { error: "no-es-gasto" };
  if (RE_NO_TX.test(t)) return { error: "no-es-gasto" };
  const verbo = VERBOS.find((v) => v.re.test(t));
  const banco = BANCOS.find(([re]) => re.test(t))?.[1] ?? "Desconocido";
  if (RE_INGRESO.test(t) && (!verbo || verbo.tipo === "pago" || verbo.tipo === "transferencia")) {
    const importes2 = importesEn(t);
    if (!importes2.length) return { error: "es-ingreso" };
    const desde = t.search(RE_INGRESO);
    const importe2 = importes2.find((i) => i.desde >= desde) ?? importes2[0];
    return {
      monto: importe2.valor,
      comercio: remitenteDe(t, importe2.hasta),
      fecha: fechaDe(t),
      banco,
      tipo: "ingreso",
      categoria: "otros",
      confianza: "baja",
      hash: huella(texto2),
      fuenteIngreso: fuenteIngresoDe(t)
    };
  }
  if (!verbo) return { error: "no-es-gasto" };
  const importes = importesEn(t);
  if (!importes.length) return { error: "sin-monto" };
  const desdeVerbo = t.search(verbo.re);
  const importe = importes.find((i) => i.desde >= desdeVerbo) ?? importes[0];
  const comercio = comercioDe(t, importe.hasta);
  const categoria2 = categoriaDe(comercio, aprendidos);
  const tarjeta = t.match(/\*\s?(\d{4})\b/)?.[1];
  return {
    monto: importe.valor,
    comercio,
    fecha: fechaDe(t),
    banco,
    tipo: verbo.tipo,
    ...tarjeta ? { tarjeta } : {},
    categoria: categoria2 ?? "otros",
    confianza: banco !== "Desconocido" && comercio.length >= 3 && categoria2 !== null ? "alta" : "baja",
    hash: huella(texto2)
  };
}

// mcp/datos.ts
var COLECCION = {
  gasto: "gastos",
  factura: "facturas",
  deuda: "deudas",
  reto: "retos",
  meta: "metas",
  foto: "fotos",
  bolsillo: "bolsillos",
  ingreso: "ingresos",
  producto: "productos",
  lista: "listas"
};
var perfilBase = { nombreA: "", nombreB: "", nombrePareja: "", moneda: "COP", onboarded: true };
function datosDesdeFilas(filas) {
  const estado = {
    version: 1,
    perfil: { ...perfilBase },
    gastos: [],
    facturas: [],
    deudas: [],
    retos: [],
    metas: [],
    fotos: [],
    bolsillos: [],
    ingresos: [],
    productos: [],
    listas: []
  };
  const apuntes = [];
  for (const f of filas) {
    if (f.tipo === "perfil") estado.perfil = { ...estado.perfil, ...f.data, onboarded: true };
    else if (f.tipo === "apunte") apuntes.push(f.data);
    else if (f.tipo in COLECCION) estado[COLECCION[f.tipo]].push(f.data);
  }
  return { estado, apuntes };
}

// mcp/herramientas.ts
var ErrorUsuario = class extends Error {
};
function hoyEn(zona = "America/Bogota", ahora = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}
var norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
var diaUTC = (iso2) => {
  const [y, m, d] = iso2.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 864e5;
};
var diasEntre = (desde, hasta) => Math.round(diaUTC(hasta) - diaUTC(desde));
function diasParaVencer(diaVence, hoy2) {
  const [y, m, d] = hoy2.split("-").map(Number);
  const ultimo = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const dia = Math.min(diaVence, ultimo(y, m));
  if (dia >= d) return dia - d;
  const [py, pm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  const prox = `${py}-${String(pm).padStart(2, "0")}-${String(Math.min(diaVence, ultimo(py, pm))).padStart(2, "0")}`;
  return diasEntre(hoy2, prox);
}
var nombreDe = (e, p) => p === "ambos" ? "Los dos" : p === "hogar" ? "La casa" : (p === "a" ? e.perfil.nombreA : e.perfil.nombreB) || (p === "a" ? "Persona 1" : "Persona 2");
function texto(v, campo, obligatorio = false) {
  if (v === void 0 || v === null || v === "") {
    if (obligatorio) throw new ErrorUsuario(`Falta "${campo}".`);
    return void 0;
  }
  if (typeof v !== "string") throw new ErrorUsuario(`"${campo}" debe ser texto.`);
  return v.trim();
}
function monto(v, campo = "monto") {
  const n = typeof v === "string" ? Number(v.replace(/[$\s.]/g, "").replace(",", ".")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) throw new ErrorUsuario(`"${campo}" debe ser un número mayor que cero.`);
  return Math.round(n);
}
function fecha(v, ctx) {
  const f = texto(v, "fecha");
  if (!f) return ctx.hoy;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new ErrorUsuario('"fecha" va como AAAA-MM-DD.');
  return f;
}
function mes(v, ctx) {
  const m = texto(v, "mes");
  if (!m) return ctx.hoy.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m)) throw new ErrorUsuario('"mes" va como AAAA-MM.');
  return m;
}
function persona(v, e, ctx, campo) {
  const t = texto(v, campo);
  if (!t || norm(t) === "yo") return ctx.persona;
  if (t === "a" || t === "b") return t;
  const n = norm(t);
  const candidatos2 = ["a", "b"].filter((p) => {
    const nombre = norm(p === "a" ? e.perfil.nombreA : e.perfil.nombreB);
    return nombre && (nombre === n || nombre.split(" ")[0] === n.split(" ")[0]);
  });
  if (candidatos2.length === 1) return candidatos2[0];
  throw new ErrorUsuario(`No sé quién es "${t}". Son ${nombreDe(e, "a")} (a) y ${nombreDe(e, "b")} (b).`);
}
function booleano(v, campo, porDefecto) {
  if (v === void 0 || v === null) return porDefecto;
  if (typeof v !== "boolean") throw new ErrorUsuario(`"${campo}" debe ser true o false.`);
  return v;
}
function uno(lista, q, que, nombre) {
  const t = texto(q, que, true);
  const porId = lista.find((x) => x.id === t);
  if (porId) return porId;
  const n = norm(t);
  const exactos = lista.filter((x) => norm(nombre(x)) === n);
  const hallados = exactos.length ? exactos : lista.filter((x) => norm(nombre(x)).includes(n));
  if (hallados.length === 1) return hallados[0];
  const opciones = (hallados.length ? hallados : lista).map((x) => `${nombre(x)} (${x.id})`).join(", ");
  if (hallados.length > 1) throw new ErrorUsuario(`Hay varias que coinciden con "${t}": ${opciones}. Usa el id.`);
  throw new ErrorUsuario(lista.length ? `No encontré "${t}". Hay: ${opciones}.` : `No hay ninguna todavía.`);
}
var saldo = (d) => Math.max(0, d.montoInicial - sumar(d.abonos.map((a) => a.monto)));
var ahorrado = (m) => sumar(m.aportes.map((a) => a.monto));
async function leer(ctx) {
  return datosDesdeFilas(await ctx.almacen.leer());
}
var vistaGasto = (g, e) => ({
  id: g.id,
  fecha: g.fecha,
  monto: g.monto,
  categoria: catInfo(g.categoria).nombre,
  nota: g.nota,
  pagoPor: nombreDe(e, g.pagadoPor),
  compartido: g.compartido,
  bolsillo: bolsilloDe(g, e.bolsillos)?.nombre ?? null,
  ...g.origen ? { desde: g.origen.fuente === "sms" ? `SMS ${g.origen.banco ?? ""}`.trim() : "mensaje pegado" } : {}
});
var vistaDeuda = (d, e, mesActual) => {
  const s = saldo(d);
  return {
    id: d.id,
    nombre: d.nombre,
    de: nombreDe(e, d.de),
    montoInicial: d.montoInicial,
    abonado: d.montoInicial - s,
    saldo: s,
    pagadaPct: pct(d.montoInicial - s, d.montoInicial),
    pagoMinimo: d.pagoMinimo,
    tasaMensualPct: d.tasaMensual,
    abonadoEsteMes: sumar(d.abonos.filter((a) => a.fecha.startsWith(mesActual)).map((a) => a.monto)),
    ultimoAbono: d.abonos.reduce((u, a) => u && u > a.fecha ? u : a.fecha, null)
  };
};
var vistaMeta = (m, e, ctx) => {
  const lleva = ahorrado(m);
  const falta = Math.max(0, m.montoObjetivo - lleva);
  const meses = Math.max(0, diasEntre(ctx.hoy, m.fecha) > 0 ? Math.ceil(diasEntre(ctx.hoy, m.fecha) / 30.44) : 0);
  return {
    id: m.id,
    titulo: m.titulo,
    emoji: m.emoji,
    descripcion: m.descripcion,
    fecha: m.fecha,
    diasQueFaltan: diasEntre(ctx.hoy, m.fecha),
    objetivo: m.montoObjetivo,
    ahorrado: lleva,
    falta,
    avancePct: pct(lleva, m.montoObjetivo),
    porMesParaLlegar: falta > 0 ? Math.ceil(falta / Math.max(1, meses)) : 0,
    aportadoEsteMes: sumar(m.aportes.filter((a) => a.fecha.startsWith(ctx.hoy.slice(0, 7))).map((a) => a.monto)),
    aportesPorPersona: {
      [nombreDe(e, "a")]: sumar(m.aportes.filter((a) => a.por === "a").map((a) => a.monto)),
      [nombreDe(e, "b")]: sumar(m.aportes.filter((a) => a.por === "b").map((a) => a.monto))
    }
  };
};
var vistaReto = (r, ctx) => ({
  id: r.id,
  titulo: r.titulo,
  emoji: r.emoji,
  descripcion: r.descripcion,
  tipo: r.tipo === "ahorro" ? "ahorrar un monto" : r.tipo === "habito" ? "hábito (días o veces)" : "no pasarse de un tope",
  meta: r.meta,
  progreso: r.progreso,
  avancePct: pct(r.progreso, r.meta),
  ...r.tipo === "limite" ? { sePaso: r.progreso > r.meta } : {},
  fechaLimite: r.fechaLimite,
  diasQueFaltan: diasEntre(ctx.hoy, r.fechaLimite),
  completado: r.completado,
  recompensa: r.recompensa
});
var vistaFactura = (f, e, m, ctx) => {
  const pagada = f.pagadaEn.includes(m);
  return {
    id: f.id,
    nombre: f.nombre,
    monto: f.monto,
    diaVence: f.diaVence,
    responsable: nombreDe(e, f.responsable),
    pagada,
    ...!pagada && m === ctx.hoy.slice(0, 7) ? { diasParaVencer: diasParaVencer(f.diaVence, ctx.hoy) } : {}
  };
};
function balance(e, m) {
  let a = 0;
  let b = 0;
  e.gastos.filter((g) => g.compartido && g.fecha.startsWith(m)).forEach((g) => g.pagadoPor === "a" ? a += g.monto : b += g.monto);
  const saldoAB = (a - b) / 2;
  if (a + b === 0) return null;
  if (saldoAB === 0) return "Están a paz y salvo en lo compartido.";
  const [debe, recibe] = saldoAB > 0 ? ["b", "a"] : ["a", "b"];
  return `${nombreDe(e, debe)} le debe ${dinero(Math.abs(saldoAB), e.perfil.moneda)} a ${nombreDe(e, recibe)} por lo compartido.`;
}
var CATS = CATEGORIAS.map((c) => c.id);
var categoria = (v) => {
  const t = texto(v, "categoria");
  if (!t) return void 0;
  const hallada = CATEGORIAS.find((c) => c.id === norm(t) || norm(c.nombre) === norm(t));
  if (!hallada) throw new ErrorUsuario(`Categoría desconocida "${t}". Son: ${CATS.join(", ")}.`);
  return hallada.id;
};
var P = {
  mes: { type: "string", description: "Mes AAAA-MM. Sin él, el mes actual." },
  fecha: { type: "string", description: "Fecha AAAA-MM-DD. Sin ella, hoy." },
  persona: (que) => ({
    type: "string",
    description: `${que}: "a", "b", "yo" o el nombre. Sin él, quien conectó a Claude.`
  }),
  monto: { type: "number", description: "Monto en pesos, sin puntos ni signos (45900)." }
};
var HERRAMIENTAS = [
  {
    name: "como_vamos",
    title: "Cómo vamos este mes",
    description: 'La foto completa de un mes: cuánto entró, cuánto salió, cuánto queda y cuánto queda "de verdad" tras facturas y mínimos de deuda; si van viviendo con un sueldo; la cascada entra → fuera de casa → vivir → avanzar; cada bolsillo con su semáforo; la comparación contra el mes pasado; facturas por vencer y quién le debe a quién. Úsala primero ante cualquier pregunta general de plata.',
    inputSchema: { type: "object", properties: { mes: P.mes } },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const m = mes(args.mes, ctx);
      const esActual = m === ctx.hoy.slice(0, 7);
      const r = resumenMes(e, m);
      const u = vistaUnSueldo(e, m);
      const c = comparacion(e, m, esActual ? Number(ctx.hoy.slice(8, 10)) : void 0);
      const facturas = e.facturas.filter((f) => f.activa).map((f) => vistaFactura(f, e, m, ctx));
      return {
        mes: m,
        hoy: ctx.hoy,
        moneda: e.perfil.moneda,
        personas: { a: nombreDe(e, "a"), b: nombreDe(e, "b") },
        caja: {
          entra: r.base,
          entraSegun: r.usaEsperado ? "lo esperado (no han anotado ingresos reales este mes)" : r.ingresosReales > 0 ? "ingresos reales anotados" : "nada: no hay ingresos anotados ni esperados",
          ingresosRealesPorPersona: { [nombreDe(e, "a")]: r.porPersona.a, [nombreDe(e, "b")]: r.porPersona.b },
          ingresosEsperados: r.ingresosEsperados,
          gastado: r.gastado,
          abonosADeudas: r.abonos,
          aportesAHitos: r.aportes,
          queda: r.queda,
          facturasSinPagar: r.facturasPendientes,
          minimosDeDeudaSinAbonar: r.minimosDeuda,
          libreDeVerdad: r.libre,
          asignadoABolsillos: r.asignado,
          sinBolsillo: r.sinAsignar
        },
        vivirConUnSueldo: {
          sueldoDe: u.persona ? nombreDe(e, u.persona) : null,
          tope: u.tope,
          gastadoParaVivir: u.gastado,
          disponible: u.disponible,
          avancePct: u.avance,
          semaforo: u.estado
        },
        reparto: reparto(e, m),
        avanzarEsteMes: avanceAvanzar(e, m),
        contraElMesPasado: {
          ...c,
          frase: fraseComparacion(c, (cat) => catInfo(cat).nombre, (n) => dinero(n, e.perfil.moneda))
        },
        bolsillos: vigentes(e, m).map((b) => {
          const v = vistaBolsillo(b, e, m);
          return {
            id: b.id,
            nombre: `${b.emoji} ${b.nombre}`,
            de: nombreDe(e, b.ambito),
            asignacion: b.asignacion,
            gastado: v.gastado,
            disponible: v.disponible,
            avancePct: v.avance,
            semaforo: v.estado,
            loQueSobra: b.acumula ? "se guarda" : "se reinicia"
          };
        }),
        facturasPorPagar: facturas.filter((f) => !f.pagada),
        compartidos: balance(e, m)
      };
    }
  },
  {
    name: "buscar_gastos",
    title: "Buscar gastos",
    description: "Busca gastos por mes o rango de fechas, categoría, texto de la nota, quién pagó o si fue compartido. Devuelve el total, el reparto por categoría y por persona, y la lista (lo más reciente primero).",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "string", description: "Mes AAAA-MM. Si no das mes ni rango, el mes actual." },
        desde: { type: "string", description: "Desde AAAA-MM-DD (incluido)." },
        hasta: { type: "string", description: "Hasta AAAA-MM-DD (incluido)." },
        categoria: { type: "string", enum: CATS },
        texto: { type: "string", description: "Palabra en la nota o el comercio (sin importar tildes)." },
        pago_por: { type: "string", description: '"a", "b" o el nombre.' },
        compartido: { type: "boolean" },
        limite: { type: "number", description: "Cuántos gastos listar (por defecto 50). Los totales cuentan todos." }
      }
    },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const desde = texto(args.desde, "desde");
      const hasta = texto(args.hasta, "hasta");
      const m = desde || hasta ? texto(args.mes, "mes") : mes(args.mes, ctx);
      const cat = categoria(args.categoria);
      const q = texto(args.texto, "texto");
      const quien = args.pago_por === void 0 ? void 0 : persona(args.pago_por, e, ctx, "pago_por");
      const compartido = args.compartido === void 0 ? void 0 : booleano(args.compartido, "compartido", false);
      const limite = typeof args.limite === "number" && args.limite > 0 ? Math.floor(args.limite) : 50;
      const lista = e.gastos.filter(
        (g) => (!m || g.fecha.startsWith(m)) && (!desde || g.fecha >= desde) && (!hasta || g.fecha <= hasta) && (!cat || g.categoria === cat) && (!q || norm(g.nota).includes(norm(q))) && (!quien || g.pagadoPor === quien) && (compartido === void 0 || g.compartido === compartido)
      ).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const porCategoria = /* @__PURE__ */ new Map();
      lista.forEach((g) => porCategoria.set(catInfo(g.categoria).nombre, (porCategoria.get(catInfo(g.categoria).nombre) ?? 0) + g.monto));
      return {
        filtro: { mes: m ?? null, desde: desde ?? null, hasta: hasta ?? null },
        moneda: e.perfil.moneda,
        cuantos: lista.length,
        total: sumar(lista.map((g) => g.monto)),
        porCategoria: Object.fromEntries([...porCategoria.entries()].sort((x, y) => y[1] - x[1])),
        porPersona: {
          [nombreDe(e, "a")]: sumar(lista.filter((g) => g.pagadoPor === "a").map((g) => g.monto)),
          [nombreDe(e, "b")]: sumar(lista.filter((g) => g.pagadoPor === "b").map((g) => g.monto))
        },
        gastos: lista.slice(0, limite).map((g) => vistaGasto(g, e)),
        ...lista.length > limite ? { nota: `Se listan ${limite} de ${lista.length}; sube "limite" para ver más.` } : {}
      };
    }
  },
  {
    name: "ver_ingresos",
    title: "Ver ingresos",
    description: "Los ingresos reales anotados en un mes (o rango), por persona y fuente, junto a lo que cada uno espera recibir.",
    inputSchema: {
      type: "object",
      properties: { mes: P.mes, desde: { type: "string" }, hasta: { type: "string" } }
    },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const desde = texto(args.desde, "desde");
      const hasta = texto(args.hasta, "hasta");
      const m = desde || hasta ? void 0 : mes(args.mes, ctx);
      const lista = e.ingresos.filter((i) => (!m || i.fecha.startsWith(m)) && (!desde || i.fecha >= desde) && (!hasta || i.fecha <= hasta)).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const esperado = e.perfil.ingresoEsperado ?? { a: 0, b: 0 };
      return {
        moneda: e.perfil.moneda,
        total: sumar(lista.map((i) => i.monto)),
        esperadoAlMes: { [nombreDe(e, "a")]: esperado.a || 0, [nombreDe(e, "b")]: esperado.b || 0 },
        ingresos: lista.map((i) => ({ id: i.id, fecha: i.fecha, monto: i.monto, de: nombreDe(e, i.de), fuente: i.fuente, nota: i.nota }))
      };
    }
  },
  {
    name: "ver_facturas",
    title: "Ver facturas",
    description: "Las facturas fijas del mes: cuánto valen, qué día vencen, de quién son, cuáles ya se pagaron y cuántos días faltan para las que no.",
    inputSchema: { type: "object", properties: { mes: P.mes } },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const m = mes(args.mes, ctx);
      const lista = e.facturas.filter((f) => f.activa).map((f) => vistaFactura(f, e, m, ctx));
      return {
        mes: m,
        moneda: e.perfil.moneda,
        pagado: sumar(lista.filter((f) => f.pagada).map((f) => f.monto)),
        pendiente: sumar(lista.filter((f) => !f.pagada).map((f) => f.monto)),
        facturas: lista.sort((a, b) => a.diaVence - b.diaVence)
      };
    }
  },
  {
    name: "ver_deudas",
    title: "Ver deudas",
    description: "Cada deuda con su saldo, lo abonado y el mínimo, en orden bola de nieve (la más chica primero, las pagadas al final). Incluye el total, cuánto se abonó este mes contra el plan y en cuántos meses quedarían libres al ritmo del plan (sin intereses).",
    inputSchema: { type: "object", properties: {} },
    soloLectura: true,
    correr: async (_args, ctx) => {
      const { estado: e } = await leer(ctx);
      const m = ctx.hoy.slice(0, 7);
      const lista = e.deudas.map((d) => vistaDeuda(d, e, m)).sort((a, b) => (a.saldo === 0 ? 1 : 0) - (b.saldo === 0 ? 1 : 0) || a.saldo - b.saldo);
      const av = avanceAvanzar(e, m);
      return {
        moneda: e.perfil.moneda,
        saldoTotal: sumar(lista.map((d) => d.saldo)),
        minimosAlMes: minimosMensuales(e.deudas),
        esteMes: { planDeAtaque: av.metaDeudas, abonado: av.abonos, porPersona: { [nombreDe(e, "a")]: av.abonosPor.a, [nombreDe(e, "b")]: av.abonosPor.b } },
        mesesParaQuedarLibres: mesesParaLibres(e.deudas, av.metaDeudas),
        siguienteATumbar: lista.find((d) => d.saldo > 0)?.nombre ?? null,
        deudas: lista
      };
    }
  },
  {
    name: "ver_hitos",
    title: "Ver hitos (Grecia y demás)",
    description: "Los hitos de ahorro (Grecia 2027 y los que hayan agregado): cuánto llevan, cuánto falta, días que quedan y cuánto habría que guardar al mes para llegar.",
    inputSchema: { type: "object", properties: {} },
    soloLectura: true,
    correr: async (_args, ctx) => {
      const { estado: e } = await leer(ctx);
      return { moneda: e.perfil.moneda, hitos: e.metas.map((m) => vistaMeta(m, e, ctx)) };
    }
  },
  {
    name: "ver_retos",
    title: "Ver retos",
    description: "Los retos de la pareja (ahorrar un monto, un hábito por N días, no pasarse de un tope) con su avance y premio.",
    inputSchema: {
      type: "object",
      properties: { incluir_completados: { type: "boolean", description: "Por defecto solo los activos." } }
    },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const todos = booleano(args.incluir_completados, "incluir_completados", false);
      return { retos: e.retos.filter((r) => todos || !r.completado).map((r) => vistaReto(r, ctx)) };
    }
  },
  {
    name: "ver_apuntes",
    title: "Ver apuntes",
    description: "Las cosas que le han pedido a Claude que lleve (ideas, pendientes, preguntas, decisiones). Por defecto solo las que no están hechas.",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Filtra por una palabra." },
        etiqueta: { type: "string" },
        incluir_hechos: { type: "boolean" }
      }
    },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e, apuntes } = await leer(ctx);
      const q = texto(args.texto, "texto");
      const et = texto(args.etiqueta, "etiqueta");
      const hechos = booleano(args.incluir_hechos, "incluir_hechos", false);
      const lista = apuntes.filter((a) => (hechos || !a.hecho) && (!q || norm(a.texto).includes(norm(q))) && (!et || norm(a.etiqueta) === norm(et))).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
      return {
        etiquetas: [...new Set(apuntes.map((a) => a.etiqueta).filter(Boolean))],
        apuntes: lista.map((a) => ({ ...a, por: nombreDe(e, a.por) }))
      };
    }
  },
  // ---------- para anotar ----------
  {
    name: "anotar_gasto",
    title: "Anotar un gasto",
    description: "Anota un gasto como si lo hubieran puesto en la app: aparece en los dos celulares. Si no dicen si es compartido, pregunta. Sin categoría, la adivina por la nota (EXITO → mercado) o queda en Otros. Devuelve en qué bolsillo cayó y cuánto le queda.",
    inputSchema: {
      type: "object",
      properties: {
        monto: P.monto,
        nota: { type: "string", description: "Qué fue o dónde (el comercio ayuda a adivinar la categoría)." },
        compartido: { type: "boolean", description: "true si es de la casa (se paga a medias); false si es personal." },
        categoria: { type: "string", enum: CATS },
        pago_por: P.persona("Quién pagó"),
        fecha: P.fecha
      },
      required: ["monto", "nota", "compartido"]
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      if (args.compartido === void 0) throw new ErrorUsuario("Falta decir si es compartido (de la casa) o personal.");
      const nota = texto(args.nota, "nota", true);
      const gasto = {
        id: ctx.uid(),
        fecha: fecha(args.fecha, ctx),
        monto: monto(args.monto),
        categoria: categoria(args.categoria) ?? categoriaDe(nota, e.perfil.aprendidos) ?? "otros",
        pagadoPor: persona(args.pago_por, e, ctx, "pago_por"),
        compartido: booleano(args.compartido, "compartido", false),
        nota
      };
      await ctx.almacen.guardar([{ id: gasto.id, tipo: "gasto", data: gasto }]);
      const despues = { ...e, gastos: [gasto, ...e.gastos] };
      const b = bolsilloDe(gasto, e.bolsillos);
      const v = b ? vistaBolsillo(b, despues, gasto.fecha.slice(0, 7)) : null;
      return {
        anotado: vistaGasto(gasto, despues),
        bolsillo: b && v ? { nombre: `${b.emoji} ${b.nombre}`, disponible: v.disponible, semaforo: v.estado } : null
      };
    }
  },
  {
    name: "anotar_ingreso",
    title: "Anotar un ingreso",
    description: "Anota plata que entró (nómina, extra, devolución). Un giro entre ustedes dos no es un ingreso: no lo anotes.",
    inputSchema: {
      type: "object",
      properties: {
        monto: P.monto,
        de: P.persona("A quién le entró"),
        fuente: { type: "string", enum: ["nomina", "extra", "devolucion", "otro"] },
        nota: { type: "string" },
        fecha: P.fecha
      },
      required: ["monto"]
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const fuente = texto(args.fuente, "fuente") ?? "otro";
      if (!["nomina", "extra", "devolucion", "otro"].includes(fuente)) throw new ErrorUsuario('"fuente" es nomina, extra, devolucion u otro.');
      const ingreso = {
        id: ctx.uid(),
        fecha: fecha(args.fecha, ctx),
        monto: monto(args.monto),
        de: persona(args.de, e, ctx, "de"),
        fuente,
        nota: texto(args.nota, "nota") ?? ""
      };
      await ctx.almacen.guardar([{ id: ingreso.id, tipo: "ingreso", data: ingreso }]);
      return { anotado: { ...ingreso, de: nombreDe(e, ingreso.de) } };
    }
  },
  {
    name: "abonar_deuda",
    title: "Abonar a una deuda",
    description: "Registra un abono a una deuda (por nombre o id) y devuelve el saldo que queda.",
    inputSchema: {
      type: "object",
      properties: { deuda: { type: "string", description: "Nombre o id." }, monto: P.monto, por: P.persona("Quién abonó"), fecha: P.fecha },
      required: ["deuda", "monto"]
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const d = uno(e.deudas, args.deuda, "deuda", (x) => x.nombre);
      const nueva = {
        ...d,
        abonos: [{ id: ctx.uid(), fecha: fecha(args.fecha, ctx), monto: monto(args.monto), por: persona(args.por, e, ctx, "por") }, ...d.abonos]
      };
      await ctx.almacen.guardar([{ id: d.id, tipo: "deuda", data: nueva }]);
      const vista = vistaDeuda(nueva, e, ctx.hoy.slice(0, 7));
      return { deuda: vista, ...vista.saldo === 0 ? { celebrar: `¡${d.nombre} cayó! 🎉` } : {} };
    }
  },
  {
    name: "aportar_hito",
    title: "Aportar a un hito",
    description: "Registra plata guardada para un hito (Grecia u otro, por nombre o id) y devuelve cuánto llevan y cuánto falta.",
    inputSchema: {
      type: "object",
      properties: { hito: { type: "string", description: 'Nombre o id (ej. "Grecia").' }, monto: P.monto, por: P.persona("Quién aportó"), fecha: P.fecha },
      required: ["hito", "monto"]
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const m = uno(e.metas, args.hito, "hito", (x) => x.titulo);
      const nueva = {
        ...m,
        aportes: [{ id: ctx.uid(), fecha: fecha(args.fecha, ctx), monto: monto(args.monto), por: persona(args.por, e, ctx, "por") }, ...m.aportes]
      };
      await ctx.almacen.guardar([{ id: m.id, tipo: "meta", data: nueva }]);
      return { hito: vistaMeta(nueva, e, ctx) };
    }
  },
  {
    name: "pagar_factura",
    title: "Marcar una factura como pagada",
    description: "Marca (o desmarca) una factura como pagada en un mes. Con anotar_gasto, además anota el gasto en Servicios como hace la app.",
    inputSchema: {
      type: "object",
      properties: {
        factura: { type: "string", description: "Nombre o id." },
        mes: P.mes,
        pagada: { type: "boolean", description: "false para desmarcarla. Por defecto true." },
        anotar_gasto: { type: "boolean", description: "Anotar también el gasto. Por defecto false." }
      },
      required: ["factura"]
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const f = uno(
        e.facturas.filter((x) => x.activa),
        args.factura,
        "factura",
        (x) => x.nombre
      );
      const m = mes(args.mes, ctx);
      const pagada = booleano(args.pagada, "pagada", true);
      const nueva = {
        ...f,
        pagadaEn: pagada ? Array.from(/* @__PURE__ */ new Set([...f.pagadaEn, m])) : f.pagadaEn.filter((x) => x !== m)
      };
      const filas = [{ id: f.id, tipo: "factura", data: nueva }];
      let gasto = null;
      if (pagada && booleano(args.anotar_gasto, "anotar_gasto", false)) {
        gasto = {
          id: ctx.uid(),
          fecha: ctx.hoy,
          monto: f.monto,
          categoria: "servicios",
          pagadoPor: f.responsable === "b" ? "b" : "a",
          compartido: f.responsable === "ambos",
          nota: `Factura: ${f.nombre}`
        };
        filas.push({ id: gasto.id, tipo: "gasto", data: gasto });
      }
      await ctx.almacen.guardar(filas);
      return { factura: vistaFactura(nueva, e, m, ctx), ...gasto ? { gastoAnotado: vistaGasto(gasto, e) } : {} };
    }
  },
  {
    name: "avanzar_reto",
    title: "Avanzar un reto",
    description: 'Actualiza el progreso de un reto: "sumar" agrega (un día más, un aporte, un gasto contra el tope) y "progreso" lo fija. Se completa solo al llegar a la meta (salvo los de tope).',
    inputSchema: {
      type: "object",
      properties: {
        reto: { type: "string", description: "Título o id." },
        sumar: { type: "number" },
        progreso: { type: "number" }
      },
      required: ["reto"]
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const r = uno(e.retos, args.reto, "reto", (x) => x.titulo);
      const suma = typeof args.sumar === "number" ? args.sumar : void 0;
      const fijo = typeof args.progreso === "number" ? args.progreso : void 0;
      if (suma === void 0 === (fijo === void 0)) throw new ErrorUsuario('Usa "sumar" o "progreso" (uno de los dos).');
      const progreso = Math.max(0, fijo ?? r.progreso + (suma ?? 0));
      const completado = r.tipo === "limite" ? r.completado : progreso >= r.meta;
      const nuevo = { ...r, progreso, completado, completadoEn: completado ? r.completadoEn ?? ctx.hoy : void 0 };
      if (!completado) delete nuevo.completadoEn;
      await ctx.almacen.guardar([{ id: r.id, tipo: "reto", data: nuevo }]);
      return { reto: vistaReto(nuevo, ctx), ...completado && !r.completado ? { celebrar: `¡Reto cumplido! Premio: ${r.recompensa || "el que quieran"} 🎉` } : {} };
    }
  },
  {
    name: "borrar_gasto",
    title: "Borrar un gasto",
    description: "Borra un gasto por su id (búscalo antes con buscar_gastos). Se quita en los dos celulares. Confirma con ellos antes de borrar.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const id = texto(args.id, "id", true);
      const g = e.gastos.find((x) => x.id === id);
      if (!g) throw new ErrorUsuario(`No hay un gasto con id "${id}".`);
      await ctx.almacen.borrar([id]);
      return { borrado: vistaGasto(g, e) };
    }
  },
  {
    name: "apuntar",
    title: "Apuntar algo para después",
    description: "Guarda algo que quieran llevar fuera de la plata o que no tenga lugar en la app: un pendiente, una idea para Grecia, una decisión, una pregunta para después. Vive en su hogar y lo ven los dos cuando le pregunten a Claude.",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string" },
        etiqueta: { type: "string", description: "Una palabra para agrupar (grecia, casa, pendiente, idea...)." },
        por: P.persona("Quién lo pide")
      },
      required: ["texto"]
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const apunte = {
        id: ctx.uid(),
        texto: texto(args.texto, "texto", true),
        etiqueta: norm(texto(args.etiqueta, "etiqueta") ?? ""),
        por: persona(args.por, e, ctx, "por"),
        creadoEn: ctx.hoy,
        hecho: false
      };
      await ctx.almacen.guardar([{ id: apunte.id, tipo: "apunte", data: apunte }]);
      return { apuntado: { ...apunte, por: nombreDe(e, apunte.por) } };
    }
  },
  {
    name: "marcar_apunte",
    title: "Marcar un apunte como hecho",
    description: "Marca un apunte como hecho (o lo reabre con hecho=false). Con borrar=true lo elimina.",
    inputSchema: {
      type: "object",
      properties: {
        apunte: { type: "string", description: "Id o parte del texto." },
        hecho: { type: "boolean" },
        borrar: { type: "boolean" }
      },
      required: ["apunte"]
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { apuntes } = await leer(ctx);
      const a = uno(apuntes, args.apunte, "apunte", (x) => x.texto);
      if (booleano(args.borrar, "borrar", false)) {
        await ctx.almacen.borrar([a.id]);
        return { borrado: a.texto };
      }
      const hecho = booleano(args.hecho, "hecho", true);
      const nuevo = { ...a, hecho };
      if (hecho) nuevo.hechoEn = ctx.hoy;
      else delete nuevo.hechoEn;
      await ctx.almacen.guardar([{ id: a.id, tipo: "apunte", data: nuevo }]);
      return { apunte: nuevo };
    }
  },
  // ---------- lo que llegó por SMS ----------
  {
    name: "por_confirmar",
    title: "Mensajes del banco por confirmar",
    description: "Los SMS del banco que llegaron por el Atajo y nadie ha resuelto: lo que la app no se atrevió a anotar sola (comercio desconocido, plata que entró) y lo que llegó mientras la app estaba cerrada. Para cada uno trae lo que se leyó (monto, comercio, fecha, categoría sugerida) y una sugerencia. Después se resuelve con confirmar_mensaje.",
    inputSchema: { type: "object", properties: {} },
    soloLectura: true,
    correr: async (_args, ctx) => {
      const { estado: e } = await leer(ctx);
      const lista = await ctx.almacen.entrantes();
      const yaAnotados = new Set([...e.gastos, ...e.ingresos].map((x) => x.origen?.hash).filter(Boolean));
      return {
        cuantos: lista.length,
        mensajes: lista.map((m) => {
          const base = { id: m.id, llegoA: nombreDe(e, m.persona), recibido: m.recibido_en, texto: m.texto };
          const l = leerMensaje(m.texto, e.perfil.aprendidos ?? {});
          if (!esLectura(l)) return { ...base, sugerencia: "descartar", motivo: MOTIVOS[l.error] };
          if (yaAnotados.has(l.hash)) return { ...base, sugerencia: "descartar", motivo: "Ese mensaje ya está anotado." };
          return {
            ...base,
            lectura: {
              tipo: l.tipo,
              monto: l.monto,
              comercio: l.comercio,
              fecha: l.fecha,
              banco: l.banco,
              ...l.tarjeta ? { tarjeta: l.tarjeta } : {},
              categoriaSugerida: catInfo(l.categoria).nombre,
              confianza: l.confianza
            },
            sugerencia: esIngreso(l) ? "ingreso, si no es un giro entre ustedes dos" : "gasto"
          };
        })
      };
    }
  },
  {
    name: "confirmar_mensaje",
    title: "Confirmar un mensaje del banco",
    description: 'Resuelve un mensaje de por_confirmar: lo guarda como gasto o como ingreso (con lo leído, corrigiendo lo que digan) o lo descarta. Si corrigen la categoría, la app se acuerda de ese comercio para la próxima. Un giro entre ustedes dos no es ingreso: se descarta. Sale de "por confirmar" en los dos celulares.',
    inputSchema: {
      type: "object",
      properties: {
        mensaje: { type: "string", description: "El id que da por_confirmar." },
        como: { type: "string", enum: ["gasto", "ingreso", "descartar"] },
        monto: P.monto,
        categoria: { type: "string", enum: CATS, description: "Solo gastos. Sin ella, la sugerida." },
        compartido: { type: "boolean", description: "Solo gastos. Por defecto personal, como en la app." },
        nota: { type: "string", description: "Sin ella, el comercio." },
        fecha: { type: "string", description: "AAAA-MM-DD. Sin ella, la del mensaje." },
        persona: { type: "string", description: "Quién pagó o a quién le entró. Sin ella, a quien le llegó el SMS." },
        fuente: { type: "string", enum: ["nomina", "extra", "devolucion", "otro"], description: "Solo ingresos." }
      },
      required: ["mensaje", "como"]
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx);
      const id = texto(args.mensaje, "mensaje", true);
      const como = texto(args.como, "como", true);
      if (!["gasto", "ingreso", "descartar"].includes(como)) throw new ErrorUsuario('"como" es gasto, ingreso o descartar.');
      const m = (await ctx.almacen.entrantes()).find((x) => x.id === id);
      if (!m) throw new ErrorUsuario("Ese mensaje ya no está por confirmar (lo resolvieron o no existe). Revisa por_confirmar.");
      if (como === "descartar") {
        if (!await ctx.almacen.resolverEntrante(id, true)) throw new ErrorUsuario("El otro celular ya lo resolvió.");
        return { descartado: m.texto };
      }
      const leido = leerMensaje(m.texto, e.perfil.aprendidos ?? {});
      const l = esLectura(leido) ? leido : null;
      if (!l && args.monto === void 0) throw new ErrorUsuario("No entendí el valor del mensaje: dime el monto.");
      const quien = args.persona === void 0 ? m.persona : persona(args.persona, e, ctx, "persona");
      const origen = { fuente: "sms", hash: l?.hash ?? huella(m.texto), ...l ? { banco: l.banco } : {} };
      const base = {
        fecha: args.fecha === void 0 ? l?.fecha ?? m.recibido_en.slice(0, 10) : fecha(args.fecha, ctx),
        monto: args.monto === void 0 ? l.monto : monto(args.monto)
      };
      const filas = [];
      let resultado;
      if (como === "gasto") {
        const sugerida = l && !esIngreso(l) ? l.categoria : void 0;
        const cat = categoria(args.categoria) ?? sugerida ?? "otros";
        const gasto = {
          id: ctx.uid(),
          ...base,
          categoria: cat,
          pagadoPor: quien,
          compartido: booleano(args.compartido, "compartido", false),
          nota: texto(args.nota, "nota") ?? (l?.comercio || `Mensaje ${l?.banco ?? "del banco"}`),
          origen
        };
        filas.push({ id: gasto.id, tipo: "gasto", data: gasto });
        resultado = { gastoAnotado: vistaGasto(gasto, e) };
        if (l?.comercio && sugerida && cat !== sugerida && claveComercio(l.comercio)) {
          const { onboarded: _o, ...perfil } = e.perfil;
          void _o;
          filas.push({ id: "perfil", tipo: "perfil", data: { ...perfil, aprendidos: { ...perfil.aprendidos, [claveComercio(l.comercio)]: cat } } });
          resultado.aprendido = `La próxima vez, ${claveComercio(l.comercio)} va a ${catInfo(cat).nombre}.`;
        }
      } else {
        const fuente = texto(args.fuente, "fuente") ?? l?.fuenteIngreso ?? "otro";
        if (!["nomina", "extra", "devolucion", "otro"].includes(fuente)) throw new ErrorUsuario('"fuente" es nomina, extra, devolucion u otro.');
        const ingreso = { id: ctx.uid(), ...base, de: quien, fuente, nota: texto(args.nota, "nota") ?? l?.comercio ?? "", origen };
        filas.push({ id: ingreso.id, tipo: "ingreso", data: ingreso });
        resultado = { ingresoAnotado: { ...ingreso, de: nombreDe(e, ingreso.de) } };
      }
      if (!await ctx.almacen.resolverEntrante(id, true)) throw new ErrorUsuario("El otro celular ya lo resolvió.");
      try {
        await ctx.almacen.guardar(filas);
      } catch (err) {
        await ctx.almacen.resolverEntrante(id, false).catch(() => {
        });
        throw err;
      }
      return resultado;
    }
  }
];

// mcp/protocolo.ts
var VERSIONES = ["2025-06-18", "2025-03-26", "2024-11-05"];
var INSTRUCCIONES = `Nuestras Metas es la app de plata de una pareja en Colombia (pesos colombianos, COP).
Cada uno es "a" o "b"; las herramientas devuelven sus nombres. Lo que se anote sin decir de quién queda
a nombre de quien conectó a Claude.

Cómo piensan la plata: la casa vive con un solo sueldo; lo que entra baja en cascada por obligaciones
fuera de casa (lo que cada uno manda a su familia), vivir (bolsillos de la casa y de cada uno) y avanzar
(deudas en bola de nieve y el ahorro para Grecia 2027). "Libre de verdad" es lo que queda tras facturas
sin pagar y mínimos de deuda.

Para preguntas generales empieza por como_vamos. Todo lo que anotes aparece en los dos celulares al
instante. Antes de anotar un gasto, si no está claro, pregunta si es compartido o personal; antes de
borrar, confirma. Lo que quieran llevar y no sea plata (pendientes, ideas, decisiones) va con apuntar.
Responde en español, corto y con montos redondos ($45.900).`;
var ok = (id, result) => ({ jsonrpc: "2.0", id, result });
var falla = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
async function atender(msg, ctx) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return falla(msg?.id ?? null, -32600, "Mensaje JSON-RPC inválido");
  }
  const id = msg.id ?? null;
  if (msg.id === void 0) return null;
  switch (msg.method) {
    case "initialize": {
      const pedida = msg.params?.protocolVersion;
      return ok(id, {
        protocolVersion: typeof pedida === "string" && VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "nuestras-metas", title: "Nuestras Metas", version: "1.0.0" },
        instructions: INSTRUCCIONES
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: HERRAMIENTAS.map((h) => ({
          name: h.name,
          title: h.title,
          description: h.description,
          inputSchema: h.inputSchema,
          annotations: { title: h.title, readOnlyHint: h.soloLectura, destructiveHint: h.name.startsWith("borrar") || h.name === "marcar_apunte", openWorldHint: false }
        }))
      });
    case "tools/call": {
      const nombre = msg.params?.name;
      const h = HERRAMIENTAS.find((x) => x.name === nombre);
      if (!h) return falla(id, -32602, `No existe la herramienta "${String(nombre)}"`);
      const args = msg.params?.arguments ?? {};
      try {
        const resultado = await h.correr(args, ctx);
        return ok(id, { content: [{ type: "text", text: JSON.stringify(resultado, null, 2) }] });
      } catch (e) {
        const texto2 = e instanceof ErrorUsuario ? e.message : `No pude completar "${h.name}": ${e instanceof Error ? e.message : String(e)}`;
        return ok(id, { content: [{ type: "text", text: texto2 }], isError: true });
      }
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return falla(id, -32601, `Método no soportado: ${msg.method}`);
  }
}
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, x-client-info, apikey"
};
var json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
function tokenDe(url) {
  const candidato = url.searchParams.get("token") ?? url.pathname.split("/").filter(Boolean).pop() ?? "";
  return /^[a-f0-9]{32,64}$/.test(candidato) ? candidato : null;
}
async function manejar(req, abrir2) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const token = tokenDe(new URL(req.url));
  if (!token) return json({ error: "Falta el token del conector en el enlace" }, 401);
  if (req.method === "GET") {
    return new Response("Este conector solo atiende POST", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
  }
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
  let cuerpo;
  try {
    cuerpo = await req.json();
  } catch {
    return json(falla(null, -32700, "JSON inválido"), 400);
  }
  const ctx = await abrir2(token);
  if (!ctx) return json({ error: "Token inválido o revocado. Genera uno nuevo en la app: Ajustes → Conectar con Claude." }, 401);
  const lote = Array.isArray(cuerpo);
  const mensajes = lote ? cuerpo : [cuerpo];
  const respuestas = (await Promise.all(mensajes.map((m) => atender(m, ctx)))).filter((r) => r !== null);
  if (respuestas.length === 0) return new Response(null, { status: 202, headers: CORS });
  return json(lote ? respuestas : respuestas[0]);
}

// mcp/funcion.ts
var URL_SB = Deno.env.get("SUPABASE_URL") ?? "";
var LLAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
var TIPOS = ["perfil", "gasto", "factura", "deuda", "reto", "meta", "foto", "bolsillo", "ingreso", "producto", "lista", "apunte"];
async function rest(ruta, init = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, {
    ...init,
    headers: { apikey: LLAVE, Authorization: `Bearer ${LLAVE}`, "Content-Type": "application/json", ...init.headers }
  });
  if (!r.ok) throw new Error(`Supabase respondió ${r.status}: ${await r.text()}`);
  return r;
}
function almacen(hogar, usuario) {
  const marca = () => ({ actualizado_en: (/* @__PURE__ */ new Date()).toISOString(), actualizado_por: usuario });
  return {
    async leer() {
      const filas = [];
      for (let desde = 0; ; desde += 1e3) {
        const r = await rest(
          `items?hogar_id=eq.${hogar}&borrado=eq.false&select=id,tipo,data&order=id&limit=1000&offset=${desde}`
        );
        const pagina = await r.json();
        filas.push(...pagina.filter((f) => TIPOS.includes(f.tipo)));
        if (pagina.length < 1e3) return filas;
      }
    },
    async guardar(filas) {
      if (!filas.length) return;
      await rest("items?on_conflict=hogar_id,id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(filas.map((f) => ({ hogar_id: hogar, id: f.id, tipo: f.tipo, data: f.data, borrado: false, ...marca() })))
      });
    },
    async borrar(ids) {
      if (!ids.length) return;
      const lista = ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
      await rest(`items?hogar_id=eq.${hogar}&id=in.(${encodeURIComponent(lista)})`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ borrado: true, ...marca() })
      });
    },
    async entrantes() {
      const r = await rest(
        `entrantes?hogar_id=eq.${hogar}&procesado=eq.false&select=id,persona,texto,recibido_en&order=recibido_en&limit=200`
      );
      return await r.json();
    },
    async resolverEntrante(id, procesado) {
      if (!/^[0-9a-f-]{36}$/.test(id)) return false;
      const r = await rest(`entrantes?hogar_id=eq.${hogar}&id=eq.${id}&procesado=eq.${!procesado}&select=id`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ procesado })
      });
      return (await r.json()).length > 0;
    }
  };
}
async function abrir(token) {
  const r = await rest(`tokens_claude?token=eq.${token}&select=hogar_id,user_id,persona`);
  const [t] = await r.json();
  if (!t) return null;
  return { almacen: almacen(t.hogar_id, t.user_id), persona: t.persona, hoy: hoyEn(), uid: () => crypto.randomUUID() };
}
Deno.serve(
  (req) => manejar(req, abrir).catch((e) => {
    console.error(e);
    return new Response(JSON.stringify({ error: "Falla interna del conector" }), { status: 500, headers: { "Content-Type": "application/json" } });
  })
);
