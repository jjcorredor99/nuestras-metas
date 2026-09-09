import { useState } from 'react'
import { useStore, ahorradoMeta, nombreDe } from '../store'
import type { Meta, Persona } from '../types'
import { dinero, diasHasta, pct, hoy, fechaLarga, fechaCorta, mesesRestantes } from '../format'
import { Modal, Campo, Segmento, Barra, InputMonto, EmojiPicker, Confeti, useToast } from '../components/ui'

const EMOJIS = ['🇬🇷', '🏠', '🚗', '💍', '🐶', '✈️', '🛋️', '🎓', '🌊', '🎸', '🏝️', '🧳']
const COLORES = ['#7d9b76', '#8fb0c4', '#6f8f5c', '#dfa32b', '#a487b5', '#c98d6b']

type Borrador = Omit<Meta, 'id' | 'aportes' | 'fija'> & { id?: string; fija?: boolean }

const nueva = (): Borrador => ({
  titulo: '',
  descripcion: '',
  emoji: '🏠',
  fecha: `${new Date().getFullYear() + 1}-12-31`,
  montoObjetivo: 0,
  color: '#7d9b76',
})

export function Metas() {
  const { estado, dispatch } = useStore()
  const { perfil, metas } = estado
  const [editando, setEditando] = useState<Borrador | null>(null)
  const [aportando, setAportando] = useState<{ meta: Meta; monto: number; por: Persona } | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [fiesta, setFiesta] = useState(0)
  const { mostrar, Toast } = useToast()

  const guardar = () => {
    if (!editando || !editando.titulo.trim() || editando.montoObjetivo <= 0) return
    if (editando.id) {
      const original = metas.find((m) => m.id === editando.id)!
      dispatch({ tipo: 'meta/editar', meta: { ...original, ...editando, id: editando.id, fija: original.fija } })
    } else {
      dispatch({ tipo: 'meta/agregar', meta: editando })
    }
    setEditando(null)
  }

  const aportar = () => {
    if (!aportando || aportando.monto <= 0) return
    const antes = ahorradoMeta(aportando.meta)
    dispatch({ tipo: 'meta/aportar', id: aportando.meta.id, aporte: { fecha: hoy(), monto: aportando.monto, por: aportando.por } })
    if (antes < aportando.meta.montoObjetivo && antes + aportando.monto >= aportando.meta.montoObjetivo) {
      setFiesta((n) => n + 1)
      mostrar(`¡${aportando.meta.titulo} completa! ${aportando.meta.emoji}`)
    } else {
      mostrar('Un pasito más cerca ✈️')
    }
    setAportando(null)
  }

  const metaDetalle = metas.find((m) => m.id === detalle)

  return (
    <div className="pila">
      <Confeti activo={fiesta > 0} key={fiesta} />
      <div className="cabecera">
        <div>
          <h1>Hitos</h1>
          <p className="sub">Lo que estamos construyendo juntos.</p>
        </div>
      </div>

      {metas.map((m) => {
        const ahorrado = ahorradoMeta(m)
        const avance = pct(ahorrado, m.montoObjetivo)
        const dias = diasHasta(m.fecha)
        const meses = mesesRestantes(m.fecha)
        const faltante = Math.max(0, m.montoObjetivo - ahorrado)
        const porMes = meses > 0 ? faltante / meses : faltante
        return (
          <div className="tarjeta color" key={m.id} style={{ background: `linear-gradient(150deg, ${m.color}, ${m.color}c4)`, color: '#fff' }}>
            <div className="fila entre">
              <div className="fila">
                <span style={{ fontSize: '2rem' }}>{m.emoji}</span>
                <div>
                  <h2 style={{ color: '#fff' }}>{m.titulo}</h2>
                  <div className="mini" style={{ opacity: 0.85 }}>
                    {fechaLarga(m.fecha)} · {dias > 0 ? `faltan ${dias} días` : dias === 0 ? 'hoy' : 'ya pasó'}
                  </div>
                </div>
              </div>
              <button className="btn-icono" style={{ background: 'rgba(255,255,255,0.2)', border: 0, color: '#fff' }} onClick={() => setEditando({ ...m })} aria-label="Editar">
                ✎
              </button>
            </div>
            {m.descripcion && <p className="chica mt" style={{ opacity: 0.92, fontStyle: 'italic' }}>{m.descripcion}</p>}
            <div className="cifra grande mt">{dinero(ahorrado, perfil.moneda)}</div>
            <div className="chica" style={{ opacity: 0.9, marginBottom: 8 }}>
              de {dinero(m.montoObjetivo, perfil.moneda)} · {avance}%
            </div>
            <Barra valor={avance} color="blanca" />
            {faltante > 0 && meses > 0 && (
              <p className="chica mt" style={{ opacity: 0.92 }}>
                Para llegar: <b>{dinero(porMes, perfil.moneda)}</b> al mes durante {meses} {meses === 1 ? 'mes' : 'meses'}.
              </p>
            )}
            {faltante === 0 && <p className="chica mt negrita">¡Meta completa! Ahora sí, a vivirla. 🎉</p>}
            <div className="fila mt" style={{ gap: 8 }}>
              <button className="btn chico" style={{ background: '#fff', color: m.color }} onClick={() => setAportando({ meta: m, monto: 0, por: 'a' })}>
                Aportar
              </button>
              {m.aportes.length > 0 && (
                <button className="btn chico" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }} onClick={() => setDetalle(m.id)}>
                  {m.aportes.length} aporte{m.aportes.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
          </div>
        )
      })}

      <div className="tarjeta clic" onClick={() => setEditando(nueva())}>
        <div className="fila">
          <span style={{ fontSize: '1.6rem' }}>➕</span>
          <div>
            <div className="negrita">Nuevo hito</div>
            <div className="chica suave">¿Algo nuestro? Una casa, un carro, un perro, lo que sea.</div>
          </div>
        </div>
      </div>

      {editando && (
        <Modal titulo={editando.id ? 'Editar hito' : 'Nuevo hito'} onCerrar={() => setEditando(null)}>
          <div className="pila">
            <Campo label="Emoji">
              <EmojiPicker opciones={EMOJIS} valor={editando.emoji} onCambio={(emoji) => setEditando({ ...editando, emoji })} />
            </Campo>
            <Campo label="Título">
              <input autoFocus value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} placeholder="Ej: Nuestra casa" />
            </Campo>
            <Campo label="¿Por qué lo queremos?">
              <textarea value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} placeholder="Unas palabras para acordarnos cuando cueste." />
            </Campo>
            <div className="grid2">
              <Campo label="Monto objetivo">
                <InputMonto valor={editando.montoObjetivo} onCambio={(montoObjetivo) => setEditando({ ...editando, montoObjetivo })} />
              </Campo>
              <Campo label="Fecha">
                <input type="date" value={editando.fecha} onChange={(e) => setEditando({ ...editando, fecha: e.target.value })} />
              </Campo>
            </div>
            <Campo label="Color">
              <div className="emojis">
                {COLORES.map((c) => (
                  <button key={c} type="button" className={editando.color === c ? 'activo' : ''} style={{ background: c, borderColor: 'transparent', boxShadow: editando.color === c ? 'inset 3px 3px 7px rgba(0,0,0,.25), 0 0 0 3px rgba(51,60,78,.55)' : 'var(--bajo)' }} onClick={() => setEditando({ ...editando, color: c })} aria-label={c} />
                ))}
              </div>
            </Campo>
            <div className="acciones">
              {editando.id && !editando.fija && (
                <button
                  className="btn peligro"
                  onClick={() => {
                    if (window.confirm('¿Borrar este hito y sus aportes?')) {
                      dispatch({ tipo: 'meta/borrar', id: editando.id! })
                      setEditando(null)
                    }
                  }}
                >
                  Borrar
                </button>
              )}
              <button className="btn" disabled={!editando.titulo.trim() || editando.montoObjetivo <= 0} onClick={guardar}>
                Guardar
              </button>
            </div>
            {editando.fija && <p className="mini suave centrado">Grecia no se borra. Se cumple. 🇬🇷</p>}
          </div>
        </Modal>
      )}

      {aportando && (
        <Modal titulo={`Aportar a ${aportando.meta.titulo}`} onCerrar={() => setAportando(null)}>
          <div className="pila">
            <Campo label="Monto">
              <InputMonto autoFocus valor={aportando.monto} onCambio={(monto) => setAportando({ ...aportando, monto })} />
            </Campo>
            <Campo label="¿Quién aporta?">
              <Segmento<Persona>
                valor={aportando.por}
                onCambio={(por) => setAportando({ ...aportando, por })}
                opciones={[
                  { valor: 'a', texto: perfil.nombreA },
                  { valor: 'b', texto: perfil.nombreB },
                ]}
              />
            </Campo>
            <div className="acciones">
              <button className="btn cielo" disabled={aportando.monto <= 0} onClick={aportar}>
                Aportar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {metaDetalle && (
        <Modal titulo={`Aportes · ${metaDetalle.titulo}`} onCerrar={() => setDetalle(null)}>
          {metaDetalle.aportes.map((a) => (
            <div className="item" key={a.id}>
              <div className="icono">{metaDetalle.emoji}</div>
              <div className="cuerpo">
                <div className="titulo">{dinero(a.monto, perfil.moneda)}</div>
                <div className="chica suave">
                  {fechaCorta(a.fecha)} · {nombreDe(perfil, a.por)}
                </div>
              </div>
              <button className="btn-icono" aria-label="Quitar aporte" onClick={() => dispatch({ tipo: 'meta/quitarAporte', id: metaDetalle.id, aporteId: a.id })}>
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
