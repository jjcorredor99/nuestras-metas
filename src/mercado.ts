import type { ItemLista, ListaCompras, Producto, TiendaId, Unidad } from './types'
import { dinero, sumar } from './format'

export const TIENDAS: { id: TiendaId; nombre: string; fuente: 'api' | 'folleto' }[] = [
  { id: 'exito', nombre: 'Éxito', fuente: 'api' },
  { id: 'carulla', nombre: 'Carulla', fuente: 'api' },
  { id: 'makro', nombre: 'Makro', fuente: 'api' },
  { id: 'd1', nombre: 'D1', fuente: 'folleto' },
  { id: 'ara', nombre: 'Ara', fuente: 'folleto' },
]

export const nombreTienda = (t: TiendaId): string => TIENDAS.find((x) => x.id === t)?.nombre ?? t

/** Cómo se dice la unidad cuando se compara: "$4.400 por litro". */
export const nombreUnidad = (u: Unidad): string => (u === 'l' ? 'litro' : u === 'kg' ? 'kilo' : 'unidad')

export type Fuente = 'api' | 'folleto' | 'manual'

/** Un precio tal como está guardado, sin interpretar. La llave es `tienda:sku`. */
export interface PrecioCrudo {
  tienda: TiendaId
  sku: string
  nombre: string
  precio: number
  contenido: number | null
  unidad: Unidad | null
  fuente: Fuente
  dia: string // YYYY-MM-DD
  vigenteHasta: string | null
  promocion: string | null
}

export type Precios = Map<string, PrecioCrudo>

export const llavePrecio = (tienda: TiendaId, sku: string): string => `${tienda}:${sku}`

// ---------- leer el contenido del nombre ----------

const UNIDADES: { patron: string; unidad: Unidad; factor: number }[] = [
  { patron: 'ML', unidad: 'l', factor: 0.001 },
  { patron: 'CC', unidad: 'l', factor: 0.001 },
  { patron: 'LTS|LT|LITROS|LITRO|L', unidad: 'l', factor: 1 },
  { patron: 'KGS|KG|KILOS|KILO', unidad: 'kg', factor: 1 },
  { patron: 'GRAMOS|GRS|GR|G', unidad: 'kg', factor: 0.001 },
  { patron: 'UNIDADES|UNIDAD|UNID|UNDS|UND|UN|ROLLOS|ROLLO', unidad: 'un', factor: 1 },
]

const redondear = (n: number): number => Math.round(n * 1e6) / 1e6

/** Mayúsculas, sin tildes y sin signos: la base para comparar nombres de tiendas distintas. */
export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Lee un número escrito como lo escriben las tiendas: en Colombia el punto separa
 * miles y la coma decimales, pero nadie es consistente. '1.100' son mil cien y
 * '1.5' es uno y medio, así que el punto solo separa miles si deja tres cifras.
 */
function leerNumero(s: string): number {
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'))
  const partes = s.split('.')
  if (partes.length > 1 && partes[partes.length - 1].length === 3) return Number(s.replace(/\./g, ''))
  return Number(s)
}

/**
 * Saca el contenido de un nombre de producto y lo pasa a la unidad de comparación.
 * 'Bolsa x 1.100 ml' -> 1.1 l · '900 gr' -> 0.9 kg · 'x 30 und' -> 30 un.
 * Un '500 g x 2' son dos de 500, o sea un kilo. Un '2x1' no es contenido: es una promoción.
 */
export function leerContenido(nombre: string): { contenido: number; unidad: Unidad } | null {
  const n = normalizarNombre(nombre)
  const alternativas = UNIDADES.map((u) => u.patron).join('|')
  const re = new RegExp(`(\\d[\\d.,]*)\\s*(${alternativas})(?![A-Z])`, 'g')

  let medida: { contenido: number; unidad: Unidad; fin: number } | null = null
  for (const m of n.matchAll(re)) {
    const valor = leerNumero(m[1])
    if (!Number.isFinite(valor) || valor <= 0) continue
    const def = UNIDADES.find((u) => new RegExp(`^(?:${u.patron})$`).test(m[2]))
    if (!def) continue
    // La primera medida que aparece manda: 'Arroz 500 g' antes que cualquier cosa de después.
    medida = { contenido: valor * def.factor, unidad: def.unidad, fin: (m.index ?? 0) + m[0].length }
    break
  }
  if (!medida) return null
  const fin = medida.fin

  // Un multiplicador es un 'X 2' que NO viene seguido de una medida (si viniera, sería el contenido).
  const multi = [...n.matchAll(new RegExp(`X\\s*(\\d+)(?!\\s*\\d)(?!\\s*(?:${alternativas})(?![A-Z]))`, 'g'))]
    .filter((m) => (m.index ?? 0) >= fin)
    .map((m) => Number(m[1]))
    .find((v) => v > 1)

  return { contenido: redondear(medida.contenido * (multi ?? 1)), unidad: medida.unidad }
}

