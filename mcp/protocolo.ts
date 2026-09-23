// MCP sobre HTTP, sin estado: cada POST trae un mensaje JSON-RPC y se contesta con JSON.
// Es todo lo que necesita un conector de Claude; no hay sesiones ni flujo SSE.
import { ErrorUsuario, HERRAMIENTAS, type Contexto } from './herramientas'

export const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCCIONES = `Nuestras Metas es la app de plata de una pareja en Colombia (pesos colombianos, COP).
Cada uno es "a" o "b"; las herramientas devuelven sus nombres. Lo que se anote sin decir de quién queda
a nombre de quien conectó a Claude.

Cómo piensan la plata: la casa vive con un solo sueldo; lo que entra baja en cascada por obligaciones
fuera de casa (lo que cada uno manda a su familia), vivir (bolsillos de la casa y de cada uno) y avanzar
(deudas en bola de nieve y el ahorro para Grecia 2027). "Libre de verdad" es lo que queda tras facturas
sin pagar y mínimos de deuda.

Para preguntas generales empieza por como_vamos. Todo lo que anotes aparece en los dos celulares al
instante. Antes de anotar un gasto, si no está claro, pregunta si es compartido o personal; antes de
borrar, confirma. Lo que quieran llevar y no sea plata (pendientes, ideas, decisiones) va con apuntar.
Responde en español, corto y con montos redondos ($45.900).`

type Id = string | number | null

interface Mensaje {
  jsonrpc?: string
  id?: Id
  method?: string
  params?: Record<string, unknown>
}

const ok = (id: Id, result: unknown) => ({ jsonrpc: '2.0', id, result })
const falla = (id: Id, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

/** Contesta un mensaje JSON-RPC. null cuando es una notificación (no lleva respuesta). */
export async function atender(msg: Mensaje, ctx: Contexto): Promise<object | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return falla(msg?.id ?? null, -32600, 'Mensaje JSON-RPC inválido')
  }
  const id = msg.id ?? null
  if (msg.id === undefined) return null

  switch (msg.method) {
    case 'initialize': {
      const pedida = msg.params?.protocolVersion
      return ok(id, {
        protocolVersion: typeof pedida === 'string' && VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'nuestras-metas', title: 'Nuestras Metas', version: '1.0.0' },
        instructions: INSTRUCCIONES,
      })
    }
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, {
        tools: HERRAMIENTAS.map((h) => ({
          name: h.name,
          title: h.title,
          description: h.description,
          inputSchema: h.inputSchema,
          annotations: { title: h.title, readOnlyHint: h.soloLectura, destructiveHint: h.name.startsWith('borrar') || h.name === 'marcar_apunte', openWorldHint: false },
        })),
      })
    case 'tools/call': {
      const nombre = msg.params?.name
      const h = HERRAMIENTAS.find((x) => x.name === nombre)
      if (!h) return falla(id, -32602, `No existe la herramienta "${String(nombre)}"`)
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>
      try {
        const resultado = await h.correr(args, ctx)
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] })
      } catch (e) {
        const texto = e instanceof ErrorUsuario ? e.message : `No pude completar "${h.name}": ${e instanceof Error ? e.message : String(e)}`
        return ok(id, { content: [{ type: 'text', text: texto }], isError: true })
      }
    }
    case 'resources/list':
      return ok(id, { resources: [] })
    case 'prompts/list':
      return ok(id, { prompts: [] })
    default:
      return falla(id, -32601, `Método no soportado: ${msg.method}`)
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-protocol-version, mcp-session-id, x-client-info, apikey',
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** El token va en la ruta (…/functions/v1/mcp/<token>) o como ?token=. Solo hex, para no colar nada en la consulta. */
export function tokenDe(url: URL): string | null {
  const candidato = url.searchParams.get('token') ?? url.pathname.split('/').filter(Boolean).pop() ?? ''
  return /^[a-f0-9]{32,64}$/.test(candidato) ? candidato : null
}

/** Atiende una petición HTTP. `abrir` convierte el token en el contexto del hogar (o null si no sirve). */
export async function manejar(req: Request, abrir: (token: string) => Promise<Contexto | null>): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const token = tokenDe(new URL(req.url))
  if (!token) return json({ error: 'Falta el token del conector en el enlace' }, 401)

  if (req.method === 'GET') {
    // Sin flujo SSE: así lo pide la especificación para servidores que solo contestan POST.
    return new Response('Este conector solo atiende POST', { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' } })
  }
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' } })

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return json(falla(null, -32700, 'JSON inválido'), 400)
  }

  // Un token malo no puede ni presentarse ni listar herramientas.
  const ctx = await abrir(token)
  if (!ctx) return json({ error: 'Token inválido o revocado. Genera uno nuevo en la app: Ajustes → Conectar con Claude.' }, 401)

  const lote = Array.isArray(cuerpo)
  const mensajes = (lote ? cuerpo : [cuerpo]) as Mensaje[]
  const respuestas = (await Promise.all(mensajes.map((m) => atender(m, ctx)))).filter((r) => r !== null)
  if (respuestas.length === 0) return new Response(null, { status: 202, headers: CORS })
  return json(lote ? respuestas : respuestas[0])
}
