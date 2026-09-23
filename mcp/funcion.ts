// La Edge Function de Supabase que Claude usa como conector.
// No se edita supabase/functions/mcp/index.ts a mano: sale de aquí con `npm run mcp:build`.
import type { Persona } from '../src/types'
import type { Almacen, Entrante, FilaItem, TipoFila } from './datos'
import { hoyEn, type Contexto } from './herramientas'
import { manejar } from './protocolo'

declare const Deno: {
  env: { get(nombre: string): string | undefined }
  serve(atender: (req: Request) => Response | Promise<Response>): unknown
}

const URL_SB = Deno.env.get('SUPABASE_URL') ?? ''
// La función lee con la llave de servicio (salta RLS), así que el token es la única puerta: se valida siempre.
const LLAVE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const TIPOS: TipoFila[] = ['perfil', 'gasto', 'factura', 'deuda', 'reto', 'meta', 'foto', 'bolsillo', 'ingreso', 'producto', 'lista', 'apunte']

async function rest(ruta: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, {
    ...init,
    headers: { apikey: LLAVE, Authorization: `Bearer ${LLAVE}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!r.ok) throw new Error(`Supabase respondió ${r.status}: ${await r.text()}`)
  return r
}

function almacen(hogar: string, usuario: string): Almacen {
  const marca = () => ({ actualizado_en: new Date().toISOString(), actualizado_por: usuario })
  return {
    async leer() {
      // PostgREST entrega de a 1000 filas: se pide por páginas.
      const filas: FilaItem[] = []
      for (let desde = 0; ; desde += 1000) {
        const r = await rest(
          `items?hogar_id=eq.${hogar}&borrado=eq.false&select=id,tipo,data&order=id&limit=1000&offset=${desde}`,
        )
        const pagina = (await r.json()) as FilaItem[]
        filas.push(...pagina.filter((f) => TIPOS.includes(f.tipo)))
        if (pagina.length < 1000) return filas
      }
    },
    async guardar(filas) {
      if (!filas.length) return
      await rest('items?on_conflict=hogar_id,id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(filas.map((f) => ({ hogar_id: hogar, id: f.id, tipo: f.tipo, data: f.data, borrado: false, ...marca() }))),
      })
    },
    async borrar(ids) {
      if (!ids.length) return
      const lista = ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',')
      await rest(`items?hogar_id=eq.${hogar}&id=in.(${encodeURIComponent(lista)})`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ borrado: true, ...marca() }),
      })
    },
    async entrantes() {
      const r = await rest(
        `entrantes?hogar_id=eq.${hogar}&procesado=eq.false&select=id,persona,texto,recibido_en&order=recibido_en&limit=200`,
      )
      return (await r.json()) as Entrante[]
    },
    async resolverEntrante(id, procesado) {
      if (!/^[0-9a-f-]{36}$/.test(id)) return false
      // Resolver solo si sigue pendiente: si los dos lo confirman a la vez, uno solo lo anota.
      const r = await rest(`entrantes?hogar_id=eq.${hogar}&id=eq.${id}&procesado=eq.${!procesado}&select=id`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ procesado }),
      })
      return ((await r.json()) as unknown[]).length > 0
    },
  }
}

async function abrir(token: string): Promise<Contexto | null> {
  const r = await rest(`tokens_claude?token=eq.${token}&select=hogar_id,user_id,persona`)
  const [t] = (await r.json()) as { hogar_id: string; user_id: string; persona: Persona }[]
  if (!t) return null
  return { almacen: almacen(t.hogar_id, t.user_id), persona: t.persona, hoy: hoyEn(), uid: () => crypto.randomUUID() }
}

Deno.serve((req) =>
  manejar(req, abrir).catch((e) => {
    console.error(e)
    return new Response(JSON.stringify({ error: 'Falla interna del conector' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }),
)
