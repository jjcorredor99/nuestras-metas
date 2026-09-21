import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { usePrecios, type Candidato } from '../precios'
import {
  comparativo,
  ETIQUETA_FRESCURA,
  leerContenido,
  nombreTienda,
  nombreUnidad,
  puntajeCoincidencia,
  TIENDAS,
  vistaDeProducto,
  type PrecioVista,
} from '../mercado'
import type { ListaCompras, Producto, TiendaId, Unidad, Vinculo } from '../types'
import { dinero, hoy } from '../format'
import { Campo, EmojiPicker, InputMonto, Modal, Segmento, Vacio, useToast } from '../components/ui'

const EMOJIS = ['🛒', '🥛', '🍚', '🥚', '🍞', '🧻', '🫒', '☕', '🧀', '🍗', '🍌', '🧴']

const UNIDADES: { valor: Unidad; texto: string }[] = [
  { valor: 'l', texto: 'Litros' },
  { valor: 'kg', texto: 'Kilos' },
  { valor: 'un', texto: 'Unidades' },
]

type Borrador = {
  id?: string
  nombre: string
  emoji: string
  unidad: Unidad
  contenidoRef: number
  habitual: number
}

const nuevo = (): Borrador => ({ nombre: '', emoji: '🛒', unidad: 'l', contenidoRef: 1, habitual: 1 })

/** El sello que acompaña a todo precio: de dónde salió y de cuándo es. */
function Sello({ p }: { p: PrecioVista }) {
  const clase = p.fuente === 'folleto' ? 'mostaza' : p.fuente === 'manual' ? 'arcilla' : p.confiable ? 'oliva' : ''
  const texto =
    p.fuente === 'folleto' ? '📰 del folleto' : p.fuente === 'manual' ? '✍️ a mano' : ETIQUETA_FRESCURA[p.frescura]
  return <span className={`chip ${clase}`}>{texto}</span>
}

