// La caja: cuánto entra, cuánto sale y cuánto queda en cada bolsillo.
// Todo es puro (sin React ni store) para poder probarlo a secas.
import type { Ambito, Bolsillo, Categoria, Deuda, Estado, Gasto, Persona } from './types'
import { mesAnterior, mesesEntre, pct, sumar } from './format'

// ---------- a qué bolsillo va un gasto ----------

export const ambitoDe = (g: Pick<Gasto, 'compartido' | 'pagadoPor'>): Ambito =>
  g.compartido ? 'hogar' : g.pagadoPor

/** Un bolsillo solo cuenta desde el mes en que se creó. */
export const existeEn = (b: Bolsillo, mes: string): boolean => mes >= b.desde

/** Los bolsillos entre los que puede elegir un gasto de ese ámbito. */
export const candidatos = (ambito: Ambito, bolsillos: Bolsillo[]): Bolsillo[] =>
  bolsillos.filter((b) => b.ambito === ambito)

/**
 * 1) el elegido a mano, si existe · 2) el de su ámbito con esa categoría
 * · 3) el comodín de su ámbito (sin categorías) · 4) ninguno.
 */
export function bolsilloDe(g: Gasto, bolsillos: Bolsillo[]): Bolsillo | null {
  if (g.bolsilloId) {
    const fijo = bolsillos.find((b) => b.id === g.bolsilloId)
    if (fijo) return fijo
  }
  const propios = candidatos(ambitoDe(g), bolsillos)
  return (
    propios.find((b) => b.categorias.includes(g.categoria)) ??
    propios.find((b) => b.categorias.length === 0) ??
    null
  )
}

/** Una categoría vive en un solo bolsillo por ámbito: al asignarla, se la quita a los demás. */
export function quitarCategorias(
  bolsillos: Bolsillo[],
  b: Pick<Bolsillo, 'id' | 'ambito' | 'categorias'>,
): Bolsillo[] {
  if (b.categorias.length === 0) return bolsillos
  return bolsillos.map((x) =>
    x.id === b.id || x.ambito !== b.ambito
      ? x
      : { ...x, categorias: x.categorias.filter((c) => !b.categorias.includes(c)) },
  )
}

// ---------- cuánto hay en un bolsillo ----------

export function gastosDe(b: Bolsillo, gastos: Gasto[], bolsillos: Bolsillo[], mes: string): Gasto[] {
  return gastos.filter((g) => g.fecha.startsWith(mes) && bolsilloDe(g, bolsillos)?.id === b.id)
}

export const gastadoEn = (b: Bolsillo, gastos: Gasto[], bolsillos: Bolsillo[], mes: string): number =>
  sumar(gastosDe(b, gastos, bolsillos, mes).map((g) => g.monto))

/**
 * Se reinicia: asignación + ajustes del mes − gastado en el mes.
 * Acumula: saldo inicial + asignación × meses desde que existe + ajustes hasta el mes − todo lo gastado hasta el mes.
 */
export function disponible(b: Bolsillo, gastos: Gasto[], bolsillos: Bolsillo[], mes: string): number {
  if (!existeEn(b, mes)) return 0
  const ajustes = (filtro: (m: string) => boolean) =>
    sumar(b.ajustes.filter((a) => filtro(a.fecha.slice(0, 7))).map((a) => a.monto))
  if (!b.acumula) {
    return b.asignacion + ajustes((m) => m === mes) - gastadoEn(b, gastos, bolsillos, mes)
  }
  const enRango = (m: string) => m >= b.desde && m <= mes
  const gastadoHasta = sumar(
    gastos
      .filter((g) => enRango(g.fecha.slice(0, 7)) && bolsilloDe(g, bolsillos)?.id === b.id)
      .map((g) => g.monto),
  )
  return b.saldoInicial + b.asignacion * mesesEntre(b.desde, mes) + ajustes(enRango) - gastadoHasta
}

export type EstadoBolsillo = 'bien' | 'amarillo' | 'rojo'

export interface VistaBolsillo {
  bolsillo: Bolsillo
  gastado: number
  disponible: number
  /** Lo que había para gastar: gastado + lo que queda. */
  tope: number
  avance: number
  estado: EstadoBolsillo
}

export function vistaBolsillo(b: Bolsillo, e: Estado, mes: string): VistaBolsillo {
  const gastado = gastadoEn(b, e.gastos, e.bolsillos, mes)
  const disp = disponible(b, e.gastos, e.bolsillos, mes)
  const tope = gastado + disp
  const estado: EstadoBolsillo = disp < 0 ? 'rojo' : tope > 0 && gastado / tope >= 0.8 ? 'amarillo' : 'bien'
  return { bolsillo: b, gastado, disponible: disp, tope, avance: disp < 0 ? 100 : pct(gastado, tope), estado }
}

