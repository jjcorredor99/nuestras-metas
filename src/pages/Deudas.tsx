import { useMemo, useState } from 'react'
import { useStore, saldoDeuda, nombreDe } from '../store'
import type { Deuda, Persona } from '../types'
import { dinero, hoy, sumar, pct, fechaCorta, mesActual, nombreMes, sumarMeses } from '../format'
import { avanceAvanzar, mesesParaLibres, minimosMensuales } from '../caja'
import { Modal, Campo, Segmento, Barra, Vacio, InputMonto, Confeti, useToast } from '../components/ui'

type Borrador = {
  id?: string
  nombre: string
  de: Persona | 'ambos'
  montoInicial: number
  tasaMensual: number
  pagoMinimo: number
}
const nueva = (): Borrador => ({ nombre: '', de: 'ambos', montoInicial: 0, tasaMensual: 0, pagoMinimo: 0 })

export function Deudas() {
  const { estado, dispatch } = useStore()
  const { perfil, deudas } = estado
  const [editando, setEditando] = useState<Borrador | null>(null)
  const [abonando, setAbonando] = useState<{ deuda: Deuda; monto: number; por: Persona } | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [fiesta, setFiesta] = useState(0)
  const { mostrar, Toast } = useToast()

  const inicial = sumar(deudas.map((d) => d.montoInicial))
  const actual = sumar(deudas.map(saldoDeuda))
  const pagado = inicial - actual
  const minimos = minimosMensuales(deudas)
  const mes = mesActual()
  const equipo = useMemo(() => avanceAvanzar(estado, mes), [estado, mes])
  const mesesLibres = mesesParaLibres(deudas, equipo.metaDeudas)

  // Bola de nieve: la más chica primero. Se siente el avance y motiva.
  const orden = useMemo(
    () =>
      [...deudas].sort((a, b) => {
        const sa = saldoDeuda(a)
        const sb = saldoDeuda(b)
        if (sa === 0 && sb > 0) return 1
        if (sb === 0 && sa > 0) return -1
        return sa - sb
      }),
    [deudas],
  )

  const guardar = () => {
    if (!editando || !editando.nombre.trim() || editando.montoInicial <= 0) return
    if (editando.id) {
      const original = deudas.find((d) => d.id === editando.id)!
      dispatch({ tipo: 'deuda/editar', deuda: { ...original, ...editando, id: editando.id, nombre: editando.nombre.trim() } })
    } else {
      dispatch({ tipo: 'deuda/agregar', deuda: { ...editando, nombre: editando.nombre.trim() } })
    }
    setEditando(null)
  }

  const abonar = () => {
    if (!abonando || abonando.monto <= 0) return
    const saldoAntes = saldoDeuda(abonando.deuda)
    dispatch({
      tipo: 'deuda/abonar',
      id: abonando.deuda.id,
      abono: { fecha: hoy(), monto: abonando.monto, por: abonando.por },
    })
    if (abonando.monto >= saldoAntes) {
      setFiesta((n) => n + 1)
      mostrar(`¡${abonando.deuda.nombre} pagada! 🎉`)
    } else {
      mostrar('Abono registrado 💪')
    }
    setAbonando(null)
  }

  const deudaDetalle = deudas.find((d) => d.id === detalle)

  return (
    <div className="pila">
      <Confeti activo={fiesta > 0} key={fiesta} />
      <div className="cabecera">
        <div>
          <h1>Deudas</h1>
          <p className="sub">Las vamos a tumbar una por una.</p>
        </div>
      </div>

      {perfil.plan && equipo.metaDeudas > 0 && actual > 0 && (
        <div className="tarjeta oliva">
          <div className="fila entre">
            <span className="etiqueta">En equipo · {nombreMes(mes).split(' ')[0]}</span>
            <span className="chip oliva">{pct(equipo.abonos, equipo.metaDeudas)}%</span>
          </div>
          <div className="cifra">
            {dinero(equipo.abonos, perfil.moneda)} <span className="chica suave">de {dinero(equipo.metaDeudas, perfil.moneda)}</span>
          </div>
          <div className="mt">
            <Barra valor={pct(equipo.abonos, equipo.metaDeudas)} color="oliva" />
          </div>
          <p className="chica" style={{ marginTop: 6 }}>
            {perfil.nombreA}: <b>{dinero(equipo.abonosPor.a, perfil.moneda)}</b> · {perfil.nombreB}:{' '}
            <b>{dinero(equipo.abonosPor.b, perfil.moneda)}</b>
            {equipo.abonos < equipo.metaDeudas
              ? ` · faltan ${dinero(equipo.metaDeudas - equipo.abonos, perfil.moneda)}`
              : ' · ¡meta del mes cumplida! 🎉'}
          </p>
          {mesesLibres !== null && mesesLibres > 0 && (
            <p className="mini suave" style={{ marginTop: 4 }}>
              A este ritmo, libres de deudas en ~{mesesLibres} {mesesLibres === 1 ? 'mes' : 'meses'} (
              {nombreMes(sumarMeses(mes, mesesLibres))}) · sin contar intereses.
            </p>
          )}
        </div>
      )}

      <div className="tarjeta">
        <div className="fila entre">
          <span className="etiqueta">Falta por pagar</span>
          <span className="chip oliva">{pct(pagado, inicial)}% listo</span>
        </div>
        <div className="cifra grande">{dinero(actual, perfil.moneda)}</div>
        <div className="mt">
          <Barra valor={pct(pagado, inicial)} color="oliva" />
        </div>
        <div className="fila entre mini suave" style={{ marginTop: 6 }}>
          <span>Pagado: {dinero(pagado, perfil.moneda)}</span>
          <span>Inicio: {dinero(inicial, perfil.moneda)}</span>
        </div>
        {minimos > 0 && (
          <p className="chica suave mt">
            Mínimos mensuales: <b>{dinero(minimos, perfil.moneda)}</b>. Lo que sobre, todo a la más chica.
          </p>
        )}
      </div>

      {deudas.length === 0 ? (
        <Vacio emoji="⛰️" texto="Anota cada deuda: tarjeta, préstamo, lo que le debemos a alguien. Verla es el primer paso." />
      ) : (
        orden.map((d, i) => {
          const saldo = saldoDeuda(d)
          const avance = pct(d.montoInicial - saldo, d.montoInicial)
          const liquidada = saldo === 0
          return (
            <div className="tarjeta" key={d.id} style={liquidada ? { opacity: 0.7 } : undefined}>
              <div className="fila entre">
                <div className="fila">
                  <span style={{ fontSize: '1.4rem' }}>{liquidada ? '🏆' : i === 0 ? '🎯' : '📌'}</span>
                  <div>
                    <div className="negrita">{d.nombre}</div>
                    <div className="mini suave">
                      {nombreDe(perfil, d.de)}
                      {d.tasaMensual > 0 && ` · ${d.tasaMensual}% mensual`}
                      {i === 0 && !liquidada && ' · la siguiente en caer'}
                    </div>
                  </div>
                </div>
                <button className="btn-icono" onClick={() => setEditando({ ...d })} aria-label="Editar">
                  ✎
                </button>
              </div>
              <div className="fila entre mt">
                <span className="cifra" style={{ fontSize: '1.4rem' }}>
                  {liquidada ? '¡Pagada!' : dinero(saldo, perfil.moneda)}
                </span>
                <span className="chica suave">{avance}%</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <Barra valor={avance} color="oliva" />
              </div>
              <div className="fila mt" style={{ gap: 8 }}>
                {!liquidada && (
                  <button className="btn chico oliva" onClick={() => setAbonando({ deuda: d, monto: d.pagoMinimo || 0, por: 'a' })}>
                    Abonar
                  </button>
                )}
                {d.abonos.length > 0 && (
                  <button className="btn chico fantasma" onClick={() => setDetalle(d.id)}>
                    {d.abonos.length} abono{d.abonos.length === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            </div>
          )
        })
      )}

      <button className="btn flotante" onClick={() => setEditando(nueva())} aria-label="Nueva deuda">
        +
      </button>

      {editando && (
        <Modal titulo={editando.id ? 'Editar deuda' : 'Nueva deuda'} onCerrar={() => setEditando(null)}>
          <div className="pila">
            <Campo label="Nombre">
              <input autoFocus value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="Ej: Tarjeta Bancolombia" />
            </Campo>
            <Campo label="Monto total (lo que debemos en total)">
              <InputMonto valor={editando.montoInicial} onCambio={(montoInicial) => setEditando({ ...editando, montoInicial })} />
            </Campo>
            <div className="grid2">
              <Campo label="Pago mínimo al mes">
                <InputMonto valor={editando.pagoMinimo} onCambio={(pagoMinimo) => setEditando({ ...editando, pagoMinimo })} />
              </Campo>
              <Campo label="Interés mensual %">
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={editando.tasaMensual || ''}
                  placeholder="0"
                  onChange={(e) => setEditando({ ...editando, tasaMensual: Number(e.target.value) })}
                />
              </Campo>
            </div>
            <Campo label="¿De quién es?">
              <Segmento<Persona | 'ambos'>
                valor={editando.de}
                onCambio={(de) => setEditando({ ...editando, de })}
                opciones={[
                  { valor: 'a', texto: perfil.nombreA },
                  { valor: 'b', texto: perfil.nombreB },
                  { valor: 'ambos', texto: 'Los dos' },
                ]}
              />
            </Campo>
            <div className="acciones">
              {editando.id && (
                <button
                  className="btn peligro"
                  onClick={() => {
                    if (window.confirm('¿Borrar esta deuda y sus abonos?')) {
                      dispatch({ tipo: 'deuda/borrar', id: editando.id! })
                      setEditando(null)
                    }
                  }}
                >
                  Borrar
                </button>
              )}
              <button className="btn" disabled={!editando.nombre.trim() || editando.montoInicial <= 0} onClick={guardar}>
                Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {abonando && (
        <Modal titulo={`Abonar a ${abonando.deuda.nombre}`} onCerrar={() => setAbonando(null)}>
          <div className="pila">
            <p className="chica suave">Saldo actual: {dinero(saldoDeuda(abonando.deuda), perfil.moneda)}</p>
            <Campo label="Monto del abono">
              <InputMonto autoFocus valor={abonando.monto} onCambio={(monto) => setAbonando({ ...abonando, monto })} />
            </Campo>
            <div className="fila envolver" style={{ gap: 6 }}>
              {abonando.deuda.pagoMinimo > 0 && (
                <button className="chip" onClick={() => setAbonando({ ...abonando, monto: abonando.deuda.pagoMinimo })}>
                  Mínimo
                </button>
              )}
              <button className="chip" onClick={() => setAbonando({ ...abonando, monto: saldoDeuda(abonando.deuda) })}>
                Todo el saldo
              </button>
            </div>
            <Campo label="¿Quién abonó?">
              <Segmento<Persona>
                valor={abonando.por}
                onCambio={(por) => setAbonando({ ...abonando, por })}
                opciones={[
                  { valor: 'a', texto: perfil.nombreA },
                  { valor: 'b', texto: perfil.nombreB },
                ]}
              />
            </Campo>
            <div className="acciones">
              <button className="btn oliva" disabled={abonando.monto <= 0} onClick={abonar}>
                Registrar abono
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deudaDetalle && (
        <Modal titulo={`Abonos · ${deudaDetalle.nombre}`} onCerrar={() => setDetalle(null)}>
          {deudaDetalle.abonos.map((a) => (
            <div className="item" key={a.id}>
              <div className="icono">💸</div>
              <div className="cuerpo">
                <div className="titulo">{dinero(a.monto, perfil.moneda)}</div>
                <div className="chica suave">
                  {fechaCorta(a.fecha)} · {nombreDe(perfil, a.por)}
                </div>
              </div>
              <button
                className="btn-icono"
                aria-label="Quitar abono"
                onClick={() => dispatch({ tipo: 'deuda/quitarAbono', id: deudaDetalle.id, abonoId: a.id })}
              >
                🗑
              </button>
            </div>
          ))}
        </Modal>
      )}
      {Toast}
    </div>
  )
}
