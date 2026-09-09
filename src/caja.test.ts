import { describe, expect, it } from 'vitest'
import type { Bolsillo, Categoria, Estado, Gasto } from './types'
import { mesAnterior, mesesEntre, sumarMeses } from './format'
import { CATEGORIAS } from './categorias'
import {
  PLANTILLAS,
  alertasBolsillos,
  avanceAvanzar,
  bolsilloDe,
  bolsillosFueraDeCasa,
  cajaDe,
  comparacion,
  disponible,
  fraseComparacion,
  mesesParaLibres,
  minimosMensuales,
  montoSugerido,
  quitarCategorias,
  reparto,
  resumenMes,
  sueldoParaVivir,
  sugerirAvanzar,
  vistaBolsillo,
  vistaUnSueldo,
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
const fueraA = bolsillo({ id: 'fueraA', ambito: 'a', categorias: ['fuera'], asignacion: 3000000 })
const fueraB = bolsillo({ id: 'fueraB', ambito: 'b', categorias: ['fuera'], asignacion: 3000000 })

/** Juan 10M, Luisa 10M; 3M cada uno fuera de casa; sobran 4M: 3M a deudas y 1M a Grecia. */
const conPlan = (extra: Partial<Estado> = {}): Estado =>
  estadoCon({
    perfil: {
      ...base().perfil,
      ingresoEsperado: { a: 10000000, b: 10000000 },
      plan: { sueldoVivir: 'menor', avanzar: { deudas: 3000000, ahorro: 1000000 } },
    },
    bolsillos: [mercado, salidas, resto, antojosA, fueraA, fueraB],
    ...extra,
  })

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
  it('las del hogar cubren todas las categorías de vivir exactamente una vez', () => {
    const todas = PLANTILLAS.filter((p) => p.ambito === 'hogar').flatMap((p) => p.categorias)
    const esperadas: Categoria[] = CATEGORIAS.map((c) => c.id).filter((c) => c !== 'fuera')
    expect([...todas].sort()).toEqual([...esperadas].sort())
  })
  it('monto sugerido: redondea a miles sobre el sueldo con el que se vive', () => {
    expect(montoSugerido(PLANTILLAS[0], 3333333)).toBe(1000000) // 30%
    expect(montoSugerido(PLANTILLAS[6], 3333333)).toBe(167000) // 5%
  })
  it('bolsillos fuera de casa: uno por persona con monto', () => {
    const lista = bolsillosFueraDeCasa({ a: 3000000, b: 0 }, '2026-09')
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ ambito: 'a', asignacion: 3000000, categorias: ['fuera'], acumula: false, desde: '2026-09' })
  })
})

// ---------- las tres cajas ----------

describe('obligaciones fuera de casa', () => {
  it('un gasto fuera personal cae en el bolsillo de obligaciones de quien pagó', () => {
    const g = gasto({ monto: 3000000, categoria: 'fuera', compartido: false, pagadoPor: 'a' })
    expect(bolsilloDe(g, [resto, antojosA, fueraA])?.id).toBe('fueraA')
  })
  it('sin bolsillo de obligaciones, nunca cae al comodín', () => {
    const g = gasto({ monto: 3000000, categoria: 'fuera', compartido: false, pagadoPor: 'b' })
    expect(bolsilloDe(g, [resto, antojosA, fueraA])).toBeNull()
    const compartido = gasto({ monto: 500000, categoria: 'fuera' })
    expect(bolsilloDe(compartido, [resto, fueraA, fueraB])).toBeNull()
  })
  it('cajaDe: por categoría, por bolsillo elegido a mano, y vivir para lo demás', () => {
    const bolsillos = [mercado, resto, fueraA]
    expect(cajaDe(gasto({ monto: 1, categoria: 'fuera' }), bolsillos)).toBe('fuera')
    expect(cajaDe(gasto({ monto: 1, categoria: 'comida', compartido: false, bolsilloId: 'fueraA' }), bolsillos)).toBe('fuera')
    expect(cajaDe(gasto({ monto: 1, categoria: 'comida' }), bolsillos)).toBe('vivir')
  })
})

