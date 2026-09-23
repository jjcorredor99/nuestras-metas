import { describe, expect, it } from 'vitest'
import type { Estado } from '../src/types'
import type { Almacen, FilaItem } from './datos'
import { diasParaVencer, hoyEn, type Contexto } from './herramientas'
import { manejar, tokenDe } from './protocolo'

const TOKEN = 'a'.repeat(40)

function hogar(): FilaItem[] {
  const perfil = { nombreA: 'Juan', nombreB: 'Lau', nombrePareja: '', moneda: 'COP', ingresoEsperado: { a: 8_000_000, b: 6_000_000 } }
  const e: Omit<Estado, 'version' | 'perfil'> = {
    gastos: [
      { id: 'g1', fecha: '2026-09-02', monto: 200_000, categoria: 'mercado', pagadoPor: 'a', compartido: true, nota: 'EXITO SUBA' },
      { id: 'g2', fecha: '2026-09-10', monto: 60_000, categoria: 'comida', pagadoPor: 'b', compartido: false, nota: 'Crepes' },
      { id: 'g3', fecha: '2026-08-15', monto: 150_000, categoria: 'mercado', pagadoPor: 'b', compartido: true, nota: 'D1' },
    ],
    facturas: [{ id: 'f1', nombre: 'Internet', monto: 90_000, diaVence: 28, responsable: 'ambos', pagadaEn: [], activa: true }],
    deudas: [
      { id: 'd1', nombre: 'Tarjeta Falabella', de: 'a', montoInicial: 1_000_000, tasaMensual: 2, pagoMinimo: 100_000, abonos: [], creadaEn: '2026-01-01' },
      { id: 'd2', nombre: 'Crédito carro', de: 'ambos', montoInicial: 20_000_000, tasaMensual: 1, pagoMinimo: 900_000, abonos: [], creadaEn: '2026-01-01' },
    ],
    retos: [{ id: 'r1', titulo: 'Sin domicilios', descripcion: '', tipo: 'habito', meta: 3, progreso: 2, fechaLimite: '2026-10-01', emoji: '🥡', completado: false, recompensa: 'Cine' }],
    metas: [{ id: 'meta-grecia-2027', titulo: 'Grecia', descripcion: '', emoji: '🇬🇷', fecha: '2027-06-15', montoObjetivo: 20_000_000, aportes: [], color: '', fija: true }],
    fotos: [],
    bolsillos: [
      { id: 'b1', nombre: 'Mercado', emoji: '🛒', ambito: 'hogar', asignacion: 1_000_000, acumula: false, categorias: ['mercado'], saldoInicial: 0, desde: '2026-01', ajustes: [] },
    ],
    ingresos: [],
    productos: [],
    listas: [],
  }
  return [
    { id: 'perfil', tipo: 'perfil', data: perfil },
    ...e.gastos.map((x) => ({ id: x.id, tipo: 'gasto' as const, data: x })),
    ...e.facturas.map((x) => ({ id: x.id, tipo: 'factura' as const, data: x })),
    ...e.deudas.map((x) => ({ id: x.id, tipo: 'deuda' as const, data: x })),
    ...e.retos.map((x) => ({ id: x.id, tipo: 'reto' as const, data: x })),
    ...e.metas.map((x) => ({ id: x.id, tipo: 'meta' as const, data: x })),
    ...e.bolsillos.map((x) => ({ id: x.id, tipo: 'bolsillo' as const, data: x })),
  ]
}

