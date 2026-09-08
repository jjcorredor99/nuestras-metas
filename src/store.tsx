import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type {
  Estado,
  Gasto,
  Factura,
  Deuda,
  Reto,
  Meta,
  Foto,
  Perfil,
  Abono,
  AporteMeta,
  Categoria,
  Bolsillo,
  AjusteBolsillo,
  Ingreso,
} from './types'
import { claveComercio } from './comercios'
import { quitarCategorias } from './caja'
import { hoy, uid } from './format'
import type { Fila } from './supabase'

const CLAVE = 'nuestras-metas:v1'

export const GRECIA_ID = 'meta-grecia-2027'

export function estadoInicial(): Estado {
  return {
    version: 1,
    perfil: {
      nombreA: '',
      nombreB: '',
      nombrePareja: '',
      moneda: 'COP',
      onboarded: false,
    },
    gastos: [],
    facturas: [],
    deudas: [],
    retos: [],
    metas: [
      {
        id: GRECIA_ID,
        titulo: 'Grecia',
        descripcion:
          'Santorini al atardecer, Atenas, comer hasta reventar. El viaje que nos prometimos.',
        emoji: '🇬🇷',
        fecha: '2027-06-15',
        montoObjetivo: 20000000,
        aportes: [],
        color: '#3a7ca5',
        fija: true,
      },
    ],
    fotos: [],
    bolsillos: [],
    ingresos: [],
  }
}

function cargar(): Estado {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (!raw) return estadoInicial()
    const parsed = JSON.parse(raw) as Partial<Estado>
    const base = estadoInicial()
    const estado: Estado = {
      ...base,
      ...parsed,
      perfil: { ...base.perfil, ...(parsed.perfil ?? {}) },
      metas: parsed.metas ?? base.metas,
    }
    // Grecia siempre existe.
    if (!estado.metas.some((m) => m.id === GRECIA_ID)) estado.metas.unshift(base.metas[0])
    return estado
  } catch {
    return estadoInicial()
  }
}

export type Accion =
  | { tipo: 'perfil'; perfil: Partial<Perfil> }
  | { tipo: 'perfil/aprender-comercio'; comercio: string; categoria: Categoria }
  | { tipo: 'gasto/agregar'; gasto: Omit<Gasto, 'id'> }
  | { tipo: 'gasto/editar'; gasto: Gasto }
  | { tipo: 'gasto/borrar'; id: string }
  | { tipo: 'factura/agregar'; factura: Omit<Factura, 'id' | 'pagadaEn' | 'activa'> }
  | { tipo: 'factura/editar'; factura: Factura }
  | { tipo: 'factura/borrar'; id: string }
  | { tipo: 'factura/pagar'; id: string; mes: string; pagada: boolean; registrarGasto?: boolean }
  | { tipo: 'deuda/agregar'; deuda: Omit<Deuda, 'id' | 'abonos' | 'creadaEn'> }
  | { tipo: 'deuda/editar'; deuda: Deuda }
  | { tipo: 'deuda/borrar'; id: string }
  | { tipo: 'deuda/abonar'; id: string; abono: Omit<Abono, 'id'> }
  | { tipo: 'deuda/quitarAbono'; id: string; abonoId: string }
  | { tipo: 'reto/agregar'; reto: Omit<Reto, 'id' | 'completado' | 'progreso'> }
  | { tipo: 'reto/editar'; reto: Reto }
  | { tipo: 'reto/borrar'; id: string }
  | { tipo: 'reto/progreso'; id: string; progreso: number }
  | { tipo: 'reto/completar'; id: string; completado: boolean }
  | { tipo: 'meta/agregar'; meta: Omit<Meta, 'id' | 'aportes' | 'fija'> }
  | { tipo: 'meta/editar'; meta: Meta }
  | { tipo: 'meta/borrar'; id: string }
  | { tipo: 'meta/aportar'; id: string; aporte: Omit<AporteMeta, 'id'> }
  | { tipo: 'meta/quitarAporte'; id: string; aporteId: string }
  | { tipo: 'foto/agregar'; foto: Foto }
  | { tipo: 'foto/editar'; foto: Foto }
  | { tipo: 'foto/borrar'; id: string }
  | { tipo: 'bolsillo/agregar'; bolsillo: Omit<Bolsillo, 'id' | 'ajustes'> }
  | { tipo: 'bolsillo/editar'; bolsillo: Bolsillo }
  | { tipo: 'bolsillo/borrar'; id: string }
  | { tipo: 'bolsillo/ajustar'; id: string; ajuste: Omit<AjusteBolsillo, 'id'> }
  | { tipo: 'bolsillo/quitarAjuste'; id: string; ajusteId: string }
  | { tipo: 'bolsillo/mover'; de: string; a: string; monto: number; fecha: string; nota: string }
  | { tipo: 'bolsillo/crearVarios'; bolsillos: Omit<Bolsillo, 'id' | 'ajustes'>[] }
  | { tipo: 'ingreso/agregar'; ingreso: Omit<Ingreso, 'id'> }
  | { tipo: 'ingreso/editar'; ingreso: Ingreso }
  | { tipo: 'ingreso/borrar'; id: string }
  | { tipo: 'importar'; estado: Estado }
  | { tipo: 'reiniciar' }
  | { tipo: 'sync/aplicar'; filas: Fila[] }