export function Mercado() {
  const { estado, dispatch } = useStore()
  const { perfil, productos, listas } = estado
  const { precios, caidas, faltaSql, recargar, anotarPrecio, buscar, leerFolleto } = usePrecios()
  const { mostrar, Toast } = useToast()

  const [pestana, setPestana] = useState<'canasta' | 'lista'>('canasta')
  const [editando, setEditando] = useState<Borrador | null>(null)
  const [ficha, setFicha] = useState<string | null>(null)
  const [paradas, setParadas] = useState(2)

  const dia = hoy()
  const moneda = perfil.moneda

  const canasta = useMemo(
    () => productos.filter((p) => p.activo).map((p) => vistaDeProducto(p, precios, dia)),
    [productos, precios, dia],
  )
  const conPrecio = canasta.filter((c) => c.mejor).length

  const listaActiva: ListaCompras | null = listas[0] ?? null
  const cuentas = useMemo(
    () => (listaActiva ? comparativo(listaActiva, productos, precios, dia, { maxTiendas: paradas, moneda }) : null),
    [listaActiva, productos, precios, dia, paradas, moneda],
  )

  const guardar = () => {
    if (!editando || !editando.nombre.trim()) return
    const base = {
      nombre: editando.nombre.trim(),
      emoji: editando.emoji,
      unidad: editando.unidad,
      contenidoRef: Math.max(0, editando.contenidoRef),
      habitual: Math.max(1, Math.round(editando.habitual)),
    }
    if (editando.id) {
      const original = productos.find((p) => p.id === editando.id)!
      dispatch({ tipo: 'producto/editar', producto: { ...original, ...base } })
    } else {
      dispatch({ tipo: 'producto/agregar', producto: base })
    }
    setEditando(null)
  }

  const aLaLista = (productoId: string, cantidad: number) => {
    if (!listaActiva) {
      dispatch({ tipo: 'lista/crear', nombre: 'Mercado' })
      // La lista recién creada queda de primera; se agrega en el siguiente toque.
      mostrar('Lista creada: vuelve a tocar el producto')
      return
    }
    dispatch({ tipo: 'lista/poner', id: listaActiva.id, productoId, cantidad })
  }

  return (
    <div className="pila">
      <div className="cabecera">
        <div>
          <h1>Mercado</h1>
          <p className="sub">Lo mismo, pero en la tienda que toca. Precios de Bogotá.</p>
        </div>
      </div>

      <Segmento<'canasta' | 'lista'>
        valor={pestana}
        onCambio={setPestana}
        opciones={[
          { valor: 'canasta', texto: 'Comparar' },
          { valor: 'lista', texto: 'Lista' },
        ]}
      />

      {faltaSql && (
        <div className="tarjeta mostaza">
          <span className="negrita">Faltan las tablas de precios</span>
          <p className="chica">
            Peguen <code>supabase/precios.sql</code> en el SQL Editor de Supabase. Mientras tanto la canasta
            funciona, pero sin precios.
          </p>
        </div>
      )}

      {caidas.length > 0 && (
        <div className="tarjeta arcilla">
          <span className="chica">
            {caidas.map((c) => `${nombreTienda(c.tienda)} no se pudo leer desde el ${c.desde}`).join(' · ')}
          </span>
        </div>
      )}

      {pestana === 'canasta' && <Folleto onLeer={leerFolleto} onAviso={mostrar} />}

      {pestana === 'canasta' ? (
        <>
          <div className="grid2">
            <div className="tarjeta">
              <span className="etiqueta">En la canasta</span>
              <div className="cifra">{canasta.length}</div>
            </div>
            <div className="tarjeta oliva">
              <span className="etiqueta">Con precio</span>
              <div className="cifra">{conPrecio}</div>
            </div>
          </div>

          {canasta.length === 0 ? (
            <Vacio
              emoji="🛒"
              texto="Agreguen lo que compran siempre: la leche, el arroz, el aceite. Después se vincula una vez con cada tienda y la app hace el resto."
            />
          ) : (
            <div className="tarjeta">
              {canasta.map(({ producto, mejor, precios: filas }) => (
                <div className="item" key={producto.id} onClick={() => setFicha(producto.id)} style={{ cursor: 'pointer' }}>
                  <div className="grande" style={{ fontSize: 26 }}>
                    {producto.emoji}
                  </div>
                  <div className="cuerpo">
                    <div className="titulo">{producto.nombre}</div>
                    <div className="chica suave">
                      {mejor ? (
                        <>
                          más barato en <span className="negrita">{nombreTienda(mejor.tienda)}</span> ·{' '}
                          {dinero(mejor.porUnidad, moneda)} por {nombreUnidad(producto.unidad)}
                          {filas.length === 1 ? ' (sin con qué comparar todavía)' : ''}
                        </>
                      ) : (
                        'sin precios: vincúlenlo o anoten lo que vieron'
                      )}
                    </div>
                  </div>
                  <div className="monto">{mejor ? dinero(mejor.precio, moneda) : '—'}</div>
                </div>
              ))}
            </div>
          )}

          <button className="btn flotante" onClick={() => setEditando(nuevo())} aria-label="Nuevo producto">
            +
          </button>
        </>
      ) : (
        <ListaDeCompras
          lista={listaActiva}
          productos={productos}
          vistas={canasta}
          cuentas={cuentas}
          paradas={paradas}
          setParadas={setParadas}
          moneda={moneda}
          onCrear={() => dispatch({ tipo: 'lista/crear', nombre: 'Mercado' })}
          onCantidad={(productoId, cantidad) => aLaLista(productoId, cantidad)}
          onMarcar={(productoId, listo) =>
            listaActiva && dispatch({ tipo: 'lista/marcar', id: listaActiva.id, productoId, listo })
          }
          onLimpiar={() => listaActiva && dispatch({ tipo: 'lista/limpiar', id: listaActiva.id })}
        />
      )}

      {editando && (
        <Modal titulo={editando.id ? 'Editar producto' : 'Nuevo producto'} onCerrar={() => setEditando(null)}>
          <div className="pila">
            <Campo label="¿Qué es?">
              <input
                autoFocus
                value={editando.nombre}
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                placeholder="Ej: Leche Colanta 1L"
              />
            </Campo>
            <Campo label="Emoji">
              <EmojiPicker opciones={EMOJIS} valor={editando.emoji} onCambio={(emoji) => setEditando({ ...editando, emoji })} />
            </Campo>
            <Campo label="¿En qué se compara?">
              <Segmento<Unidad>
                valor={editando.unidad}
                onCambio={(unidad) => setEditando({ ...editando, unidad })}
                opciones={UNIDADES}
              />
            </Campo>
            <div className="grid2">
              <Campo label={`Contenido de referencia (${editando.unidad})`}>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={editando.contenidoRef}
                  onChange={(e) => setEditando({ ...editando, contenidoRef: Number(e.target.value) })}
                />
              </Campo>
              <Campo label="Cuántos suelen llevar">
                <input
                  type="number"
                  min={1}
                  value={editando.habitual}
                  onChange={(e) => setEditando({ ...editando, habitual: Number(e.target.value) })}
                />
              </Campo>
            </div>
            <div className="acciones">
              {editando.id && (
                <button
                  className="btn peligro"
                  onClick={() => {
                    dispatch({ tipo: 'producto/borrar', id: editando.id! })
                    setEditando(null)
                  }}
                >
                  Borrar
                </button>
              )}
              <button className="btn" disabled={!editando.nombre.trim()} onClick={guardar}>
                Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {ficha && (
        <Ficha
          producto={productos.find((p) => p.id === ficha)!}
          vista={canasta.find((c) => c.producto.id === ficha)}
          moneda={moneda}
          buscar={buscar}
          onCerrar={() => setFicha(null)}
          onEditar={(p) => {
            setFicha(null)
            setEditando({ id: p.id, nombre: p.nombre, emoji: p.emoji, unidad: p.unidad, contenidoRef: p.contenidoRef, habitual: p.habitual })
          }}
          onVincular={(id, vinculo) => dispatch({ tipo: 'producto/vincular', id, vinculo })}
          onDesvincular={(id, tienda) => dispatch({ tipo: 'producto/desvincular', id, tienda })}
          onAnotar={async (p) => {
            const error = await anotarPrecio(p)
            mostrar(error ?? 'Precio anotado')
            return error
          }}
          onRecargar={recargar}
          onLista={(id) => {
            const p = productos.find((x) => x.id === id)
            aLaLista(id, p?.habitual ?? 1)
            mostrar('A la lista 🛒')
          }}
        />
      )}

      {Toast}
    </div>
  )
}

// ---------- la foto del folleto ----------

const leerArchivo = (f: File): Promise<string> =>
  new Promise((listo, falla) => {
    const lector = new FileReader()
    lector.onload = () => listo(String(lector.result))
    lector.onerror = () => falla(new Error('No se pudo leer la foto'))
    lector.readAsDataURL(f)
  })

/**
 * D1 y Ara no tienen tienda en línea de verdad. Si el robot no alcanzó el folleto
 * de la semana, ustedes le toman una foto en el pasillo y lo lee Claude.
 */
function Folleto({
  onLeer,
  onAviso,
}: {
  onLeer: (tienda: TiendaId, imagenes: string[]) => Promise<string | null>
  onAviso: (m: string) => void
}) {
  const [tienda, setTienda] = useState<TiendaId | null>(null)
  const [leyendo, setLeyendo] = useState(false)

  const soloFolleto = TIENDAS.filter((t) => t.fuente === 'folleto')

  const subir = async (lista: FileList | null) => {
    if (!lista || !tienda) return
    setLeyendo(true)
    try {
      const imagenes = await Promise.all([...lista].slice(0, 6).map(leerArchivo))
      const error = await onLeer(tienda, imagenes)
      onAviso(error ?? 'Folleto leído 📰')
    } catch (e) {
      onAviso(e instanceof Error ? e.message : 'No se pudo leer la foto')
    } finally {
      setLeyendo(false)
      setTienda(null)
    }
  }

  return (
    <div className="tarjeta fila entre envolver">
      <div className="col" style={{ flex: 1 }}>
        <span className="negrita">📰 Foto del folleto</span>
        <span className="chica suave">
          {soloFolleto.map((t) => t.nombre).join(' y ')} no tienen tienda en línea. Si están allá, tómenle una foto
          al folleto y la app saca los precios.
        </span>
      </div>
      <div className="fila" style={{ gap: 6 }}>
        {soloFolleto.map((t) => (
          <label key={t.id} className="btn chico secundario" style={{ cursor: 'pointer' }}>
            {leyendo && tienda === t.id ? 'Leyendo…' : t.nombre}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={leyendo}
              onClick={() => setTienda(t.id)}
              onChange={(e) => {
                void subir(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

// ---------- la lista de compras ----------

function ListaDeCompras({
  lista,
  productos,
  vistas,
  cuentas,
  paradas,
  setParadas,
  moneda,
  onCrear,
  onCantidad,
  onMarcar,
  onLimpiar,
}: {
  lista: ListaCompras | null
  productos: Producto[]
  vistas: ReturnType<typeof vistaDeProducto>[]
  cuentas: ReturnType<typeof comparativo> | null
  paradas: number
  setParadas: (n: number) => void
  moneda: string
  onCrear: () => void
  onCantidad: (productoId: string, cantidad: number) => void
  onMarcar: (productoId: string, listo: boolean) => void
  onLimpiar: () => void
}) {
  const [agregando, setAgregando] = useState(false)

  if (!lista) {
    return (
      <Vacio
        emoji="📝"
        texto="Armen la lista del mercado y la app les dice cuánto cuesta en cada tienda."
        hijo={
          <button className="btn" onClick={onCrear}>
            Nueva lista
          </button>
        }
      />
    )
  }

  const enLista = lista.items.filter((i) => i.cantidad > 0)
  const fuera = productos.filter((p) => p.activo && !enLista.some((i) => i.productoId === p.id))

  return (
    <>
      {cuentas && (
        <div className={`tarjeta ${cuentas.valeLaPena ? 'oliva' : ''}`}>
          <span className="etiqueta">La cuenta</span>
          <p style={{ marginBottom: 8 }}>{cuentas.frase}</p>
          <div className="fila entre envolver">
            <span className="chica suave">¿Cuántas paradas están dispuestos a hacer?</span>
            <Segmento<string>
              valor={String(paradas)}
              onCambio={(v) => setParadas(Number(v))}
              opciones={[
                { valor: '1', texto: 'Una' },
                { valor: '2', texto: 'Dos' },
                { valor: '3', texto: 'Tres' },
              ]}
            />
          </div>
        </div>
      )}

      {enLista.length === 0 ? (
        <Vacio emoji="🧺" texto="La lista está vacía." hijo={<button className="btn" onClick={() => setAgregando(true)}>Agregar productos</button>} />
      ) : (
        <div className="tarjeta">
          {enLista.map((item) => {
            const p = productos.find((x) => x.id === item.productoId)
            if (!p) return null
            const donde = cuentas?.repartido.asignacion.get(p.id)
            // La lista suma paquetes, no litros: si allá viene en otra presentación hay que decirlo,
            // porque el total puede ganar sencillamente porque trae menos.
            const paquete = donde
              ? vistas.find((v) => v.producto.id === p.id)?.precios.find((x) => x.tienda === donde)
              : undefined
            const otroTamano = paquete && Math.abs(paquete.contenido - p.contenidoRef) > 0.001
            return (
              <div className={`item ${item.listo ? 'pagada' : ''}`} key={p.id}>
                <button
                  className={`check ${item.listo ? 'on' : ''}`}
                  onClick={() => onMarcar(p.id, !item.listo)}
                  aria-label="Marcar como comprado"
                >
                  {item.listo ? '✓' : ''}
                </button>
                <div className="cuerpo">
                  <div className={`titulo ${item.listo ? 'tachado' : ''}`}>
                    {p.emoji} {p.nombre}
                  </div>
                  <div className="chica suave">
                    {donde ? `más barato en ${nombreTienda(donde)}` : 'sin precio todavía'}
                    {otroTamano && paquete && (
                      <>
                        {' · '}
                        <span className="negrita">
                          allá viene de {paquete.contenido.toLocaleString('es-CO')} {p.unidad}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="fila" style={{ gap: 6 }}>
                  <button className="btn chico fantasma" onClick={() => onCantidad(p.id, item.cantidad - 1)} aria-label="Menos">
                    −
                  </button>
                  <span className="negrita" style={{ minWidth: 18, textAlign: 'center' }}>
                    {item.cantidad}
                  </span>
                  <button className="btn chico fantasma" onClick={() => onCantidad(p.id, item.cantidad + 1)} aria-label="Más">
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="fila entre envolver">
        <button className="btn secundario" onClick={() => setAgregando(true)}>
          Agregar productos
        </button>
        {enLista.some((i) => i.listo) && (
          <button className="btn fantasma" onClick={onLimpiar}>
            Quitar lo comprado
          </button>
        )}
      </div>

      {cuentas && cuentas.unaTienda.some((o) => o.total > 0) && (
        <div className="tarjeta">
          <span className="etiqueta">Si compran todo en una sola</span>
          {cuentas.unaTienda.map((o) => (
            <div className="item" key={o.tiendas[0]}>
              <div className="cuerpo">
                <div className="titulo">{nombreTienda(o.tiendas[0])}</div>
                {o.faltan.length > 0 && (
                  <div className="chica suave">
                    le {o.faltan.length === 1 ? 'falta 1 producto' : `faltan ${o.faltan.length} productos`}
                  </div>
                )}
              </div>
              <div className="monto">{o.total > 0 ? dinero(o.total, moneda) : '—'}</div>
            </div>
          ))}
        </div>
      )}

      {agregando && (
        <Modal titulo="Agregar a la lista" onCerrar={() => setAgregando(false)}>
          {fuera.length === 0 ? (
            <p className="chica suave">Ya está todo lo de la canasta en la lista.</p>
          ) : (
            <div className="pila">
              {fuera.map((p) => (
                <button
                  key={p.id}
                  className="btn secundario ancho"
                  onClick={() => {
                    onCantidad(p.id, p.habitual)
                    setAgregando(false)
                  }}
                >
                  {p.emoji} {p.nombre}
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

// ---------- la ficha de un producto ----------

function Ficha({
  producto,
  vista,
  moneda,
  buscar,
  onCerrar,
  onEditar,
  onVincular,
  onDesvincular,
  onAnotar,
  onRecargar,
  onLista,
}: {
  producto: Producto
  vista: ReturnType<typeof vistaDeProducto> | undefined
  moneda: string
  buscar: (termino: string) => Promise<Candidato[]>
  onCerrar: () => void
  onEditar: (p: Producto) => void
  onVincular: (id: string, vinculo: Vinculo) => void
  onDesvincular: (id: string, tienda: TiendaId) => void
  onAnotar: (p: { tienda: TiendaId; nombre: string; precio: number; contenido?: number; unidad?: Unidad; sku?: string }) => Promise<string | null>
  onRecargar: () => Promise<void>
  onLista: (id: string) => void
}) {
  const [vinculando, setVinculando] = useState<TiendaId | null>(null)
  const [anotando, setAnotando] = useState<TiendaId | null>(null)

  const porTienda = new Map(vista?.precios.map((p) => [p.tienda, p]) ?? [])

  return (
    <Modal titulo={`${producto.emoji} ${producto.nombre}`} onCerrar={onCerrar}>
      <div className="pila">
        <p className="chica suave">
          Se compara por {nombreUnidad(producto.unidad)}. Cada tienda vende otra presentación, así que el precio
          de la etiqueta no dice quién está más barato.
        </p>

        <div className="tarjeta">
          {TIENDAS.map((t) => {
            const p = porTienda.get(t.id)
            const v = producto.vinculos.find((x) => x.tienda === t.id)
            const esMejor = vista?.mejor?.tienda === t.id
            return (
              <div className="item" key={t.id}>
                <div className="cuerpo">
                  <div className="titulo">
                    {nombreTienda(t.id)} {esMejor && <span className="chip oliva">la más barata</span>}
                  </div>
                  <div className="chica suave">
                    {p ? (
                      <>
                        {dinero(p.porUnidad, moneda)} por {nombreUnidad(producto.unidad)} · <Sello p={p} />
                      </>
                    ) : v ? (
                      'vinculado, pero sin precio usable'
                    ) : (
                      'sin vincular'
                    )}
                  </div>
                  <div className="fila" style={{ gap: 6, marginTop: 6, whiteSpace: 'nowrap' }}>
                    <button className="btn chico fantasma" onClick={() => setVinculando(t.id)}>
                      {v ? 'Cambiar' : 'Vincular'}
                    </button>
                    <button className="btn chico fantasma" onClick={() => setAnotando(t.id)}>
                      A mano
                    </button>
                    {v && (
                      <button className="btn chico fantasma" onClick={() => onDesvincular(producto.id, t.id)}>
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
                <div className="monto">{p ? dinero(p.precio, moneda) : '—'}</div>
              </div>
            )
          })}
        </div>

        <div className="acciones">
          <button className="btn fantasma" onClick={() => onEditar(producto)}>
            Editar
          </button>
          <button className="btn" onClick={() => onLista(producto.id)}>
            A la lista
          </button>
        </div>
      </div>

      {vinculando && (
        <Vincular
          producto={producto}
          tienda={vinculando}
          buscar={buscar}
          onCerrar={() => setVinculando(null)}
          onElegir={(vinculo) => {
            onVincular(producto.id, vinculo)
            setVinculando(null)
          }}
        />
      )}

      {anotando && (
        <AnotarPrecio
          producto={producto}
          tienda={anotando}
          onCerrar={() => setAnotando(null)}
          onGuardar={async (datos) => {
            const error = await onAnotar(datos)
            if (!error) {
              onVincular(producto.id, {
                tienda: anotando,
                sku: datos.sku ?? '',
                nombre: datos.nombre,
                contenido: datos.contenido ?? producto.contenidoRef,
                unidad: producto.unidad,
                confirmado: true,
              })
              await onRecargar()
              setAnotando(null)
            }
            return error
          }}
        />
      )}
    </Modal>
  )
}

// ---------- vincular con el SKU de una tienda ----------

function Vincular({
  producto,
  tienda,
  buscar,
  onCerrar,
  onElegir,
}: {
  producto: Producto
  tienda: TiendaId
  buscar: (termino: string) => Promise<Candidato[]>
  onCerrar: () => void
  onElegir: (v: Vinculo) => void
}) {
  const [termino, setTermino] = useState(producto.nombre)
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null)
  const [buscando, setBuscando] = useState(false)

  const lanzar = async () => {
    setBuscando(true)
    const todos = await buscar(termino)
    setCandidatos(todos.filter((c) => c.tienda === tienda))
    setBuscando(false)
  }

  const ordenados = (candidatos ?? [])
    .map((c) => ({
      c,
      puntaje: puntajeCoincidencia(
        producto.nombre,
        c.nombre,
        c.contenido ? { canonico: producto.contenidoRef, tienda: c.contenido } : undefined,
      ),
    }))
    .sort((a, b) => b.puntaje - a.puntaje)

  return (
    <Modal titulo={`Vincular en ${nombreTienda(tienda)}`} onCerrar={onCerrar}>
      <div className="pila">
        <Campo label="Buscar en la tienda">
          <input autoFocus value={termino} onChange={(e) => setTermino(e.target.value)} placeholder="Ej: leche colanta" />
        </Campo>
        <button className="btn ancho" onClick={lanzar} disabled={buscando || termino.trim().length < 3}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>

        {candidatos !== null && ordenados.length === 0 && (
          <p className="chica suave">
            Nada. {TIENDAS.find((t) => t.id === tienda)?.fuente === 'folleto'
              ? 'Esta tienda solo se lee del folleto: por ahora, anoten el precio a mano.'
              : 'Puede que el robot todavía no llegue a esta tienda; anoten el precio a mano.'}
          </p>
        )}

        {ordenados.map(({ c, puntaje }) => (
          <button
            key={c.sku}
            className="btn secundario ancho"
            style={{ textAlign: 'left' }}
            onClick={() =>
              onElegir({
                tienda,
                sku: c.sku,
                nombre: c.nombre,
                contenido: c.contenido ?? leerContenido(c.nombre)?.contenido ?? producto.contenidoRef,
                unidad: c.unidad ?? producto.unidad,
                confirmado: true,
              })
            }
          >
            <span className="negrita">{c.nombre}</span>
            <span className="chica suave">
              {' '}
              · {dinero(c.precio)} {puntaje >= 0.85 ? '· parece el mismo' : ''}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ---------- anotar un precio a mano ----------

function AnotarPrecio({
  producto,
  tienda,
  onCerrar,
  onGuardar,
}: {
  producto: Producto
  tienda: TiendaId
  onCerrar: () => void
  onGuardar: (datos: {
    tienda: TiendaId
    nombre: string
    precio: number
    contenido?: number
    unidad?: Unidad
    sku?: string
  }) => Promise<string | null>
}) {
  const [nombre, setNombre] = useState(producto.nombre)
  const [precio, setPrecio] = useState(0)
  const [contenido, setContenido] = useState(producto.contenidoRef)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    const e = await onGuardar({ tienda, nombre: nombre.trim(), precio, contenido, unidad: producto.unidad })
    setError(e)
    setGuardando(false)
  }

  return (
    <Modal titulo={`Precio en ${nombreTienda(tienda)}`} onCerrar={onCerrar}>
      <div className="pila">
        <p className="chica suave">Lo que vieron en el estante. Queda marcado como anotado a mano, con su fecha.</p>
        <Campo label="Cómo se llama allá">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <div className="grid2">
          <Campo label="Precio">
            <InputMonto valor={precio} onCambio={setPrecio} autoFocus />
          </Campo>
          <Campo label={`Contenido (${producto.unidad})`}>
            <input type="number" step="0.1" min={0} value={contenido} onChange={(e) => setContenido(Number(e.target.value))} />
          </Campo>
        </div>
        {error && <p className="chica" style={{ color: 'var(--alerta)' }}>{error}</p>}
        <div className="acciones">
          <button className="btn" disabled={guardando || precio <= 0 || !nombre.trim()} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