export const vigentes = (e: Estado, mes: string): Bolsillo[] => e.bolsillos.filter((b) => existeEn(b, mes))

export const alertasBolsillos = (e: Estado, mes: string): VistaBolsillo[] =>
  vigentes(e, mes)
    .map((b) => vistaBolsillo(b, e, mes))
    .filter((v) => v.estado !== 'bien')

/** Gastos del mes de un ámbito que no cayeron en ningún bolsillo. */
export function sinBolsillo(e: Estado, mes: string, ambito: Ambito): { n: number; monto: number } {
  const lista = e.gastos.filter(
    (g) => g.fecha.startsWith(mes) && ambitoDe(g) === ambito && bolsilloDe(g, e.bolsillos) === null,
  )
  return { n: lista.length, monto: sumar(lista.map((g) => g.monto)) }
}

// ---------- el mes completo ----------

const saldoDe = (d: Deuda): number => Math.max(0, d.montoInicial - sumar(d.abonos.map((a) => a.monto)))

export interface ResumenMes {
  ingresosReales: number
  ingresosEsperados: number
  /** Si no se ha anotado ningún ingreso, se planea con el esperado. */
  usaEsperado: boolean
  base: number
  porPersona: Record<Persona, number>
  gastado: number
  abonos: number
  aportes: number
  salidas: number
  queda: number
  facturasPendientes: number
  minimosDeuda: number
  comprometido: number
  libre: number
  asignado: number
  sinAsignar: number
}

export function resumenMes(e: Estado, mes: string): ResumenMes {
  const delMes = (fecha: string) => fecha.startsWith(mes)
  const ingresos = e.ingresos.filter((i) => delMes(i.fecha))
  const ingresosReales = sumar(ingresos.map((i) => i.monto))
  const esperado = e.perfil.ingresoEsperado ?? { a: 0, b: 0 }
  const ingresosEsperados = (esperado.a || 0) + (esperado.b || 0)
  const usaEsperado = ingresosReales === 0 && ingresosEsperados > 0
  const base = usaEsperado ? ingresosEsperados : ingresosReales

  const gastado = sumar(e.gastos.filter((g) => delMes(g.fecha)).map((g) => g.monto))
  const abonos = sumar(e.deudas.flatMap((d) => d.abonos.filter((a) => delMes(a.fecha)).map((a) => a.monto)))
  const aportes = sumar(e.metas.flatMap((m) => m.aportes.filter((a) => delMes(a.fecha)).map((a) => a.monto)))
  const salidas = gastado + abonos + aportes
  const queda = base - salidas

  const facturasPendientes = sumar(
    e.facturas.filter((f) => f.activa && !f.pagadaEn.includes(mes)).map((f) => f.monto),
  )
  const minimosDeuda = sumar(
    e.deudas
      .filter((d) => saldoDe(d) > 0 && !d.abonos.some((a) => delMes(a.fecha)))
      .map((d) => d.pagoMinimo),
  )
  const comprometido = facturasPendientes + minimosDeuda
  const asignado = sumar(vigentes(e, mes).map((b) => b.asignacion))

  return {
    ingresosReales,
    ingresosEsperados,
    usaEsperado,
    base,
    porPersona: {
      a: sumar(ingresos.filter((i) => i.de === 'a').map((i) => i.monto)),
      b: sumar(ingresos.filter((i) => i.de === 'b').map((i) => i.monto)),
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
    sinAsignar: ingresosEsperados - asignado,
  }
}

// ---------- contra el mes pasado ----------

export interface Comparacion {
  hayAnterior: boolean
  gastadoActual: number
  gastadoAnterior: number
  delta: number
  deltaPct: number | null
  ingresosDelta: number
  subio: { categoria: Categoria; delta: number } | null
  bajo: { categoria: Categoria; delta: number } | null
  /** true cuando se comparó solo hasta el día de hoy. */
  parcial: boolean
}

/** Con `hastaDia`, compara los dos meses solo hasta ese día (justo para un mes que va a medias). */
export function comparacion(e: Estado, mes: string, hastaDia?: number): Comparacion {
  const prev = mesAnterior(mes)
  const cabe = (fecha: string) => hastaDia === undefined || Number(fecha.slice(8, 10)) <= hastaDia
  const gastosDe = (m: string) => e.gastos.filter((g) => g.fecha.startsWith(m) && cabe(g.fecha))
  const actual = gastosDe(mes)
  const anterior = gastosDe(prev)

  const porCat = (lista: Gasto[]) => {
    const mapa = new Map<Categoria, number>()
    lista.forEach((g) => mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + g.monto))
    return mapa
  }
  const catActual = porCat(actual)
  const catAnterior = porCat(anterior)
  const categorias = new Set<Categoria>([...catActual.keys(), ...catAnterior.keys()])
  let subio: Comparacion['subio'] = null
  let bajo: Comparacion['bajo'] = null
  for (const c of categorias) {
    const d = (catActual.get(c) ?? 0) - (catAnterior.get(c) ?? 0)
    if (d > 0 && (!subio || d > subio.delta)) subio = { categoria: c, delta: d }
    if (d < 0 && (!bajo || d < bajo.delta)) bajo = { categoria: c, delta: d }
  }

  const gastadoActual = sumar(actual.map((g) => g.monto))
  const gastadoAnterior = sumar(anterior.map((g) => g.monto))
  const delta = gastadoActual - gastadoAnterior
  const ingresosEn = (m: string) =>
    sumar(e.ingresos.filter((i) => i.fecha.startsWith(m) && cabe(i.fecha)).map((i) => i.monto))

  return {
    hayAnterior: e.gastos.some((g) => g.fecha.startsWith(prev)),
    gastadoActual,
    gastadoAnterior,
    delta,
    deltaPct: gastadoAnterior > 0 ? Math.round((delta / gastadoAnterior) * 100) : null,
    ingresosDelta: ingresosEn(mes) - ingresosEn(prev),
    subio,
    bajo,
    parcial: hastaDia !== undefined,
  }
}

