import { abrirCorrida, cerrarCorrida, cliente, guardarPrecios, tiendasPor } from '../_compartido/db.ts'
import { CORS, responder, traer } from '../_compartido/red.ts'
import type { PrecioCrudo, Tienda, TiendaId, Unidad } from '../_compartido/tipos.ts'
import { leerFolleto, type Bloque, type ProductoFolleto } from './claude.ts'

const FUNCION = 'precios-folletos'

/**
 * D1 y Ara casi no tienen tienda en línea: lo que hay es el folleto de la semana.
 *
 * Dos caminos, el mismo código:
 *   1. Automático — baja el folleto de `tiendas.config.folleto` (semanal, por cron).
 *   2. A mano — la app manda las fotos que ustedes le tomaron al folleto en la tienda:
 *      POST { tienda: 'd1', imagenes: ['<base64>', ...] }
 *
 * Lo que salga entra marcado como 'folleto', con su vigencia. En la app nunca se
 * muestra con la misma cara que un precio de API.
 */

const esImagen = (tipo: string): boolean => /^image\/(png|jpeg|webp|gif)$/.test(tipo)

/** El sku de folleto es determinista: el mismo producto la otra semana cae en la misma fila. */
async function skuDe(p: ProductoFolleto): Promise<string> {
  const semilla = `${p.nombre.toLowerCase().trim()}|${p.contenido ?? ''}`
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(semilla))
  const hex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `folleto:${hex.slice(0, 16)}`
}

const aBase64 = (bytes: ArrayBuffer): string => {
  let binario = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) binario += String.fromCharCode(arr[i])
  return btoa(binario)
}

/** Baja el folleto de la semana y lo deja listo para mandárselo a Claude. */
async function paginasDeLaWeb(t: Tienda): Promise<Bloque[]> {
  const url = t.config?.folleto
  if (!url) throw new Error(`Falta la URL del folleto en tiendas.config de ${t.id}`)
  const r = await traer(url, {}, 30000)
  if (!r.ok) throw new Error(`El folleto respondió HTTP ${r.status}`)
  const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim()
  const datos = aBase64(await r.arrayBuffer())

  if (tipo === 'application/pdf') {
    // El PDF va entero en una sola llamada: la API lo pagina por dentro.
    return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: datos } }]
  }
  if (esImagen(tipo)) {
    return [{ type: 'image', source: { type: 'base64', media_type: tipo, data: datos } }]
  }
  throw new Error(`El folleto vino como ${tipo || 'algo desconocido'}: no sé leerlo`)
}

const paginasDeFotos = (imagenes: string[]): Bloque[] =>
  imagenes.map((b64) => {
    // La app puede mandar el data URL completo o solo el base64.
    const m = /^data:([^;]+);base64,(.*)$/.exec(b64)
    const tipo = m ? m[1] : 'image/jpeg'
    return { type: 'image', source: { type: 'base64', media_type: tipo, data: m ? m[2] : b64 } }
  })

function aPrecios(productos: ProductoFolleto[], skus: string[]): PrecioCrudo[] {
  return productos.map((p, i) => ({
    sku: skus[i],
    nombre: p.nombre,
    marca: p.marca,
    precio: p.precio,
    precioLista: p.precio_lista,
    contenido: p.contenido,
    unidad: (p.unidad ?? null) as Unidad | null,
    promocion: p.promocion,
    vigenteHasta: p.vigente_hasta,
  }))
}

async function correrTienda(db: ReturnType<typeof cliente>, t: Tienda, fotos?: string[]) {
  const corrida = await abrirCorrida(db, t.id, FUNCION)
  try {
    const paginas = fotos?.length ? paginasDeFotos(fotos) : await paginasDeLaWeb(t)
    const productos = await leerFolleto(paginas)
    const skus = await Promise.all(productos.map(skuDe))
    const filas = await guardarPrecios(db, t.id, aPrecios(productos, skus), 'folleto')
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

  let soloTienda: TiendaId | undefined
  let imagenes: string[] | undefined
  try {
    const cuerpo = (await req.json()) as { tienda?: TiendaId; imagenes?: string[] }
    soloTienda = cuerpo.tienda
    imagenes = cuerpo.imagenes
  } catch {
    // Sin cuerpo: es la corrida semanal del cron.
  }

  const db = cliente()
  const tiendas = (await tiendasPor(db, 'folleto')).filter((t) => !soloTienda || t.id === soloTienda)
  if (tiendas.length === 0) return responder({ error: 'Esa tienda no lee folletos' }, 400)

  const resultados = await Promise.allSettled(tiendas.map((t) => correrTienda(db, t, imagenes)))
  const resumen = resultados.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { tienda: tiendas[i].id, ok: false, filas: 0, error: String(r.reason) },
  )

  return responder({ funcion: FUNCION, tiendas: resumen })
})
