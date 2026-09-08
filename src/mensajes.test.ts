import { describe, expect, it } from 'vitest'
import { aNumero, esLectura, huella, leerMensaje, type Lectura, borradorIngresoDesde } from './mensajes'
import { hoy } from './format'

const leer = (texto: string, aprendidos = {}): Lectura => {
  const r = leerMensaje(texto, aprendidos)
  if (!esLectura(r)) throw new Error(`esperaba una lectura, salió ${r.error}: ${texto}`)
  return r
}

describe('aNumero', () => {
  it('entiende los formatos que usan los bancos', () => {
    expect(aNumero('45.900')).toBe(45900)
    expect(aNumero('45.900,50')).toBe(45900.5)
    expect(aNumero('45,900.00')).toBe(45900)
    expect(aNumero('1.500.000')).toBe(1500000)
    expect(aNumero('32000')).toBe(32000)
    expect(aNumero('12.500.')).toBe(12500)
  })
})

describe('Bancolombia', () => {
  it('compra con comercio, fecha y tarjeta', () => {
    const l = leer(
      'Bancolombia le informa Compra por $45.900 en EXITO SUBA 06/09/2026 15:32. T.Cred *1234. Inquietudes al 018000912345',
    )
    expect(l.monto).toBe(45900)
    expect(l.comercio).toBe('EXITO SUBA')
    expect(l.fecha).toBe('2026-09-06')
    expect(l.banco).toBe('Bancolombia')
    expect(l.tipo).toBe('compra')
    expect(l.tarjeta).toBe('1234')
    expect(l.categoria).toBe('mercado')
    expect(l.confianza).toBe('alta')
  })

  it('no se traga el cupo disponible como monto', () => {
    const l = leer('Bancolombia: Compraste $12.500 en D1 TIENDA. Cupo disponible $1.500.000')
    expect(l.monto).toBe(12500)
    expect(l.categoria).toBe('mercado')
  })

  it('compra sin fecha usa hoy', () => {
    const l = leer('Bancolombia: Compraste $32.000 en RAPPI COLOMBIA')
    expect(l.monto).toBe(32000)
    expect(l.comercio).toBe('RAPPI COLOMBIA')
    expect(l.fecha).toBe(hoy())
    expect(l.categoria).toBe('comida')
  })

  it('pago a una empresa de servicios', () => {
    const l = leer('Bancolombia le informa Pago por $120.000 a EPM desde producto *4321')
    expect(l.monto).toBe(120000)
    expect(l.comercio).toBe('EPM')
    expect(l.tipo).toBe('pago')
    expect(l.categoria).toBe('servicios')
  })

  it('retiro en cajero', () => {
    const l = leer('Bancolombia le informa Retiro por $200.000 en CAJERO CC ANDINO 06/09/2026')
    expect(l.monto).toBe(200000)
    expect(l.tipo).toBe('retiro')
    expect(l.comercio).toBe('CAJERO CC ANDINO')
    expect(l.confianza).toBe('baja') // no sabemos de qué es un retiro
  })

  it('transferencia a una persona queda en confianza baja', () => {
    const l = leer('Bancolombia: Transferiste $50.000 a JUAN PEREZ desde tu cuenta *1234')
    expect(l.monto).toBe(50000)
    expect(l.tipo).toBe('transferencia')
    expect(l.comercio).toBe('JUAN PEREZ')
    expect(l.confianza).toBe('baja')
  })

  it('pago con QR corta el comercio en el "con"', () => {
    const l = leer('Bancolombia: Pagaste $89.900 en FALABELLA CHIA con QR')
    expect(l.comercio).toBe('FALABELLA CHIA')
    expect(l.categoria).toBe('ropa')
  })

  it('acepta tildes y minúsculas', () => {
    const l = leer('Bancolombia te informa compra por $18.000 en Farmatodo Chapinero')
    expect(l.comercio).toBe('FARMATODO CHAPINERO')
    expect(l.categoria).toBe('salud')
  })
})

describe('tarjetas y billeteras', () => {
  it('RappiCard', () => {
    const l = leer('RappiCard: Compra aprobada por $28.900 en MCDONALDS CALLE 100. Cupo disponible $2.000.000')
    expect(l.monto).toBe(28900)
    expect(l.banco).toBe('RappiCard')
    expect(l.comercio).toBe('MCDONALDS CALLE 100')
    expect(l.categoria).toBe('comida')
    expect(l.confianza).toBe('alta')
  })

  it('CMR Falabella', () => {
    const l = leer('CMR Falabella: Realizaste una compra por $89.900 en ZARA UNICENTRO el 06/09/2026')
    expect(l.monto).toBe(89900)
    expect(l.banco).toBe('Falabella')
    expect(l.categoria).toBe('ropa')
  })

  it('Lulo Bank', () => {
    const l = leer('Lulo Bank: Compraste $12.000 en ARA CALLE 80.')
    expect(l.monto).toBe(12000)
    expect(l.banco).toBe('Lulo Bank')
    expect(l.categoria).toBe('mercado')
  })

  it('Nequi pago', () => {
    const l = leer('Nequi: Pagaste $15.000 en JUAN VALDEZ. Te queda $340.000')
    expect(l.monto).toBe(15000)
    expect(l.banco).toBe('Nequi')
    expect(l.categoria).toBe('comida')
  })

  it('Daviplata', () => {
    const l = leer('DaviPlata: Pagaste $30.000 en UBER TRIP 06-SEP-2026')
    expect(l.monto).toBe(30000)
    expect(l.fecha).toBe('2026-09-06')
    expect(l.categoria).toBe('transporte')
  })

  it('un banco que no conocemos igual se lee, pero con confianza baja', () => {
    const l = leer('Compra por $25.000 en NETFLIX')
    expect(l.monto).toBe(25000)
    expect(l.banco).toBe('Desconocido')
    expect(l.categoria).toBe('diversion')
    expect(l.confianza).toBe('baja')
  })

  it('monto sin signo de pesos', () => {
    const l = leer('Bancolombia: Compraste por 45900 en OLIMPICA')
    expect(l.monto).toBe(45900)
  })
})

