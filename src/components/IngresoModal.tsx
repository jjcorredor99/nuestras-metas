import { useState } from 'react'
import { useStore } from '../store'
import type { FuenteIngreso, Ingreso, Persona } from '../types'
import { Modal, Campo, Segmento, InputMonto } from './ui'

export const FUENTES: { valor: FuenteIngreso; texto: string; emoji: string }[] = [
  { valor: 'nomina', texto: 'Nómina', emoji: '💼' },
  { valor: 'extra', texto: 'Extra', emoji: '✨' },
  { valor: 'devolucion', texto: 'Devolución', emoji: '↩️' },
  { valor: 'otro', texto: 'Otro', emoji: '💵' },
]

export const fuenteInfo = (f: FuenteIngreso) => FUENTES.find((x) => x.valor === f) ?? FUENTES[3]

export type BorradorIngreso = Omit<Ingreso, 'id'> & { id?: string }

/** Anotar o editar un ingreso. Lo usan la Caja y la bandeja "por confirmar" de Gastos. */
export function IngresoModal({
  inicial,
  onCerrar,
  onGuardado,
}: {
  inicial: BorradorIngreso
  onCerrar: () => void
  onGuardado?: (ingreso: BorradorIngreso) => void
}) {
  const { estado, dispatch } = useStore()
  const { perfil } = estado
  const [i, setI] = useState<BorradorIngreso>(inicial)

  const guardar = () => {
    if (i.monto <= 0) return
    if (i.id) dispatch({ tipo: 'ingreso/editar', ingreso: i as Ingreso })
    else dispatch({ tipo: 'ingreso/agregar', ingreso: i })
    onGuardado?.(i)
    onCerrar()
  }

  return (
    <Modal titulo={i.id ? 'Editar ingreso' : 'Anotar ingreso'} onCerrar={onCerrar}>
      <div className="pila">
        <Campo label="Monto">
          <InputMonto autoFocus valor={i.monto} onCambio={(monto) => setI({ ...i, monto })} />
        </Campo>
        <Campo label="¿De quién?">
          <Segmento<Persona>
            valor={i.de}
            onCambio={(de) => setI({ ...i, de })}
            opciones={[
              { valor: 'a', texto: perfil.nombreA },
              { valor: 'b', texto: perfil.nombreB },
            ]}
          />
        </Campo>
        <Campo label="¿De dónde viene?">
          <div className="fila envolver" style={{ gap: 6 }}>
            {FUENTES.map((f) => (
              <button
                key={f.valor}
                type="button"
                className={`chip ${i.fuente === f.valor ? 'oliva' : ''}`}
                onClick={() => setI({ ...i, fuente: f.valor })}
              >
                {f.emoji} {f.texto}
              </button>
            ))}
          </div>
        </Campo>
        <div className="grid2">
          <Campo label="Fecha">
            <input type="date" value={i.fecha} onChange={(e) => setI({ ...i, fecha: e.target.value })} />
          </Campo>
          <Campo label="Nota">
            <input value={i.nota} onChange={(e) => setI({ ...i, nota: e.target.value })} placeholder="Ej: quincena" />
          </Campo>
        </div>
        <div className="acciones">
          {i.id && (
            <button
              className="btn peligro"
              onClick={() => {
                dispatch({ tipo: 'ingreso/borrar', id: i.id! })
                onCerrar()
              }}
            >
              Borrar
            </button>
          )}
          <button className="btn oliva" disabled={i.monto <= 0} onClick={guardar}>
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  )
}
