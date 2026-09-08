import { describe, expect, it } from 'vitest'
import type { Bolsillo, Categoria, Estado, Gasto } from './types'
import { mesAnterior, mesesEntre } from './format'
import {
  PLANTILLAS,
  alertasBolsillos,
  bolsilloDe,
  comparacion,
  disponible,
  fraseComparacion,
  montoSugerido,
  quitarCategorias,
  resumenMes,
  vistaBolsillo,
} from './caja'

// ---------- armado rápido ----------

const base = (): Estado => ({
  version: 1,
  perfil: { nombreA: 'Juan', nombreB: 'Luisa', nombrePareja: 'Los dos', moneda: 'COP', onboarded: true },
  gastos: [],
  facturas: [],
  deudas: [],
  retos: [],
  metas: [],
  fotos: [],
  bolsillos: [],
  ingresos: [],
})

const estadoCon = (extra: Partial<Estado>): Estado => ({ ...base(), ...extra })

let n = 0
const gasto = (p: Partial<Gasto> & { monto: number }): Gasto => ({
  id: `g${++n}`,
  fecha: '2026-09-10',
  categoria: 'mercado',
  pagadoPor: 'a',
  compartido: true,
  nota: '',
  ...p,
})

const bolsillo = (p: Partial<Bolsillo> & { id: string }): Bolsillo => ({
  nombre: p.id,
  emoji: '💰',
  ambito: 'hogar',
  asignacion: 100000,
  acumula: false,
  categorias: [],
  saldoInicial: 0,
  desde: '2026-09',
  ajustes: [],
  ...p,
})

const mercado = bolsillo({ id: 'mercado', categorias: ['mercado', 'hogar'] })
const salidas = bolsillo({ id: 'salidas', categorias: ['comida', 'diversion'] })
const resto = bolsillo({ id: 'resto' }) // comodín del hogar
const antojosA = bolsillo({ id: 'antojosA', ambito: 'a' })

// ---------- meses ----------

describe('meses', () => {
  it('mes anterior', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12')
    expect(mesAnterior('2026-09')).toBe('2026-08')
  })
  it('meses entre, contando los extremos', () => {
    expect(mesesEntre('2026-09', '2026-09')).toBe(1)
    expect(mesesEntre('2026-07', '2026-09')).toBe(3)
    expect(mesesEntre('2025-11', '2026-02')).toBe(4)
    expect(mesesEntre('2026-09', '2026-08')).toBe(0)
  })
})

// ---------- a qué bolsillo va ----------

describe('bolsilloDe', () => {
  const bolsillos = [mercado, salidas, resto, antojosA]

  it('por categoría dentro del ámbito', () => {
    expect(bolsilloDe(gasto({ monto: 1, categoria: 'comida' }), bolsillos)?.id).toBe('salidas')
    expect(bolsilloDe(gasto({ monto: 1, categoria: 'hogar' }), bolsillos)?.id).toBe('mercado')
  })
  it('compartido va al hogar; personal va al bolsillo de quien pagó', () => {
    expect(bolsilloDe(gasto({ monto: 1, categoria: 'comida', compartido: false, pagadoPor: 'a' }), bolsillos)?.id).toBe('antojosA')
  })
  it('cae al comodín si nadie tiene esa categoría', () => {
    expect(bolsilloDe(gasto({ monto: 1, categoria: 'ropa' }), bolsillos)?.id).toBe('resto')
  })
  it('sin comodín ni categoría: ninguno', () => {
    expect(bolsilloDe(gasto({ monto: 1, categoria: 'ropa', compartido: false, pagadoPor: 'b' }), bolsillos)).toBeNull()
  })
  it('el elegido a mano gana, incluso de otro ámbito', () => {
    expect(bolsilloDe(gasto({ monto: 1, categoria: 'comida', bolsilloId: 'antojosA' }), bolsillos)?.id).toBe('antojosA')
  })
  it('un id que ya no existe vuelve a lo automático', () => {
    expect(bolsilloDe(gasto({ monto: 1, categoria: 'comida', bolsilloId: 'borrado' }), bolsillos)?.id).toBe('salidas')
  })
})

describe('quitarCategorias', () => {
  it('se la quita a los del mismo ámbito, no a los personales', () => {
    const personal = bolsillo({ id: 'p', ambito: 'a', categorias: ['comida'] })
    const nuevo = bolsillo({ id: 'nuevo', categorias: ['comida'] })
    const r = quitarCategorias([mercado, salidas, personal], nuevo)
    expect(r.find((b) => b.id === 'salidas')?.categorias).toEqual(['diversion'])
    expect(r.find((b) => b.id === 'p')?.categorias).toEqual(['comida'])
    expect(r.find((b) => b.id === 'mercado')?.categorias).toEqual(['mercado', 'hogar'])
  })
})

// ---------- disponible ----------

