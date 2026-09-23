import { abrirCorrida, cerrarCorrida, cliente, guardarConfig, tiendasPor } from '../_compartido/db.ts'
import { dominiosCandidatos, ESTRATEGIAS, type Estrategia } from '../_compartido/vtex.ts'
import { CORS, responder, traer } from '../_compartido/red.ts'
import type { Config, Tienda } from '../_compartido/tipos.ts'

/**
 * Contesta la única pregunta que el plan no pudo verificar: ¿se deja leer esta
 * tienda, y por cuál camino? Corre desde la red de Supabase, no desde un portátil
 * con proxy.
 *
 *   curl -X POST https://TU-PROYECTO.supabase.co/functions/v1/precios-descubrir \
 *     -H "Authorization: Bearer <service-role-key>"
 *
 * Lo que responda queda guardado en `tiendas.config.estrategia`, que es lo que
 * después usa el adaptador. La tienda que no responda se queda en 'manual': se
 * compara igual, con el precio que ustedes anoten.
 *
 * Programado cada lunes (supabase/precios-auto.sql) deja de ser un trámite de una
 * vez y pasa a ser mantenimiento: si una tienda cambia de plataforma o empieza a
 * cerrar la puerta, el lunes siguiente se vuelve a probar y se guarda el camino
 * que sí sirva, antes de la corrida diaria. Cada probada queda en
 * `precios_corridas`, porque algo que corre solo y no deja rastro no se puede
 * revisar después.
 */
const FUNCION = 'precios-descubrir'
const PRUEBA = 'leche entera'

interface Hallazgo {
  tienda: string
  fuente: string
  dominio?: string
  camino: string
  estado: number | string
  ejemplo?: string
  veredicto: 'se deja leer' | 'no responde' | 'sin configurar'
}

/**
 * Prueba cada dominio candidato con cada camino, y corta en el primero que
 * devuelva productos de verdad. Un 200 con la lista vacía no cuenta: eso es una
 * página de "no encontramos nada", no una API que sirva.
 */
async function probarApi(t: Tienda): Promise<Hallazgo[]> {
  const cfg: Config = t.config ?? {}
  const dominios = dominiosCandidatos(t.id, cfg)
  if (dominios.length === 0) {
    return [{ tienda: t.id, fuente: t.fuente, camino: '—', estado: 'sin dominio candidato', veredicto: 'sin configurar' }]
  }

  const q = encodeURIComponent(PRUEBA)
  const url = (dominio: string, estrategia: Estrategia): string =>
    estrategia === 'busqueda-inteligente'
      ? `https://${dominio}/api/io/_v/api/intelligent-search/product_search/?query=${q}&count=3`
      : `https://${dominio}/api/catalog_system/pub/products/search/?ft=${q}&_from=0&_to=2`

  const hallazgos: Hallazgo[] = []
  for (const dominio of dominios) {
    for (const estrategia of ESTRATEGIAS) {
      try {
        const r = await traer(url(dominio, estrategia), {}, 15000)
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
        const sirve = r.ok && cuantos > 0
        hallazgos.push({
          tienda: t.id,
          fuente: t.fuente,
          dominio,
          camino: estrategia,
          estado: r.status,
          ejemplo,
          veredicto: sirve ? 'se deja leer' : 'no responde',
        })
        if (sirve) return hallazgos
      } catch (e) {
        hallazgos.push({
          tienda: t.id,
          fuente: t.fuente,
          dominio,
          camino: estrategia,
          estado: e instanceof Error ? e.message : String(e),
          veredicto: 'no responde',
        })
      }
    }
  }
  return hallazgos
}

async function probarFolleto(t: Tienda): Promise<Hallazgo> {
  const url = (t.config ?? {}).folleto
  if (!url) {
    // No es una falla del robot: es que nadie le ha dicho dónde está el folleto.
    return {
      tienda: t.id,
      fuente: t.fuente,
      camino: 'folleto',
      estado: "falta la URL del folleto en tiendas.config (o usen la foto desde la app)",
      veredicto: 'sin configurar',
    }
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
    const corrida = await abrirCorrida(db, t.id, FUNCION)
    try {
      const suyos = await probarApi(t)
      hallazgos.push(...suyos)
      const gana = suyos.find((h) => h.veredicto === 'se deja leer')
      // Si cambió de camino o de dominio, queda guardado antes de la corrida diaria.
      if (gana) {
        await guardarConfig(db, t.id, { ...(t.config ?? {}), dominio: gana.dominio, estrategia: gana.camino })
      }
      await cerrarCorrida(
        db,
        corrida,
        !!gana,
        0,
        // Decir cuáles se probaron: "no responde" a secas no deja actuar a nadie.
        gana ? undefined : `Ningún camino respondió en: ${[...new Set(suyos.map((h) => h.dominio))].join(', ')}`,
      )
    } catch (e) {
      await cerrarCorrida(db, corrida, false, 0, e instanceof Error ? e.message : String(e))
    }
  }

  for (const t of conFolleto) {
    const corrida = await abrirCorrida(db, t.id, FUNCION)
    const h = await probarFolleto(t)
    hallazgos.push(h)
    const ok = h.veredicto === 'se deja leer'
    await cerrarCorrida(db, corrida, ok, 0, ok ? undefined : String(h.estado))
  }

  // El resumen que decide el alcance de las fases siguientes.
  const resumen = hallazgos
    .filter((h) => h.veredicto === 'se deja leer')
    .map((h) => `${h.tienda}: ${h.camino}${h.dominio ? ` en ${h.dominio}` : ''}`)

  const sinRespuesta = (id: string) => !hallazgos.some((h) => h.tienda === id && h.veredicto === 'se deja leer')

  return responder({
    hallazgos,
    resumen,
    // Se probó y no contestó: por ahora se compara con lo que ustedes anoten.
    mudas: [...conApi, ...conFolleto].map((t) => t.id).filter(sinRespuesta),
    // Ni siquiera se probó porque falta decirle dónde mirar: no es lo mismo.
    sinConfigurar: hallazgos.filter((h) => h.veredicto === 'sin configurar').map((h) => h.tienda),
  })
})