/**
 * Lo único que hace honesta la comparación: cuánto cuesta el litro, el kilo o la unidad.
 * Sin contenido no se puede comparar, y devolver 0 lo haría pasar por el más barato:
 * por eso devuelve infinito, que nunca gana.
 */
export function precioPorUnidad(precio: number, contenido: number): number {
  if (!(contenido > 0) || !Number.isFinite(contenido)) return Number.POSITIVE_INFINITY
  return redondear(precio / contenido)
}

// ---------- emparejar nombres entre tiendas ----------

const GENERICAS = new Set([
  'DE', 'LA', 'EL', 'LOS', 'LAS', 'CON', 'SIN', 'POR', 'PARA', 'BOLSA', 'CAJA', 'PAQUETE',
  'BANDEJA', 'BOTELLA', 'GARRAFA', 'UNIDAD', 'UNIDADES', 'UND', 'PACK', 'TARRO',
])

function palabras(s: string): string[] {
  return normalizarNombre(s)
    .split(' ')
    .filter((t) => t.length >= 3 && !GENERICAS.has(t) && !/^\d/.test(t))
}

// La palabra larga suele ser la marca, y la marca es lo que de verdad identifica el producto.
const peso = (t: string): number => (t.length >= 5 ? 2 : 1)

/**
 * Qué tanto se parece lo que ustedes escribieron a lo que vende la tienda, de 0 a 1.
 * Si se pasan los dos contenidos, una presentación distinta baja el puntaje: no sirve
 * proponer el garrafón de 4 litros cuando lo que se sigue es la bolsa de uno.
 */
export function puntajeCoincidencia(
  canonico: string,
  deLaTienda: string,
  contenidos?: { canonico: number; tienda: number },
): number {
  const mias = palabras(canonico)
  if (mias.length === 0) return 0
  const suyas = new Set(palabras(deLaTienda))
  const total = sumar(mias.map(peso))
  const logrado = sumar(mias.filter((t) => suyas.has(t)).map(peso))
  let p = logrado / total
  if (contenidos && contenidos.canonico > 0 && contenidos.tienda > 0) {
    const razon = Math.min(contenidos.canonico, contenidos.tienda) / Math.max(contenidos.canonico, contenidos.tienda)
    p = p * (0.8 + 0.2 * razon)
  }
  return redondear(Math.max(0, Math.min(1, p)))
}

// ---------- qué tan viejo es un precio ----------

export type Frescura = 'hoy' | 'reciente' | 'viejo' | 'vencido'

const diasEntre = (desde: string, hasta: string): number => {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86400000)
}

/** Una oferta de folleto que ya caducó está vencida por más nueva que sea la fila. */
export function frescura(dia: string, vigenteHasta: string | null, hoy: string): Frescura {
  if (vigenteHasta && vigenteHasta < hoy) return 'vencido'
  const d = diasEntre(dia, hoy)
  if (d <= 0) return 'hoy'
  if (d <= 3) return 'reciente'
  return 'viejo'
}

export const ETIQUETA_FRESCURA: Record<Frescura, string> = {
  hoy: 'de hoy',
  reciente: 'de hace poco',
  viejo: 'puede haber cambiado',
  vencido: 'la oferta ya venció',
}

// ---------- la comparación ----------

export interface PrecioVista {
  tienda: TiendaId
  sku: string
  nombre: string
  precio: number
  contenido: number
  porUnidad: number
  fuente: Fuente
  dia: string
  frescura: Frescura
  /** Lo trajo la API y no está viejo: se puede mostrar sin advertencia. */
  confiable: boolean
  promocion: string | null
}

export interface Comparacion {
  producto: Producto
  precios: PrecioVista[] // de más barato a más caro, por unidad
  mejor: PrecioVista | null
  faltan: TiendaId[] // vinculadas pero sin precio usable, o sin vincular
}

/**
 * El contenido lo manda la fuente; si no lo dice, se lee del nombre; y si tampoco,
 * queda el que confirmó una persona al vincular.
 */
