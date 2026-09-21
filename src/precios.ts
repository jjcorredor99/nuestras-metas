import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, type FilaCorrida, type FilaPrecio } from './supabase'
import { llavePrecio, type Precios, type PrecioCrudo } from './mercado'
import type { TiendaId, Unidad } from './types'

/** Un candidato de la búsqueda en vivo, para vincular un producto con su SKU. */
export interface Candidato {
  tienda: TiendaId
  sku: string
  nombre: string
  marca: string | null
  precio: number
  contenido: number | null
  unidad: Unidad | null
  imagen: string | null
}

const esUnidad = (u: string | null): u is Unidad => u === 'l' || u === 'kg' || u === 'un'
const esTienda = (t: string): t is TiendaId =>
  t === 'exito' || t === 'carulla' || t === 'makro' || t === 'd1' || t === 'ara'

/** true cuando todavía no han pegado supabase/precios.sql. */
const faltanTablas = (e: unknown): boolean =>
  /does not exist|could not find the (table|function)|schema cache/i.test(
    e instanceof Error ? e.message : String(e),
  )

function aCrudo(f: FilaPrecio): PrecioCrudo | null {
  if (!esTienda(f.tienda_id)) return null
  return {
    tienda: f.tienda_id,
    sku: f.sku,
    nombre: f.nombre,
    precio: Number(f.precio),
    contenido: f.contenido === null ? null : Number(f.contenido),
    unidad: esUnidad(f.unidad) ? f.unidad : null,
    fuente: f.fuente,
    dia: f.dia,
    vigenteHasta: f.vigente_hasta,
    promocion: f.promocion,
  }
}

export interface EstadoPrecios {
  precios: Precios
  /** Tiendas que el robot no pudo leer en su última corrida. */
  caidas: { tienda: TiendaId; desde: string }[]
  cargando: boolean
  /** Falta pegar supabase/precios.sql, o no hay sesión para leerlo. */
  faltaSql: boolean
  recargar: () => Promise<void>
  anotarPrecio: (p: {
    tienda: TiendaId
    nombre: string
    precio: number
    contenido?: number
    unidad?: Unidad
    sku?: string
  }) => Promise<string | null>
  buscar: (termino: string) => Promise<Candidato[]>
  /** La foto que le tomaron al folleto en la tienda: la lee Claude y entra como precio de folleto. */
  leerFolleto: (tienda: TiendaId, imagenes: string[]) => Promise<string | null>
}

/**
 * Los precios no son del hogar: son catálogo público y viven en sus propias tablas,
 * así que no pasan por el sync de `items`. Se leen aparte y se refrescan a mano.
 */
export function usePrecios(): EstadoPrecios {
  const [filas, setFilas] = useState<FilaPrecio[]>([])
  const [corridas, setCorridas] = useState<FilaCorrida[]>([])
  const [cargando, setCargando] = useState(false)
  const [faltaSql, setFaltaSql] = useState(false)

  const recargar = useCallback(async () => {
    if (!supabase) return
    setCargando(true)
    try {
      const { data, error } = await supabase.from('precios_ultimos').select('*')
      if (error) throw error
      setFilas((data ?? []) as FilaPrecio[])
      setFaltaSql(false)
      const { data: c } = await supabase
        .from('precios_corridas')
        .select('*')
        .order('iniciado_en', { ascending: false })
        .limit(40)
      setCorridas((c ?? []) as FilaCorrida[])
    } catch (e) {
      if (faltanTablas(e)) setFaltaSql(true)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const precios = useMemo<Precios>(() => {
    const m: Precios = new Map()
    for (const f of filas) {
      const p = aCrudo(f)
      if (p) m.set(llavePrecio(p.tienda, p.sku), p)
    }
    return m
  }, [filas])

  // La última corrida de cada tienda; si falló, la app lo dice en vez de callarse.
  const caidas = useMemo(() => {
    const ultima = new Map<string, FilaCorrida>()
    for (const c of corridas) if (!ultima.has(c.tienda_id)) ultima.set(c.tienda_id, c)
    return [...ultima.values()]
      .filter((c) => c.ok === false && esTienda(c.tienda_id))
      .map((c) => ({ tienda: c.tienda_id as TiendaId, desde: c.iniciado_en.slice(0, 10) }))
  }, [corridas])

  const anotarPrecio = useCallback<EstadoPrecios['anotarPrecio']>(
    async (p) => {
      if (!supabase) return 'Sin conexión con Supabase'
      const { error } = await supabase.rpc('precio_manual', {
        p_tienda: p.tienda,
        p_nombre: p.nombre,
        p_precio: p.precio,
        p_contenido: p.contenido ?? null,
        p_unidad: p.unidad ?? null,
        p_sku: p.sku ?? null,
      })
      if (error) return faltanTablas(error) ? 'Falta pegar supabase/precios.sql' : error.message
      await recargar()
      return null
    },
    [recargar],
  )

  const buscar = useCallback<EstadoPrecios['buscar']>(async (termino) => {
    if (!supabase || termino.trim().length < 3) return []
    const { data, error } = await supabase.functions.invoke('precios-buscar', {
      body: { termino: termino.trim() },
    })
    if (error) return []
    const lista = (data as { candidatos?: unknown[] } | null)?.candidatos ?? []
    return lista.filter((c): c is Candidato => {
      const x = c as Partial<Candidato>
      return typeof x?.sku === 'string' && typeof x?.tienda === 'string' && esTienda(x.tienda)
    })
  }, [])

  const leerFolleto = useCallback<EstadoPrecios['leerFolleto']>(
    async (tienda, imagenes) => {
      if (!supabase) return 'Sin conexión con Supabase'
      if (imagenes.length === 0) return 'No hay fotos que leer'
      const { data, error } = await supabase.functions.invoke('precios-folletos', {
        body: { tienda, imagenes },
      })
      if (error) return error.message
      const suya = (data as { tiendas?: { tienda: string; ok: boolean; filas: number; error?: string }[] } | null)
        ?.tiendas?.find((t) => t.tienda === tienda)
      if (suya && !suya.ok) return suya.error ?? 'No se pudo leer el folleto'
      await recargar()
      return suya && suya.filas === 0 ? 'No se reconoció ningún precio en la foto' : null
    },
    [recargar],
  )

  return { precios, caidas, cargando, faltaSql, recargar, anotarPrecio, buscar, leerFolleto }
}