describe('lo que hay que descartar', () => {
  const rechaza = (texto: string, motivo: string) => {
    const r = leerMensaje(texto)
    expect(esLectura(r)).toBe(false)
    if (!esLectura(r)) expect(r.error).toBe(motivo)
  }

  it('clave dinámica', () => {
    rechaza('Bancolombia: Tu clave dinamica es 483920. No compartas este codigo.', 'no-es-gasto')
  })
  it('código de verificación', () => {
    rechaza('Nequi: Tu codigo de verificacion es 8891', 'no-es-gasto')
  })
  it('publicidad', () => {
    rechaza('Bancolombia: Aprovecha tu cupo de $5.000.000 con la tarjeta que te preaprobamos', 'no-es-gasto')
  })
  it('plata que entra sin valor', () => {
    rechaza('Bancolombia: Recibiste una consignacion en tu cuenta de ahorros', 'es-ingreso')
  })
  it('mensaje sin valor', () => {
    rechaza('Bancolombia: Compraste en EXITO SUBA hoy', 'sin-monto')
  })
  it('texto que no viene al caso', () => {
    rechaza('Hola amor, ya voy en camino', 'no-es-gasto')
  })
})

describe('ingresos', () => {
  it('lo que recibes es un ingreso, y nunca de confianza alta', () => {
    const l = leer('Nequi: Recibiste $50.000 de JUAN PEREZ')
    expect(l.tipo).toBe('ingreso')
    expect(l.monto).toBe(50000)
    expect(l.comercio).toBe('JUAN PEREZ')
    expect(l.banco).toBe('Nequi')
    expect(l.confianza).toBe('baja')
    expect(l.fuenteIngreso).toBe('otro')
  })
  it('un pago recibido también', () => {
    const l = leer('Nequi: Recibiste un pago de $80.000 de MARIA')
    expect(l.tipo).toBe('ingreso')
    expect(l.monto).toBe(80000)
    expect(l.comercio).toBe('MARIA')
  })
  it('transferencia recibida en Bancolombia, cortando en "en tu cuenta"', () => {
    const l = leer('Bancolombia le informa que recibiste una transferencia por $1.200.000 de EMPRESA SAS en tu cuenta *1234')
    expect(l.tipo).toBe('ingreso')
    expect(l.monto).toBe(1200000)
    expect(l.comercio).toBe('EMPRESA SAS')
  })
  it('nómina', () => {
    const l = leer('Bancolombia: Abono a tu cuenta por $3.500.000 por concepto de NOMINA')
    expect(l.tipo).toBe('ingreso')
    expect(l.monto).toBe(3500000)
    expect(l.fuenteIngreso).toBe('nomina')
  })
  it('te llegaron', () => {
    const l = leer('Nequi: Te llegaron $20.000 de PEDRO')
    expect(l.tipo).toBe('ingreso')
    expect(l.comercio).toBe('PEDRO')
  })
  it('devolución', () => {
    const l = leer('Bancolombia: Devolucion por $45.900 de EXITO a tu tarjeta *0126')
    expect(l.tipo).toBe('ingreso')
    expect(l.fuenteIngreso).toBe('devolucion')
    expect(l.comercio).toBe('EXITO')
  })
  it('una compra sigue siendo compra aunque hable de devolución', () => {
    const l = leer('Bancolombia: Compraste $20.000 en EXITO. Devolucion pendiente de aprobar')
    expect(l.tipo).toBe('compra')
  })
  it('borrador de ingreso', () => {
    const l = leer('Nequi: Recibiste $50.000 de JUAN PEREZ')
    const b = borradorIngresoDesde(l, 'b')
    expect(b).toMatchObject({ monto: 50000, de: 'b', fuente: 'otro', nota: 'JUAN PEREZ' })
    expect(b.origen?.hash).toBe(l.hash)
  })
})

describe('memoria y huella', () => {
  it('usa la categoría que ustedes corrigieron', () => {
    const texto = 'Bancolombia: Compraste $60.000 en DONDE PACHO 06/09/2026'
    expect(leer(texto).categoria).toBe('otros')
    expect(leer(texto).confianza).toBe('baja')
    const l = leer(texto, { PACHO: 'comida' as const, DONDE: 'comida' as const })
    expect(l.categoria).toBe('comida')
    expect(l.confianza).toBe('alta')
  })

  it('el mismo mensaje tiene la misma huella aunque cambien espacios y mayúsculas', () => {
    expect(huella('Compra  por $10.000 en ARA')).toBe(huella('compra por $10.000 EN ara'))
    expect(huella('Compra por $10.000 en ARA')).not.toBe(huella('Compra por $11.000 en ARA'))
  })
})