function contenidoDe(p: PrecioCrudo, respaldo: number): number {
  if (p.contenido && p.contenido > 0) return p.contenido
  return leerContenido(p.nombre)?.contenido ?? respaldo
}

export function vistaDeProducto(producto: Producto, precios: Precios, hoy: string): Comparacion {
  const vistas: PrecioVista[] = []
  const faltan: TiendaId[] = []

  for (const t of TIENDAS) {
    const v = producto.vinculos.find((x) => x.tienda === t.id)
    const p = v ? precios.get(llavePrecio(t.id, v.sku)) : undefined
    if (!v || !p) {
      faltan.push(t.id)
      continue
    }
    const f = frescura(p.dia, p.vigenteHasta, hoy)
    if (f === 'vencido') {
      faltan.push(t.id)
      continue
    }
    const contenido = contenidoDe(p, v.contenido)
    vistas.push({
      tienda: t.id,
      sku: p.sku,
      nombre: p.nombre,
      precio: p.precio,
      contenido,
      porUnidad: precioPorUnidad(p.precio, contenido),
      fuente: p.fuente,
      dia: p.dia,
      frescura: f,
      confiable: p.fuente === 'api' && (f === 'hoy' || f === 'reciente'),
      promocion: p.promocion,
    })
  }

  vistas.sort((a, b) => a.porUnidad - b.porUnidad || a.precio - b.precio)
  return { producto, precios: vistas, mejor: vistas[0] ?? null, faltan }
}

// ---------- la lista de compras ----------

export interface Opcion {
  tiendas: TiendaId[]
  total: number
  /** Ids de producto que esa opción no cubre. */
  faltan: string[]
}

/** Solo cuentan los productos con cantidad; un cero no es una compra. */
const pedidos = (lista: ListaCompras): ItemLista[] => lista.items.filter((i) => i.cantidad > 0)

/** Precio usable de cada producto en cada tienda, calculado una sola vez. */
export type Indice = Map<string, Map<TiendaId, PrecioVista>>

export function indexar(productos: Producto[], precios: Precios, hoy: string): Indice {
  const indice: Indice = new Map()
  for (const p of productos) {
    const porTienda = new Map<TiendaId, PrecioVista>()
    for (const v of vistaDeProducto(p, precios, hoy).precios) porTienda.set(v.tienda, v)
    indice.set(p.id, porTienda)
  }
  return indice
}

function totalCon(lista: ListaCompras, indice: Indice, tienda: TiendaId): Opcion {
  let total = 0
  const faltan: string[] = []
  for (const item of pedidos(lista)) {
    const precio = indice.get(item.productoId)?.get(tienda)
    if (!precio) faltan.push(item.productoId)
    else total += precio.precio * item.cantidad
  }
  return { tiendas: [tienda], total: redondear(total), faltan }
}

export function totalEnUnaTienda(
  lista: ListaCompras,
  productos: Producto[],
  precios: Precios,
  tienda: TiendaId,
  hoy: string,
): Opcion {
  return totalCon(lista, indexar(productos, precios, hoy), tienda)
}

/** Todos los subconjuntos de tiendas de 1 a `maxTiendas`. Con cinco tiendas son 25 opciones: fuerza bruta y listo. */
function combinaciones(ids: TiendaId[], max: number): TiendaId[][] {
  const salida: TiendaId[][] = []
  const paso = (desde: number, actual: TiendaId[]) => {
    if (actual.length > 0) salida.push([...actual])
    if (actual.length === max) return
    for (let i = desde; i < ids.length; i++) paso(i + 1, [...actual, ids[i]])
  }
  paso(0, [])
  return salida
}

export interface Reparto extends Opcion {
  /** En qué tienda conviene comprar cada producto. */
  asignacion: Map<string, TiendaId>
}

/**
 * Cada producto en la tienda más barata, pero sin mandar a recorrer la ciudad:
 * `maxTiendas` es cuántas paradas están dispuestos a hacer.
 */
