import { useState } from 'react'
import { useStore } from '../store'
import type { Reto, TipoReto } from '../types'
import { dinero, diasHasta, pct, fechaCorta } from '../format'
import { Modal, Campo, Segmento, Barra, Vacio, InputMonto, EmojiPicker, Confeti, useToast } from '../components/ui'

type Borrador = Omit<Reto, 'id' | 'completado' | 'progreso'> & { id?: string; progreso?: number; completado?: boolean }

const EMOJIS = ['🔥', '🥗', '🚫', '🏃', '🍳', '💰', '🎯', '🧠', '🌱', '🛑', '📵', '🏡', '🎉']

const fechaMasDias = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PLANTILLAS: Omit<Borrador, 'fechaLimite'>[] = [
  { titulo: 'Mes sin domicilios', descripcion: 'Cocinamos en casa. Cero apps de comida.', tipo: 'habito', meta: 30, emoji: '🍳', recompensa: 'Una cena bonita afuera' },
  { titulo: 'Colchón de emergencia', descripcion: 'Un primer fondo para no volver a la tarjeta.', tipo: 'ahorro', meta: 1000000, emoji: '💰', recompensa: 'Tranquilidad' },
  { titulo: 'Semana sin gastos hormiga', descripcion: 'Nada de tinto, chicles ni "una cosita".', tipo: 'habito', meta: 7, emoji: '🐜', recompensa: 'Helado' },
  { titulo: 'Salidas bajo control', descripcion: 'Este mes no pasamos del tope en salidas.', tipo: 'limite', meta: 400000, emoji: '🛑', recompensa: 'Plan en casa con peli' },
  { titulo: 'Abono extra a la deuda', descripcion: 'Un abono adicional al mínimo este mes.', tipo: 'ahorro', meta: 300000, emoji: '⛰️', recompensa: 'Ver la barra bajar' },
]

const nuevo = (): Borrador => ({
  titulo: '',
  descripcion: '',
  tipo: 'ahorro',
  meta: 0,
  fechaLimite: fechaMasDias(30),
  emoji: '🎯',
  recompensa: '',
})

