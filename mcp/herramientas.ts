// Las herramientas que ve Claude: preguntar cómo van y anotar cosas, con la misma matemática de la app.
import type { Categoria, Deuda, Estado, Factura, FuenteIngreso, Gasto, Ingreso, Meta, Persona, Reto } from '../src/types'
import {
  avanceAvanzar,
  bolsilloDe,
  comparacion,
  fraseComparacion,
  mesesParaLibres,
  minimosMensuales,
  reparto,
  resumenMes,
  vigentes,
  vistaBolsillo,
  vistaUnSueldo,
} from '../src/caja'
import { CATEGORIAS, catInfo } from '../src/categorias'
import { categoriaDe } from '../src/comercios'
import { dinero, pct, sumar } from '../src/format'
import { datosDesdeFilas, type Almacen, type Apunte, type Datos } from './datos'

export interface Contexto {
  almacen: Almacen
  /** Quién conectó a Claude: lo que anote sin decir de quién, queda a su nombre. */
  persona: Persona
  /** Hoy en Colombia, YYYY-MM-DD. */
  hoy: string
  uid: () => string
}

/** Un error que se le devuelve a Claude para que corrija o pregunte. */
export class ErrorUsuario extends Error {}

type Args = Record<string, unknown>

export interface Herramienta {
  name: string
  title: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  soloLectura: boolean
  correr: (args: Args, ctx: Contexto) => Promise<unknown>
}

// ---------- utilidades ----------

/** YYYY-MM-DD en una zona horaria (la función corre en UTC; a las 8 p. m. en Bogotá ya sería mañana). */
export function hoyEn(zona = 'America/Bogota', ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const diaUTC = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}
const diasEntre = (desde: string, hasta: string): number => Math.round(diaUTC(hasta) - diaUTC(desde))

/** Días hasta el próximo vencimiento de una factura con día fijo, contando desde `hoy`. */
export function diasParaVencer(diaVence: number, hoy: string): number {
  const [y, m, d] = hoy.split('-').map(Number)
  const ultimo = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate()
  const dia = Math.min(diaVence, ultimo(y, m))
  if (dia >= d) return dia - d
  const [py, pm] = m === 12 ? [y + 1, 1] : [y, m + 1]
  const prox = `${py}-${String(pm).padStart(2, '0')}-${String(Math.min(diaVence, ultimo(py, pm))).padStart(2, '0')}`
  return diasEntre(hoy, prox)
}

const nombreDe = (e: Estado, p: Persona | 'ambos' | 'hogar'): string =>
  p === 'ambos' ? 'Los dos' : p === 'hogar' ? 'La casa' : (p === 'a' ? e.perfil.nombreA : e.perfil.nombreB) || (p === 'a' ? 'Persona 1' : 'Persona 2')

function texto(v: unknown, campo: string, obligatorio: true): string
function texto(v: unknown, campo: string, obligatorio?: false): string | undefined
function texto(v: unknown, campo: string, obligatorio = false): string | undefined {
  if (v === undefined || v === null || v === '') {
    if (obligatorio) throw new ErrorUsuario(`Falta "${campo}".`)
    return undefined
  }
  if (typeof v !== 'string') throw new ErrorUsuario(`"${campo}" debe ser texto.`)
  return v.trim()
}

function monto(v: unknown, campo = 'monto'): number {
  const n = typeof v === 'string' ? Number(v.replace(/[$\s.]/g, '').replace(',', '.')) : v
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) throw new ErrorUsuario(`"${campo}" debe ser un número mayor que cero.`)
  return Math.round(n)
}

function fecha(v: unknown, ctx: Contexto): string {
  const f = texto(v, 'fecha')
  if (!f) return ctx.hoy
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new ErrorUsuario('"fecha" va como AAAA-MM-DD.')
  return f
}

function mes(v: unknown, ctx: Contexto): string {
  const m = texto(v, 'mes')
  if (!m) return ctx.hoy.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(m)) throw new ErrorUsuario('"mes" va como AAAA-MM.')
  return m
}