describe('disponible · se reinicia', () => {
  const gastos = [
    gasto({ monto: 30000, fecha: '2026-09-02' }),
    gasto({ monto: 20000, fecha: '2026-09-20' }),
    gasto({ monto: 99000, fecha: '2026-08-15' }), // otro mes: no cuenta
  ]
  it('asignación menos lo gastado en el mes', () => {
    expect(disponible(mercado, gastos, [mercado], '2026-09')).toBe(50000)
  })
  it('un ajuste solo pesa en su mes', () => {
    const b = { ...mercado, ajustes: [{ id: 'x', fecha: '2026-09-05', monto: 10000, nota: '' }, { id: 'y', fecha: '2026-10-05', monto: 5000, nota: '' }] }
    expect(disponible(b, gastos, [b], '2026-09')).toBe(60000)
    expect(disponible(b, gastos, [b], '2026-10')).toBe(105000)
  })
  it('antes de existir, cero', () => {
    expect(disponible(mercado, gastos, [mercado], '2026-08')).toBe(0)
  })
})

describe('disponible · acumula', () => {
  const b = bolsillo({ id: 'ahorro', acumula: true, asignacion: 100000, saldoInicial: 50000, desde: '2026-07', categorias: ['viajes'] })
  const gastos = [
    gasto({ monto: 30000, fecha: '2026-07-10', categoria: 'viajes' }),
    gasto({ monto: 40000, fecha: '2026-09-10', categoria: 'viajes' }),
    gasto({ monto: 999999, fecha: '2026-06-10', categoria: 'viajes' }), // antes de `desde`
  ]
  it('arrastra lo que sobra', () => {
    // 50.000 + 100.000×3 meses − 70.000
    expect(disponible(b, gastos, [b], '2026-09')).toBe(280000)
    expect(disponible(b, gastos, [b], '2026-07')).toBe(120000)
  })
  it('un ajuste del mes 1 sigue pesando en el mes 3', () => {
    const c = { ...b, ajustes: [{ id: 'x', fecha: '2026-07-20', monto: -20000, nota: '' }] }
    expect(disponible(c, gastos, [c], '2026-09')).toBe(260000)
  })
})

describe('vistaBolsillo y alertas', () => {
  it('bien / amarillo / rojo', () => {
    const e = estadoCon({ bolsillos: [mercado] })
    expect(vistaBolsillo(mercado, { ...e, gastos: [gasto({ monto: 10000 })] }, '2026-09').estado).toBe('bien')
    expect(vistaBolsillo(mercado, { ...e, gastos: [gasto({ monto: 85000 })] }, '2026-09').estado).toBe('amarillo')
    const rojo = vistaBolsillo(mercado, { ...e, gastos: [gasto({ monto: 130000 })] }, '2026-09')
    expect(rojo.estado).toBe('rojo')
    expect(rojo.avance).toBe(100)
  })
  it('el tope de un acumula incluye el arrastre', () => {
    const b = bolsillo({ id: 'x', acumula: true, saldoInicial: 50000, desde: '2026-08', categorias: ['mercado'] })
    const v = vistaBolsillo(b, estadoCon({ bolsillos: [b], gastos: [gasto({ monto: 10000 })] }), '2026-09')
    expect(v.tope).toBe(250000)
    expect(v.disponible).toBe(240000)
  })
  it('solo lista los que no están bien', () => {
    const e = estadoCon({ bolsillos: [mercado, salidas], gastos: [gasto({ monto: 130000 })] })
    expect(alertasBolsillos(e, '2026-09').map((v) => v.bolsillo.id)).toEqual(['mercado'])
  })
})

// ---------- resumen del mes ----------

