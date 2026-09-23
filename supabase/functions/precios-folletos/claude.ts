import Anthropic from 'npm:@anthropic-ai/sdk'

/** Un producto tal como lo saca Claude del folleto. */
export interface ProductoFolleto {
  nombre: string
  marca: string | null
  precio: number
  precio_lista: number | null
  contenido: number | null
  unidad: 'l' | 'kg' | 'un' | null
  promocion: string | null
  vigente_hasta: string | null
}

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['productos'],
  properties: {
    productos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'precio', 'marca', 'precio_lista', 'contenido', 'unidad', 'promocion', 'vigente_hasta'],
        properties: {
          nombre: { type: 'string' },
          marca: { type: ['string', 'null'] },
          precio: { type: 'number' },
          precio_lista: { type: ['number', 'null'] },
          contenido: { type: ['number', 'null'] },
          unidad: { type: ['string', 'null'], enum: ['l', 'kg', 'un', null] },
          promocion: { type: ['string', 'null'] },
          vigente_hasta: { type: ['string', 'null'] },
        },
      },
    },
  },
}

const INSTRUCCIONES = `Esta es una página del folleto semanal de una cadena de supermercados en Colombia.

Saca todos los productos con precio que veas. Reglas:
- "precio" es lo que cuesta hoy, en pesos colombianos, sin puntos ni símbolo (12900, no $12.900).
- "precio_lista" solo si el folleto muestra el precio tachado de antes; si no, null.
- "contenido" en la unidad de comparación: litros para líquidos, kilos para sólidos, unidades para lo que se cuenta.
  Una bolsa de 1.100 ml son 1.1 litros; 900 g son 0.9 kg; una bandeja de 30 huevos son 30 unidades.
  Si la imagen no dice cuánto trae, pon null: no lo adivines.
- "promocion" si es un 2x1, un "lleve 3 pague 2" o si el precio exige tarjeta del almacén.
- "vigente_hasta" en formato YYYY-MM-DD solo si el folleto dice hasta cuándo dura. Si no, null.
- Si un precio está borroso o no estás seguro de a qué producto corresponde, déjalo por fuera.
  Es mejor traer menos productos que traer un precio equivocado.`

export type Bloque =
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

/**
 * Le pasa una página (o un PDF entero) a Claude y recibe los productos en JSON.
 * Va página por página a propósito: una borrosa no puede tumbar el folleto completo.
 */
export async function leerFolleto(paginas: Bloque[]): Promise<ProductoFolleto[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY en los secretos de la función')
  const cliente = new Anthropic({ apiKey })

  const salida: ProductoFolleto[] = []
  for (const pagina of paginas) {
    const r = await cliente.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: [pagina, { type: 'text', text: INSTRUCCIONES }] }],
    })

    if (r.stop_reason === 'refusal') continue
    const texto = r.content.find((b) => b.type === 'text')
    if (!texto || texto.type !== 'text') continue
    try {
      const datos = JSON.parse(texto.text) as { productos?: ProductoFolleto[] }
      for (const p of datos.productos ?? []) {
        if (typeof p?.nombre === 'string' && typeof p?.precio === 'number' && p.precio > 0) salida.push(p)
      }
    } catch {
      // Una página que no devolvió JSON no tumba las demás.
      continue
    }
  }
  return salida
}