function reducer(s: Estado, a: Accion): Estado {
  switch (a.tipo) {
    case 'perfil':
      return { ...s, perfil: { ...s.perfil, ...a.perfil } }
    case 'perfil/aprender-comercio': {
      const clave = claveComercio(a.comercio)
      if (!clave) return s
      return { ...s, perfil: { ...s.perfil, aprendidos: { ...s.perfil.aprendidos, [clave]: a.categoria } } }
    }

    case 'gasto/agregar':
      return { ...s, gastos: [{ ...a.gasto, id: uid() }, ...s.gastos] }
    case 'gasto/editar':
      return { ...s, gastos: s.gastos.map((g) => (g.id === a.gasto.id ? a.gasto : g)) }
    case 'gasto/borrar':
      return { ...s, gastos: s.gastos.filter((g) => g.id !== a.id) }

    case 'factura/agregar':
      return { ...s, facturas: [...s.facturas, { ...a.factura, id: uid(), pagadaEn: [], activa: true }] }
    case 'factura/editar':
      return { ...s, facturas: s.facturas.map((f) => (f.id === a.factura.id ? a.factura : f)) }
    case 'factura/borrar':
      return { ...s, facturas: s.facturas.filter((f) => f.id !== a.id) }
    case 'factura/pagar': {
      const factura = s.facturas.find((f) => f.id === a.id)
      if (!factura) return s
      const pagadaEn = a.pagada
        ? Array.from(new Set([...factura.pagadaEn, a.mes]))
        : factura.pagadaEn.filter((m) => m !== a.mes)
      const facturas = s.facturas.map((f) => (f.id === a.id ? { ...f, pagadaEn } : f))
      let gastos = s.gastos
      if (a.pagada && a.registrarGasto) {
        gastos = [
          {
            id: uid(),
            fecha: hoy(),
            monto: factura.monto,
            categoria: 'servicios',
            pagadoPor: factura.responsable === 'b' ? 'b' : 'a',
            compartido: factura.responsable === 'ambos',
            nota: `Factura: ${factura.nombre}`,
          },
          ...s.gastos,
        ]
      }
      return { ...s, facturas, gastos }
    }

    case 'deuda/agregar':
      return { ...s, deudas: [...s.deudas, { ...a.deuda, id: uid(), abonos: [], creadaEn: hoy() }] }
    case 'deuda/editar':
      return { ...s, deudas: s.deudas.map((d) => (d.id === a.deuda.id ? a.deuda : d)) }
    case 'deuda/borrar':
      return { ...s, deudas: s.deudas.filter((d) => d.id !== a.id) }
    case 'deuda/abonar':
      return {
        ...s,
        deudas: s.deudas.map((d) =>
          d.id === a.id ? { ...d, abonos: [{ ...a.abono, id: uid() }, ...d.abonos] } : d,
        ),
      }
    case 'deuda/quitarAbono':
      return {
        ...s,
        deudas: s.deudas.map((d) =>
          d.id === a.id ? { ...d, abonos: d.abonos.filter((x) => x.id !== a.abonoId) } : d,
        ),
      }

    case 'reto/agregar':
      return { ...s, retos: [{ ...a.reto, id: uid(), progreso: 0, completado: false }, ...s.retos] }
    case 'reto/editar':
      return { ...s, retos: s.retos.map((r) => (r.id === a.reto.id ? a.reto : r)) }
    case 'reto/borrar':
      return { ...s, retos: s.retos.filter((r) => r.id !== a.id) }
    case 'reto/progreso':
      return {
        ...s,
        retos: s.retos.map((r) => {
          if (r.id !== a.id) return r
          const progreso = Math.max(0, a.progreso)
          const completado = r.tipo === 'limite' ? r.completado : progreso >= r.meta
          return {
            ...r,
            progreso,
            completado,
            completadoEn: completado ? (r.completadoEn ?? hoy()) : undefined,
          }
        }),
      }
    case 'reto/completar':
      return {
        ...s,
        retos: s.retos.map((r) =>
          r.id === a.id
            ? { ...r, completado: a.completado, completadoEn: a.completado ? hoy() : undefined }
            : r,
        ),
      }

    case 'meta/agregar':
      return { ...s, metas: [...s.metas, { ...a.meta, id: uid(), aportes: [], fija: false }] }
    case 'meta/editar':
      return { ...s, metas: s.metas.map((m) => (m.id === a.meta.id ? a.meta : m)) }
    case 'meta/borrar':
      return { ...s, metas: s.metas.filter((m) => m.id !== a.id || m.fija) }
    case 'meta/aportar':
      return {
        ...s,
        metas: s.metas.map((m) =>
          m.id === a.id ? { ...m, aportes: [{ ...a.aporte, id: uid() }, ...m.aportes] } : m,
        ),
      }
    case 'meta/quitarAporte':
      return {
        ...s,
        metas: s.metas.map((m) =>
          m.id === a.id ? { ...m, aportes: m.aportes.filter((x) => x.id !== a.aporteId) } : m,
        ),
      }

    case 'foto/agregar':
      return { ...s, fotos: [a.foto, ...s.fotos] }
    case 'foto/editar':
      return { ...s, fotos: s.fotos.map((f) => (f.id === a.foto.id ? a.foto : f)) }
    case 'foto/borrar':
      return { ...s, fotos: s.fotos.filter((f) => f.id !== a.id) }

    case 'bolsillo/agregar': {
      const nuevo: Bolsillo = { ...a.bolsillo, id: uid(), ajustes: [] }
      return { ...s, bolsillos: [...quitarCategorias(s.bolsillos, nuevo), nuevo] }
    }
    case 'bolsillo/editar':
      return {
        ...s,
        bolsillos: quitarCategorias(s.bolsillos, a.bolsillo).map((b) => (b.id === a.bolsillo.id ? a.bolsillo : b)),
      }
    case 'bolsillo/crearVarios': {
      let lista = s.bolsillos
      for (const b of a.bolsillos) {
        const nuevo: Bolsillo = { ...b, id: uid(), ajustes: [] }
        lista = [...quitarCategorias(lista, nuevo), nuevo]
      }
      return { ...s, bolsillos: lista }
    }
    case 'bolsillo/borrar':
      return {
        ...s,
        bolsillos: s.bolsillos.filter((b) => b.id !== a.id),
        // Los gastos se quedan; solo pierden la asignación a mano.
        gastos: s.gastos.map((g) => {
          if (g.bolsilloId !== a.id) return g
          const { bolsilloId: _b, ...resto } = g
          void _b
          return resto
        }),
      }
    case 'bolsillo/ajustar':
      return {
        ...s,
        bolsillos: s.bolsillos.map((b) =>
          b.id === a.id ? { ...b, ajustes: [{ ...a.ajuste, id: uid() }, ...b.ajustes] } : b,
        ),
      }
    case 'bolsillo/quitarAjuste':
      return {
        ...s,
        bolsillos: s.bolsillos.map((b) =>
          b.id === a.id ? { ...b, ajustes: b.ajustes.filter((x) => x.id !== a.ajusteId) } : b,
        ),
      }
    case 'bolsillo/mover': {
      if (a.de === a.a || a.monto <= 0) return s
      const nombre = (id: string) => s.bolsillos.find((b) => b.id === id)?.nombre ?? '?'
      return {
        ...s,
        bolsillos: s.bolsillos.map((b) => {
          if (b.id === a.de) {
            const ajuste: AjusteBolsillo = { id: uid(), fecha: a.fecha, monto: -a.monto, nota: a.nota || `→ ${nombre(a.a)}` }
            return { ...b, ajustes: [ajuste, ...b.ajustes] }
          }
          if (b.id === a.a) {
            const ajuste: AjusteBolsillo = { id: uid(), fecha: a.fecha, monto: a.monto, nota: a.nota || `← ${nombre(a.de)}` }
            return { ...b, ajustes: [ajuste, ...b.ajustes] }
          }
          return b
        }),
      }
    }

    case 'ingreso/agregar':
      return { ...s, ingresos: [{ ...a.ingreso, id: uid() }, ...s.ingresos] }
    case 'ingreso/editar':
      return { ...s, ingresos: s.ingresos.map((i) => (i.id === a.ingreso.id ? a.ingreso : i)) }
    case 'ingreso/borrar':
      return { ...s, ingresos: s.ingresos.filter((i) => i.id !== a.id) }

    case 'importar':
      return { ...estadoInicial(), ...a.estado }
    case 'reiniciar':
      return estadoInicial()

    case 'sync/aplicar':
      return aplicarFilas(s, a.filas)
  }
}