function repartirCon(lista: ListaCompras, indice: Indice, maxTiendas: number): Reparto {
  const items = pedidos(lista)
  if (items.length === 0) return { tiendas: [], total: 0, faltan: [], asignacion: new Map() }

  let mejor: Reparto | null = null
  for (const combo of combinaciones(
    TIENDAS.map((t) => t.id),
    Math.max(1, maxTiendas),
  )) {
    let total = 0
    const faltan: string[] = []
    const asignacion = new Map<string, TiendaId>()
    for (const item of items) {
      const porTienda = indice.get(item.productoId)
      const opciones = combo.map((t) => porTienda?.get(t)).filter((p): p is PrecioVista => p !== undefined)
      if (opciones.length === 0) {
        faltan.push(item.productoId)
        continue
      }
      const barato = opciones.reduce((a, b) => (b.precio < a.precio ? b : a))
      total += barato.precio * item.cantidad
      asignacion.set(item.productoId, barato.tienda)
    }
    // Usadas de verdad: una parada donde no se compra nada no es una parada.
    const usadas = [...new Set(asignacion.values())]
    const candidato: Reparto = {
      tiendas: combo.filter((t) => usadas.includes(t)),
      total: redondear(total),
      faltan,
      asignacion,
    }
    if (!mejor || esMejor(candidato, mejor)) mejor = candidato
  }
  return mejor ?? { tiendas: [], total: 0, faltan: items.map((i) => i.productoId), asignacion: new Map() }
}

export function mejorRepartido(
  lista: ListaCompras,
  productos: Producto[],
  precios: Precios,
  hoy: string,
  maxTiendas = 2,
): Reparto {
  return repartirCon(lista, indexar(productos, precios, hoy), maxTiendas)
}

/** Primero cubrir la lista, después el precio, y en empate menos paradas. */
function esMejor(a: Opcion, b: Opcion): boolean {
  if (a.faltan.length !== b.faltan.length) return a.faltan.length < b.faltan.length
  if (a.total !== b.total) return a.total < b.total
  return a.tiendas.length < b.tiendas.length
}

/** Por debajo de esto, repartir no vale el viaje. */
export const AHORRO_MINIMO = 5000
export const AHORRO_MINIMO_PCT = 3

export interface Comparativo {
  unaTienda: Opcion[] // ordenadas: primero la que cubre más, después la más barata
  repartido: Reparto
  ahorro: number
  valeLaPena: boolean
  frase: string
}

export function comparativo(
  lista: ListaCompras,
  productos: Producto[],
  precios: Precios,
  hoy: string,
  opciones: { maxTiendas?: number; moneda?: string } = {},
): Comparativo {
  const { maxTiendas = 2, moneda = 'COP' } = opciones
  const indice = indexar(productos, precios, hoy)
  const unaTienda = TIENDAS.map((t) => totalCon(lista, indice, t.id)).sort((a, b) =>
    esMejor(a, b) ? -1 : esMejor(b, a) ? 1 : 0,
  )
  const repartido = repartirCon(lista, indice, maxTiendas)
  const mejorSola = unaTienda[0]

  const items = pedidos(lista)
  if (items.length === 0) {
    return { unaTienda, repartido, ahorro: 0, valeLaPena: false, frase: 'La lista está vacía.' }
  }
  if (!mejorSola || mejorSola.faltan.length === items.length) {
    return {
      unaTienda,
      repartido,
      ahorro: 0,
      valeLaPena: false,
      frase: 'Todavía no hay precios para comparar: vinculen los productos o anoten lo que vieron.',
    }
  }

  // Comparar contra la mejor tienda sola solo tiene sentido si el reparto cubre por lo menos lo mismo.
  const comparable = repartido.faltan.length <= mejorSola.faltan.length
  const ahorro = comparable ? redondear(mejorSola.total - repartido.total) : 0
  const valeLaPena =
    ahorro >= AHORRO_MINIMO && mejorSola.total > 0 && (ahorro / mejorSola.total) * 100 >= AHORRO_MINIMO_PCT

  const sola = `Todo en ${nombreTienda(mejorSola.tiendas[0])}: ${dinero(mejorSola.total, moneda)}`
  const paradas = repartido.tiendas.map(nombreTienda).join(' y ')

  let frase: string
  if (valeLaPena) {
    const cuantas = repartido.tiendas.length
    frase = `${sola}. Repartido entre ${paradas}: ${dinero(repartido.total, moneda)} — ahorran ${dinero(ahorro, moneda)} por ir a ${cuantas === 2 ? 'dos sitios' : `${cuantas} sitios`}.`
  } else if (ahorro > 0) {
    frase = `${sola}. Repartir apenas ahorra ${dinero(ahorro, moneda)}: prácticamente igual, vayan al que les quede cerca.`
  } else {
    frase = `${sola}. Repartir no ahorra nada; vayan a una sola.`
  }
  if (mejorSola.faltan.length > 0) {
    const n = mejorSola.faltan.length
    frase += ` (${n === 1 ? 'Falta el precio de 1 producto' : `Faltan los precios de ${n} productos`}.)`
  }
  return { unaTienda, repartido, ahorro, valeLaPena, frase }
}
