import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Hogar, type Fila } from './supabase'
import { useStore, filasDeEstado } from './store'
import type { Estado } from './types'
import { leerFoto, guardarFoto, borrarFoto } from './db'

export type EstadoSync = 'sin-config' | 'cargando' | 'sin-sesion' | 'sin-hogar' | 'listo'

interface Ctx {
  estadoSync: EstadoSync
  usuario: User | null
  hogar: Hogar | null
  error: string | null
  pendientes: number
  ultimaSync: string | null
  enLinea: boolean
  entrar: (email: string, pass: string) => Promise<string | null>
  registrarse: (email: string, pass: string) => Promise<string | null>
  salir: () => Promise<void>
  crearHogar: (nombre: string) => Promise<string | null>
  unirseHogar: (codigo: string) => Promise<string | null>
  forzarSync: () => Promise<void>
}

const SyncCtx = createContext<Ctx | null>(null)

const CLAVE_ULTIMA = 'nuestras-metas:ultima-sync'

/** JSON con llaves ordenadas: Postgres (jsonb) reordena las llaves y sin esto todo parecería "cambiado". */
function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v as object).sort()) {
      const val = (v as Record<string, unknown>)[k]
      if (val !== undefined) o[k] = ordenar(val)
    }
    return o
  }
  return v
}
const canon = (v: unknown): string => JSON.stringify(ordenar(v))
const rutaFoto = (hogarId: string, id: string) => `${hogarId}/${id}.jpg`

