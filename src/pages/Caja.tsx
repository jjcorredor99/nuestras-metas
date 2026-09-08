import { useMemo, useState } from 'react'
import { useStore, nombreDe } from '../store'
import type { Ambito, Bolsillo } from '../types'
import { dinero, hoy, mesActual, nombreMes, fechaCorta, pct } from '../format'
import { CATEGORIAS, catInfo } from '../categorias'
import { Modal, Campo, Segmento, Barra, Vacio, InputMonto, EmojiPicker, useToast } from '../components/ui'
import { IngresoModal, fuenteInfo, type BorradorIngreso } from '../components/IngresoModal'
import { ArmarCaja } from '../components/ArmarCaja'
import { resumenMes, vistaBolsillo, vigentes, gastosDe, sinBolsillo, disponible, type VistaBolsillo } from '../caja'

const EMOJIS = ['🛒', '🍕', '🚕', '💡', '📦', '🍦', '🏠', '💊', '🎬', '👗', '🎁', '✈️', '☕', '🐶', '💰', '🎯']

type BorradorBolsillo = Omit<Bolsillo, 'id' | 'ajustes'> & { id?: string }

const nuevoBolsillo = (ambito: Ambito): BorradorBolsillo => ({
  nombre: '',
  emoji: '💰',
  ambito,
  asignacion: 0,
  acumula: false,
  categorias: [],
  saldoInicial: 0,
  desde: mesActual(),
})

const colorBarra = (v: VistaBolsillo): 'oliva' | 'mostaza' | '' =>
  v.estado === 'rojo' ? '' : v.estado === 'amarillo' ? 'mostaza' : 'oliva'

