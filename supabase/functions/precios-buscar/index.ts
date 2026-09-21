import { cliente, guardarPrecios, tiendasPor } from '../_compartido/db.ts'
import { adaptadorVtex } from '../_compartido/vtex.ts'
import { CORS, responder } from '../_compartido/red.ts'
import type { PrecioCrudo, TiendaId } from '../_compartido/tipos.ts'

/**
 * La búsqueda en vivo de la pantalla de vincular.
 *
 * Además de responder, guarda lo que encontró: así la tabla se alimenta sola.
 * Desde que alguien vincula un producto, el robot diario ya sabe qué refrescar,
 * y nunca hay que leerle los datos del hogar a nadie.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let termino = ''
  let soloTienda: TiendaId | undefined
  try {
    const cuerpo = (await req.json()) as { termino?: string; tienda?: TiendaId }
    termino = (cuerpo.termino ?? '').trim()
    soloTienda = cuerpo.tienda
  } catch {
    return responder({ error: 'Cuerpo inválido' }, 400)
  }
  if (termino.length < 3) return responder({ candidatos: [] })

  const db = cliente()
  const tiendas = (await tiendasPor(db, 'api')).filter((t) => !soloTienda || t.id === soloTienda)

  const porTienda = await Promise.allSettled(
    tiendas.map(async (t) => {
      const filas = await adaptadorVtex(t.id).buscar(termino, t.config ?? {})
      const top = filas.slice(0, 20)
      // Guardar lo encontrado es lo que hace que mañana el robot lo refresque solo.
      await guardarPrecios(db, t.id, top, 'api')
      return top.map((p: PrecioCrudo) => ({
        tienda: t.id,
        sku: p.sku,
        nombre: p.nombre,
        marca: p.marca ?? null,
        precio: p.precio,
        contenido: p.contenido ?? null,
        unidad: p.unidad ?? null,
        imagen: p.imagen ?? null,
      }))
    }),
  )

  const candidatos = porTienda.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  const fallaron = porTienda
    .map((r, i) => (r.status === 'rejected' ? tiendas[i].id : null))
    .filter((x): x is TiendaId => x !== null)

  return responder({ candidatos, fallaron })
})
