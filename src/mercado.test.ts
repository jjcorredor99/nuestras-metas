import { describe, expect, it } from 'vitest'
import {
  comparativo,
  frescura,
  leerContenido,
  llavePrecio,
  mejorRepartido,
  precioPorUnidad,
  puntajeCoincidencia,
  totalEnUnaTienda,
  vistaDeProducto,
  type PrecioCrudo,
  type Precios,
} from './mercado'
import { estadoInicial, reducer } from './store'
import type { ListaCompras, Producto, TiendaId, Unidad, Vinculo } from './types'

// ---------- fábricas ----------

const HOY = '2026-09-21'

const vinculo = (tienda: TiendaId, sku: string, contenido = 1, unidad: Unidad = 'l'): Vinculo => ({
  tienda,
  sku,
  nombre: `${sku} en ${tienda}`,
  contenido,
  unidad,
  confirmado: true,
})

const producto = (id: string, nombre: string, vinculos: Vinculo[], unidad: Unidad = 'l'): Producto => ({
  id,
  nombre,
  emoji: '🛒',
  unidad,
  contenidoRef: 1,
  habitual: 1,
  vinculos,
  activo: true,
})

const precio = (tienda: TiendaId, sku: string, monto: number, extra: Partial<PrecioCrudo> = {}): PrecioCrudo => ({
  tienda,
  sku,
  nombre: `${sku} en ${tienda}`,
  precio: monto,
  contenido: null,
  unidad: null,
  fuente: 'api',
  dia: HOY,
  vigenteHasta: null,
  promocion: null,
  ...extra,
})

const preciosDe = (...lista: PrecioCrudo[]): Precios =>
  new Map(lista.map((p) => [llavePrecio(p.tienda, p.sku), p]))

const lista = (items: { productoId: string; cantidad: number }[]): ListaCompras => ({
  id: 'lista-1',
  nombre: 'Mercado',
  creadaEn: HOY,
  items: items.map((i) => ({ ...i, listo: false })),
})

// ---------- leer el contenido del nombre ----------

describe('leerContenido', () => {
  it('lee la bolsa de 1.100 ml como 1,1 litros y no como mil cien', () => {
    expect(leerContenido('Leche Entera Colanta Bolsa x 1.100 ml')).toEqual({ contenido: 1.1, unidad: 'l' })
  })

  it('entiende los gramos escritos de todas las formas', () => {
    expect(leerContenido('Panela pulverizada 900g')).toEqual({ contenido: 0.9, unidad: 'kg' })
    expect(leerContenido('Panela pulverizada 900 gr')).toEqual({ contenido: 0.9, unidad: 'kg' })
    expect(leerContenido('Panela pulverizada x900G')).toEqual({ contenido: 0.9, unidad: 'kg' })
  })

  it('lee la coma como decimal', () => {
    expect(leerContenido('Gaseosa 1,5 L')).toEqual({ contenido: 1.5, unidad: 'l' })
  })

  it('cuenta las unidades sueltas', () => {
    expect(leerContenido('Huevos AA x 30 und')).toEqual({ contenido: 30, unidad: 'un' })
    expect(leerContenido('Papel higiénico x 12 rollos')).toEqual({ contenido: 12, unidad: 'un' })
  })

  it('multiplica cuando vienen dos empaques: 500 g x 2 es un kilo', () => {
    expect(leerContenido('Arroz Diana 500 g x 2')).toEqual({ contenido: 1, unidad: 'kg' })
  })

  it('no se traga el 2x1 como si fuera contenido', () => {
    expect(leerContenido('Yogur Alpina 2x1')).toBeNull()
  })

  it('devuelve null cuando el nombre no dice cuánto trae', () => {
    expect(leerContenido('Pan tajado')).toBeNull()
  })
})

// ---------- precio por unidad ----------

describe('precioPorUnidad', () => {
  it('destapa que la bolsa más barata no es la leche más barata', () => {
    const exito = precioPorUnidad(4800, 1.1) // bolsa de 1.100 ml
    const d1 = precioPorUnidad(4100, 0.9) // bolsa de 900 ml
    expect(d1).toBeGreaterThan(exito)
    expect(Math.round(exito)).toBe(4364)
    expect(Math.round(d1)).toBe(4556)
  })

  it('sin contenido no revienta, y nunca queda como el más barato', () => {
    expect(precioPorUnidad(4100, 0)).toBe(Number.POSITIVE_INFINITY)
    expect(precioPorUnidad(4100, 0)).toBeGreaterThan(precioPorUnidad(9999999, 1))
  })
})