function mensaje(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos'
  if (/user already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Prueba "Entrar".'
  if (/password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres'
  if (/email not confirmed/i.test(m)) return 'Confirma tu correo primero (revisa la bandeja)'
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera un momento.'
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'No hay conexión con el servidor. Revisa el internet.'
  if (/relation .* does not exist|could not find the (table|function)/i.test(m)) return 'Falta crear las tablas en Supabase (supabase/schema.sql).'
  return m
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { estado, dispatch } = useStore()
  const [usuario, setUsuario] = useState<User | null>(null)
  const [hogar, setHogar] = useState<Hogar | null>(null)
  const [cargando, setCargando] = useState(!!supabase)
  const [error, setError] = useState<string | null>(null)
  const [pendientes, setPendientes] = useState(0)
  const [ultimaSync, setUltimaSync] = useState<string | null>(() => localStorage.getItem(CLAVE_ULTIMA))
  const [enLinea, setEnLinea] = useState(navigator.onLine)

  // Última versión de cada fila que sabemos que está en la nube (id -> JSON de data).
  const conocidas = useRef<Map<string, string> | null>(null)
  const estadoRef = useRef<Estado>(estado)
  estadoRef.current = estado
  const empujando = useRef(false)

  // ---------- sesión ----------
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setUsuario(data.session?.user ?? null)
      if (!data.session) setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUsuario(session?.user ?? null)
      if (!session) {
        setHogar(null)
        conocidas.current = null
        setCargando(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // ---------- hogar ----------
  useEffect(() => {
    if (!supabase || !usuario) return
    let vivo = true
    setCargando(true)
    supabase
      .rpc('mi_hogar')
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) setError(mensaje(error))
        const h = Array.isArray(data) ? (data[0] as Hogar | undefined) : (data as Hogar | null)
        setHogar(h ?? null)
        setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [usuario])

  useEffect(() => {
    const on = () => setEnLinea(true)
    const off = () => setEnLinea(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // ---------- aplicar filas remotas ----------
  const aplicarRemotas = useCallback(
    async (filas: Fila[], hogarId: string) => {
      if (filas.length === 0) return
      const mapa = conocidas.current ?? new Map<string, string>()
      for (const f of filas) {
        if (f.borrado) mapa.delete(f.id)
        else mapa.set(f.id, canon(f.data))
      }
      conocidas.current = mapa
      dispatch({ tipo: 'sync/aplicar', filas })

      // Fotos: bajar las que no tengamos, borrar las que quitaron.
      for (const f of filas.filter((x) => x.tipo === 'foto')) {
        if (f.borrado) {
          await borrarFoto(f.id).catch(() => {})
          continue
        }
        const local = await leerFoto(f.id).catch(() => undefined)
        if (local || !supabase) continue
        const { data } = await supabase.storage.from('fotos').download(rutaFoto(hogarId, f.id))
        if (data) {
          await guardarFoto(f.id, data)
          window.dispatchEvent(new Event('fotos-actualizadas'))
        }
      }
    },
    [dispatch],
  )

  // ---------- empujar cambios locales ----------
  const empujar = useCallback(async () => {
    if (!supabase || !hogar || !usuario || !conocidas.current || empujando.current) return
    empujando.current = true
    try {
      const actuales = filasDeEstado(estadoRef.current)
      const ahora = new Date().toISOString()
      const cambios: Fila[] = []
      const idsActuales = new Set<string>()
      for (const f of actuales) {
        idsActuales.add(f.id)
        const json = canon(f.data)
        if (conocidas.current.get(f.id) !== json) {
          cambios.push({ hogar_id: hogar.id, id: f.id, tipo: f.tipo, data: f.data, borrado: false, actualizado_en: ahora, actualizado_por: usuario.id })
        }
      }
      const borradas: string[] = []
      for (const id of conocidas.current.keys()) {
        if (!idsActuales.has(id)) borradas.push(id)
      }
      setPendientes(cambios.length + borradas.length)
      if (cambios.length === 0 && borradas.length === 0) return

      // Fotos nuevas: subir el archivo antes que la fila.
      for (const c of cambios.filter((x) => x.tipo === 'foto' && !conocidas.current!.has(x.id))) {
        const blob = await leerFoto(c.id)
        if (blob) {
          const { error } = await supabase.storage.from('fotos').upload(rutaFoto(hogar.id, c.id), blob, { upsert: true, contentType: 'image/jpeg' })
          if (error) throw error
        }
      }

      if (cambios.length) {
        const { error } = await supabase.from('items').upsert(cambios, { onConflict: 'hogar_id,id' })
        if (error) throw error
        for (const c of cambios) conocidas.current.set(c.id, canon(c.data))
      }
      if (borradas.length) {
        const { error } = await supabase
          .from('items')
          .update({ borrado: true, actualizado_en: ahora, actualizado_por: usuario.id })
          .eq('hogar_id', hogar.id)
          .in('id', borradas)
        if (error) throw error
        const fotosBorradas = borradas.filter((id) => !estadoRef.current.fotos.some((f) => f.id === id))
        if (fotosBorradas.length) {
          await supabase.storage.from('fotos').remove(fotosBorradas.map((id) => rutaFoto(hogar.id, id))).catch(() => {})
        }
        for (const id of borradas) conocidas.current.delete(id)
      }
      setPendientes(0)
      setError(null)
      const t = new Date().toISOString()
      setUltimaSync(t)
      localStorage.setItem(CLAVE_ULTIMA, t)
    } catch (e) {
      setError(navigator.onLine ? mensaje(e) : 'Sin conexión. Se sincroniza al volver.')
    } finally {
      empujando.current = false
    }
  }, [hogar, usuario])

  // ---------- carga inicial + tiempo real ----------
  useEffect(() => {
    if (!supabase || !hogar || !usuario) return
    const sb = supabase
    let vivo = true

    const cargarTodo = async () => {
      const { data, error } = await sb.from('items').select('*').eq('hogar_id', hogar.id)
      if (!vivo) return
      if (error) {
        setError(mensaje(error))
        return
      }
      const filas = (data ?? []) as Fila[]
      // Lo remoto manda sobre lo local en los ids que ya existen; lo local que no exista arriba, se sube.
      conocidas.current = new Map()
      if (filas.length === 0) {
        // Hogar recién creado: subir todo lo local.
        await empujar()
        return
      }
      // Al aplicar lo remoto cambia el estado, y ese cambio dispara el empuje de lo local que falte arriba.
      await aplicarRemotas(filas, hogar.id)
    }
    cargarTodo()

    const canal = sb
      .channel(`items-${hogar.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `hogar_id=eq.${hogar.id}` },
        (payload) => {
          const f = payload.new as Fila
          if (!f || !f.id) return
          if (f.actualizado_por === usuario.id) {
            // Eco de lo que subimos: solo anota que ya está arriba.
            const m = conocidas.current
            if (m) {
              if (f.borrado) m.delete(f.id)
              else m.set(f.id, canon(f.data))
            }
            return
          }
          aplicarRemotas([f], hogar.id)
        },
      )
      .subscribe()

    return () => {
      vivo = false
      sb.removeChannel(canal)
    }
  }, [hogar, usuario, aplicarRemotas, empujar])

  // Cada cambio local intenta subir. Si falla, reintenta al volver la conexión o cada 30 s.
  useEffect(() => {
    if (!conocidas.current) return
    const t = setTimeout(() => empujar(), 250)
    return () => clearTimeout(t)
  }, [estado, empujar])

  useEffect(() => {
    if (!hogar) return
    const iv = setInterval(() => {
      if (pendientes > 0 || error) empujar()
    }, 30000)
    const on = () => empujar()
    window.addEventListener('online', on)
    return () => {
      clearInterval(iv)
      window.removeEventListener('online', on)
    }
  }, [hogar, pendientes, error, empujar])

  // Al volver a la app, traer lo que cambió mientras no estaba.
  useEffect(() => {
    if (!supabase || !hogar) return
    const sb = supabase
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      const desde = ultimaSync ?? '1970-01-01'
      const { data } = await sb.from('items').select('*').eq('hogar_id', hogar.id).gt('actualizado_en', desde)
      if (data?.length) await aplicarRemotas(data as Fila[], hogar.id)
      empujar()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [hogar, ultimaSync, aplicarRemotas, empujar])

  // ---------- acciones ----------
  const entrar = useCallback(async (email: string, pass: string) => {
    if (!supabase) return 'Sin configuración'
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    return error ? mensaje(error) : null
  }, [])

  const registrarse = useCallback(async (email: string, pass: string) => {
    if (!supabase) return 'Sin configuración'
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pass })
    if (error) return mensaje(error)
    if (!data.session) return 'Te enviamos un correo para confirmar la cuenta. Ábrelo y vuelve a entrar.'
    return null
  }, [])

  const salir = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setHogar(null)
    conocidas.current = null
  }, [])

  const crearHogar = useCallback(async (nombre: string) => {
    if (!supabase) return 'Sin configuración'
    const { data, error } = await supabase.rpc('crear_hogar', { p_nombre: nombre })
    if (error) return mensaje(error)
    setHogar(data as Hogar)
    return null
  }, [])

  const unirseHogar = useCallback(async (codigo: string) => {
    if (!supabase) return 'Sin configuración'
    const { data, error } = await supabase.rpc('unirse_hogar', { p_codigo: codigo })
    if (error) return mensaje(error)
    setHogar(data as Hogar)
    return null
  }, [])

  const estadoSync: EstadoSync = !supabase
    ? 'sin-config'
    : cargando
      ? 'cargando'
      : !usuario
        ? 'sin-sesion'
        : !hogar
          ? 'sin-hogar'
          : 'listo'

  const value = useMemo<Ctx>(
    () => ({
      estadoSync,
      usuario,
      hogar,
      error,
      pendientes,
      ultimaSync,
      enLinea,
      entrar,
      registrarse,
      salir,
      crearHogar,
      unirseHogar,
      forzarSync: empujar,
    }),
    [estadoSync, usuario, hogar, error, pendientes, ultimaSync, enLinea, entrar, registrarse, salir, crearHogar, unirseHogar, empujar],
  )

  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>
}

export function useSync(): Ctx {
  const ctx = useContext(SyncCtx)
  if (!ctx) throw new Error('useSync fuera de SyncProvider')
  return ctx
}
