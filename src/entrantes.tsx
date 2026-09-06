import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase, type FilaEntrante } from './supabase'
import { useSync } from './sync'
import { useStore } from './store'
import { borradorDesde, esLectura, leerMensaje, type Lectura } from './mensajes'
import type { Categoria, Estado, Persona } from './types'

/** Un mensaje que el lector no entendió del todo: espera un toque de ustedes. */
export interface Pendiente {
  id: string
  texto: string
  persona: Persona
  recibidoEn: string
  lectura: Lectura | null
}

interface Ctx {
  /** Mensajes por confirmar. */
  pendientes: Pendiente[]
  /** Los que se anotaron solos y todavía no hemos avisado. */
  anotados: Lectura[]
  limpiarAviso: () => void
  /** Marca el mensaje como resuelto (lo anotaron o lo descartaron). */
  cerrar: (id: string) => Promise<void>
  /** true cuando faltan las tablas de supabase/mensajes.sql. */
  faltaSql: boolean
}

const EntrantesCtx = createContext<Ctx | null>(null)

const noExiste = (e: unknown): boolean =>
  /does not exist|could not find the (table|function)|schema cache/i.test(
    e instanceof Error ? e.message : String(e),
  )

export function EntrantesProvider({ children }: { children: ReactNode }) {
  const { hogar } = useSync()
  const { estado, dispatch } = useStore()
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [anotados, setAnotados] = useState<Lectura[]>([])
  const [faltaSql, setFaltaSql] = useState(false)

  // Refs para que el procesador no se reinicie con cada cambio del estado.
  const estadoRef = useRef<Estado>(estado)
  estadoRef.current = estado
  const vistos = useRef(new Set<string>())

  /**
   * Marca la fila como procesada.
   * 'mio' = la tomamos nosotros · 'ajeno' = el otro celular se adelantó · 'falla' = no hubo red.
   */
  const reclamar = useCallback(
    async (id: string): Promise<'mio' | 'ajeno' | 'falla'> => {
      if (!supabase || !hogar) return 'falla'
      const { data, error } = await supabase
        .from('entrantes')
        .update({ procesado: true })
        .eq('id', id)
        .eq('procesado', false)
        .select('id')
      if (error) return 'falla'
      return data?.length ? 'mio' : 'ajeno'
    },
    [hogar],
  )

  const cerrar = useCallback(
    async (id: string) => {
      setPendientes((p) => p.filter((x) => x.id !== id))
      await reclamar(id)
    },
    [reclamar],
  )

  const procesar = useCallback(
    async (filas: FilaEntrante[]) => {
      const aprendidos: Record<string, Categoria> = estadoRef.current.perfil.aprendidos ?? {}
      const nuevos: Lectura[] = []

      for (const fila of filas) {
        if (fila.procesado || vistos.current.has(fila.id)) continue
        vistos.current.add(fila.id)

        const lectura = leerMensaje(fila.texto, aprendidos)

        // No es un gasto, o ese mensaje ya está anotado: se cierra en silencio.
        const sobra = !esLectura(lectura) || estadoRef.current.gastos.some((g) => g.origen?.hash === lectura.hash)
        if (sobra) {
          // Si no hubo red, lo soltamos para reintentarlo después.
          if ((await reclamar(fila.id)) === 'falla') vistos.current.delete(fila.id)
          continue
        }

        if (lectura.confianza === 'alta') {
          // Reclamar antes de anotar: si los dos celulares lo ven, solo uno lo guarda.
          const quien = await reclamar(fila.id)
          if (quien === 'mio') {
            dispatch({ tipo: 'gasto/agregar', gasto: borradorDesde(lectura, fila.persona) })
            nuevos.push(lectura)
          } else if (quien === 'falla') {
            vistos.current.delete(fila.id)
          }
          continue
        }

        setPendientes((p) =>
          p.some((x) => x.id === fila.id)
            ? p
            : [...p, { id: fila.id, texto: fila.texto, persona: fila.persona, recibidoEn: fila.recibido_en, lectura }],
        )
      }

      if (nuevos.length) setAnotados((a) => [...a, ...nuevos])
    },
    [dispatch, reclamar],
  )

  useEffect(() => {
    if (!supabase || !hogar) {
      setPendientes([])
      vistos.current.clear()
      return
    }
    const sb = supabase
    let vivo = true

    const cargar = async () => {
      const { data, error } = await sb
        .from('entrantes')
        .select('*')
        .eq('hogar_id', hogar.id)
        .eq('procesado', false)
        .order('recibido_en', { ascending: true })
      if (!vivo) return
      if (error) {
        setFaltaSql(noExiste(error))
        return
      }
      setFaltaSql(false)
      await procesar((data ?? []) as FilaEntrante[])
    }
    cargar()

    const canal = sb
      .channel(`entrantes-${hogar.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entrantes', filter: `hogar_id=eq.${hogar.id}` },
        (payload) => {
          const fila = payload.new as FilaEntrante
          if (!fila?.id) return
          // El otro celular ya lo resolvió: sacarlo de la lista de acá.
          if (fila.procesado) {
            setPendientes((p) => p.filter((x) => x.id !== fila.id))
            return
          }
          procesar([fila])
        },
      )
      .subscribe()

    // Al volver a la app, revisar lo que llegó mientras no estaba abierta.
    const onVisible = () => {
      if (document.visibilityState === 'visible') cargar()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', onVisible)
      sb.removeChannel(canal)
    }
  }, [hogar, procesar])

  const limpiarAviso = useCallback(() => setAnotados([]), [])

  const value = useMemo<Ctx>(
    () => ({ pendientes, anotados, limpiarAviso, cerrar, faltaSql }),
    [pendientes, anotados, limpiarAviso, cerrar, faltaSql],
  )

  return <EntrantesCtx.Provider value={value}>{children}</EntrantesCtx.Provider>
}

export function useEntrantes(): Ctx {
  return (
    useContext(EntrantesCtx) ?? {
      pendientes: [],
      anotados: [],
      limpiarAviso: () => {},
      cerrar: async () => {},
      faltaSql: false,
    }
  )
}