/** 'a', 'b', 'yo' o el nombre de alguno de los dos. Sin valor, quien conectó a Claude. */
function persona(v: unknown, e: Estado, ctx: Contexto, campo: string): Persona {
  const t = texto(v, campo)
  if (!t || norm(t) === 'yo') return ctx.persona
  if (t === 'a' || t === 'b') return t
  const n = norm(t)
  const candidatos = (['a', 'b'] as Persona[]).filter((p) => {
    const nombre = norm(p === 'a' ? e.perfil.nombreA : e.perfil.nombreB)
    return nombre && (nombre === n || nombre.split(' ')[0] === n.split(' ')[0])
  })
  if (candidatos.length === 1) return candidatos[0]
  throw new ErrorUsuario(`No sé quién es "${t}". Son ${nombreDe(e, 'a')} (a) y ${nombreDe(e, 'b')} (b).`)
}

function booleano(v: unknown, campo: string, porDefecto: boolean): boolean {
  if (v === undefined || v === null) return porDefecto
  if (typeof v !== 'boolean') throw new ErrorUsuario(`"${campo}" debe ser true o false.`)
  return v
}

/** Busca por id exacto o por nombre (sin tildes ni mayúsculas). Si hay varias, pide precisar. */
function uno<T extends { id: string }>(lista: T[], q: unknown, que: string, nombre: (x: T) => string): T {
  const t = texto(q, que, true)
  const porId = lista.find((x) => x.id === t)
  if (porId) return porId
  const n = norm(t)
  const exactos = lista.filter((x) => norm(nombre(x)) === n)
  const hallados = exactos.length ? exactos : lista.filter((x) => norm(nombre(x)).includes(n))
  if (hallados.length === 1) return hallados[0]
  const opciones = (hallados.length ? hallados : lista).map((x) => `${nombre(x)} (${x.id})`).join(', ')
  if (hallados.length > 1) throw new ErrorUsuario(`Hay varias que coinciden con "${t}": ${opciones}. Usa el id.`)
  throw new ErrorUsuario(lista.length ? `No encontré "${t}". Hay: ${opciones}.` : `No hay ninguna todavía.`)
}

const saldo = (d: Deuda): number => Math.max(0, d.montoInicial - sumar(d.abonos.map((a) => a.monto)))
const ahorrado = (m: Meta): number => sumar(m.aportes.map((a) => a.monto))

async function leer(ctx: Contexto): Promise<Datos> {
  return datosDesdeFilas(await ctx.almacen.leer())
}

const vistaGasto = (g: Gasto, e: Estado) => ({
  id: g.id,
  fecha: g.fecha,
  monto: g.monto,
  categoria: catInfo(g.categoria).nombre,
  nota: g.nota,
  pagoPor: nombreDe(e, g.pagadoPor),
  compartido: g.compartido,
  bolsillo: bolsilloDe(g, e.bolsillos)?.nombre ?? null,
  ...(g.origen ? { desde: g.origen.fuente === 'sms' ? `SMS ${g.origen.banco ?? ''}`.trim() : 'mensaje pegado' } : {}),
})

const vistaDeuda = (d: Deuda, e: Estado, mesActual: string) => {
  const s = saldo(d)
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
    ultimoAbono: d.abonos.reduce<string | null>((u, a) => (u && u > a.fecha ? u : a.fecha), null),
  }
}

const vistaMeta = (m: Meta, e: Estado, ctx: Contexto) => {
  const lleva = ahorrado(m)
  const falta = Math.max(0, m.montoObjetivo - lleva)
  const meses = Math.max(0, diasEntre(ctx.hoy, m.fecha) > 0 ? Math.ceil(diasEntre(ctx.hoy, m.fecha) / 30.44) : 0)
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
      [nombreDe(e, 'a')]: sumar(m.aportes.filter((a) => a.por === 'a').map((a) => a.monto)),
      [nombreDe(e, 'b')]: sumar(m.aportes.filter((a) => a.por === 'b').map((a) => a.monto)),
    },
  }
}

const vistaReto = (r: Reto, ctx: Contexto) => ({
  id: r.id,
  titulo: r.titulo,
  emoji: r.emoji,
  descripcion: r.descripcion,
  tipo: r.tipo === 'ahorro' ? 'ahorrar un monto' : r.tipo === 'habito' ? 'hábito (días o veces)' : 'no pasarse de un tope',
  meta: r.meta,
  progreso: r.progreso,
  avancePct: pct(r.progreso, r.meta),
  ...(r.tipo === 'limite' ? { sePaso: r.progreso > r.meta } : {}),
  fechaLimite: r.fechaLimite,
  diasQueFaltan: diasEntre(ctx.hoy, r.fechaLimite),
  completado: r.completado,
  recompensa: r.recompensa,
})