/** Coleccion del estado que corresponde a cada tipo de fila remota. */
const COLECCION: Record<Exclude<Fila['tipo'], 'perfil'>, keyof Omit<Estado, 'version' | 'perfil'>> = {
  gasto: 'gastos',
  factura: 'facturas',
  deuda: 'deudas',
  reto: 'retos',
  meta: 'metas',
  foto: 'fotos',
  bolsillo: 'bolsillos',
  ingreso: 'ingresos',
}

function aplicarFilas(s: Estado, filas: Fila[]): Estado {
  let n: Estado = { ...s }
  for (const f of filas) {
    if (f.tipo === 'perfil') {
      if (!f.borrado) n = { ...n, perfil: { ...n.perfil, ...(f.data as Partial<Perfil>), onboarded: true } }
      continue
    }
    const clave = COLECCION[f.tipo]
    if (!clave) continue
    const lista = n[clave] as { id: string }[]
    if (f.borrado) {
      // Grecia nunca se borra, ni desde el otro celular.
      if (f.id === GRECIA_ID) continue
      n = { ...n, [clave]: lista.filter((x) => x.id !== f.id) }
    } else {
      const dato = f.data as { id: string }
      const existe = lista.some((x) => x.id === f.id)
      n = {
        ...n,
        [clave]: existe ? lista.map((x) => (x.id === f.id ? dato : x)) : [dato, ...lista],
      }
    }
  }
  return n
}

