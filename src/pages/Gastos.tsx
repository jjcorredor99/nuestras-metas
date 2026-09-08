import { useEffect, useMemo, useState } from 'react'
import { useStore, nombreDe } from '../store'
import type { Gasto, Categoria, Persona } from '../types'
import { dinero, hoy, mesActual, nombreMes, fechaCorta, sumar, pct } from '../format'
import { CATEGORIAS, catInfo } from '../categorias'
import { Modal, Campo, Segmento, Barra, Vacio, InputMonto, useToast } from '../components/ui'
import { DesdeMensaje } from '../components/DesdeMensaje'
import { useEntrantes, type Pendiente } from '../entrantes'
import { borradorDesde, type Lectura } from '../mensajes'
import { alLlegarMensaje, tomarMensajePendiente } from '../enlace'

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
  const { pendientes, anotados, limpiarAviso, cerrar } = useEntrantes()
  // Mensaje que estamos leyendo (pegado o traído por un enlace).
  const [pegando, setPegando] = useState<{ texto: string } | null>(null)
  // Fila de la bandeja que este gasto viene a resolver.
  const [entranteId, setEntranteId] = useState<string | null>(null)
  // Lo que el lector propuso, para aprender si lo corrigen.
  const [sugerida, setSugerida] = useState<{ comercio: string; categoria: Categoria } | null>(null)

  // Un enlace con ?texto= (por ejemplo desde un Atajo) abre el mensaje listo para revisar.
  useEffect(() => {
    const recoger = () => {
      const t = tomarMensajePendiente()
      if (t) setPegando({ texto: t })
    }
    recoger()
    return alLlegarMensaje(recoger)
  }, [])

  // Aviso de lo que se anotó solo desde los mensajes.
  useEffect(() => {
    if (!anotados.length) return
    mostrar(
      anotados.length === 1
        ? 'Anoté un gasto desde tus mensajes'
        : `Anoté ${anotados.length} gastos desde tus mensajes`,
    )
    limpiarAviso()
  }, [anotados, limpiarAviso, mostrar])

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

  const cerrarModal = () => {
    setEditando(null)
    setEntranteId(null)
    setSugerida(null)
  }

  const guardar = () => {
    if (!editando || editando.monto <= 0) return
    // Si corrigieron la categoría que propuse, me la aprendo para la próxima.
    if (sugerida?.comercio && editando.categoria !== sugerida.categoria) {
      dispatch({ tipo: 'perfil/aprender-comercio', comercio: sugerida.comercio, categoria: editando.categoria })
    }
    if (editando.id) {
      dispatch({ tipo: 'gasto/editar', gasto: editando as Gasto })
      mostrar('Gasto actualizado')
    } else {
      dispatch({ tipo: 'gasto/agregar', gasto: editando })
      mostrar('Gasto anotado')
    }
    if (entranteId) cerrar(entranteId)
    cerrarModal()
  }

  /** Abre el formulario con lo que salió del mensaje. */
  const abrirLectura = (l: Lectura, pagadoPor: Persona, fuente: 'sms' | 'pegado', idEntrante: string | null) => {
    setPegando(null)
    if (gastos.some((g) => g.origen?.hash === l.hash)) {
      mostrar('Ese mensaje ya estaba anotado')
      if (idEntrante) cerrar(idEntrante)
      return
    }
    setSugerida({ comercio: l.comercio, categoria: l.categoria })
    setEntranteId(idEntrante)
    setEditando(borradorDesde(l, pagadoPor, fuente))
  }

  const anotarPendiente = (p: Pendiente) => {
    if (p.lectura) return abrirLectura(p.lectura, p.persona, 'sms', p.id)
    setEntranteId(p.id)
    setSugerida(null)
    setEditando({ ...nuevo(), pagadoPor: p.persona, compartido: false, nota: p.texto.slice(0, 60) })
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

      {pendientes.length > 0 && (
        <div className="tarjeta">
          <div className="fila entre">
            <h3 style={{ marginBottom: 0 }}>Por confirmar</h3>
            <span className="chica suave">{pendientes.length}</span>
          </div>
          <p className="mini suave" style={{ marginTop: 4, marginBottom: 6 }}>
            Llegaron por mensaje pero no estoy seguro de algo. Revísalos.
          </p>
          {pendientes.map((p) => (
            <div className="pendiente" key={p.id}>
              <div className="fila entre">
                <span className="titulo">
                  {p.lectura ? catInfo(p.lectura.categoria).emoji : '📩'}{' '}
                  {p.lectura?.comercio || 'Mensaje del banco'}
                </span>
                {p.lectura && <span className="monto">{dinero(p.lectura.monto, perfil.moneda)}</span>}
              </div>
              <p className="texto-sms">{p.texto}</p>
              <div className="fila" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn chico" onClick={() => anotarPendiente(p)}>
                  Anotar
                </button>
                <button className="btn chico fantasma" onClick={() => cerrar(p.id)}>
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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

      <button
        className="btn flotante mensaje"
        onClick={() => setPegando({ texto: '' })}
        aria-label="Anotar desde un mensaje"
        title="Desde un mensaje"
      >
        📩
      </button>
      <button className="btn flotante" onClick={() => setEditando(nuevo())} aria-label="Anotar gasto">
        +
      </button>

      {pegando && (
        <DesdeMensaje
          textoInicial={pegando.texto}
          onCerrar={() => setPegando(null)}
          onListo={(l) => abrirLectura(l, 'a', 'pegado', null)}
          onManual={(nota) => {
            setPegando(null)
            setSugerida(null)
            setEntranteId(null)
            setEditando({ ...nuevo(), nota })
          }}
        />
      )}

      {editando && (
        <Modal titulo={editando.id ? 'Editar gasto' : 'Anotar gasto'} onCerrar={cerrarModal}>
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
                    cerrarModal()
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
