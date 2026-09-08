import { useState } from 'react'
import { useStore } from '../store'
import { dinero, mesActual } from '../format'
import { PLANTILLAS, bolsillosDesdePlantillas, montoSugerido } from '../caja'
import { Modal, Campo, InputMonto } from './ui'

/**
 * Primera vez en la Caja: cuánto entra y qué bolsillos arrancan.
 * Los montos son sugerencias; se editan antes de crear.
 */
export function ArmarCaja({ onCerrar }: { onCerrar: () => void }) {
  const { estado, dispatch } = useStore()
  const { perfil } = estado
  const [paso, setPaso] = useState<1 | 2>(1)
  const [ingresos, setIngresos] = useState({
    a: perfil.ingresoEsperado?.a ?? 0,
    b: perfil.ingresoEsperado?.b ?? 0,
  })
  const [filas, setFilas] = useState<{ on: boolean; monto: number }[]>([])

  const nombrePersona = (p: 'a' | 'b') => (p === 'a' ? perfil.nombreA : perfil.nombreB)
  const total = ingresos.a + ingresos.b

  const irAlPaso2 = () => {
    setFilas(PLANTILLAS.map((p) => ({ on: true, monto: montoSugerido(p, ingresos) })))
    setPaso(2)
  }

  const asignado = filas.reduce((acc, f) => acc + (f.on ? f.monto : 0), 0)
  const sobra = total - asignado

  const crear = () => {
    const elegidas = PLANTILLAS.map((plantilla, i) => ({ plantilla, ...filas[i] }))
      .filter((f) => f.on && f.monto > 0)
      .map(({ plantilla, monto }) => ({ plantilla, monto }))
    dispatch({ tipo: 'perfil', perfil: { ingresoEsperado: ingresos } })
    dispatch({ tipo: 'bolsillo/crearVarios', bolsillos: bolsillosDesdePlantillas(elegidas, mesActual()) })
    onCerrar()
  }

  return (
    <Modal titulo={paso === 1 ? '¿Cuánto entra al mes?' : 'Los bolsillos'} onCerrar={onCerrar}>
      {paso === 1 ? (
        <div className="pila">
          <p className="chica suave">
            Lo que cada uno espera recibir en un mes normal. Sirve para repartirlo en bolsillos; los ingresos reales
            se anotan aparte cuando lleguen.
          </p>
          <Campo label={`Ingreso mensual de ${perfil.nombreA}`}>
            <InputMonto autoFocus valor={ingresos.a} onCambio={(a) => setIngresos({ ...ingresos, a })} />
          </Campo>
          <Campo label={`Ingreso mensual de ${perfil.nombreB}`}>
            <InputMonto valor={ingresos.b} onCambio={(b) => setIngresos({ ...ingresos, b })} />
          </Campo>
          <div className="acciones">
            <button className="btn" disabled={total <= 0} onClick={irAlPaso2}>
              Siguiente
            </button>
          </div>
        </div>
      ) : (
        <div className="pila">
          <p className="chica suave">
            Una propuesta para arrancar sobre {dinero(total, perfil.moneda)} al mes. Cambia los montos o apaga los que no
            quieran. Después se pueden crear más.
          </p>
          {PLANTILLAS.map((p, i) => {
            const f = filas[i]
            const titulo = p.ambito === 'hogar' ? p.nombre : `${p.nombre} · ${nombrePersona(p.ambito)}`
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
                    {p.categorias.length
                      ? p.categorias.map((c) => c).join(', ')
                      : 'lo que no tenga bolsillo'}{' '}
                    · {p.acumula ? 'guarda lo que sobra' : 'se reinicia cada mes'}
                  </div>
                </div>
                <div style={{ width: 108, flexShrink: 0 }}>
                  <InputMonto valor={f.monto} onCambio={(monto) => setFilas(filas.map((x, j) => (j === i ? { ...x, monto } : x)))} />
                </div>
              </div>
            )
          })}
          <p className={`chica ${sobra < 0 ? 'negrita' : 'suave'}`} style={sobra < 0 ? { color: '#b1402a' } : undefined}>
            {sobra >= 0
              ? `Quedan ${dinero(sobra, perfil.moneda)} sin bolsillo: para Grecia, deudas y ahorro.`
              : `Te pasaste por ${dinero(-sobra, perfil.moneda)}. Baja algún monto.`}
          </p>
          <div className="acciones">
            <button className="btn fantasma" onClick={() => setPaso(1)}>
              Atrás
            </button>
            <button className="btn" disabled={asignado <= 0} onClick={crear}>
              Armar mi caja
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