export function Retos() {
  const { estado, dispatch } = useStore()
  const { perfil, retos } = estado
  const [editando, setEditando] = useState<Borrador | null>(null)
  const [avanzando, setAvanzando] = useState<{ reto: Reto; cantidad: number } | null>(null)
  const [fiesta, setFiesta] = useState(0)
  const { mostrar, Toast } = useToast()

  const activos = retos.filter((r) => !r.completado)
  const hechos = retos.filter((r) => r.completado)

  const unidad = (r: Pick<Reto, 'tipo' | 'meta' | 'progreso'>) =>
    r.tipo === 'habito' ? `${r.progreso} / ${r.meta} días` : `${dinero(r.progreso, perfil.moneda)} / ${dinero(r.meta, perfil.moneda)}`

  const guardar = () => {
    if (!editando || !editando.titulo.trim() || editando.meta <= 0) return
    if (editando.id) {
      const original = retos.find((r) => r.id === editando.id)!
      dispatch({ tipo: 'reto/editar', reto: { ...original, ...editando, id: editando.id } as Reto })
    } else {
      dispatch({ tipo: 'reto/agregar', reto: editando })
      mostrar('Reto aceptado 🤝')
    }
    setEditando(null)
  }

  const avanzar = () => {
    if (!avanzando) return
    const nuevoProgreso = avanzando.reto.progreso + avanzando.cantidad
    dispatch({ tipo: 'reto/progreso', id: avanzando.reto.id, progreso: nuevoProgreso })
    if (avanzando.reto.tipo !== 'limite' && nuevoProgreso >= avanzando.reto.meta) {
      setFiesta((n) => n + 1)
      mostrar(`¡Reto cumplido! ${avanzando.reto.emoji}`)
    }
    setAvanzando(null)
  }

  const completarLimite = (r: Reto) => {
    dispatch({ tipo: 'reto/completar', id: r.id, completado: true })
    setFiesta((n) => n + 1)
    mostrar(`¡Lo logramos! ${r.emoji}`)
  }

  return (
    <div className="pila">
      <Confeti activo={fiesta > 0} key={fiesta} />
      <div className="cabecera">
        <div>
          <h1>Retos</h1>
          <p className="sub">Pequeñas victorias que suman a lo grande.</p>
        </div>
        <span className="chip oliva">{hechos.length} cumplidos</span>
      </div>

      {activos.length === 0 && (
        <div className="tarjeta">
          <h3 className="mb">¿Con cuál arrancamos?</h3>
          <div className="pila">
            {PLANTILLAS.map((p) => (
              <div className="item" key={p.titulo} style={{ cursor: 'pointer' }} onClick={() => setEditando({ ...p, fechaLimite: fechaMasDias(p.tipo === 'habito' ? p.meta : 30) })}>
                <div className="icono">{p.emoji}</div>
                <div className="cuerpo">
                  <div className="titulo">{p.titulo}</div>
                  <div className="chica suave">{p.descripcion}</div>
                </div>
                <span className="suave">›</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activos.map((r) => {
        const dias = diasHasta(r.fechaLimite)
        const avance = r.tipo === 'limite' ? pct(r.progreso, r.meta) : pct(r.progreso, r.meta)
        const pasado = r.tipo === 'limite' && r.progreso > r.meta
        return (
          <div className="tarjeta" key={r.id}>
            <div className="fila entre">
              <div className="fila">
                <span style={{ fontSize: '1.6rem' }}>{r.emoji}</span>
                <div>
                  <div className="negrita">{r.titulo}</div>
                  <div className="mini suave">
                    {dias < 0 ? `venció hace ${-dias} d` : dias === 0 ? 'último día' : `${dias} días restantes`}
                    {r.recompensa && ` · premio: ${r.recompensa}`}
                  </div>
                </div>
              </div>
              <button className="btn-icono" onClick={() => setEditando({ ...r })} aria-label="Editar">
                ✎
              </button>
            </div>
            {r.descripcion && <p className="chica suave mt">{r.descripcion}</p>}
            <div className="fila entre chica mt">
              <span className="negrita" style={pasado ? { color: 'var(--alerta)' } : undefined}>
                {unidad(r)}
              </span>
              <span className="suave">{r.tipo === 'limite' ? `${avance}% del tope` : `${avance}%`}</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <Barra valor={avance} color={r.tipo === 'limite' ? (pasado ? 'coral' : 'mostaza') : 'oliva'} />
            </div>
            <div className="fila mt" style={{ gap: 8 }}>
              {r.tipo === 'habito' ? (
                <button className="btn chico oliva" onClick={() => { setAvanzando({ reto: r, cantidad: 1 }); }}>
                  +1 día ✓
                </button>
              ) : r.tipo === 'limite' ? (
                <>
                  <button className="btn chico secundario" onClick={() => setAvanzando({ reto: r, cantidad: 0 })}>
                    Anotar gasto
                  </button>
                  <button className="btn chico oliva" disabled={pasado} onClick={() => completarLimite(r)}>
                    Cerrar reto
                  </button>
                </>
              ) : (
                <button className="btn chico oliva" onClick={() => setAvanzando({ reto: r, cantidad: 0 })}>
                  Sumar
                </button>
              )}
            </div>
          </div>
        )
      })}

      {hechos.length > 0 && (
        <div className="tarjeta oliva">
          <h3 className="mb">Cumplidos 🏅</h3>
          {hechos.map((r) => (
            <div className="item" key={r.id}>
              <div className="icono" style={{ background: 'var(--sup)' }}>{r.emoji}</div>
              <div className="cuerpo">
                <div className="titulo">{r.titulo}</div>
                <div className="chica suave">{r.completadoEn ? `el ${fechaCorta(r.completadoEn)}` : ''}{r.recompensa && ` · ganamos: ${r.recompensa}`}</div>
              </div>
              <button className="btn-icono" aria-label="Reabrir" title="Reabrir" onClick={() => dispatch({ tipo: 'reto/completar', id: r.id, completado: false })}>
                ↩
              </button>
            </div>
          ))}
        </div>
      )}

      {retos.length === 0 && activos.length === 0 && (
        <Vacio emoji="🤝" texto="O crea uno propio con el botón +" />
      )}

      <button className="btn flotante" onClick={() => setEditando(nuevo())} aria-label="Nuevo reto">
        +
      </button>

      {editando && (
        <Modal titulo={editando.id ? 'Editar reto' : 'Nuevo reto'} onCerrar={() => setEditando(null)}>
          <div className="pila">
            <Campo label="Emoji">
              <EmojiPicker opciones={EMOJIS} valor={editando.emoji} onCambio={(emoji) => setEditando({ ...editando, emoji })} />
            </Campo>
            <Campo label="Título">
              <input autoFocus value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} placeholder="Ej: Mes sin domicilios" />
            </Campo>
            <Campo label="Tipo">
              <Segmento<TipoReto>
                valor={editando.tipo}
                onCambio={(tipo) => setEditando({ ...editando, tipo })}
                opciones={[
                  { valor: 'ahorro', texto: 'Ahorrar' },
                  { valor: 'habito', texto: 'Hábito' },
                  { valor: 'limite', texto: 'Tope' },
                ]}
              />
              <p className="mini suave">
                {editando.tipo === 'ahorro' && 'Juntar un monto antes de la fecha.'}
                {editando.tipo === 'habito' && 'Cumplir X días seguidos (marcan +1 cada día).'}
                {editando.tipo === 'limite' && 'No pasarse de un monto en el periodo.'}
              </p>
            </Campo>
            <div className="grid2">
              <Campo label={editando.tipo === 'habito' ? 'Días' : 'Monto'}>
                {editando.tipo === 'habito' ? (
                  <input type="number" min={1} value={editando.meta || ''} onChange={(e) => setEditando({ ...editando, meta: Number(e.target.value) })} />
                ) : (
                  <InputMonto valor={editando.meta} onCambio={(meta) => setEditando({ ...editando, meta })} />
                )}
              </Campo>
              <Campo label="Fecha límite">
                <input type="date" value={editando.fechaLimite} onChange={(e) => setEditando({ ...editando, fechaLimite: e.target.value })} />
              </Campo>
            </div>
            <Campo label="Descripción">
              <input value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} placeholder="¿En qué consiste?" />
            </Campo>
            <Campo label="Premio si lo cumplimos">
              <input value={editando.recompensa} onChange={(e) => setEditando({ ...editando, recompensa: e.target.value })} placeholder="Ej: cena, peli, día de spa..." />
            </Campo>
            <div className="acciones">
              {editando.id && (
                <button
                  className="btn peligro"
                  onClick={() => {
                    dispatch({ tipo: 'reto/borrar', id: editando.id! })
                    setEditando(null)
                  }}
                >
                  Borrar
                </button>
              )}
              <button className="btn" disabled={!editando.titulo.trim() || editando.meta <= 0} onClick={guardar}>
                Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {avanzando && (
        <Modal
          titulo={avanzando.reto.tipo === 'habito' ? 'Un día más' : avanzando.reto.tipo === 'limite' ? 'Anotar gasto del reto' : 'Sumar al reto'}
          onCerrar={() => setAvanzando(null)}
        >
          <div className="pila">
            <p className="chica suave">
              {avanzando.reto.emoji} {avanzando.reto.titulo} · {unidad(avanzando.reto)}
            </p>
            {avanzando.reto.tipo === 'habito' ? (
              <Campo label="Días a sumar">
                <input type="number" min={1} value={avanzando.cantidad} onChange={(e) => setAvanzando({ ...avanzando, cantidad: Number(e.target.value) })} />
              </Campo>
            ) : (
              <Campo label="Monto">
                <InputMonto autoFocus valor={avanzando.cantidad} onCambio={(cantidad) => setAvanzando({ ...avanzando, cantidad })} />
              </Campo>
            )}
            <div className="acciones">
              <button className="btn oliva" disabled={avanzando.cantidad <= 0} onClick={avanzar}>
                Registrar
              </button>
            </div>
          </div>
        </Modal>
      )}
      {Toast}
    </div>
  )
}
