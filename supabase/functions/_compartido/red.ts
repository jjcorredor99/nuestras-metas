/**
 * Somos dos personas mirando precios, no un robot de scraping industrial:
 * una consulta por producto seguido al día, con pausa entre lotes y sin paralelismo.
 */
const AGENTE = 'Mozilla/5.0 (compatible; NuestrasMetas/1.0; uso personal de dos personas)'

export class ErrorTienda extends Error {
  readonly reintentable: boolean
  constructor(mensaje: string, reintentable = false) {
    super(mensaje)
    this.name = 'ErrorTienda'
    this.reintentable = reintentable
  }
}

export const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** fetch con timeout duro: una tienda colgada no puede quedarse con toda la corrida. */
export async function traer(url: string, opciones: RequestInit = {}, ms = 20000): Promise<Response> {
  const ctrl = new AbortController()
  const reloj = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, {
      ...opciones,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'es-CO,es;q=0.9',
        'User-Agent': AGENTE,
        ...(opciones.headers ?? {}),
      },
    })
  } catch (e) {
    // Se cayó la red o venció el reloj: eso sí se reintenta.
    throw new ErrorTienda(e instanceof Error ? e.message : String(e), true)
  } finally {
    clearTimeout(reloj)
  }
}

/** Pide JSON y traduce los códigos: un 429 o un 5xx se reintenta; un 403 o un 404, no. */
export async function traerJson<T>(url: string, opciones: RequestInit = {}): Promise<T> {
  const r = await traer(url, opciones)
  if (!r.ok) {
    // 404 = ese SKU ya no existe · 403 = nos cerraron la puerta. Insistir no ayuda.
    throw new ErrorTienda(`HTTP ${r.status} en ${new URL(url).host}`, r.status === 429 || r.status >= 500)
  }
  try {
    return (await r.json()) as T
  } catch {
    throw new ErrorTienda(`Respuesta que no es JSON en ${new URL(url).host}`, false)
  }
}

/** Reintenta solo lo que vale la pena reintentar, con espera creciente y algo de azar. */
export async function conReintentos<T>(fn: () => Promise<T>, intentos = 3, baseMs = 800): Promise<T> {
  let ultimo: unknown
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn()
    } catch (e) {
      ultimo = e
      if (e instanceof ErrorTienda && !e.reintentable) throw e
      if (i === intentos - 1) break
      await pausa(baseMs * 2 ** i + Math.random() * 300)
    }
  }
  throw ultimo
}

/** Parte una lista en lotes, para no disparar cien consultas de golpe. */
export function enLotes<T>(lista: T[], tam: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += tam) lotes.push(lista.slice(i, i + tam))
  return lotes
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function responder(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