// ---------- emparejar nombres ----------

describe('puntajeCoincidencia', () => {
  it('prefiere la misma marca antes que el mismo tamaño', () => {
    const buena = puntajeCoincidencia('Leche Colanta 1L', 'LECHE ENTERA COLANTA 1000ML')
    const mala = puntajeCoincidencia('Leche Colanta 1L', 'LECHE ALPINA DESLACTOSADA 1L')
    expect(buena).toBeGreaterThan(mala)
    expect(buena).toBe(1)
  })

  it('no le importan las tildes ni las mayúsculas', () => {
    expect(puntajeCoincidencia('Atún lomitos en aceite', 'ATUN LOMITOS EN ACEITE')).toBe(1)
  })

  it('castiga la presentación equivocada: el garrafón no es la botella', () => {
    const igual = puntajeCoincidencia('Aceite Premier', 'ACEITE PREMIER', { canonico: 1, tienda: 1 })
    const garrafon = puntajeCoincidencia('Aceite Premier', 'ACEITE PREMIER', { canonico: 1, tienda: 5 })
    expect(igual).toBe(1)
    expect(garrafon).toBeLessThan(igual)
  })

  it('es cero cuando no hay con qué comparar', () => {
    expect(puntajeCoincidencia('', 'LECHE COLANTA')).toBe(0)
  })
})

// ---------- qué tan viejo es un precio ----------

describe('frescura', () => {
  it('distingue el de hoy, el de hace poco y el que ya puede haber cambiado', () => {
    expect(frescura(HOY, null, HOY)).toBe('hoy')
    expect(frescura('2026-09-19', null, HOY)).toBe('reciente')
    expect(frescura('2026-09-10', null, HOY)).toBe('viejo')
  })

  it('una oferta de folleto que ya caducó está vencida, por nueva que sea la fila', () => {
    expect(frescura(HOY, '2026-09-20', HOY)).toBe('vencido')
  })
})

// ---------- la comparación por producto ----------

describe('vistaDeProducto', () => {
  const leche = producto('leche', 'Leche Colanta 1L', [
    vinculo('exito', 'e-leche', 1.1),
    vinculo('d1', 'd-leche', 0.9),
  ])

  it('gana la más barata por litro, no la de menor precio', () => {
    const v = vistaDeProducto(leche, preciosDe(precio('exito', 'e-leche', 4800), precio('d1', 'd-leche', 4100)), HOY)
    expect(v.mejor?.tienda).toBe('exito')
    expect(v.precios.map((p) => p.tienda)).toEqual(['exito', 'd1'])
  })

  it('una oferta de folleto vencida no compite: queda como faltante', () => {
    const v = vistaDeProducto(
      leche,
      preciosDe(
        precio('exito', 'e-leche', 4800),
        precio('d1', 'd-leche', 2000, { fuente: 'folleto', vigenteHasta: '2026-09-15' }),
      ),
      HOY,
    )
    expect(v.mejor?.tienda).toBe('exito')
    expect(v.faltan).toContain('d1')
  })

  it('marca como poco confiable lo que viene del folleto o está viejo', () => {
    const v = vistaDeProducto(
      leche,
      preciosDe(
        precio('exito', 'e-leche', 4800, { dia: '2026-09-01' }),
        precio('d1', 'd-leche', 4100, { fuente: 'folleto', vigenteHasta: '2026-09-30' }),
      ),
      HOY,
    )
    expect(v.precios.every((p) => !p.confiable)).toBe(true)
    expect(v.precios.find((p) => p.tienda === 'exito')?.frescura).toBe('viejo')
  })

  it('usa el contenido que trae la fuente por encima del que se guardó al vincular', () => {
    const v = vistaDeProducto(leche, preciosDe(precio('exito', 'e-leche', 4800, { contenido: 2 })), HOY)
    expect(v.mejor?.contenido).toBe(2)
    expect(v.mejor?.porUnidad).toBe(2400)
  })
})

// ---------- la lista de compras ----------