describe('alertas', () => {
  it('una obligación cumplida completa no avisa; pasada, sí', () => {
    const exacta = conPlan({ gastos: [gasto({ monto: 3000000, categoria: 'fuera', compartido: false, pagadoPor: 'a' })] })
    expect(alertasBolsillos(exacta, '2026-09').map((v) => v.bolsillo.id)).toEqual([])
    const pasada = conPlan({ gastos: [gasto({ monto: 3500000, categoria: 'fuera', compartido: false, pagadoPor: 'a' })] })
    expect(alertasBolsillos(pasada, '2026-09').map((v) => v.bolsillo.id)).toEqual(['fueraA'])
  })
})

describe('vivir con un sueldo', () => {
  it('el sueldo menor, uno explícito, uno en cero, ninguno', () => {
    const perfil = base().perfil
    expect(sueldoParaVivir({ ...perfil, ingresoEsperado: { a: 10000000, b: 8000000 } })).toEqual({ persona: 'b', monto: 8000000 })
    expect(sueldoParaVivir({ ...perfil, ingresoEsperado: { a: 10000000, b: 8000000 }, plan: { sueldoVivir: 'a', avanzar: { deudas: 0, ahorro: 0 } } })).toEqual({ persona: 'a', monto: 10000000 })
    expect(sueldoParaVivir({ ...perfil, ingresoEsperado: { a: 0, b: 8000000 } })).toEqual({ persona: 'b', monto: 8000000 })
    expect(sueldoParaVivir(perfil)).toEqual({ persona: null, monto: 0 })
  })
  it('cuenta todo lo que no sea fuera de casa, con o sin bolsillo, solo del mes', () => {
    const e = conPlan({
      gastos: [
        gasto({ monto: 3000000, categoria: 'fuera', compartido: false, pagadoPor: 'a' }),
        gasto({ monto: 500000, categoria: 'fuera' }), // compartido, sin bolsillo, igual es fuera
        gasto({ monto: 6000000, categoria: 'mercado' }),
        gasto({ monto: 400000, categoria: 'ropa', compartido: false, pagadoPor: 'b' }), // sin bolsillo de b: vivir
        gasto({ monto: 999999, categoria: 'mercado', fecha: '2026-08-20' }),
      ],
    })
    const v = vistaUnSueldo(e, '2026-09')
    expect(v.persona).toBe('a')
    expect(v.tope).toBe(10000000)
    expect(v.gastado).toBe(6400000)
    expect(v.disponible).toBe(3600000)
    expect(v.estado).toBe('bien')
  })
  it('semáforo: amarillo desde el 80%, rojo al pasarse', () => {
    const amarillo = vistaUnSueldo(conPlan({ gastos: [gasto({ monto: 8500000 })] }), '2026-09')
    expect(amarillo.estado).toBe('amarillo')
    const rojo = vistaUnSueldo(conPlan({ gastos: [gasto({ monto: 10500000 })] }), '2026-09')
    expect(rojo.estado).toBe('rojo')
    expect(rojo.avance).toBe(100)
    const vacio = vistaUnSueldo(base(), '2026-09')
    expect(vacio).toMatchObject({ tope: 0, avance: 0, estado: 'bien' })
  })
})

