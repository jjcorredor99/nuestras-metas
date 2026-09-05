import { useMemo, useState } from 'react'
import { useStore, nombreDe } from '../store'
import type { Gasto, Categoria, Persona } from '../types'
import { dinero, hoy, mesActual, nombreMes, fechaCorta, sumar, pct } from '../format'
import { CATEGORIAS, catInfo } from '../categorias'
import { Modal, Campo, Segmento, Barra, Vacio, InputMonto, useToast } from '../components/ui'

type Borrador = Omit<Gasto, 'id'> & { id?: string }

const nuevo = (): Borrador => ({
  fecha: hoy(),
  monto: 0,
  categoria: 'mercado',
  pagadoPor: 'a',
  compartido: true,
  nota: '',
})

export function Gastos() {
  const { estado, dispatch } = useStore()
  const { perfil, gastos } = estado
  const [mes, setMes] = useState(mesActual())
  const [editando, setEditando] = useState<Borrador | null>(null)
  const { mostrar, Toast } = useToast()

  const meses = useMemo(() => {
    const set = new Set(gastos.map((g) => g.fecha.slice(0, 7)))
    set.add(mesActual())
    return [...set].sort().reverse()
  }, [gastos])

  const delMes = useMemo(
    () => gastos.filter((g) => g.fecha.startsWith(mes)).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [gastos, mes],
  )
  const total = sumar(delMes.map((g) => g.monto))

  // Balance: en gastos compartidos cada uno debe la mitad. Quien pagó de más, recibe.
  const balance = useMemo(() => {
    let a = 0
    let b = 0
    delMes.filter((g) => g.compartido).forEach((g) => (g.pagadoPor === 'a' ? (a += g.monto) : (b += g.monto)))
    return (a - b) / 2 // positivo: B le debe a A
  }, [delMes])

  const porCat = useMemo(() => {
    const m = new Map<Categoria, number>()
    delMes.forEach((g) => m.set(g.categoria, (m.get(g.categoria) ?? 0) + g.monto))
    return [...m.entries()].sort((x, y) => y[1] - x[1])
  }, [delMes])

  const porDia = useMemo(() => {
    const grupos = new Map<string, Gasto[]>()
    delMes.forEach((g) => grupos.set(g.fecha, [...(grupos.get(g.fecha) ?? []), g]))
    return [...grupos.entries()]
  }, [delMes])

  const guardar = () => {
    if (!editando || editando.monto <= 0) return
    if (editando.id) {
      dispatch({ tipo: 'gasto/editar', gasto: editando as Gasto })
      mostrar('Gasto actualizado')
    } else {
      dispatch({ tipo: 'gasto/agregar', gasto: editando })
      mostrar('Gasto anotado')
    }
    setEditando(null)
  }

  return (
    <div className="pila">
      <div className="cabecera">
        <div>
          <h1>Gastos</h1>
          <p className="sub">Lo que sale, para saber en qué se va.</p>
        </div>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          style={{ border: '1px solid var(--linea)', borderRadius: 12, padding: '8px 10px', background: '#fff' }}
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {nombreMes(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="tarjeta terracota">
        <span className="etiqueta">Total {nombreMes(mes)}</span>
        <div className="cifra grande">{dinero(total, perfil.moneda)}</div>
        {balance !== 0 && (
          <p className="chica" style={{ marginTop: 8, opacity: 0.92 }}>
            {balance > 0
              ? `${perfil.nombreB} le debe ${dinero(balance, perfil.moneda)} a ${perfil.nombreA}`
              : `${perfil.nombreA} le debe ${dinero(-balance, perfil.moneda)} a ${perfil.nombreB}`}{' '}
            por lo compartido.
          </p>
        )}
        {balance === 0 && delMes.length > 0 && (
          <p className="chica" style={{ marginTop: 8, opacity: 0.92 }}>
            Van parejos en lo compartido. 🤝
          </p>
        )}
      </div>

      {porCat.length > 0 && (
        <div className="tarjeta">
          <h3 className="mb">Por categoría</h3>
          {porCat.map(([c, v]) => {
            const info = catInfo(c)
            return (
              <div className="cat-fila" key={c}>
                <span>{info.emoji}</span>
                <div>
                  <div className="fila entre chica">
                    <span>{info.nombre}</span>
                    <span className="negrita">{dinero(v, perfil.moneda)}</span>
                  </div>
                  <Barra valor={pct(v, total)} />
                </div>
                <span className="mini suave">{pct(v, total)}%</span>
              </div>
            )
          })}
        </div>
      )}

      {delMes.length === 0 ? (
        <Vacio emoji="🧾" texto="Nada anotado este mes todavía." />
      ) : (
        porDia.map(([dia, lista]) => (
          <div className="tarjeta" key={dia}>
            <div className="fila entre mb">
              <span className="etiqueta">{fechaCorta(dia)}</span>
              <span className="chica suave">{dinero(sumar(lista.map((g) => g.monto)), perfil.moneda)}</span>
            </div>
            {lista.map((g) => {
              const info = catInfo(g.categoria)
              return (
                <div className="item" key={g.id} onClick={() => setEditando(g)} style={{ cursor: 'pointer' }}>
                  <div className="icono">{info.emoji}</div>
                  <div className="cuerpo">
                    <div className="titulo">{g.nota || info.nombre}</div>
                    <div className="chica suave">
                      {nombreDe(perfil, g.pagadoPor)} · {g.compartido ? 'compartido' : 'personal'}
                    </div>
                  </div>
                  <div className="monto">{dinero(g.monto, perfil.moneda)}</div>
                </div>
              )
            })}
          </div>
        ))
      )}

      <button className="btn flotante" onClick={() => setEditando(nuevo())} aria-label="Anotar gasto">
        +
      </button>

      {editando && (
        <Modal titulo={editando.id ? 'Editar gasto' : 'Anotar gasto'} onCerrar={() => setEditando(null)}>
          <div className="pila">
            <Campo label="Monto">
              <InputMonto autoFocus valor={editando.monto} onCambio={(monto) => setEditando({ ...editando, monto })} />
            </Campo>
            <Campo label="Categoría">
              <div className="emojis">
                {CATEGORIAS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.nombre}
                    className={editando.categoria === c.id ? 'activo' : ''}
                    onClick={() => setEditando({ ...editando, categoria: c.id })}
                  >
                    {c.emoji}
                  </button>
                ))}
              </div>
              <p className="mini suave">{catInfo(editando.categoria).nombre}</p>
            </Campo>
            <Campo label="¿Quién pagó?">
              <Segmento<Persona>
                valor={editando.pagadoPor}
                onCambio={(pagadoPor) => setEditando({ ...editando, pagadoPor })}
                opciones={[
                  { valor: 'a', texto: perfil.nombreA },
                  { valor: 'b', texto: perfil.nombreB },
                ]}
              />
            </Campo>
            <Campo label="¿Es de los dos?">
              <Segmento<'si' | 'no'>
                valor={editando.compartido ? 'si' : 'no'}
                onCambio={(v) => setEditando({ ...editando, compartido: v === 'si' })}
                opciones={[
                  { valor: 'si', texto: 'Compartido' },
                  { valor: 'no', texto: 'Personal' },
                ]}
              />
            </Campo>
            <div className="grid2">
              <Campo label="Fecha">
                <input type="date" value={editando.fecha} onChange={(e) => setEditando({ ...editando, fecha: e.target.value })} />
              </Campo>
              <Campo label="Nota">
                <input
                  value={editando.nota}
                  onChange={(e) => setEditando({ ...editando, nota: e.target.value })}
                  placeholder="Ej: mercado del mes"
                />
              </Campo>
            </div>
            <div className="acciones">
              {editando.id && (
                <button
                  className="btn peligro"
                  onClick={() => {
                    dispatch({ tipo: 'gasto/borrar', id: editando.id! })
                    setEditando(null)
                  }}
                >
                  Borrar
                </button>
              )}
              <button className="btn" disabled={editando.monto <= 0} onClick={guardar}>
                Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}
      {Toast}
    </div>
  )
}
