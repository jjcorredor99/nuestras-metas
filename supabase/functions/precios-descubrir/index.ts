import { cliente, guardarConfig, tiendasPor } from '../_compartido/db.ts'
import { dominioDe, ESTRATEGIAS, type Estrategia } from '../_compartido/vtex.ts'
import { CORS, responder, traer } from '../_compartido/red.ts'
import type { Config, Tienda } from '../_compartido/tipos.ts'

/**
 * El checkpoint de la fase 0. Corre desde la red de Supabase (no desde un portátil
 * con proxy) y contesta la única pregunta que el plan no pudo verificar:
 * ¿se deja leer esta tienda, y por cuál camino?
 *
 *   curl -X POST https://TU-PROYECTO.supabase.co/functions/v1/precios-descubrir \
 *     -H "Authorization: Bearer <service-role-key>"
 *
 * Lo que responda queda guardado en `tiendas.config.estrategia`, que es lo que
 * después usa el adaptador. La tienda que no responda se queda en 'manual': se
 * compara igual, con el precio que ustedes anoten.
 */
const PRUEBA = 'leche entera'

interface Hallazgo {
  tienda: string
  fuente: string
  camino: string
  estado: number | string
  ejemplo?: string
  veredicto: 'se deja leer' | 'no responde' | 'sin configurar'
}

async function probarApi(t: Tienda): Promise<Hallazgo[]> {
  const cfg: Config = t.config ?? {}
  let dominio: string
  try {
    dominio = dominioDe(t.id, cfg)
  } catch {
    return [{ tienda: t.id, fuente: t.fuente, camino: '—', estado: '—', veredicto: 'sin configurar' }]
  }

  const q = encodeURIComponent(PRUEBA)
  const urls: Record<Estrategia, string> = {
    'busqueda-inteligente': `https://${dominio}/api/io/_v/api/intelligent-search/product_search/?query=${q}&count=3`,
    catalogo: `https://${dominio}/api/catalog_system/pub/products/search/?ft=${q}&_from=0&_to=2`,
  }

  const hallazgos: Hallazgo[] = []
  for (const estrategia of ESTRATEGIAS) {
    try {
      const r = await traer(urls[estrategia], {}, 15000)
      const texto = await r.text()
      let cuantos = 0
      let ejemplo: string | undefined
      try {
        const json = JSON.parse(texto) as unknown
        const lista = Array.isArray(json) ? json : ((json as { products?: unknown[] })?.products ?? [])
        cuantos = lista.length
        ejemplo = cuantos > 0 ? JSON.stringify(lista[0]).slice(0, 300) : undefined
      } catch {
        ejemplo = texto.slice(0, 200)
      }
      hallazgos.push({
        tienda: t.id,
        fuente: t.fuente,
        camino: estrategia,
        estado: r.status,
        ejemplo,
        veredicto: r.ok && cuantos > 0 ? 'se deja leer' : 'no responde',
      })
    } catch (e) {
      hallazgos.push({
        tienda: t.id,
        fuente: t.fuente,
        camino: estrategia,
        estado: e instanceof Error ? e.message : String(e),
        veredicto: 'no responde',
      })
    }
  }
  return hallazgos
}

async function probarFolleto(t: Tienda): Promise<Hallazgo> {
  const url = (t.config ?? {}).folleto
  if (!url) {
    return { tienda: t.id, fuente: t.fuente, camino: 'folleto', estado: '—', veredicto: 'sin configurar' }
  }
  try {
    const r = await traer(url, { method: 'GET' }, 20000)
    return {
      tienda: t.id,
      fuente: t.fuente,
      camino: 'folleto',
      estado: r.status,
      ejemplo: r.headers.get('content-type') ?? undefined,
      veredicto: r.ok ? 'se deja leer' : 'no responde',
    }
  } catch (e) {
    return {
      tienda: t.id,
      fuente: t.fuente,
      camino: 'folleto',
      estado: e instanceof Error ? e.message : String(e),
      veredicto: 'no responde',
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const db = cliente()
  const conApi = await tiendasPor(db, 'api')
  const conFolleto = await tiendasPor(db, 'folleto')

  const hallazgos: Hallazgo[] = []
  for (const t of conApi) {
    const suyos = await probarApi(t)
    hallazgos.push(...suyos)
    const gana = suyos.find((h) => h.veredicto === 'se deja leer')
    if (gana) await guardarConfig(db, t.id, { ...(t.config ?? {}), estrategia: gana.camino })
  }
  for (const t of conFolleto) hallazgos.push(await probarFolleto(t))

  // El resumen que decide el alcance de las fases siguientes.
  const resumen = hallazgos
    .filter((h) => h.veredicto === 'se deja leer')
    .map((h) => `${h.tienda}: ${h.camino}`)
  const mudas = [...conApi, ...conFolleto]
    .map((t) => t.id)
    .filter((id) => !hallazgos.some((h) => h.tienda === id && h.veredicto === 'se deja leer'))

  return responder({
    hallazgos,
    resumen,
    // Estas quedan como 'manual': se comparan con lo que ustedes anoten.
    mudas,
  })
})