describe('reparto del mes', () => {
  it('entra 20 → fuera 6 → vivir 10 → avanzar 4', () => {
    const r = reparto(
      conPlan({
        gastos: [gasto({ monto: 3000000, categoria: 'fuera', compartido: false, pagadoPor: 'a' }), gasto({ monto: 2000000 })],
        deudas: [{ id: 'd', nombre: 'TC', de: 'a', montoInicial: 5000000, tasaMensual: 2, pagoMinimo: 300000, creadaEn: '2026-01-01', abonos: [{ id: 'x', fecha: '2026-09-05', monto: 1000000, por: 'b' }] }],
      }),
      '2026-09',
    )
    expect(r.entra).toBe(20000000)
    expect(r.fuera.plan).toBe(6000000)
    expect(r.fuera.real).toBe(3000000)
    expect(r.fuera.porPersona.a).toEqual({ plan: 3000000, real: 3000000 })
    expect(r.fuera.porPersona.b).toEqual({ plan: 3000000, real: 0 })
    expect(r.vivir.tope).toBe(10000000)
    expect(r.vivir.asignado).toBe(400000) // mercado, salidas, resto, antojosA a 100k
    expect(r.vivir.colchon).toBe(9600000)
    expect(r.vivir.gastado).toBe(2000000)
    expect(r.avanzar).toEqual({ plan: 4000000, deudas: 3000000, ahorro: 1000000, real: 1000000, sinRepartir: 0 })
  })
  it('no cierra cuando obligaciones + un sueldo superan lo que entra', () => {
    const e = conPlan({ perfil: { ...base().perfil, ingresoEsperado: { a: 2000000, b: 5000000 } } })
    expect(reparto(e, '2026-09').avanzar.plan).toBe(-1000000)
  })
})

describe('avanzar en equipo', () => {
  const deudas: Estado['deudas'] = [
    { id: 'd1', nombre: 'TC Juan', de: 'a', montoInicial: 4000000, tasaMensual: 2, pagoMinimo: 200000, creadaEn: '2026-01-01', abonos: [{ id: 'x', fecha: '2026-09-05', monto: 1500000, por: 'a' }, { id: 'y', fecha: '2026-08-05', monto: 500000, por: 'a' }] },
    { id: 'd2', nombre: 'Crédito', de: 'b', montoInicial: 5000000, tasaMensual: 1.5, pagoMinimo: 400000, creadaEn: '2026-01-01', abonos: [{ id: 'z', fecha: '2026-09-07', monto: 900000, por: 'b' }] },
    { id: 'd3', nombre: 'Pagada', de: 'ambos', montoInicial: 100000, tasaMensual: 0, pagoMinimo: 50000, creadaEn: '2026-01-01', abonos: [{ id: 'w', fecha: '2026-07-01', monto: 100000, por: 'a' }] },
  ]
  it('abonos y aportes del mes, por persona', () => {
    const e = conPlan({
      deudas,
      metas: [
        { id: 'm', titulo: 'Grecia', descripcion: '', emoji: '🇬🇷', fecha: '2027-06-01', montoObjetivo: 30000000, color: '', fija: true, aportes: [{ id: 'a1', fecha: '2026-09-02', monto: 600000, por: 'b' }, { id: 'a2', fecha: '2026-08-02', monto: 600000, por: 'b' }] },
      ],
    })
    const av = avanceAvanzar(e, '2026-09')
    expect(av).toEqual({ metaDeudas: 3000000, abonos: 2400000, abonosPor: { a: 1500000, b: 900000 }, metaAhorro: 1000000, aportes: 600000, aportesPor: { a: 0, b: 600000 } })
  })
  it('mínimos solo de las que aún deben', () => {
    expect(minimosMensuales(deudas)).toBe(600000)
  })
  it('meses para quedar libres, sin intereses', () => {
    // saldo: 4M − 2M + 5M − 0.9M = 6.1M
    expect(mesesParaLibres(deudas, 3000000)).toBe(3)
    expect(mesesParaLibres(deudas, 0)).toBeNull()
    expect(mesesParaLibres([deudas[2]], 0)).toBe(0)
    expect(sumarMeses('2026-11', 3)).toBe('2027-02')
    expect(sumarMeses('2026-09', 14)).toBe('2027-11')
  })
  it('sugerencia: tres cuartos a deudas, nunca menos que los mínimos, nunca más que lo que sobra', () => {
    expect(sugerirAvanzar(4000000, 600000)).toEqual({ deudas: 3000000, ahorro: 1000000 })
    expect(sugerirAvanzar(4000000, 3500000)).toEqual({ deudas: 3500000, ahorro: 500000 })
    expect(sugerirAvanzar(1000000, 2000000)).toEqual({ deudas: 1000000, ahorro: 0 })
    expect(sugerirAvanzar(0, 600000)).toEqual({ deudas: 0, ahorro: 0 })
  })
})