export function Caja() {
  const { estado, dispatch } = useStore()
  const { perfil, gastos, ingresos, bolsillos } = estado
  const [mes, setMes] = useState(mesActual())
  const [armando, setArmando] = useState(false)
  const [editando, setEditando] = useState<BorradorBolsillo | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [ajustando, setAjustando] = useState<{ id: string; modo: 'meter' | 'sacar'; monto: number; nota: string } | null>(null)
  const [moviendo, setMoviendo] = useState<{ de: string; a: string; monto: number; nota: string } | null>(null)
  const [ingreso, setIngreso] = useState<BorradorIngreso | null>(null)
  const [esperados, setEsperados] = useState<{ a: number; b: number } | null>(null)
  const { mostrar, Toast } = useToast()

  const meses = useMemo(() => {
    const set = new Set([...gastos.map((g) => g.fecha.slice(0, 7)), ...ingresos.map((i) => i.fecha.slice(0, 7))])
    set.add(mesActual())
    return [...set].sort().reverse()
  }, [gastos, ingresos])

  const r = useMemo(() => resumenMes(estado, mes), [estado, mes])
  const secciones = useMemo(() => {
    const lista: { ambito: Ambito; titulo: string; vistas: VistaBolsillo[]; sin: { n: number; monto: number } }[] = [
      { ambito: 'hogar', titulo: 'De la casa', vistas: [], sin: { n: 0, monto: 0 } },
      { ambito: 'a', titulo: `De ${perfil.nombreA}`, vistas: [], sin: { n: 0, monto: 0 } },
      { ambito: 'b', titulo: `De ${perfil.nombreB}`, vistas: [], sin: { n: 0, monto: 0 } },
    ]
    for (const s of lista) {
      s.vistas = vigentes(estado, mes)
        .filter((b) => b.ambito === s.ambito)
        .map((b) => vistaBolsillo(b, estado, mes))
      s.sin = sinBolsillo(estado, mes, s.ambito)
    }
    return lista.filter((s) => s.vistas.length > 0 || s.sin.n > 0)
  }, [estado, mes, perfil.nombreA, perfil.nombreB])

  const ingresosMes = useMemo(
    () => ingresos.filter((i) => i.fecha.startsWith(mes)).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [ingresos, mes],
  )

  const bolsilloDetalle = bolsillos.find((b) => b.id === detalle)
  const nombreAmbito = (a: Ambito) => (a === 'hogar' ? 'La casa' : nombreDe(perfil, a))

  // ---------- guardar bolsillo ----------
  const guardarBolsillo = () => {
    if (!editando || !editando.nombre.trim() || editando.asignacion < 0) return
    const limpio = { ...editando, nombre: editando.nombre.trim() }
    if (editando.id) {
      const original = bolsillos.find((b) => b.id === editando.id)!
      dispatch({ tipo: 'bolsillo/editar', bolsillo: { ...limpio, id: editando.id, ajustes: original.ajustes } })
      mostrar('Bolsillo actualizado')
    } else {
      dispatch({ tipo: 'bolsillo/agregar', bolsillo: limpio })
      mostrar('Bolsillo creado')
    }
    setEditando(null)
  }

  const cambiarAcumula = (b: BorradorBolsillo, acumula: boolean): BorradorBolsillo => {
    if (acumula && !b.acumula && b.id) {
      // Al empezar a guardar, arranca hoy con lo que tenía disponible este mes.
      const original = bolsillos.find((x) => x.id === b.id)!
      const disp = disponible({ ...original, ...b, acumula: false }, gastos, bolsillos, mesActual())
      return { ...b, acumula, desde: mesActual(), saldoInicial: Math.max(0, disp) }
    }
    return { ...b, acumula }
  }

  const duenoDe = (c: (typeof CATEGORIAS)[number]['id'], b: BorradorBolsillo) =>
    bolsillos.find((x) => x.id !== b.id && x.ambito === b.ambito && x.categorias.includes(c))
  const otroComodin = (b: BorradorBolsillo) =>
    bolsillos.find((x) => x.id !== b.id && x.ambito === b.ambito && x.categorias.length === 0)

  return (
    <div className="pila">
      <div className="cabecera">
        <div>
          <h1>Caja</h1>
          <p className="sub">Lo que entra, lo que hay en cada bolsillo y lo que queda.</p>
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

      {bolsillos.length === 0 ? (
        <Vacio
          emoji="💰"
          texto="Reparte lo que entra en bolsillos y sabrás, cada día, cuánto queda de verdad."
          hijo={
            <button className="btn" onClick={() => setArmando(true)}>
              Armar mi caja
            </button>
          }
        />
      ) : (
        <>
          <div className="tarjeta terracota">
            <span className="etiqueta">Queda · {nombreMes(mes)}</span>
            <div className="cifra grande">{dinero(r.queda, perfil.moneda)}</div>
            <p className="chica" style={{ opacity: 0.92, marginTop: 6 }}>
              Entró {dinero(r.base, perfil.moneda)}
              {r.usaEsperado && ' (esperado)'} · Salió {dinero(r.salidas, perfil.moneda)}
            </p>
            <div className="fila entre" style={{ marginTop: 12 }}>
              <span className="chica negrita">Libre de verdad</span>
              <span className="chica negrita">{dinero(r.libre, perfil.moneda)}</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <Barra valor={pct(r.libre, r.base)} color="blanca" />
            </div>
            <p className="mini" style={{ opacity: 0.85, marginTop: 6 }}>
              Comprometido {dinero(r.comprometido, perfil.moneda)}: facturas {dinero(r.facturasPendientes, perfil.moneda)} + mínimos de
              deuda {dinero(r.minimosDeuda, perfil.moneda)}
            </p>
          </div>

          <div className="tarjeta">
            <div className="fila entre">
              <div>
                <h3>Plan del mes</h3>
                <p className="chica suave">
                  Asignado {dinero(r.asignado, perfil.moneda)} de {dinero(r.ingresosEsperados, perfil.moneda)} esperados
                </p>
              </div>
              <span className={`chip ${r.sinAsignar >= 0 ? 'oliva' : 'terracota'}`}>
                {r.sinAsignar >= 0
                  ? `${dinero(r.sinAsignar, perfil.moneda)} sin bolsillo`
                  : `te pasaste por ${dinero(-r.sinAsignar, perfil.moneda)}`}
              </span>
            </div>
            <div className="fila mt" style={{ gap: 8 }}>
              <button
                className="btn chico fantasma"
                onClick={() => setEsperados({ a: perfil.ingresoEsperado?.a ?? 0, b: perfil.ingresoEsperado?.b ?? 0 })}
              >
                Ingresos esperados
              </button>
              <button className="btn chico secundario" onClick={() => setEditando(nuevoBolsillo('hogar'))}>
                + Bolsillo
              </button>
            </div>
          </div>

          {secciones.length === 0 && (
            <p className="chica suave centrado">Ningún bolsillo existía todavía en {nombreMes(mes)}.</p>
          )}

          {secciones.map((s) => (
            <div className="tarjeta" key={s.ambito}>
              <h3 className="mb">{s.titulo}</h3>
              {s.vistas.map((v) => (
                <div
                  className="item"
                  key={v.bolsillo.id}
                  onClick={() => setDetalle(v.bolsillo.id)}
                  style={{ cursor: 'pointer', display: 'block' }}
                >
                  <div className="fila entre">
                    <span className="negrita">
                      {v.bolsillo.emoji} {v.bolsillo.nombre}{' '}
                      <span className="mini suave" style={{ fontWeight: 600 }}>
                        {v.bolsillo.acumula ? '· guarda' : '· se reinicia'}
                      </span>
                    </span>
                    <span className="monto" style={v.disponible < 0 ? { color: '#b1402a' } : undefined}>
                      {dinero(v.disponible, perfil.moneda)}
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Barra valor={v.avance} color={colorBarra(v)} />
                  </div>
                  <div className="mini suave" style={{ marginTop: 4 }}>
                    gastado {dinero(v.gastado, perfil.moneda)} de {dinero(v.tope, perfil.moneda)}
                    {v.estado === 'rojo' && ' · en rojo'}
                    {v.estado === 'amarillo' && ' · casi'}
                  </div>
                </div>
              ))}
              {s.sin.n > 0 && (
                <p className="mini suave" style={{ marginTop: 8 }}>
                  Sin bolsillo: {s.sin.n} {s.sin.n === 1 ? 'gasto' : 'gastos'} · {dinero(s.sin.monto, perfil.moneda)}
                </p>
              )}
            </div>
          ))}

          <div className="tarjeta">
            <div className="fila entre mb">
              <h3>Ingresos del mes</h3>
              <span className="chica suave">{dinero(r.ingresosReales, perfil.moneda)}</span>
            </div>
            {ingresosMes.length === 0 ? (
              <p className="chica suave">Nada anotado todavía. Cuando llegue la nómina, anótala con el +.</p>
            ) : (
              ingresosMes.map((i) => {
                const f = fuenteInfo(i.fuente)
                return (
                  <div className="item" key={i.id} onClick={() => setIngreso(i)} style={{ cursor: 'pointer' }}>
                    <div className="icono">{f.emoji}</div>
                    <div className="cuerpo">
                      <div className="titulo">{i.nota || f.texto}</div>
                      <div className="chica suave">
                        {fechaCorta(i.fecha)} · {nombreDe(perfil, i.de)}
                      </div>
                    </div>
                    <div className="monto">{dinero(i.monto, perfil.moneda)}</div>
                  </div>
                )
              })
            )}
          </div>

          <button
            className="btn flotante oliva"
            onClick={() => setIngreso({ fecha: hoy(), monto: 0, de: 'a', fuente: 'nomina', nota: '' })}
            aria-label="Anotar ingreso"
            title="Anotar ingreso"
          >
            +
          </button>
        </>
      )}

      {armando && <ArmarCaja onCerrar={() => setArmando(false)} />}
      {ingreso && <IngresoModal inicial={ingreso} onCerrar={() => setIngreso(null)} onGuardado={() => mostrar('Ingreso anotado 💵')} />}

      {esperados && (
        <Modal titulo="Ingresos esperados" onCerrar={() => setEsperados(null)}>
          <div className="pila">
            <p className="chica suave">Lo que cada uno espera recibir en un mes normal. Es la base para repartir los bolsillos.</p>
            <Campo label={`Ingreso mensual de ${perfil.nombreA}`}>
              <InputMonto autoFocus valor={esperados.a} onCambio={(a) => setEsperados({ ...esperados, a })} />
            </Campo>
            <Campo label={`Ingreso mensual de ${perfil.nombreB}`}>
              <InputMonto valor={esperados.b} onCambio={(b) => setEsperados({ ...esperados, b })} />
            </Campo>
            <div className="acciones">
              <button
                className="btn"
                onClick={() => {
                  dispatch({ tipo: 'perfil', perfil: { ingresoEsperado: esperados } })
                  setEsperados(null)
                  mostrar('Guardado')
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {bolsilloDetalle && (
        <Modal titulo={`${bolsilloDetalle.emoji} ${bolsilloDetalle.nombre}`} onCerrar={() => setDetalle(null)}>
          {(() => {
            const v = vistaBolsillo(bolsilloDetalle, estado, mes)
            const lista = gastosDe(bolsilloDetalle, gastos, bolsillos, mes).sort((a, b) => b.fecha.localeCompare(a.fecha))
            const ajustes = bolsilloDetalle.ajustes.filter((a) => a.fecha.startsWith(mes))
            return (
              <div className="pila">
                <div className="fila entre">
                  <div>
                    <div className="etiqueta">Disponible · {nombreMes(mes)}</div>
                    <div className="cifra" style={v.disponible < 0 ? { color: '#b1402a' } : undefined}>
                      {dinero(v.disponible, perfil.moneda)}
                    </div>
                  </div>
                  <span className="chip">
                    {nombreAmbito(bolsilloDetalle.ambito)} · {bolsilloDetalle.acumula ? 'guarda' : 'se reinicia'}
                  </span>
                </div>
                <Barra valor={v.avance} color={colorBarra(v)} />
                <p className="mini suave">
                  gastado {dinero(v.gastado, perfil.moneda)} de {dinero(v.tope, perfil.moneda)} · asignación mensual{' '}
                  {dinero(bolsilloDetalle.asignacion, perfil.moneda)}
                </p>
                <div className="fila envolver" style={{ gap: 8 }}>
                  <button className="btn chico secundario" onClick={() => setEditando({ ...bolsilloDetalle })}>
                    Editar
                  </button>
                  <button
                    className="btn chico fantasma"
                    onClick={() => setAjustando({ id: bolsilloDetalle.id, modo: 'meter', monto: 0, nota: '' })}
                  >
                    Meter o sacar
                  </button>
                  {bolsillos.length > 1 && (
                    <button
                      className="btn chico fantasma"
                      onClick={() =>
                        setMoviendo({
                          de: bolsilloDetalle.id,
                          a: bolsillos.find((b) => b.id !== bolsilloDetalle.id)!.id,
                          monto: 0,
                          nota: '',
                        })
                      }
                    >
                      Mover plata
                    </button>
                  )}
                </div>

                {lista.length > 0 && (
                  <div>
                    <div className="etiqueta mb">Gastos del mes</div>
                    {lista.map((g) => {
                      const info = catInfo(g.categoria)
                      return (
                        <div className="item" key={g.id}>
                          <div className="icono">{info.emoji}</div>
                          <div className="cuerpo">
                            <div className="titulo">{g.nota || info.nombre}</div>
                            <div className="chica suave">
                              {fechaCorta(g.fecha)} · {nombreDe(perfil, g.pagadoPor)}
                            </div>
                          </div>
                          <div className="monto">{dinero(g.monto, perfil.moneda)}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {lista.length === 0 && <p className="chica suave">Nada gastado de aquí este mes.</p>}

                {ajustes.length > 0 && (
                  <div>
                    <div className="etiqueta mb">Movimientos</div>
                    {ajustes.map((a) => (
                      <div className="item" key={a.id}>
                        <div className="icono">{a.monto >= 0 ? '⬆️' : '⬇️'}</div>
                        <div className="cuerpo">
                          <div className="titulo">{a.nota || (a.monto >= 0 ? 'Entró' : 'Salió')}</div>
                          <div className="chica suave">{fechaCorta(a.fecha)}</div>
                        </div>
                        <div className="monto">{dinero(a.monto, perfil.moneda)}</div>
                        <button
                          className="btn-icono"
                          aria-label="Quitar movimiento"
                          onClick={() => dispatch({ tipo: 'bolsillo/quitarAjuste', id: bolsilloDetalle.id, ajusteId: a.id })}
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </Modal>
      )}

      {ajustando && (
        <Modal titulo="Meter o sacar plata" onCerrar={() => setAjustando(null)}>
          <div className="pila">
            <Segmento<'meter' | 'sacar'>
              valor={ajustando.modo}
              onCambio={(modo) => setAjustando({ ...ajustando, modo })}
              opciones={[
                { valor: 'meter', texto: 'Meter' },
                { valor: 'sacar', texto: 'Sacar' },
              ]}
            />
            <Campo label="Monto">
              <InputMonto autoFocus valor={ajustando.monto} onCambio={(monto) => setAjustando({ ...ajustando, monto })} />
            </Campo>
            <Campo label="¿Por qué?">
              <input
                value={ajustando.nota}
                onChange={(e) => setAjustando({ ...ajustando, nota: e.target.value })}
                placeholder="Ej: nos sobró del mercado"
              />
            </Campo>
            <div className="acciones">
              <button
                className="btn"
                disabled={ajustando.monto <= 0}
                onClick={() => {
                  dispatch({
                    tipo: 'bolsillo/ajustar',
                    id: ajustando.id,
                    ajuste: {
                      fecha: hoy(),
                      monto: ajustando.modo === 'meter' ? ajustando.monto : -ajustando.monto,
                      nota: ajustando.nota.trim(),
                    },
                  })
                  setAjustando(null)
                  mostrar('Listo')
                }}
              >
                Registrar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {moviendo && (
        <Modal titulo="Mover plata" onCerrar={() => setMoviendo(null)}>
          <div className="pila">
            <p className="chica suave">
              De <b>{bolsillos.find((b) => b.id === moviendo.de)?.nombre}</b> a:
            </p>
            <Campo label="Bolsillo destino">
              <select value={moviendo.a} onChange={(e) => setMoviendo({ ...moviendo, a: e.target.value })}>
                {bolsillos
                  .filter((b) => b.id !== moviendo.de)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.emoji} {b.nombre} · {nombreAmbito(b.ambito)}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo label="Monto">
              <InputMonto autoFocus valor={moviendo.monto} onCambio={(monto) => setMoviendo({ ...moviendo, monto })} />
            </Campo>
            <Campo label="Nota">
              <input value={moviendo.nota} onChange={(e) => setMoviendo({ ...moviendo, nota: e.target.value })} placeholder="Opcional" />
            </Campo>
            <div className="acciones">
              <button
                className="btn"
                disabled={moviendo.monto <= 0}
                onClick={() => {
                  dispatch({ tipo: 'bolsillo/mover', de: moviendo.de, a: moviendo.a, monto: moviendo.monto, fecha: hoy(), nota: moviendo.nota.trim() })
                  setMoviendo(null)
                  mostrar('Plata movida')
                }}
              >
                Mover
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editando && (
        <Modal titulo={editando.id ? 'Editar bolsillo' : 'Nuevo bolsillo'} onCerrar={() => setEditando(null)}>
          <div className="pila">
            <Campo label="Emoji">
              <EmojiPicker opciones={EMOJIS} valor={editando.emoji} onCambio={(emoji) => setEditando({ ...editando, emoji })} />
            </Campo>
            <Campo label="Nombre">
              <input autoFocus value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="Ej: Mercado y casa" />
            </Campo>
            <Campo label="¿De quién es?">
              <Segmento<Ambito>
                valor={editando.ambito}
                onCambio={(ambito) => setEditando({ ...editando, ambito })}
                opciones={[
                  { valor: 'hogar', texto: 'De la casa' },
                  { valor: 'a', texto: perfil.nombreA },
                  { valor: 'b', texto: perfil.nombreB },
                ]}
              />
            </Campo>
            <Campo label="Asignación mensual">
              <InputMonto valor={editando.asignacion} onCambio={(asignacion) => setEditando({ ...editando, asignacion })} />
            </Campo>
            <Campo label="¿Lo que sobra se guarda?">
              <Segmento<'si' | 'no'>
                valor={editando.acumula ? 'si' : 'no'}
                onCambio={(v) => setEditando(cambiarAcumula(editando, v === 'si'))}
                opciones={[
                  { valor: 'si', texto: 'Se guarda' },
                  { valor: 'no', texto: 'Se reinicia' },
                ]}
              />
              <p className="mini suave">
                {editando.acumula
                  ? 'Lo que no gasten pasa al mes siguiente. Ideal para ahorrar o para lo que no es mensual.'
                  : 'Cada mes arranca de nuevo con su asignación. Ideal para mercado, salidas o transporte.'}
              </p>
            </Campo>
            {editando.acumula && (
              <Campo label="Con cuánto arranca">
                <InputMonto valor={editando.saldoInicial} onCambio={(saldoInicial) => setEditando({ ...editando, saldoInicial })} />
              </Campo>
            )}
            <Campo label="Categorías que caen aquí">
              <div className="emojis">
                {CATEGORIAS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.nombre}
                    className={editando.categorias.includes(c.id) ? 'activo' : ''}
                    onClick={() =>
                      setEditando({
                        ...editando,
                        categorias: editando.categorias.includes(c.id)
                          ? editando.categorias.filter((x) => x !== c.id)
                          : [...editando.categorias, c.id],
                      })
                    }
                  >
                    {c.emoji}
                  </button>
                ))}
              </div>
              {editando.categorias.length === 0 ? (
                <p className="mini suave">
                  Sin categorías: recibe todo lo que no tenga bolsillo en este ámbito.
                  {otroComodin(editando) && ` Ojo: ${otroComodin(editando)!.nombre} ya hace eso.`}
                </p>
              ) : (
                <p className="mini suave">
                  {editando.categorias.map((c) => catInfo(c).nombre).join(', ')}
                  {editando.categorias
                    .map((c) => duenoDe(c, editando))
                    .filter((b): b is Bolsillo => !!b)
                    .filter((b, i, arr) => arr.indexOf(b) === i)
                    .map((b) => ` · se lo quito a ${b.nombre}`)
                    .join('')}
                </p>
              )}
            </Campo>
            <div className="acciones">
              {editando.id && (
                <button
                  className="btn peligro"
                  onClick={() => {
                    if (window.confirm('¿Borrar este bolsillo? Los gastos no se borran, solo dejan de contar aquí.')) {
                      dispatch({ tipo: 'bolsillo/borrar', id: editando.id! })
                      setEditando(null)
                      setDetalle(null)
                    }
                  }}
                >
                  Borrar
                </button>
              )}
              <button className="btn" disabled={!editando.nombre.trim()} onClick={guardarBolsillo}>
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