const vistaFactura = (f: Factura, e: Estado, m: string, ctx: Contexto) => {
  const pagada = f.pagadaEn.includes(m)
  return {
    id: f.id,
    nombre: f.nombre,
    monto: f.monto,
    diaVence: f.diaVence,
    responsable: nombreDe(e, f.responsable),
    pagada,
    ...(!pagada && m === ctx.hoy.slice(0, 7) ? { diasParaVencer: diasParaVencer(f.diaVence, ctx.hoy) } : {}),
  }
}

/** Quién le debe a quién por lo compartido del mes (cada uno pone la mitad). */
function balance(e: Estado, m: string): string | null {
  let a = 0
  let b = 0
  e.gastos.filter((g) => g.compartido && g.fecha.startsWith(m)).forEach((g) => (g.pagadoPor === 'a' ? (a += g.monto) : (b += g.monto)))
  const saldoAB = (a - b) / 2
  if (a + b === 0) return null
  if (saldoAB === 0) return 'Están a paz y salvo en lo compartido.'
  const [debe, recibe] = saldoAB > 0 ? (['b', 'a'] as const) : (['a', 'b'] as const)
  return `${nombreDe(e, debe)} le debe ${dinero(Math.abs(saldoAB), e.perfil.moneda)} a ${nombreDe(e, recibe)} por lo compartido.`
}

const CATS = CATEGORIAS.map((c) => c.id)
const categoria = (v: unknown): Categoria | undefined => {
  const t = texto(v, 'categoria')
  if (!t) return undefined
  const hallada = CATEGORIAS.find((c) => c.id === norm(t) || norm(c.nombre) === norm(t))
  if (!hallada) throw new ErrorUsuario(`Categoría desconocida "${t}". Son: ${CATS.join(', ')}.`)
  return hallada.id
}

const P = {
  mes: { type: 'string', description: 'Mes AAAA-MM. Sin él, el mes actual.' },
  fecha: { type: 'string', description: 'Fecha AAAA-MM-DD. Sin ella, hoy.' },
  persona: (que: string) => ({
    type: 'string',
    description: `${que}: "a", "b", "yo" o el nombre. Sin él, quien conectó a Claude.`,
  }),
  monto: { type: 'number', description: 'Monto en pesos, sin puntos ni signos (45900).' },
}

// ---------- las herramientas ----------

