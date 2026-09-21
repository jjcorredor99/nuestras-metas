import { conReintentos, enLotes, ErrorTienda, pausa, traerJson } from './red.ts'
import type { Adaptador, Config, PrecioCrudo, TiendaId, Unidad } from './tipos.ts'

/**
 * Éxito, Carulla y Makro corren sobre VTEX, así que es un solo adaptador
 * parametrizado por dominio. OJO: ninguno de estos caminos está verificado —
 * el plan los prueba en orden con `precios-descubrir` y anota en
 * `tiendas.config.estrategia` cuál respondió.
 */
export const DOMINIOS: Record<string, string> = {
  exito: 'www.exito.com',
  carulla: 'www.carulla.com',
  makro: 'www.makro.com.co',
}

interface OfertaVtex {
  Price?: number
  ListPrice?: number
  IsAvailable?: boolean
  Teasers?: { Name?: string }[]
}

interface ItemVtex {
  itemId?: string
  name?: string
  nameComplete?: string
  unitMultiplier?: number
  measurementUnit?: string
  images?: { imageUrl?: string }[]
  sellers?: { commertialOffer?: OfertaVtex }[]
}

interface ProductoVtex {
  productId?: string
  productName?: string
  brand?: string
  link?: string
  linkText?: string
  items?: ItemVtex[]
}

/**
 * VTEX dice el contenido en `unitMultiplier` + `measurementUnit`, pero casi siempre
 * viene como "1 un", que no sirve para comparar. En ese caso lo dejamos en null
 * y que la app lo lea del nombre: una sola implementación de esa maña, y está probada.
 */
function contenidoDe(item: ItemVtex): { contenido: number | null; unidad: Unidad | null } {
  const mult = item.unitMultiplier
  const medida = (item.measurementUnit ?? '').toLowerCase().trim()
  if (!mult || mult <= 0) return { contenido: null, unidad: null }
  if (medida === 'kg') return { contenido: mult, unidad: 'kg' }
  if (medida === 'g' || medida === 'gr') return { contenido: mult / 1000, unidad: 'kg' }
  if (medida === 'l' || medida === 'lt') return { contenido: mult, unidad: 'l' }
  if (medida === 'ml') return { contenido: mult / 1000, unidad: 'l' }
  if ((medida === 'un' || medida === 'und') && mult !== 1) return { contenido: mult, unidad: 'un' }
  return { contenido: null, unidad: null }
}

function leerProductos(crudo: unknown, dominio: string): PrecioCrudo[] {
  // La búsqueda inteligente envuelve en { products: [...] }; el catálogo devuelve el arreglo pelado.
  const lista: ProductoVtex[] = Array.isArray(crudo)
    ? (crudo as ProductoVtex[])
    : (((crudo as { products?: ProductoVtex[] })?.products ?? []) as ProductoVtex[])

  const salida: PrecioCrudo[] = []
  for (const p of lista) {
    for (const item of p.items ?? []) {
      const oferta = item.sellers?.[0]?.commertialOffer
      const precio = oferta?.Price
      if (!item.itemId || !precio || precio <= 0) continue
      if (oferta?.IsAvailable === false) continue
      const { contenido, unidad } = contenidoDe(item)
      salida.push({
        sku: String(item.itemId),
        nombre: item.nameComplete || item.name || p.productName || 'Sin nombre',
        marca: p.brand ?? null,
        precio,
        precioLista: oferta?.ListPrice && oferta.ListPrice > precio ? oferta.ListPrice : null,
        contenido,
        unidad,
        promocion: oferta?.Teasers?.[0]?.Name ?? null,
        url: p.link ?? (p.linkText ? `https://${dominio}/${p.linkText}/p` : null),
        imagen: item.images?.[0]?.imageUrl ?? null,
      })
    }
  }
  return salida
}

/** Los caminos que se prueban, en orden. El primero que responda se guarda en la config. */
export const ESTRATEGIAS = ['busqueda-inteligente', 'catalogo'] as const
export type Estrategia = (typeof ESTRATEGIAS)[number]

const urlBusqueda = (dominio: string, estrategia: Estrategia, termino: string, canal?: string): string => {
  const q = encodeURIComponent(termino)
  const sc = canal ? `&sc=${encodeURIComponent(canal)}` : ''
  return estrategia === 'busqueda-inteligente'
    ? `https://${dominio}/api/io/_v/api/intelligent-search/product_search/?query=${q}&count=20${sc}`
    : `https://${dominio}/api/catalog_system/pub/products/search/?ft=${q}&_from=0&_to=19${sc}`
}

const urlSkus = (dominio: string, skus: string[], canal?: string): string => {
  const fq = skus.map((s) => `fq=skuId:${encodeURIComponent(s)}`).join('&')
  const sc = canal ? `&sc=${encodeURIComponent(canal)}` : ''
  return `https://${dominio}/api/catalog_system/pub/products/search/?${fq}&_from=0&_to=${Math.max(0, skus.length - 1)}${sc}`
}

export function dominioDe(tienda: TiendaId, cfg: Config): string {
  const d = cfg.dominio ?? DOMINIOS[tienda]
  if (!d) throw new ErrorTienda(`No sé con qué dominio hablarle a ${tienda}`, false)
  return d
}

export function adaptadorVtex(tienda: TiendaId): Adaptador {
  return {
    tienda,

    async buscar(termino, cfg) {
      const dominio = dominioDe(tienda, cfg)
      const orden: Estrategia[] = cfg.estrategia
        ? [cfg.estrategia as Estrategia, ...ESTRATEGIAS.filter((e) => e !== cfg.estrategia)]
        : [...ESTRATEGIAS]

      let ultimo: unknown
      for (const estrategia of orden) {
        try {
          const crudo = await conReintentos(() =>
            traerJson<unknown>(urlBusqueda(dominio, estrategia, termino, cfg.salesChannel)),
          )
          const filas = leerProductos(crudo, dominio)
          if (filas.length > 0) return filas
        } catch (e) {
          ultimo = e
        }
      }
      if (ultimo) throw ultimo
      return []
    },

    async traer(skus, cfg) {
      const dominio = dominioDe(tienda, cfg)
      const salida: PrecioCrudo[] = []
      const lotes = enLotes(skus, 25)
      for (let i = 0; i < lotes.length; i++) {
        const crudo = await conReintentos(() => traerJson<unknown>(urlSkus(dominio, lotes[i], cfg.salesChannel)))
        salida.push(...leerProductos(crudo, dominio))
        // Buena vecindad: un respiro entre lotes.
        if (i < lotes.length - 1) await pausa(400)
      }
      // Solo nos interesan los SKU que seguimos, no los hermanos que devuelva el producto.
      const pedidos = new Set(skus)
      return salida.filter((p) => pedidos.has(p.sku))
    },
  }
}