describe('totalEnUnaTienda', () => {
  const aceite = producto('aceite', 'Aceite Premier', [vinculo('exito', 'e-aceite'), vinculo('d1', 'd-aceite')])
  const arroz = producto('arroz', 'Arroz Diana', [vinculo('exito', 'e-arroz')], 'kg')
  const productos = [aceite, arroz]
  const precios = preciosDe(precio('exito', 'e-aceite', 28000), precio('d1', 'd-aceite', 19900), precio('exito', 'e-arroz', 39900))

  it('suma respetando las cantidades', () => {
    const l = lista([
      { productoId: 'aceite', cantidad: 2 },
      { productoId: 'arroz', cantidad: 1 },
    ])
    expect(totalEnUnaTienda(l, productos, precios, 'exito', HOY).total).toBe(95900)
  })

  it('lo que la tienda no tiene se cuenta aparte, nunca como cero', () => {
    const l = lista([
      { productoId: 'aceite', cantidad: 1 },
      { productoId: 'arroz', cantidad: 1 },
    ])
    const d1 = totalEnUnaTienda(l, productos, precios, 'd1', HOY)
    expect(d1.total).toBe(19900)
    expect(d1.faltan).toEqual(['arroz'])
  })

  it('una cantidad en cero no es una compra', () => {
    const l = lista([{ productoId: 'aceite', cantidad: 0 }])
    expect(totalEnUnaTienda(l, productos, precios, 'exito', HOY)).toEqual({ tiendas: ['exito'], total: 0, faltan: [] })
  })
})

describe('mejorRepartido', () => {
  const aceite = producto('aceite', 'Aceite Premier', [vinculo('exito', 'e-aceite'), vinculo('d1', 'd-aceite')])
  const arroz = producto('arroz', 'Arroz Diana', [vinculo('exito', 'e-arroz'), vinculo('d1', 'd-arroz')], 'kg')
  const productos = [aceite, arroz]
  // El aceite está mejor en D1 y el arroz en Éxito: repartir tiene sentido.
  const precios = preciosDe(
    precio('exito', 'e-aceite', 28000),
    precio('d1', 'd-aceite', 19900),
    precio('exito', 'e-arroz', 39900),
    precio('d1', 'd-arroz', 45900),
  )
  const l = lista([
    { productoId: 'aceite', cantidad: 1 },
    { productoId: 'arroz', cantidad: 1 },
  ])

  it('con una sola parada da lo mismo que la mejor tienda sola', () => {
    const r = mejorRepartido(l, productos, precios, HOY, 1)
    expect(r.tiendas).toEqual(['d1'])
    expect(r.total).toBe(65800)
  })

  it('con dos paradas encuentra el par óptimo', () => {
    const r = mejorRepartido(l, productos, precios, HOY, 2)
    expect(r.total).toBe(59800)
    expect(r.asignacion.get('aceite')).toBe('d1')
    expect(r.asignacion.get('arroz')).toBe('exito')
    expect(r.tiendas).toHaveLength(2)
  })

  it('no cuenta como parada una tienda donde no se compra nada', () => {
    const soloExito = preciosDe(precio('exito', 'e-aceite', 28000), precio('exito', 'e-arroz', 39900))
    expect(mejorRepartido(l, productos, soloExito, HOY, 3).tiendas).toEqual(['exito'])
  })

  it('con la lista vacía no inventa nada', () => {
    const r = mejorRepartido(lista([]), productos, precios, HOY, 2)
    expect(r).toEqual({ tiendas: [], total: 0, faltan: [], asignacion: new Map() })
  })
})

