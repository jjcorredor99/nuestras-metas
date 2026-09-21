import { abrirCorrida, cerrarCorrida, cliente, guardarPrecios, skusVigentes, tiendasPor } from '../_compartido/db.ts'
import { adaptadorVtex } from '../_compartido/vtex.ts'
import { CORS, responder } from '../_compartido/red.ts'
import type { ResultadoTienda, Tienda } from '../_compartido/tipos.ts'

const FUNCION = 'precios-tiendas'

async function correrTienda(db: ReturnType<typeof cliente>, t: Tienda): Promise<ResultadoTienda> {
  const corrida = await abrirCorrida(db, t.id, FUNCION)
  try {
    const skus = await skusVigentes(db, t.id)
    if (skus.length === 0) {
      // Todavía nadie ha vinculado nada de esta tienda: no es un error.
      await cerrarCorrida(db, corrida, true, 0)
      return { tienda: t.id, ok: true, filas: 0 }
    }
    const precios = await adaptadorVtex(t.id).traer(skus, t.config ?? {})
    const filas = await guardarPrecios(db, t.id, precios, 'api')
    await cerrarCorrida(db, corrida, true, filas)
    return { tienda: t.id, ok: true, filas }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await cerrarCorrida(db, corrida, false, 0, error)
    return { tienda: t.id, ok: false, filas: 0, error }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const db = cliente()
  const tiendas = await tiendasPor(db, 'api')

  // Cada tienda en su propio carril: la que se caiga queda anotada y las demás siguen.
  const resultados = await Promise.allSettled(tiendas.map((t) => correrTienda(db, t)))
  const resumen: ResultadoTienda[] = resultados.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { tienda: tiendas[i].id, ok: false, filas: 0, error: String(r.reason) },
  )

  // Siempre 200: un 500 haría que pg_net solo anote "falló" sin decir de quién.
  return responder({ funcion: FUNCION, tiendas: resumen })
})