/** Convierte el estado en filas remotas (sin hogar_id ni fechas; eso lo pone el sync). */
export function filasDeEstado(e: Estado): { id: string; tipo: Fila['tipo']; data: unknown }[] {
  const { onboarded: _o, ...perfil } = e.perfil
  void _o
  return [
    { id: 'perfil', tipo: 'perfil', data: perfil },
    ...e.gastos.map((x) => ({ id: x.id, tipo: 'gasto' as const, data: x })),
    ...e.facturas.map((x) => ({ id: x.id, tipo: 'factura' as const, data: x })),
    ...e.deudas.map((x) => ({ id: x.id, tipo: 'deuda' as const, data: x })),
    ...e.retos.map((x) => ({ id: x.id, tipo: 'reto' as const, data: x })),
    ...e.metas.map((x) => ({ id: x.id, tipo: 'meta' as const, data: x })),
    ...e.fotos.map((x) => ({ id: x.id, tipo: 'foto' as const, data: x })),
    ...e.bolsillos.map((x) => ({ id: x.id, tipo: 'bolsillo' as const, data: x })),
    ...e.ingresos.map((x) => ({ id: x.id, tipo: 'ingreso' as const, data: x })),
  ]
}

interface Ctx {
  estado: Estado
  dispatch: (a: Accion) => void
}

const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [estado, dispatch] = useReducer(reducer, undefined, cargar)

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(estado))
    } catch {
      /* sin espacio o modo privado: seguimos en memoria */
    }
  }, [estado])

  const value = useMemo(() => ({ estado, dispatch }), [estado])
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore(): Ctx {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore fuera de StoreProvider')
  return ctx
}

// ---------- Cálculos derivados ----------

export function saldoDeuda(d: Deuda): number {
  return Math.max(0, d.montoInicial - d.abonos.reduce((a, b) => a + b.monto, 0))
}

export function ahorradoMeta(m: Meta): number {
  return m.aportes.reduce((a, b) => a + b.monto, 0)
}

export function nombreDe(perfil: Perfil, p: 'a' | 'b' | 'ambos'): string {
  if (p === 'ambos') return 'Los dos'
  return p === 'a' ? perfil.nombreA || 'A' : perfil.nombreB || 'B'
}
