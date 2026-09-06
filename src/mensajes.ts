import type { Categoria, Gasto, OrigenGasto, Persona } from './types'
import { hoy } from './format'
import { categoriaDe } from './comercios'

export type TipoMovimiento = 'compra' | 'pago' | 'retiro' | 'transferencia'
export type MotivoRechazo = 'sin-monto' | 'no-es-gasto' | 'es-ingreso'

export interface Lectura {
  monto: number
  comercio: string
  fecha: string // YYYY-MM-DD
  banco: string
  tipo: TipoMovimiento
  tarjeta?: string
  categoria: Categoria
  /** 'alta' = se anota solo; 'baja' = pasa por la bandeja "por confirmar". */
  confianza: 'alta' | 'baja'
  hash: string
}

export interface Rechazo {
  error: MotivoRechazo
}

export const esLectura = (r: Lectura | Rechazo): r is Lectura => !('error' in r)

export const MOTIVOS: Record<MotivoRechazo, string> = {
  'sin-monto': 'No encontré un valor en el mensaje.',
  'no-es-gasto': 'Ese mensaje no parece un gasto.',
  'es-ingreso': 'Eso es plata que entró, no un gasto.',
}

/** Mayúsculas, sin tildes y con los espacios parejos. Todo lo demás trabaja sobre esto. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Huella del mensaje: sirve para no anotar dos veces el mismo SMS. */
export function huella(texto: string): string {
  const t = normalizar(texto)
  let h = 0x811c9dc5
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${t.length.toString(36)}${h.toString(36)}`
}

const BANCOS: [RegExp, string][] = [
  [/BANCOLOMBIA/, 'Bancolombia'],
  [/NEQUI/, 'Nequi'],
  [/DAVIPLATA/, 'Daviplata'],
  [/DAVIVIENDA/, 'Davivienda'],
  [/RAPPICARD|RAPPI CARD|RAPPIPAY/, 'RappiCard'],
  [/\bCMR\b|BANCO FALABELLA/, 'Falabella'],
  [/LULO/, 'Lulo Bank'],
  [/SCOTIABANK|COLPATRIA/, 'Scotiabank'],
  [/BBVA/, 'BBVA'],
  [/BANCO DE BOGOTA/, 'Banco de Bogotá'],
  [/BANCO DE OCCIDENTE/, 'Occidente'],
  [/NUBANK|\bNU\b/, 'Nu'],
]

const VERBOS: { tipo: TipoMovimiento; re: RegExp }[] = [
  { tipo: 'compra', re: /\bCOMPR(A|ASTE|O|AS)\b/ },
  { tipo: 'retiro', re: /\bRETIR(O|ASTE|OS)\b|\bAVANCE\b/ },
  { tipo: 'transferencia', re: /\bTRANSFER(ISTE|ENCIA)\b|\bENVIASTE\b/ },
  { tipo: 'pago', re: /\bPAG(O|ASTE|OS|UE)\b/ },
]

const RE_INGRESO =
  /\bRECIBISTE\b|\bTE CONSIGNARON\b|\bCONSIGNACION\b|\bTE ENVIO\b|\bTE TRANSFIRIO\b|\bABONO A TU\b|\bDEVOLUCION\b|\bREVERSION\b|\bTE LLEGARON\b|\bNOMINA\b/

const RE_NO_TX =
  /CLAVE DINAMICA|NO COMPARTAS|NUNCA COMPARTAS|CODIGO DE (VERIFICACION|SEGURIDAD|ACCESO)|\bOTP\b|CONTRASENA|ACTUALIZA TUS DATOS|APROVECHA|PROMOCION|FELICITACIONES|SORTEO|INTENTO DE|BLOQUE(O|AMOS)|TU CLAVE/

const MESES: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12,
}

/** "45.900" -> 45900 · "45.900,50" -> 45900.5 · "45,900.00" -> 45900 */
export function aNumero(bruto: string): number {
  const t = bruto.replace(/[^\d.,]/g, '').replace(/[.,]+$/, '')
  if (!t) return 0
  const ultimo = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'))
  if (ultimo === -1) return Number(t) || 0
  const decimales = t.length - ultimo - 1
  if (decimales === 1 || decimales === 2) {
    const entero = t.slice(0, ultimo).replace(/[.,]/g, '')
    return Number(`${entero || '0'}.${t.slice(ultimo + 1)}`) || 0
  }
  return Number(t.replace(/[.,]/g, '')) || 0
}

interface Importe {
  valor: number
  desde: number
  hasta: number
}

function importesEn(t: string): Importe[] {
  const out: Importe[] = []
  const conSigno = /(?:\$|COP\s?\$?|USD\s?\$?)\s?([\d][\d.,]*)/g
  let m: RegExpExecArray | null
  while ((m = conSigno.exec(t))) {
    const valor = aNumero(m[1])
    if (valor > 0) out.push({ valor, desde: m.index, hasta: m.index + m[0].length })
  }
  if (out.length) return out
  const sinSigno = /\b(?:POR|DE)\s+([\d][\d.,]{2,})/g
  while ((m = sinSigno.exec(t))) {
    const valor = aNumero(m[1])
    if (valor > 0) out.push({ valor, desde: m.index, hasta: m.index + m[0].length })
  }
  return out
}

const CORTES =
  /[,;:!?]|\.(?=\s|$)|\s\d{1,2}[/-]\d{1,2}|\sT\.?\s?(?:CRED|DEB)|\sTARJETA|\sDESDE|\sCUPO|\sSALDO|\sHORA\b|\sCON\s|\sPRODUCTO|\sREF\b|\sSI NO\b|\sINQUIETUDES|\sPOR\b|\sVALOR\b|\s\*\d|\sA LAS\b/

function comercioDe(t: string, desde: number): string {
  let resto = t.slice(desde)
  const conector = resto.match(/^\s*(?:EN LA|EN EL|EN|A|CON|PARA)\s+/)
  resto = conector ? resto.slice(conector[0].length) : resto.replace(/^\s+/, '')
  const corte = resto.search(CORTES)
  const bruto = corte >= 0 ? resto.slice(0, corte) : resto
  return bruto
    .replace(/\*+\d*/g, ' ')
    .replace(/[^A-Z0-9&.\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(EL|LA|DE|DEL|Y|EN)$/, '')
    .trim()
    .slice(0, 40)
}

const iso = (a: number, m: number, d: number): string =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const valida = (d: number, m: number, a: number): boolean =>
  d >= 1 && d <= 31 && m >= 1 && m <= 12 && a >= 2000 && a <= 2100

function fechaDe(t: string): string {
  const anio = Number(hoy().slice(0, 4))
  const candidatos: string[] = []

  const numerica = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  if (numerica) {
    const d = Number(numerica[1])
    const m = Number(numerica[2])
    let a = numerica[3] ? Number(numerica[3]) : anio
    if (a < 100) a += 2000
    if (valida(d, m, a)) candidatos.push(iso(a, m, d))
    if (valida(m, d, a)) candidatos.push(iso(a, d, m)) // por si venía mm/dd
  }

  const conMes = t.match(/\b(\d{1,2})[ -](?:DE[ -])?([A-Z]{3})[A-Z]*\.?(?:[ -](?:DE[ -])?(\d{2,4}))?/)
  if (conMes && MESES[conMes[2]]) {
    const d = Number(conMes[1])
    const m = MESES[conMes[2]]
    let a = conMes[3] ? Number(conMes[3]) : anio
    if (a < 100) a += 2000
    if (valida(d, m, a)) candidatos.unshift(iso(a, m, d))
  }

  const limite = hoy()
  return candidatos.find((f) => f <= limite) ?? limite
}

/**
 * Lee el texto de un SMS del banco y saca el gasto.
 * `aprendidos` son las correcciones de categoría que ya hicieron ustedes.
 */
export function leerMensaje(
  texto: string,
  aprendidos: Record<string, Categoria> = {},
): Lectura | Rechazo {
  const t = normalizar(texto)
  if (t.length < 8) return { error: 'no-es-gasto' }
  if (RE_NO_TX.test(t)) return { error: 'no-es-gasto' }

  const verbo = VERBOS.find((v) => v.re.test(t))
  if (RE_INGRESO.test(t) && (!verbo || verbo.tipo === 'pago' || verbo.tipo === 'transferencia')) {
    return { error: 'es-ingreso' }
  }
  if (!verbo) return { error: 'no-es-gasto' }

  const importes = importesEn(t)
  if (!importes.length) return { error: 'sin-monto' }
  const desdeVerbo = t.search(verbo.re)
  const importe = importes.find((i) => i.desde >= desdeVerbo) ?? importes[0]

  const banco = BANCOS.find(([re]) => re.test(t))?.[1] ?? 'Desconocido'
  const comercio = comercioDe(t, importe.hasta)
  const categoria = categoriaDe(comercio, aprendidos)
  const tarjeta = t.match(/\*\s?(\d{4})\b/)?.[1]

  return {
    monto: importe.valor,
    comercio,
    fecha: fechaDe(t),
    banco,
    tipo: verbo.tipo,
    ...(tarjeta ? { tarjeta } : {}),
    categoria: categoria ?? 'otros',
    confianza:
      banco !== 'Desconocido' && comercio.length >= 3 && categoria !== null ? 'alta' : 'baja',
    hash: huella(texto),
  }
}

/** Lo que va en la nota del gasto. */
export function notaDe(l: Lectura): string {
  if (l.comercio) return l.comercio
  const como: Record<TipoMovimiento, string> = {
    compra: 'Compra',
    pago: 'Pago',
    retiro: 'Retiro',
    transferencia: 'Transferencia',
  }
  return `${como[l.tipo]} ${l.banco !== 'Desconocido' ? l.banco : ''}`.trim()
}

/** Convierte una lectura en el gasto listo para guardar. */
export function borradorDesde(
  l: Lectura,
  pagadoPor: Persona,
  fuente: OrigenGasto['fuente'] = 'sms',
  compartido = true,
): Omit<Gasto, 'id'> {
  return {
    fecha: l.fecha,
    monto: l.monto,
    categoria: l.categoria,
    pagadoPor,
    compartido,
    nota: notaDe(l),
    origen: { fuente, hash: l.hash, banco: l.banco },
  }
}
