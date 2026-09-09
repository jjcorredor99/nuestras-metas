import { useState } from 'react'
import { useStore, nombreDe } from '../store'
import type { Persona } from '../types'
import { dinero, mesActual, nombreMes, sumarMeses } from '../format'
import {
  PLANTILLAS,
  bolsillosDesdePlantillas,
  bolsillosFueraDeCasa,
  esFueraDeCasa,
  mesesParaLibres,
  minimosMensuales,
  montoSugerido,
  sugerirAvanzar,
  vigentes,
} from '../caja'
import { Modal, Campo, InputMonto, Segmento } from './ui'

type Paso = 1 | 2 | 3 | 4

/**
 * Primera vez en la Caja: cuánto entra, qué sale primero, con qué sueldo se vive y a dónde va lo que sobra.
 * En modo 'plan' la caja ya existe (bolsillos de antes) y solo falta la regla: no se crean bolsillos de vivir.
 */
export function ArmarCaja({ onCerrar, modo = 'completo' }: { onCerrar: () => void; modo?: 'completo' | 'plan' }) {
  const { estado, dispatch } = useStore()
  const { perfil, deudas } = estado
  const mes = mesActual()
  const existentes = vigentes(estado, mes)
  const yaTieneFuera = (p: Persona) => existentes.some((b) => b.ambito === p && esFueraDeCasa(b))

  const [paso, setPaso] = useState<Paso>(1)
  const [ingresos, setIngresos] = useState({
    a: perfil.ingresoEsperado?.a ?? 0,
    b: perfil.ingresoEsperado?.b ?? 0,
  })
  const [fuera, setFuera] = useState<Record<Persona, number>>({
    a: existentes.filter((b) => b.ambito === 'a' && esFueraDeCasa(b)).reduce((acc, b) => acc + b.asignacion, 0),
    b: existentes.filter((b) => b.ambito === 'b' && esFueraDeCasa(b)).reduce((acc, b) => acc + b.asignacion, 0),
  })
  const [sueldoVivir, setSueldoVivir] = useState<Persona | 'menor'>(perfil.plan?.sueldoVivir ?? 'menor')
  const [filas, setFilas] = useState<{ on: boolean; monto: number }[]>([])
  const [avanzar, setAvanzar] = useState(perfil.plan?.avanzar ?? { deudas: 0, ahorro: 0 })

  const nombre = (p: Persona) => nombreDe(perfil, p)
  const total = ingresos.a + ingresos.b
  const totalFuera = fuera.a + fuera.b

  // El sueldo con el que se vive, según lo que hay escrito en este momento.
  const sueldo = (() => {
    if (sueldoVivir !== 'menor') return { persona: sueldoVivir, monto: ingresos[sueldoVivir] }
    if (ingresos.a <= 0) return { persona: 'b' as Persona, monto: ingresos.b }
    if (ingresos.b <= 0) return { persona: 'a' as Persona, monto: ingresos.a }
    return ingresos.a <= ingresos.b ? { persona: 'a' as Persona, monto: ingresos.a } : { persona: 'b' as Persona, monto: ingresos.b }
  })()

  const asignadoVivir =
    modo === 'plan'
      ? existentes.filter((b) => !esFueraDeCasa(b)).reduce((acc, b) => acc + b.asignacion, 0)
      : filas.reduce((acc, f) => acc + (f.on ? f.monto : 0), 0)
  const colchon = sueldo.monto - asignadoVivir
  const sobra = total - totalFuera - sueldo.monto
  const minimos = minimosMensuales(deudas)
  const meses = mesesParaLibres(deudas, avanzar.deudas)
  const sinRepartir = sobra - avanzar.deudas - avanzar.ahorro

  const irA = (p: Paso) => {
    if (p === 3 && filas.length === 0) setFilas(PLANTILLAS.map((pl) => ({ on: true, monto: montoSugerido(pl, sueldo.monto) })))
    if (p === 4 && avanzar.deudas === 0 && avanzar.ahorro === 0) setAvanzar(sugerirAvanzar(sobra, minimos))
    setPaso(p)
  }

  const recalcularFilas = (base: number) => setFilas(PLANTILLAS.map((pl) => ({ on: true, monto: montoSugerido(pl, base) })))

  const crear = () => {
    const nuevos = bolsillosFueraDeCasa({ a: yaTieneFuera('a') ? 0 : fuera.a, b: yaTieneFuera('b') ? 0 : fuera.b }, mes)
    if (modo === 'completo') {
      const elegidas = PLANTILLAS.map((plantilla, i) => ({ plantilla, ...filas[i] }))
        .filter((f) => f.on && f.monto > 0)
        .map(({ plantilla, monto }) => ({ plantilla, monto }))
      nuevos.push(...bolsillosDesdePlantillas(elegidas, mes))
    }
    dispatch({ tipo: 'perfil', perfil: { ingresoEsperado: ingresos, plan: { sueldoVivir, avanzar } } })
    if (nuevos.length > 0) dispatch({ tipo: 'bolsillo/crearVarios', bolsillos: nuevos })
    onCerrar()
  }

  const titulos: Record<Paso, string> = {
    1: '¿Cuánto entra al mes?',
    2: 'Obligaciones fuera de casa',
    3: 'Vivir con un sueldo',
    4: 'Lo que sobra',
  }

  return (
    <Modal titulo={titulos[paso]} onCerrar={onCerrar}>
      <p className="mini suave" style={{ marginBottom: 10 }}>
        Paso {paso} de 4
      </p>

      {paso === 1 && (
        <div className="pila">
          <p className="chica suave">
            Lo que cada uno espera recibir en un mes normal. Con eso armamos la regla; los ingresos reales se anotan
            aparte cuando lleguen.
          </p>
          <Campo label={`Ingreso mensual de ${nombre('a')}`}>
            <InputMonto autoFocus valor={ingresos.a} onCambio={(a) => setIngresos({ ...ingresos, a })} />
          </Campo>
          <Campo label={`Ingreso mensual de ${nombre('b')}`}>
            <InputMonto valor={ingresos.b} onCambio={(b) => setIngresos({ ...ingresos, b })} />
          </Campo>
          <div className="acciones">
            <button className="btn" disabled={total <= 0} onClick={() => irA(2)}>
              Siguiente
            </button>
          </div>
        </div>
      )}

      {paso === 2 && (
        <div className="pila">
          <p className="chica suave">
            Lo que cada uno manda a su familia u otras obligaciones fijas por fuera de la casa. Sale primero, antes de
            repartir cualquier cosa. Cada uno tendrá su bolsillo 📤.
          </p>
          <Campo label={`De ${nombre('a')}`}>
            <InputMonto autoFocus valor={fuera.a} onCambio={(a) => setFuera({ ...fuera, a })} />
          </Campo>
          <Campo label={`De ${nombre('b')}`}>
            <InputMonto valor={fuera.b} onCambio={(b) => setFuera({ ...fuera, b })} />
          </Campo>
          <p className="chica suave">
            Quedan <b>{dinero(total - totalFuera, perfil.moneda)}</b> de {dinero(total, perfil.moneda)} para la casa y para avanzar.
          </p>
          <div className="acciones">
            <button className="btn fantasma" onClick={() => setPaso(1)}>
              Atrás
            </button>
            <button className="btn" disabled={totalFuera >= total} onClick={() => irA(3)}>
              Siguiente
            </button>
          </div>
        </div>
      )}

      {paso === 3 && (
        <div className="pila">
          <p className="chica suave">
            La regla: la casa vive con <b>un solo sueldo</b>. El otro se va entero a deudas y a Grecia.
          </p>
          <Campo label="¿Con cuál?">
            <Segmento<Persona | 'menor'>
              opciones={[
                { valor: 'menor', texto: 'El menor' },
                { valor: 'a', texto: nombre('a') },
                { valor: 'b', texto: nombre('b') },
              ]}
              valor={sueldoVivir}
              onCambio={(v) => {
                setSueldoVivir(v)
                const base = v === 'menor' ? Math.min(...[ingresos.a, ingresos.b].filter((x) => x > 0)) : ingresos[v]
                if (modo === 'completo') recalcularFilas(base)
              }}
            />
          </Campo>
          <div className="tarjeta oliva">
            <span className="etiqueta">Vivimos con el sueldo de {sueldo.persona ? nombre(sueldo.persona) : '—'}</span>
            <div className="cifra">{dinero(sueldo.monto, perfil.moneda)}</div>
          </div>

          {modo === 'completo' ? (
            <>
              <p className="chica suave">Una propuesta para repartirlo. Cambia los montos o apaga los que no quieran; después se pueden crear más.</p>
              {PLANTILLAS.map((p, i) => {
                const f = filas[i]
                if (!f) return null
                const titulo = p.ambito === 'hogar' ? p.nombre : `${p.nombre} · ${nombre(p.ambito)}`
                return (
                  <div className="item" key={i} style={{ opacity: f.on ? 1 : 0.5 }}>
                    <button
                      type="button"
                      className={`check ${f.on ? 'on' : ''}`}
                      aria-label={f.on ? 'Quitar' : 'Incluir'}
                      onClick={() => setFilas(filas.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                    >
                      {f.on ? '✓' : ''}
                    </button>
                    <div className="cuerpo">
                      <div className="titulo">
                        {p.emoji} {titulo}
                      </div>
                      <div className="mini suave">
                        {p.categorias.length ? p.categorias.join(', ') : 'lo que no tenga bolsillo'} ·{' '}
                        {p.acumula ? 'guarda lo que sobra' : 'se reinicia cada mes'}
                      </div>
                    </div>
                    <div style={{ width: 108, flexShrink: 0 }}>
                      <InputMonto valor={f.monto} onCambio={(monto) => setFilas(filas.map((x, j) => (j === i ? { ...x, monto } : x)))} />
                    </div>
                  </div>
                )
              })}
            </>
          ) : (
            <>
              <p className="chica suave">Los bolsillos que ya tienen siguen igual; ahora cuentan contra ese sueldo.</p>
              {existentes
                .filter((b) => !esFueraDeCasa(b))
                .map((b) => (
                  <div className="fila entre chica" key={b.id}>
                    <span>
                      {b.emoji} {b.nombre}
                      {b.ambito !== 'hogar' && <span className="suave"> · {nombre(b.ambito)}</span>}
                    </span>
                    <span className="negrita">{dinero(b.asignacion, perfil.moneda)}</span>
                  </div>
                ))}
            </>
          )}

          <p className={`chica ${colchon < 0 ? 'negrita' : 'suave'}`} style={colchon < 0 ? { color: 'var(--alerta)' } : undefined}>
            {colchon >= 0
              ? `Quedan ${dinero(colchon, perfil.moneda)} del sueldo sin bolsillo, de colchón para lo que se salga del plan.`
              : `Te pasaste del sueldo por ${dinero(-colchon, perfil.moneda)}. Baja algún monto.`}
          </p>
          <div className="acciones">
            <button className="btn fantasma" onClick={() => setPaso(2)}>
              Atrás
            </button>
            <button className="btn" disabled={sueldo.monto <= 0} onClick={() => irA(4)}>
              Siguiente
            </button>
          </div>
        </div>
      )}

      {paso === 4 && (
        <div className="pila">
          {sobra <= 0 ? (
            <div className="tarjeta coral">
              <span className="etiqueta">No cierra</span>
              <p className="chica" style={{ marginTop: 4 }}>
                Obligaciones ({dinero(totalFuera, perfil.moneda)}) más un sueldo ({dinero(sueldo.monto, perfil.moneda)}) superan lo
                que entra ({dinero(total, perfil.moneda)}). Vuelve atrás y ajusta.
              </p>
            </div>
          ) : (
            <>
              <div className="tarjeta oliva">
                <span className="etiqueta">Para avanzar cada mes</span>
                <div className="cifra">{dinero(sobra, perfil.moneda)}</div>
                <p className="mini suave" style={{ marginTop: 2 }}>
                  {dinero(total, perfil.moneda)} − obligaciones {dinero(totalFuera, perfil.moneda)} − un sueldo {dinero(sueldo.monto, perfil.moneda)}
                </p>
              </div>
              <p className="chica suave">¿Cómo lo reparten? Las deudas se atacan en equipo: no importa de quién sea cada una.</p>
              <Campo label="💪 A las deudas">
                <InputMonto autoFocus valor={avanzar.deudas} onCambio={(deudas) => setAvanzar({ ...avanzar, deudas })} />
              </Campo>
              {minimos > 0 && avanzar.deudas < minimos && (
                <p className="mini negrita" style={{ color: 'var(--alerta)' }}>
                  Los mínimos de este mes suman {dinero(minimos, perfil.moneda)}.
                </p>
              )}
              <Campo label="✈️ A Grecia y al ahorro">
                <InputMonto valor={avanzar.ahorro} onCambio={(ahorro) => setAvanzar({ ...avanzar, ahorro })} />
              </Campo>
              <p className={`chica ${sinRepartir < 0 ? 'negrita' : 'suave'}`} style={sinRepartir < 0 ? { color: 'var(--alerta)' } : undefined}>
                {sinRepartir === 0
                  ? 'Repartido completo.'
                  : sinRepartir > 0
                    ? `Quedan ${dinero(sinRepartir, perfil.moneda)} sin repartir.`
                    : `Te pasaste por ${dinero(-sinRepartir, perfil.moneda)}.`}
              </p>
              {meses !== null && meses > 0 && (
                <p className="chica">
                  A este ritmo, <b>libres de deudas en ~{meses} {meses === 1 ? 'mes' : 'meses'}</b> ({nombreMes(sumarMeses(mes, meses))}) ·
                  sin contar intereses.
                </p>
              )}
            </>
          )}
          <div className="acciones">
            <button className="btn fantasma" onClick={() => setPaso(3)}>
              Atrás
            </button>
            <button className="btn" disabled={sobra <= 0} onClick={crear}>
              {modo === 'completo' ? 'Armar mi caja' : 'Guardar el plan'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
