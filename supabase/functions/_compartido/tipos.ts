export type TiendaId = 'exito' | 'carulla' | 'makro' | 'd1' | 'ara'

export type Unidad = 'l' | 'kg' | 'un'

export type Fuente = 'api' | 'folleto' | 'manual'

/** Lo que devuelve un adaptador: un precio ya leído, todavía sin guardar. */
export interface PrecioCrudo {
  sku: string
  nombre: string
  marca?: string | null
  precio: number
  precioLista?: number | null
  contenido?: number | null
  unidad?: Unidad | null
  promocion?: string | null
  vigenteHasta?: string | null
  url?: string | null
  imagen?: string | null
}

/** Lo que la tienda guarda en `tiendas.config`: lo llena la fase de descubrimiento. */
export interface Config {
  dominio?: string
  salesChannel?: string
  /** Cuál de los caminos funcionó: 'busqueda-inteligente' | 'catalogo'. */
  estrategia?: string
  /** URL del folleto de la semana, para D1 y Ara. */
  folleto?: string
}

export interface Tienda {
  id: TiendaId
  nombre: string
  fuente: Fuente
  activa: boolean
  config: Config
}

export interface Adaptador {
  tienda: TiendaId
  /** Busca por texto: es lo que alimenta la pantalla de vincular. */
  buscar(termino: string, cfg: Config): Promise<PrecioCrudo[]>
  /** Refresca los SKU que ya se siguen. */
  traer(skus: string[], cfg: Config): Promise<PrecioCrudo[]>
}

/** Lo que cada tienda reporta al terminar. Una caída no tumba a las demás. */
export interface ResultadoTienda {
  tienda: TiendaId
  ok: boolean
  filas: number
  error?: string
}