function montar() {
  const filas = new Map(hogar().map((f) => [f.id, f]))
  const entrantes = new Map(
    [
      { id: 'm1', persona: 'b' as const, texto: 'Bancolombia: Compraste $32.000 en TIENDA DON PEPE', recibido_en: '2026-09-22T15:00:00Z' },
      { id: 'm2', persona: 'a' as const, texto: 'Bancolombia: Recibiste una transferencia por $300.000 de LAURA GOMEZ', recibido_en: '2026-09-22T16:00:00Z' },
      { id: 'm3', persona: 'a' as const, texto: 'Bancolombia: Tu clave dinamica es 483920. No compartas este codigo.', recibido_en: '2026-09-22T17:00:00Z' },
    ].map((m) => [m.id, { ...m, procesado: false }]),
  )
  let n = 0
  const almacen: Almacen = {
    leer: async () => [...filas.values()],
    guardar: async (nuevas) => nuevas.forEach((f) => filas.set(f.id, structuredClone(f))),
    borrar: async (ids) => ids.forEach((id) => filas.delete(id)),
    entrantes: async () => [...entrantes.values()].filter((m) => !m.procesado),
    resolverEntrante: async (id, procesado) => {
      const m = entrantes.get(id)
      if (!m || m.procesado === procesado) return false
      m.procesado = procesado
      return true
    },
  }
  const ctx: Contexto = { almacen, persona: 'a', hoy: '2026-09-23', uid: () => `nuevo-${++n}` }
  const pedir = async (method: string, params?: unknown, token = TOKEN) => {
    const r = await manejar(
      new Request(`https://x.supabase.co/functions/v1/mcp/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }),
      async (t) => (t === TOKEN ? ctx : null),
    )
    return { status: r.status, cuerpo: r.status === 202 ? null : await r.json() }
  }
  const usar = async (name: string, args: Record<string, unknown> = {}) => {
    const { cuerpo } = await pedir('tools/call', { name, arguments: args })
    const texto = cuerpo.result.content[0].text as string
    return { error: cuerpo.result.isError === true, texto, datos: cuerpo.result.isError ? null : JSON.parse(texto) }
  }
  return { filas, entrantes, pedir, usar }
}

describe('protocolo', () => {
  it('se presenta y lista las herramientas', async () => {
    const { pedir } = montar()
    const ini = await pedir('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'claude', version: '1' } })
    expect(ini.cuerpo.result.protocolVersion).toBe('2025-03-26')
    expect(ini.cuerpo.result.capabilities.tools).toBeDefined()
    const lista = await pedir('tools/list')
    const nombres = lista.cuerpo.result.tools.map((t: { name: string }) => t.name)
    expect(nombres).toContain('como_vamos')
    expect(nombres).toContain('anotar_gasto')
    const leer = lista.cuerpo.result.tools.find((t: { name: string }) => t.name === 'ver_deudas')
    expect(leer.annotations.readOnlyHint).toBe(true)
  })

  it('una versión desconocida recibe la más nueva', async () => {
    const { pedir } = montar()
    const ini = await pedir('initialize', { protocolVersion: '1999-01-01' })
    expect(ini.cuerpo.result.protocolVersion).toBe('2025-06-18')
  })

  it('las notificaciones no llevan respuesta', async () => {
    const { filas } = montar()
    void filas
    const r = await manejar(
      new Request(`https://x/functions/v1/mcp/${TOKEN}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }),
      async () => ({}) as Contexto,
    )
    expect(r.status).toBe(202)
  })

  it('sin token o con uno revocado no entra nadie', async () => {
    const { pedir } = montar()
    expect((await pedir('tools/list', undefined, 'b'.repeat(40))).status).toBe(401)
    expect((await pedir('tools/list', undefined, 'nada')).status).toBe(401)
  })

  it('el token sale de la ruta o de ?token=, y solo si es hex', () => {
    expect(tokenDe(new URL(`https://x/functions/v1/mcp/${TOKEN}`))).toBe(TOKEN)
    expect(tokenDe(new URL(`https://x/mcp?token=${TOKEN}`))).toBe(TOKEN)
    expect(tokenDe(new URL(`https://x/mcp/${TOKEN}&hogar_id=eq.x`))).toBeNull()
  })

  it('un método desconocido es un error JSON-RPC', async () => {
    const { pedir } = montar()
    expect((await pedir('cosas/raras')).cuerpo.error.code).toBe(-32601)
  })
})

