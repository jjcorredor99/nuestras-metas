import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Fuente, PrecioCrudo, Tienda, TiendaId } from './tipos.ts'

/** Cliente con la llave de servicio: se salta la RLS, que es justo lo que necesita el robot. */
export function cliente(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Bogotá es UTC-5 todo el año: no hay horario de verano que complique esto. */
export function diaBogota(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
}

export async function tiendasPor(db: SupabaseClient, fuente: Fuente): Promise<Tienda[]> {
  const { data, error } = await db.from('tiendas').select('*').eq('activa', true).eq('fuente', fuente).order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []) as Tienda[]
}

/**
 * Qué SKU refrescar. La tabla se alimenta sola: al vincular un producto, la
 * búsqueda guarda lo que encontró, y de ahí en adelante el robot lo mantiene al día.
 * Los últimos 60 días para que lo que dejaron de seguir se caiga solo.
 */
export async function skusVigentes(db: SupabaseClient, tienda: TiendaId): Promise<string[]> {
  const desde = new Date(Date.now() - 60 * 86400 * 1000).toISOString().slice(0, 10)
  const { data, error } = await db
    .from('precios')
    .select('sku')
    .eq('tienda_id', tienda)
    .eq('fuente', 'api')
    .gte('dia', desde)
  if (error) throw new Error(error.message)
  return [...new Set((data ?? []).map((f) => (f as { sku: string }).sku))]
}

export async function guardarPrecios(
  db: SupabaseClient,
  tienda: TiendaId,
  filas: PrecioCrudo[],
  fuente: Fuente,
): Promise<number> {
  if (filas.length === 0) return 0
  const dia = diaBogota()
  const { error } = await db.from('precios').upsert(
    filas.map((p) => ({
      tienda_id: tienda,
      sku: p.sku,
      dia,
      nombre: p.nombre,
      marca: p.marca ?? null,
      precio: p.precio,
      precio_lista: p.precioLista ?? null,
      contenido: p.contenido ?? null,
      unidad: p.unidad ?? null,
      promocion: p.promocion ?? null,
      vigente_hasta: p.vigenteHasta ?? null,
      url: p.url ?? null,
      imagen: p.imagen ?? null,
      fuente,
      capturado_en: new Date().toISOString(),
    })),
    { onConflict: 'tienda_id,sku,dia' },
  )
  if (error) throw new Error(error.message)
  return filas.length
}

export async function abrirCorrida(db: SupabaseClient, tienda: string, funcion: string): Promise<number | null> {
  const { data } = await db.from('precios_corridas').insert({ tienda_id: tienda, funcion }).select('id').single()
  return (data as { id: number } | null)?.id ?? null
}

export async function cerrarCorrida(
  db: SupabaseClient,
  id: number | null,
  ok: boolean,
  filas: number,
  error?: string,
): Promise<void> {
  if (id === null) return
  await db
    .from('precios_corridas')
    .update({ terminado_en: new Date().toISOString(), ok, filas, error: error ?? null })
    .eq('id', id)
}

export async function guardarConfig(db: SupabaseClient, tienda: TiendaId, config: unknown): Promise<void> {
  await db.from('tiendas').update({ config }).eq('id', tienda)
}