export const HERRAMIENTAS: Herramienta[] = [
  {
    name: 'como_vamos',
    title: 'Cómo vamos este mes',
    description:
      'La foto completa de un mes: cuánto entró, cuánto salió, cuánto queda y cuánto queda "de verdad" tras facturas y mínimos de deuda; si van viviendo con un sueldo; la cascada entra → fuera de casa → vivir → avanzar; cada bolsillo con su semáforo; la comparación contra el mes pasado; facturas por vencer y quién le debe a quién. Úsala primero ante cualquier pregunta general de plata.',
    inputSchema: { type: 'object', properties: { mes: P.mes } },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const m = mes(args.mes, ctx)
      const esActual = m === ctx.hoy.slice(0, 7)
      const r = resumenMes(e, m)
      const u = vistaUnSueldo(e, m)
      const c = comparacion(e, m, esActual ? Number(ctx.hoy.slice(8, 10)) : undefined)
      const facturas = e.facturas.filter((f) => f.activa).map((f) => vistaFactura(f, e, m, ctx))
      return {
        mes: m,
        hoy: ctx.hoy,
        moneda: e.perfil.moneda,
        personas: { a: nombreDe(e, 'a'), b: nombreDe(e, 'b') },
        caja: {
          entra: r.base,
          entraSegun: r.usaEsperado
            ? 'lo esperado (no han anotado ingresos reales este mes)'
            : r.ingresosReales > 0
              ? 'ingresos reales anotados'
              : 'nada: no hay ingresos anotados ni esperados',
          ingresosRealesPorPersona: { [nombreDe(e, 'a')]: r.porPersona.a, [nombreDe(e, 'b')]: r.porPersona.b },
          ingresosEsperados: r.ingresosEsperados,
          gastado: r.gastado,
          abonosADeudas: r.abonos,
          aportesAHitos: r.aportes,
          queda: r.queda,
          facturasSinPagar: r.facturasPendientes,
          minimosDeDeudaSinAbonar: r.minimosDeuda,
          libreDeVerdad: r.libre,
          asignadoABolsillos: r.asignado,
          sinBolsillo: r.sinAsignar,
        },
        vivirConUnSueldo: {
          sueldoDe: u.persona ? nombreDe(e, u.persona) : null,
          tope: u.tope,
          gastadoParaVivir: u.gastado,
          disponible: u.disponible,
          avancePct: u.avance,
          semaforo: u.estado,
        },
        reparto: reparto(e, m),
        avanzarEsteMes: avanceAvanzar(e, m),
        contraElMesPasado: {
          ...c,
          frase: fraseComparacion(c, (cat) => catInfo(cat).nombre, (n) => dinero(n, e.perfil.moneda)),
        },
        bolsillos: vigentes(e, m).map((b) => {
          const v = vistaBolsillo(b, e, m)
          return {
            id: b.id,
            nombre: `${b.emoji} ${b.nombre}`,
            de: nombreDe(e, b.ambito),
            asignacion: b.asignacion,
            gastado: v.gastado,
            disponible: v.disponible,
            avancePct: v.avance,
            semaforo: v.estado,
            loQueSobra: b.acumula ? 'se guarda' : 'se reinicia',
          }
        }),
        facturasPorPagar: facturas.filter((f) => !f.pagada),
        compartidos: balance(e, m),
      }
    },
  },
  {
    name: 'buscar_gastos',
    title: 'Buscar gastos',
    description:
      'Busca gastos por mes o rango de fechas, categoría, texto de la nota, quién pagó o si fue compartido. Devuelve el total, el reparto por categoría y por persona, y la lista (lo más reciente primero).',
    inputSchema: {
      type: 'object',
      properties: {
        mes: { type: 'string', description: 'Mes AAAA-MM. Si no das mes ni rango, el mes actual.' },
        desde: { type: 'string', description: 'Desde AAAA-MM-DD (incluido).' },
        hasta: { type: 'string', description: 'Hasta AAAA-MM-DD (incluido).' },
        categoria: { type: 'string', enum: CATS },
        texto: { type: 'string', description: 'Palabra en la nota o el comercio (sin importar tildes).' },
        pago_por: { type: 'string', description: '"a", "b" o el nombre.' },
        compartido: { type: 'boolean' },
        limite: { type: 'number', description: 'Cuántos gastos listar (por defecto 50). Los totales cuentan todos.' },
      },
    },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const desde = texto(args.desde, 'desde')
      const hasta = texto(args.hasta, 'hasta')
      const m = desde || hasta ? texto(args.mes, 'mes') : mes(args.mes, ctx)
      const cat = categoria(args.categoria)
      const q = texto(args.texto, 'texto')
      const quien = args.pago_por === undefined ? undefined : persona(args.pago_por, e, ctx, 'pago_por')
      const compartido = args.compartido === undefined ? undefined : booleano(args.compartido, 'compartido', false)
      const limite = typeof args.limite === 'number' && args.limite > 0 ? Math.floor(args.limite) : 50

      const lista = e.gastos
        .filter(
          (g) =>
            (!m || g.fecha.startsWith(m)) &&
            (!desde || g.fecha >= desde) &&
            (!hasta || g.fecha <= hasta) &&
            (!cat || g.categoria === cat) &&
            (!q || norm(g.nota).includes(norm(q))) &&
            (!quien || g.pagadoPor === quien) &&
            (compartido === undefined || g.compartido === compartido),
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha))

      const porCategoria = new Map<string, number>()
      lista.forEach((g) => porCategoria.set(catInfo(g.categoria).nombre, (porCategoria.get(catInfo(g.categoria).nombre) ?? 0) + g.monto))
      return {
        filtro: { mes: m ?? null, desde: desde ?? null, hasta: hasta ?? null },
        moneda: e.perfil.moneda,
        cuantos: lista.length,
        total: sumar(lista.map((g) => g.monto)),
        porCategoria: Object.fromEntries([...porCategoria.entries()].sort((x, y) => y[1] - x[1])),
        porPersona: {
          [nombreDe(e, 'a')]: sumar(lista.filter((g) => g.pagadoPor === 'a').map((g) => g.monto)),
          [nombreDe(e, 'b')]: sumar(lista.filter((g) => g.pagadoPor === 'b').map((g) => g.monto)),
        },
        gastos: lista.slice(0, limite).map((g) => vistaGasto(g, e)),
        ...(lista.length > limite ? { nota: `Se listan ${limite} de ${lista.length}; sube "limite" para ver más.` } : {}),
      }
    },
  },
  {
    name: 'ver_ingresos',
    title: 'Ver ingresos',
    description: 'Los ingresos reales anotados en un mes (o rango), por persona y fuente, junto a lo que cada uno espera recibir.',
    inputSchema: {
      type: 'object',
      properties: { mes: P.mes, desde: { type: 'string' }, hasta: { type: 'string' } },
    },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const desde = texto(args.desde, 'desde')
      const hasta = texto(args.hasta, 'hasta')
      const m = desde || hasta ? undefined : mes(args.mes, ctx)
      const lista = e.ingresos
        .filter((i) => (!m || i.fecha.startsWith(m)) && (!desde || i.fecha >= desde) && (!hasta || i.fecha <= hasta))
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
      const esperado = e.perfil.ingresoEsperado ?? { a: 0, b: 0 }
      return {
        moneda: e.perfil.moneda,
        total: sumar(lista.map((i) => i.monto)),
        esperadoAlMes: { [nombreDe(e, 'a')]: esperado.a || 0, [nombreDe(e, 'b')]: esperado.b || 0 },
        ingresos: lista.map((i) => ({ id: i.id, fecha: i.fecha, monto: i.monto, de: nombreDe(e, i.de), fuente: i.fuente, nota: i.nota })),
      }
    },
  },
  {
    name: 'ver_facturas',
    title: 'Ver facturas',
    description: 'Las facturas fijas del mes: cuánto valen, qué día vencen, de quién son, cuáles ya se pagaron y cuántos días faltan para las que no.',
    inputSchema: { type: 'object', properties: { mes: P.mes } },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const m = mes(args.mes, ctx)
      const lista = e.facturas.filter((f) => f.activa).map((f) => vistaFactura(f, e, m, ctx))
      return {
        mes: m,
        moneda: e.perfil.moneda,
        pagado: sumar(lista.filter((f) => f.pagada).map((f) => f.monto)),
        pendiente: sumar(lista.filter((f) => !f.pagada).map((f) => f.monto)),
        facturas: lista.sort((a, b) => a.diaVence - b.diaVence),
      }
    },
  },
  {
    name: 'ver_deudas',
    title: 'Ver deudas',
    description:
      'Cada deuda con su saldo, lo abonado y el mínimo, en orden bola de nieve (la más chica primero, las pagadas al final). Incluye el total, cuánto se abonó este mes contra el plan y en cuántos meses quedarían libres al ritmo del plan (sin intereses).',
    inputSchema: { type: 'object', properties: {} },
    soloLectura: true,
    correr: async (_args, ctx) => {
      const { estado: e } = await leer(ctx)
      const m = ctx.hoy.slice(0, 7)
      const lista = e.deudas.map((d) => vistaDeuda(d, e, m)).sort((a, b) => (a.saldo === 0 ? 1 : 0) - (b.saldo === 0 ? 1 : 0) || a.saldo - b.saldo)
      const av = avanceAvanzar(e, m)
      return {
        moneda: e.perfil.moneda,
        saldoTotal: sumar(lista.map((d) => d.saldo)),
        minimosAlMes: minimosMensuales(e.deudas),
        esteMes: { planDeAtaque: av.metaDeudas, abonado: av.abonos, porPersona: { [nombreDe(e, 'a')]: av.abonosPor.a, [nombreDe(e, 'b')]: av.abonosPor.b } },
        mesesParaQuedarLibres: mesesParaLibres(e.deudas, av.metaDeudas),
        siguienteATumbar: lista.find((d) => d.saldo > 0)?.nombre ?? null,
        deudas: lista,
      }
    },
  },
  {
    name: 'ver_hitos',
    title: 'Ver hitos (Grecia y demás)',
    description: 'Los hitos de ahorro (Grecia 2027 y los que hayan agregado): cuánto llevan, cuánto falta, días que quedan y cuánto habría que guardar al mes para llegar.',
    inputSchema: { type: 'object', properties: {} },
    soloLectura: true,
    correr: async (_args, ctx) => {
      const { estado: e } = await leer(ctx)
      return { moneda: e.perfil.moneda, hitos: e.metas.map((m) => vistaMeta(m, e, ctx)) }
    },
  },
  {
    name: 'ver_retos',
    title: 'Ver retos',
    description: 'Los retos de la pareja (ahorrar un monto, un hábito por N días, no pasarse de un tope) con su avance y premio.',
    inputSchema: {
      type: 'object',
      properties: { incluir_completados: { type: 'boolean', description: 'Por defecto solo los activos.' } },
    },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const todos = booleano(args.incluir_completados, 'incluir_completados', false)
      return { retos: e.retos.filter((r) => todos || !r.completado).map((r) => vistaReto(r, ctx)) }
    },
  },
  {
    name: 'ver_apuntes',
    title: 'Ver apuntes',
    description:
      'Las cosas que le han pedido a Claude que lleve (ideas, pendientes, preguntas, decisiones). Por defecto solo las que no están hechas.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Filtra por una palabra.' },
        etiqueta: { type: 'string' },
        incluir_hechos: { type: 'boolean' },
      },
    },
    soloLectura: true,
    correr: async (args, ctx) => {
      const { estado: e, apuntes } = await leer(ctx)
      const q = texto(args.texto, 'texto')
      const et = texto(args.etiqueta, 'etiqueta')
      const hechos = booleano(args.incluir_hechos, 'incluir_hechos', false)
      const lista = apuntes
        .filter((a) => (hechos || !a.hecho) && (!q || norm(a.texto).includes(norm(q))) && (!et || norm(a.etiqueta) === norm(et)))
        .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
      return {
        etiquetas: [...new Set(apuntes.map((a) => a.etiqueta).filter(Boolean))],
        apuntes: lista.map((a) => ({ ...a, por: nombreDe(e, a.por) })),
      }
    },
  },

  // ---------- para anotar ----------
  {
    name: 'anotar_gasto',
    title: 'Anotar un gasto',
    description:
      'Anota un gasto como si lo hubieran puesto en la app: aparece en los dos celulares. Si no dicen si es compartido, pregunta. Sin categoría, la adivina por la nota (EXITO → mercado) o queda en Otros. Devuelve en qué bolsillo cayó y cuánto le queda.',
    inputSchema: {
      type: 'object',
      properties: {
        monto: P.monto,
        nota: { type: 'string', description: 'Qué fue o dónde (el comercio ayuda a adivinar la categoría).' },
        compartido: { type: 'boolean', description: 'true si es de la casa (se paga a medias); false si es personal.' },
        categoria: { type: 'string', enum: CATS },
        pago_por: P.persona('Quién pagó'),
        fecha: P.fecha,
      },
      required: ['monto', 'nota', 'compartido'],
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      if (args.compartido === undefined) throw new ErrorUsuario('Falta decir si es compartido (de la casa) o personal.')
      const nota = texto(args.nota, 'nota', true)
      const gasto: Gasto = {
        id: ctx.uid(),
        fecha: fecha(args.fecha, ctx),
        monto: monto(args.monto),
        categoria: categoria(args.categoria) ?? categoriaDe(nota, e.perfil.aprendidos) ?? 'otros',
        pagadoPor: persona(args.pago_por, e, ctx, 'pago_por'),
        compartido: booleano(args.compartido, 'compartido', false),
        nota,
      }
      await ctx.almacen.guardar([{ id: gasto.id, tipo: 'gasto', data: gasto }])
      const despues: Estado = { ...e, gastos: [gasto, ...e.gastos] }
      const b = bolsilloDe(gasto, e.bolsillos)
      const v = b ? vistaBolsillo(b, despues, gasto.fecha.slice(0, 7)) : null
      return {
        anotado: vistaGasto(gasto, despues),
        bolsillo: b && v ? { nombre: `${b.emoji} ${b.nombre}`, disponible: v.disponible, semaforo: v.estado } : null,
      }
    },
  },
  {
    name: 'anotar_ingreso',
    title: 'Anotar un ingreso',
    description: 'Anota plata que entró (nómina, extra, devolución). Un giro entre ustedes dos no es un ingreso: no lo anotes.',
    inputSchema: {
      type: 'object',
      properties: {
        monto: P.monto,
        de: P.persona('A quién le entró'),
        fuente: { type: 'string', enum: ['nomina', 'extra', 'devolucion', 'otro'] },
        nota: { type: 'string' },
        fecha: P.fecha,
      },
      required: ['monto'],
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const fuente = (texto(args.fuente, 'fuente') ?? 'otro') as FuenteIngreso
      if (!['nomina', 'extra', 'devolucion', 'otro'].includes(fuente)) throw new ErrorUsuario('"fuente" es nomina, extra, devolucion u otro.')
      const ingreso: Ingreso = {
        id: ctx.uid(),
        fecha: fecha(args.fecha, ctx),
        monto: monto(args.monto),
        de: persona(args.de, e, ctx, 'de'),
        fuente,
        nota: texto(args.nota, 'nota') ?? '',
      }
      await ctx.almacen.guardar([{ id: ingreso.id, tipo: 'ingreso', data: ingreso }])
      return { anotado: { ...ingreso, de: nombreDe(e, ingreso.de) } }
    },
  },
  {
    name: 'abonar_deuda',
    title: 'Abonar a una deuda',
    description: 'Registra un abono a una deuda (por nombre o id) y devuelve el saldo que queda.',
    inputSchema: {
      type: 'object',
      properties: { deuda: { type: 'string', description: 'Nombre o id.' }, monto: P.monto, por: P.persona('Quién abonó'), fecha: P.fecha },
      required: ['deuda', 'monto'],
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const d = uno(e.deudas, args.deuda, 'deuda', (x) => x.nombre)
      const nueva: Deuda = {
        ...d,
        abonos: [{ id: ctx.uid(), fecha: fecha(args.fecha, ctx), monto: monto(args.monto), por: persona(args.por, e, ctx, 'por') }, ...d.abonos],
      }
      await ctx.almacen.guardar([{ id: d.id, tipo: 'deuda', data: nueva }])
      const vista = vistaDeuda(nueva, e, ctx.hoy.slice(0, 7))
      return { deuda: vista, ...(vista.saldo === 0 ? { celebrar: `¡${d.nombre} cayó! 🎉` } : {}) }
    },
  },
  {
    name: 'aportar_hito',
    title: 'Aportar a un hito',
    description: 'Registra plata guardada para un hito (Grecia u otro, por nombre o id) y devuelve cuánto llevan y cuánto falta.',
    inputSchema: {
      type: 'object',
      properties: { hito: { type: 'string', description: 'Nombre o id (ej. "Grecia").' }, monto: P.monto, por: P.persona('Quién aportó'), fecha: P.fecha },
      required: ['hito', 'monto'],
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const m = uno(e.metas, args.hito, 'hito', (x) => x.titulo)
      const nueva: Meta = {
        ...m,
        aportes: [{ id: ctx.uid(), fecha: fecha(args.fecha, ctx), monto: monto(args.monto), por: persona(args.por, e, ctx, 'por') }, ...m.aportes],
      }
      await ctx.almacen.guardar([{ id: m.id, tipo: 'meta', data: nueva }])
      return { hito: vistaMeta(nueva, e, ctx) }
    },
  },
  {
    name: 'pagar_factura',
    title: 'Marcar una factura como pagada',
    description: 'Marca (o desmarca) una factura como pagada en un mes. Con anotar_gasto, además anota el gasto en Servicios como hace la app.',
    inputSchema: {
      type: 'object',
      properties: {
        factura: { type: 'string', description: 'Nombre o id.' },
        mes: P.mes,
        pagada: { type: 'boolean', description: 'false para desmarcarla. Por defecto true.' },
        anotar_gasto: { type: 'boolean', description: 'Anotar también el gasto. Por defecto false.' },
      },
      required: ['factura'],
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const f = uno(
        e.facturas.filter((x) => x.activa),
        args.factura,
        'factura',
        (x) => x.nombre,
      )
      const m = mes(args.mes, ctx)
      const pagada = booleano(args.pagada, 'pagada', true)
      const nueva: Factura = {
        ...f,
        pagadaEn: pagada ? Array.from(new Set([...f.pagadaEn, m])) : f.pagadaEn.filter((x) => x !== m),
      }
      const filas: { id: string; tipo: 'factura' | 'gasto'; data: unknown }[] = [{ id: f.id, tipo: 'factura', data: nueva }]
      let gasto: Gasto | null = null
      if (pagada && booleano(args.anotar_gasto, 'anotar_gasto', false)) {
        gasto = {
          id: ctx.uid(),
          fecha: ctx.hoy,
          monto: f.monto,
          categoria: 'servicios',
          pagadoPor: f.responsable === 'b' ? 'b' : 'a',
          compartido: f.responsable === 'ambos',
          nota: `Factura: ${f.nombre}`,
        }
        filas.push({ id: gasto.id, tipo: 'gasto', data: gasto })
      }
      await ctx.almacen.guardar(filas)
      return { factura: vistaFactura(nueva, e, m, ctx), ...(gasto ? { gastoAnotado: vistaGasto(gasto, e) } : {}) }
    },
  },
  {
    name: 'avanzar_reto',
    title: 'Avanzar un reto',
    description: 'Actualiza el progreso de un reto: "sumar" agrega (un día más, un aporte, un gasto contra el tope) y "progreso" lo fija. Se completa solo al llegar a la meta (salvo los de tope).',
    inputSchema: {
      type: 'object',
      properties: {
        reto: { type: 'string', description: 'Título o id.' },
        sumar: { type: 'number' },
        progreso: { type: 'number' },
      },
      required: ['reto'],
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const r = uno(e.retos, args.reto, 'reto', (x) => x.titulo)
      const suma = typeof args.sumar === 'number' ? args.sumar : undefined
      const fijo = typeof args.progreso === 'number' ? args.progreso : undefined
      if ((suma === undefined) === (fijo === undefined)) throw new ErrorUsuario('Usa "sumar" o "progreso" (uno de los dos).')
      const progreso = Math.max(0, fijo ?? r.progreso + (suma ?? 0))
      const completado = r.tipo === 'limite' ? r.completado : progreso >= r.meta
      const nuevo: Reto = { ...r, progreso, completado, completadoEn: completado ? (r.completadoEn ?? ctx.hoy) : undefined }
      if (!completado) delete nuevo.completadoEn
      await ctx.almacen.guardar([{ id: r.id, tipo: 'reto', data: nuevo }])
      return { reto: vistaReto(nuevo, ctx), ...(completado && !r.completado ? { celebrar: `¡Reto cumplido! Premio: ${r.recompensa || 'el que quieran'} 🎉` } : {}) }
    },
  },
  {
    name: 'borrar_gasto',
    title: 'Borrar un gasto',
    description: 'Borra un gasto por su id (búscalo antes con buscar_gastos). Se quita en los dos celulares. Confirma con ellos antes de borrar.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const id = texto(args.id, 'id', true)
      const g = e.gastos.find((x) => x.id === id)
      if (!g) throw new ErrorUsuario(`No hay un gasto con id "${id}".`)
      await ctx.almacen.borrar([id])
      return { borrado: vistaGasto(g, e) }
    },
  },
  {
    name: 'apuntar',
    title: 'Apuntar algo para después',
    description:
      'Guarda algo que quieran llevar fuera de la plata o que no tenga lugar en la app: un pendiente, una idea para Grecia, una decisión, una pregunta para después. Vive en su hogar y lo ven los dos cuando le pregunten a Claude.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        etiqueta: { type: 'string', description: 'Una palabra para agrupar (grecia, casa, pendiente, idea...).' },
        por: P.persona('Quién lo pide'),
      },
      required: ['texto'],
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { estado: e } = await leer(ctx)
      const apunte: Apunte = {
        id: ctx.uid(),
        texto: texto(args.texto, 'texto', true),
        etiqueta: norm(texto(args.etiqueta, 'etiqueta') ?? ''),
        por: persona(args.por, e, ctx, 'por'),
        creadoEn: ctx.hoy,
        hecho: false,
      }
      await ctx.almacen.guardar([{ id: apunte.id, tipo: 'apunte', data: apunte }])
      return { apuntado: { ...apunte, por: nombreDe(e, apunte.por) } }
    },
  },
  {
    name: 'marcar_apunte',
    title: 'Marcar un apunte como hecho',
    description: 'Marca un apunte como hecho (o lo reabre con hecho=false). Con borrar=true lo elimina.',
    inputSchema: {
      type: 'object',
      properties: {
        apunte: { type: 'string', description: 'Id o parte del texto.' },
        hecho: { type: 'boolean' },
        borrar: { type: 'boolean' },
      },
      required: ['apunte'],
    },
    soloLectura: false,
    correr: async (args, ctx) => {
      const { apuntes } = await leer(ctx)
      const a = uno(apuntes, args.apunte, 'apunte', (x) => x.texto)
      if (booleano(args.borrar, 'borrar', false)) {
        await ctx.almacen.borrar([a.id])
        return { borrado: a.texto }
      }
      const hecho = booleano(args.hecho, 'hecho', true)
      const nuevo: Apunte = { ...a, hecho }
      if (hecho) nuevo.hechoEn = ctx.hoy
      else delete nuevo.hechoEn
      await ctx.almacen.guardar([{ id: a.id, tipo: 'apunte', data: nuevo }])
      return { apunte: nuevo }
    },
  },
]