describe('herramientas', () => {
  it('como_vamos arma el mes con los nombres', async () => {
    const { usar } = montar()
    const { datos } = await usar('como_vamos')
    expect(datos.mes).toBe('2026-09')
    expect(datos.caja.gastado).toBe(260_000)
    expect(datos.caja.entra).toBe(14_000_000)
    expect(datos.bolsillos[0]).toMatchObject({ gastado: 200_000, disponible: 800_000 })
    expect(datos.compartidos).toMatch(/^Lau le debe \$\s?100\.000 a Juan/)
    expect(datos.facturasPorPagar[0]).toMatchObject({ nombre: 'Internet', diasParaVencer: 5 })
  })

  it('buscar_gastos filtra por texto sin tildes y por persona', async () => {
    const { usar } = montar()
    const { datos } = await usar('buscar_gastos', { desde: '2026-08-01', hasta: '2026-09-30', pago_por: 'lau' })
    expect(datos.cuantos).toBe(2)
    expect(datos.total).toBe(210_000)
    const porTexto = await usar('buscar_gastos', { texto: 'éxito' })
    expect(porTexto.datos.gastos.map((g: { id: string }) => g.id)).toEqual(['g1'])
  })

  it('anotar_gasto adivina la categoría y dice en qué bolsillo cayó', async () => {
    const { usar, filas } = montar()
    const { datos } = await usar('anotar_gasto', { monto: 50_000, nota: 'Carulla 85', compartido: true })
    expect(datos.anotado).toMatchObject({ categoria: 'Mercado', pagoPor: 'Juan', fecha: '2026-09-23' })
    expect(datos.bolsillo).toMatchObject({ disponible: 750_000 })
    expect(filas.get('nuevo-1')?.tipo).toBe('gasto')
  })

  it('anotar_gasto pide saber si es compartido', async () => {
    const { usar } = montar()
    const r = await usar('anotar_gasto', { monto: 10_000, nota: 'algo' })
    expect(r.error).toBe(true)
    expect(r.texto).toMatch(/compartido/)
  })

  it('abonar_deuda busca por nombre y celebra cuando cae', async () => {
    const { usar } = montar()
    const { datos } = await usar('abonar_deuda', { deuda: 'falabella', monto: 1_000_000, por: 'b' })
    expect(datos.deuda.saldo).toBe(0)
    expect(datos.celebrar).toMatch(/cayó/)
    const deudas = await usar('ver_deudas')
    expect(deudas.datos.siguienteATumbar).toBe('Crédito carro')
    expect(deudas.datos.esteMes.porPersona.Lau).toBe(1_000_000)
  })

  it('una búsqueda ambigua pide el id', async () => {
    const { usar } = montar()
    const r = await usar('abonar_deuda', { deuda: 'r', monto: 1 })
    expect(r.error).toBe(true)
    expect(r.texto).toMatch(/varias/)
  })

  it('aportar_hito suma a Grecia', async () => {
    const { usar } = montar()
    const { datos } = await usar('aportar_hito', { hito: 'grecia', monto: 500_000 })
    expect(datos.hito).toMatchObject({ ahorrado: 500_000, falta: 19_500_000 })
  })

  it('pagar_factura puede anotar el gasto como la app', async () => {
    const { usar, filas } = montar()
    const { datos } = await usar('pagar_factura', { factura: 'internet', anotar_gasto: true })
    expect(datos.factura.pagada).toBe(true)
    expect(datos.gastoAnotado).toMatchObject({ monto: 90_000, compartido: true, categoria: 'Servicios' })
    expect((filas.get('f1')?.data as { pagadaEn: string[] }).pagadaEn).toEqual(['2026-09'])
  })

  it('avanzar_reto lo completa al llegar a la meta', async () => {
    const { usar } = montar()
    const { datos } = await usar('avanzar_reto', { reto: 'domicilios', sumar: 1 })
    expect(datos.reto.completado).toBe(true)
    expect(datos.celebrar).toMatch(/Cine/)
  })

  it('apuntes: apuntar, listar y marcar', async () => {
    const { usar } = montar()
    await usar('apuntar', { texto: 'Averiguar la visa Schengen', etiqueta: 'Grecia' })
    let lista = await usar('ver_apuntes')
    expect(lista.datos.apuntes).toHaveLength(1)
    expect(lista.datos.apuntes[0]).toMatchObject({ etiqueta: 'grecia', por: 'Juan' })
    await usar('marcar_apunte', { apunte: 'visa' })
    lista = await usar('ver_apuntes')
    expect(lista.datos.apuntes).toHaveLength(0)
  })

  it('borrar_gasto lo quita', async () => {
    const { usar, filas } = montar()
    await usar('borrar_gasto', { id: 'g2' })
    expect(filas.has('g2')).toBe(false)
  })
})

