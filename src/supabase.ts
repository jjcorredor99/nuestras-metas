import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Datos que necesita el Atajo del celular para mandar los mensajes (son públicos por diseño). */
export const supabaseUrl = url ?? ''
export const supabaseKey = key ?? ''

/** null cuando no hay configuración: la app funciona solo en local. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null

export interface Hogar {
  id: string
  nombre: string
  codigo: string
  creado_por: string
  creado_en: string
}

export type TipoItem = 'perfil' | 'gasto' | 'factura' | 'deuda' | 'reto' | 'meta' | 'foto'

export interface Fila {
  hogar_id: string
  id: string
  tipo: TipoItem
  data: unknown
  borrado: boolean
  actualizado_en: string
  actualizado_por?: string | null
}

/** Un mensaje del banco tal como lo dejó el Atajo del celular. */
export interface FilaEntrante {
  id: string
  hogar_id: string
  persona: 'a' | 'b'
  texto: string
  recibido_en: string
  procesado: boolean
}