describe('resumenMes', () => {
  const e = estadoCon({
    perfil: { ...base().perfil, ingresoEsperado: { a: 4000000, b: 3000000 } },
    gastos: [gasto({ monto: 150000 }), gasto({ monto: 50000, fecha: '2026-08-01' })],
    facturas: [
      { id: 'f1', nombre: 'Luz', monto: 90000, diaVence: 10, responsable: 'ambos', pagadaEn: [], activa: true },
      { id: 'f2', nombre: 'Internet', monto: 80000, diaVence: 5, responsable: 'ambos', pagadaEn: ['2026-09'], activa: true },
      { id: 'f3', nombre: 'Vieja', monto: 1, diaVence: 5, responsable: 'ambos', pagadaEn: [], activa: false },
    ],
    deudas: [
      { id: 'd1', nombre: 'Tarjeta', de: 'a', montoInicial: 1000000, tasaMensual: 0, pagoMinimo: 100000, abonos: [], creadaEn: '2026-01-01' },
      { id: 'd2', nombre: 'Abonada', de: 'a', montoInicial: 500000, tasaMensual: 0, pagoMinimo: 50000, abonos: [{ id: 'a', fecha: '2026-09-03', monto: 60000, por: 'a' }], creadaEn: '2026-01-01' },
      { id: 'd3', nombre: 'Pagada', de: 'a', montoInicial: 100, tasaMensual: 0, pagoMinimo: 10, abonos: [{ id: 'b', fecha: '2026-01-03', monto: 100, por: 'a' }], creadaEn: '2026-01-01' },
    ],
    metas: [{ id: 'm', titulo: 'Grecia', descripcion: '', emoji: '', fecha: '2027-06-15', montoObjetivo: 1, aportes: [{ id: 'x', fecha: '2026-09-04', monto: 200000, por: 'b' }], color: '', fija: true }],
    bolsillos: [mercado, salidas],
  })

  it('sin ingresos reales planea con el esperado', () => {
    const r = resumenMes(e, '2026-09')
    expect(r.usaEsperado).toBe(true)
    expect(r.base).toBe(7000000)
    expect(r.gastado).toBe(150000)
    expect(r.abonos).toBe(60000)
    expect(r.aportes).toBe(200000)
    expect(r.salidas).toBe(410000)
    expect(r.queda).toBe(6590000)
  })
  it('comprometido: facturas sin pagar y mínimos sin abono, sin duplicar', () => {
    const r = resumenMes(e, '2026-09')
    expect(r.facturasPendientes).toBe(90000)
    expect(r.minimosDeuda).toBe(100000)
    expect(r.libre).toBe(6590000 - 190000)
  })
  it('los ingresos reales mandan sobre el esperado', () => {
    const r = resumenMes({ ...e, ingresos: [{ id: 'i', fecha: '2026-09-01', monto: 4000000, de: 'a', fuente: 'nomina', nota: '' }] }, '2026-09')
    expect(r.usaEsperado).toBe(false)
    expect(r.base).toBe(4000000)
    expect(r.porPersona).toEqual({ a: 4000000, b: 0 })
  })
  it('asignado y sin asignar', () => {
    const r = resumenMes(e, '2026-09')
    expect(r.asignado).toBe(200000)
    expect(r.sinAsignar).toBe(6800000)
  })
})

// ---------- comparación ----------

describe('comparacion', () => {
  const e = estadoCon({
    gastos: [
      gasto({ monto: 100000, fecha: '2026-08-05', categoria: 'mercado' }),
      gasto({ monto: 50000, fecha: '2026-08-06', categoria: 'comida' }),
      gasto({ monto: 30000, fecha: '2026-08-25', categoria: 'comida' }),
      gasto({ monto: 100000, fecha: '2026-09-05', categoria: 'mercado' }),
      gasto({ monto: 120000, fecha: '2026-09-06', categoria: 'comida' }),
    ],
  })
  const nombre = (c: Categoria) => c
  const dinero = (n: number) => `$${n}`

  it('sin mes anterior no hay frase', () => {
    const c = comparacion(estadoCon({ gastos: [gasto({ monto: 1 })] }), '2026-09')
    expect(c.hayAnterior).toBe(false)
    expect(fraseComparacion(c, nombre, dinero)).toBeNull()
  })
  it('mes completo contra mes completo', () => {
    const c = comparacion(e, '2026-09')
    expect(c.gastadoAnterior).toBe(180000)
    expect(c.gastadoActual).toBe(220000)
    expect(c.deltaPct).toBe(22)
    expect(c.subio).toEqual({ categoria: 'comida', delta: 40000 })
    expect(c.bajo).toBeNull()
    expect(fraseComparacion(c, nombre, dinero)).toBe('Van 22% por encima del mes pasado. Subió comida (+$40000).')
  })
  it('a medias: solo hasta el mismo día', () => {
    const c = comparacion(e, '2026-09', 10)
    expect(c.gastadoAnterior).toBe(150000)
    expect(c.parcial).toBe(true)
    expect(fraseComparacion(c, nombre, dinero)).toContain('a esta altura')
  })
  it('igual dentro del ±3%', () => {
    const c = comparacion(estadoCon({ gastos: [gasto({ monto: 100000, fecha: '2026-08-01' }), gasto({ monto: 102000, fecha: '2026-09-01' })] }), '2026-09')
    expect(fraseComparacion(c, nombre, dinero)).toBe('Van igual que el mes pasado.')
  })
})

// ---------- plantillas ----------

describe('plantillas', () => {
  it('las del hogar cubren las 11 categorías exactamente una vez', () => {
    const todas = PLANTILLAS.filter((p) => p.ambito === 'hogar').flatMap((p) => p.categorias)
    const esperadas: Categoria[] = ['mercado', 'comida', 'transporte', 'hogar', 'servicios', 'salud', 'diversion', 'ropa', 'regalos', 'viajes', 'otros']
    expect([...todas].sort()).toEqual([...esperadas].sort())
  })
  it('monto sugerido: redondea a miles y usa el ingreso correcto', () => {
    const ingresos = { a: 4000000, b: 3333333 }
    expect(montoSugerido(PLANTILLAS[0], ingresos)).toBe(2200000) // 30% de 7.333.333
    expect(montoSugerido(PLANTILLAS[6], ingresos)).toBe(167000) // 5% de lo de b
  })
})