/** La frase de Inicio. null cuando no hay con qué comparar. */
export function fraseComparacion(
  c: Comparacion,
  nombreCat: (cat: Categoria) => string,
  dinero: (n: number) => string,
): string | null {
  if (!c.hayAnterior) return null
  const cola = c.parcial ? ' a esta altura' : ''
  let frase: string
  if (c.deltaPct === null) {
    frase =
      c.delta === 0
        ? `Van igual que el mes pasado${cola}.`
        : `Llevan ${dinero(Math.abs(c.delta))} ${c.delta < 0 ? 'menos' : 'más'} que el mes pasado${cola}.`
  } else if (Math.abs(c.deltaPct) <= 3) {
    frase = `Van igual que el mes pasado${cola}.`
  } else {
    frase = `Van ${Math.abs(c.deltaPct)}% por ${c.delta < 0 ? 'debajo' : 'encima'} del mes pasado${cola}.`
  }
  // Solo vale la pena nombrar la categoría si su alza es al menos el 10% de lo del mes pasado.
  if (c.subio && c.subio.delta >= Math.max(1, c.gastadoAnterior) * 0.1) {
    frase += ` Subió ${nombreCat(c.subio.categoria)} (+${dinero(c.subio.delta)}).`
  }
  return frase
}

// ---------- para arrancar: plantillas ----------

export interface Plantilla {
  nombre: string
  emoji: string
  ambito: Ambito
  categorias: Categoria[]
  /** Porcentaje sugerido del ingreso (del hogar, o de esa persona si es personal). */
  pct: number
  acumula: boolean
}

export const PLANTILLAS: Plantilla[] = [
  { nombre: 'Mercado y casa', emoji: '🛒', ambito: 'hogar', categorias: ['mercado', 'hogar'], pct: 30, acumula: false },
  { nombre: 'Salidas', emoji: '🍕', ambito: 'hogar', categorias: ['comida', 'diversion'], pct: 10, acumula: true },
  { nombre: 'Transporte', emoji: '🚕', ambito: 'hogar', categorias: ['transporte'], pct: 8, acumula: false },
  { nombre: 'Servicios y salud', emoji: '💡', ambito: 'hogar', categorias: ['servicios', 'salud'], pct: 15, acumula: false },
  { nombre: 'Todo lo demás', emoji: '📦', ambito: 'hogar', categorias: ['ropa', 'regalos', 'viajes', 'otros'], pct: 7, acumula: true },
  { nombre: 'Mis antojos', emoji: '🍦', ambito: 'a', categorias: [], pct: 5, acumula: true },
  { nombre: 'Mis antojos', emoji: '🍦', ambito: 'b', categorias: [], pct: 5, acumula: true },
]

const aMiles = (n: number) => Math.round(n / 1000) * 1000

export function montoSugerido(p: Plantilla, ingresos: { a: number; b: number }): number {
  const base = p.ambito === 'hogar' ? ingresos.a + ingresos.b : ingresos[p.ambito]
  return aMiles((p.pct / 100) * base)
}

export function bolsillosDesdePlantillas(
  elegidas: { plantilla: Plantilla; monto: number }[],
  mes: string,
): Omit<Bolsillo, 'id' | 'ajustes'>[] {
  return elegidas.map(({ plantilla: p, monto }) => ({
    nombre: p.nombre,
    emoji: p.emoji,
    ambito: p.ambito,
    asignacion: monto,
    acumula: p.acumula,
    categorias: p.categorias,
    saldoInicial: 0,
    desde: mes,
  }))
}