describe('por confirmar', () => {
  it('lista lo que llegó por SMS con lo leído y una sugerencia', async () => {
    const { usar } = montar()
    const { datos } = await usar('por_confirmar')
    expect(datos.cuantos).toBe(3)
    const [compra, ingreso, clave] = datos.mensajes
    expect(compra).toMatchObject({ llegoA: 'Lau', sugerencia: 'gasto', lectura: { monto: 32_000, categoriaSugerida: 'Otros' } })
    expect(ingreso.sugerencia).toMatch(/^ingreso/)
    expect(clave.sugerencia).toBe('descartar')
  })

  it('confirmar como gasto lo anota a nombre de quien recibió el SMS y aprende la categoría', async () => {
    const { usar, filas, entrantes } = montar()
    const { datos } = await usar('confirmar_mensaje', { mensaje: 'm1', como: 'gasto', categoria: 'mercado', compartido: true })
    expect(datos.gastoAnotado).toMatchObject({ monto: 32_000, pagoPor: 'Lau', categoria: 'Mercado', compartido: true, desde: 'SMS Bancolombia' })
    expect(datos.aprendido).toMatch(/TIENDA va a Mercado/)
    expect((filas.get('perfil')?.data as { aprendidos: Record<string, string> }).aprendidos.TIENDA).toBe('mercado')
    expect(entrantes.get('m1')?.procesado).toBe(true)
    // Ya no está por confirmar, y no se puede confirmar dos veces.
    expect((await usar('por_confirmar')).datos.cuantos).toBe(2)
    expect((await usar('confirmar_mensaje', { mensaje: 'm1', como: 'gasto' })).error).toBe(true)
  })

  it('confirmar como ingreso y descartar', async () => {
    const { usar, entrantes } = montar()
    const { datos } = await usar('confirmar_mensaje', { mensaje: 'm2', como: 'ingreso', fuente: 'extra' })
    expect(datos.ingresoAnotado).toMatchObject({ monto: 300_000, de: 'Juan', fuente: 'extra' })
    await usar('confirmar_mensaje', { mensaje: 'm3', como: 'descartar' })
    expect(entrantes.get('m3')?.procesado).toBe(true)
  })

  it('si el mensaje no trae valor, pide el monto', async () => {
    const { usar } = montar()
    const r = await usar('confirmar_mensaje', { mensaje: 'm3', como: 'gasto' })
    expect(r.error).toBe(true)
    expect(r.texto).toMatch(/monto/)
  })
})

describe('fechas', () => {
  it('hoy va en hora de Bogotá', () => {
    expect(hoyEn('America/Bogota', new Date('2026-09-24T02:00:00Z'))).toBe('2026-09-23')
  })

  it('días para vencer pasa al mes siguiente y respeta meses cortos', () => {
    expect(diasParaVencer(28, '2026-09-23')).toBe(5)
    expect(diasParaVencer(5, '2026-09-23')).toBe(12)
    expect(diasParaVencer(31, '2026-02-10')).toBe(18)
    expect(diasParaVencer(10, '2026-12-20')).toBe(21)
  })
})