describe('comparativo', () => {
  const aceite = producto('aceite', 'Aceite Premier', [vinculo('exito', 'e-aceite'), vinculo('d1', 'd-aceite')])
  const arroz = producto('arroz', 'Arroz Diana', [vinculo('exito', 'e-arroz'), vinculo('d1', 'd-arroz')], 'kg')
  const productos = [aceite, arroz]
  const l = lista([
    { productoId: 'aceite', cantidad: 1 },
    { productoId: 'arroz', cantidad: 1 },
  ])

  it('dice cuánto se ahorra cuando de verdad vale la pena repartir', () => {
    const precios = preciosDe(
      precio('exito', 'e-aceite', 28000),
      precio('d1', 'd-aceite', 19900),
      precio('exito', 'e-arroz', 39900),
      precio('d1', 'd-arroz', 45900),
    )
    const c = comparativo(l, productos, precios, HOY)
    expect(c.ahorro).toBe(6000)
    expect(c.valeLaPena).toBe(true)
    expect(c.frase).toContain('ahorran')
    expect(c.frase).toContain('dos sitios')
  })

  it('no manda a cruzar la ciudad por unos pesos', () => {
    const precios = preciosDe(
      precio('exito', 'e-aceite', 28000),
      precio('d1', 'd-aceite', 27900),
      precio('exito', 'e-arroz', 39800),
      precio('d1', 'd-arroz', 39900),
    )
    const c = comparativo(l, productos, precios, HOY)
    expect(c.ahorro).toBe(100)
    expect(c.valeLaPena).toBe(false)
    expect(c.frase).toContain('vayan al que les quede cerca')
  })

  it('cuando una sola tienda ya es lo mejor, lo dice sin rodeos', () => {
    const precios = preciosDe(
      precio('exito', 'e-aceite', 28000),
      precio('d1', 'd-aceite', 31000),
      precio('exito', 'e-arroz', 39900),
      precio('d1', 'd-arroz', 45900),
    )
    const c = comparativo(l, productos, precios, HOY)
    expect(c.ahorro).toBe(0)
    expect(c.frase).toContain('no ahorra nada')
  })

  it('avisa cuando faltan precios en vez de dar un total que engaña', () => {
    const precios = preciosDe(precio('exito', 'e-aceite', 28000))
    const c = comparativo(l, productos, precios, HOY)
    expect(c.frase).toContain('Falta el precio de 1 producto')
  })

  it('con la canasta sin un solo precio, lo dice en vez de reventar', () => {
    const c = comparativo(l, productos, preciosDe(), HOY)
    expect(c.frase).toContain('Todavía no hay precios')
  })

  it('con la lista vacía no propone nada', () => {
    expect(comparativo(lista([]), productos, preciosDe(), HOY).frase).toBe('La lista está vacía.')
  })
})

// ---------- el estado ----------

describe('reducer del mercado', () => {
  const base = () => {
    let e = estadoInicial()
    e = reducer(e, {
      tipo: 'producto/agregar',
      producto: { nombre: 'Leche', emoji: '🥛', unidad: 'l', contenidoRef: 1, habitual: 2 },
    })
    e = reducer(e, { tipo: 'lista/crear', nombre: 'Mercado' })
    return e
  }

  it('vincular dos veces la misma tienda reemplaza, no duplica', () => {
    let e = base()
    const id = e.productos[0].id
    e = reducer(e, { tipo: 'producto/vincular', id, vinculo: vinculo('exito', 'viejo') })
    e = reducer(e, { tipo: 'producto/vincular', id, vinculo: vinculo('exito', 'nuevo') })
    expect(e.productos[0].vinculos).toHaveLength(1)
    expect(e.productos[0].vinculos[0].sku).toBe('nuevo')
  })

  it('borrar un producto lo saca también de las listas', () => {
    let e = base()
    const id = e.productos[0].id
    const listaId = e.listas[0].id
    e = reducer(e, { tipo: 'lista/poner', id: listaId, productoId: id, cantidad: 2 })
    expect(e.listas[0].items).toHaveLength(1)
    e = reducer(e, { tipo: 'producto/borrar', id })
    expect(e.listas[0].items).toEqual([])
  })

  it('poner cantidad cero quita el producto de la lista', () => {
    let e = base()
    const id = e.productos[0].id
    const listaId = e.listas[0].id
    e = reducer(e, { tipo: 'lista/poner', id: listaId, productoId: id, cantidad: 3 })
    e = reducer(e, { tipo: 'lista/poner', id: listaId, productoId: id, cantidad: 0 })
    expect(e.listas[0].items).toEqual([])
  })

  it('limpiar la lista se lleva solo lo que ya se compró', () => {
    let e = base()
    e = reducer(e, {
      tipo: 'producto/agregar',
      producto: { nombre: 'Arroz', emoji: '🍚', unidad: 'kg', contenidoRef: 1, habitual: 1 },
    })
    const [leche, arroz] = e.productos
    const listaId = e.listas[0].id
    e = reducer(e, { tipo: 'lista/poner', id: listaId, productoId: leche.id, cantidad: 1 })
    e = reducer(e, { tipo: 'lista/poner', id: listaId, productoId: arroz.id, cantidad: 1 })
    e = reducer(e, { tipo: 'lista/marcar', id: listaId, productoId: leche.id, listo: true })
    e = reducer(e, { tipo: 'lista/limpiar', id: listaId })
    expect(e.listas[0].items.map((i) => i.productoId)).toEqual([arroz.id])
  })
})
