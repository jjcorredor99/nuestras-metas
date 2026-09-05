import { useEffect, useMemo, useState } from 'react'
import { useStore, nombreDe } from '../store'
import type { Factura, Persona } from '../types'
import { dinero, mesActual, nombreMes, diasParaVencer, sumar } from '../format'
import { Modal, Campo, Segmento, Vacio, InputMonto, useToast } from '../components/ui'

type Borrador = {
  id?: string
  nombre: string
  monto: number
  diaVence: number
  responsable: Persona | 'ambos'
}

const nueva = (): Borrador => ({ nombre: '', monto: 0, diaVence: 5, responsable: 'ambos' })

const CLAVE_NOTIF = 'nuestras-metas:notif'

export function Facturas() {
  const { estado, dispatch } = useStore()
  const { perfil, facturas } = estado
  const mes = mesActual()
  const [editando, setEditando] = useState<Borrador | null>(null)
  const [permiso, setPermiso] = useState<NotificationPermission | 'no-soportado'>(
    typeof Notification === 'undefined' ? 'no-soportado' : Notification.permission,
  )
  const { mostrar, Toast } = useToast()

  const lista = useMemo(
    () =>
      facturas
        .filter((f) => f.activa)
        .map((f) => ({ f, dias: diasParaVencer(f.diaVence), pagada: f.pagadaEn.includes(mes) }))
        .sort((x, y) => Number(x.pagada) - Number(y.pagada) || x.dias - y.dias),
    [facturas, mes],
  )
  const pendiente = sumar(lista.filter((x) => !x.pagada).map((x) => x.f.monto))
  const totalMes = sumar(lista.map((x) => x.f.monto))

  // Aviso del navegador: una vez al día si hay algo que vence en ≤3 días.
  useEffect(() => {
    if (permiso !== 'granted') return
    const hoyKey = new Date().toDateString()
    if (localStorage.getItem(CLAVE_NOTIF) === hoyKey) return
    const urgentes = lista.filter((x) => !x.pagada && x.dias <= 3)
    if (urgentes.length === 0) return
    localStorage.setItem(CLAVE_NOTIF, hoyKey)
    const textos = urgentes.map((x) => `${x.f.nombre} (${x.dias <= 0 ? 'hoy' : `${x.dias} d`})`).join(', ')
    try {
      new Notification('Facturas por vencer', { body: textos })
    } catch {
      /* algunos móviles no permiten Notification directo */
    }
  }, [permiso, lista])

  const pedirPermiso = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setPermiso(p)
    if (p === 'granted') mostrar('Te avisaremos cuando algo esté por vencer')
  }

  const guardar = () => {
    if (!editando || !editando.nombre.trim() || editando.monto <= 0) return
    const base = { ...editando, nombre: editando.nombre.trim(), diaVence: Math.min(31, Math.max(1, editando.diaVence)) }
    if (editando.id) {
      const original = facturas.find((f) => f.id === editando.id)!
      dispatch({ tipo: 'factura/editar', factura: { ...original, ...base, id: editando.id } as Factura })
    } else {
      dispatch({ tipo: 'factura/agregar', factura: base })
    }
    setEditando(null)
  }

  const marcar = (f: Factura, pagada: boolean) => {
    if (pagada) {
      const registrar = window.confirm(`¿Anotar ${dinero(f.monto, perfil.moneda)} también como gasto del mes?`)
      dispatch({ tipo: 'factura/pagar', id: f.id, mes, pagada: true, registrarGasto: registrar })
      mostrar('¡Una menos! ✅')
    } else {
      dispatch({ tipo: 'factura/pagar', id: f.id, mes, pagada: false })
    }
  }

  return (
    <div className="pila">
      <div className="cabecera">
        <div>
          <h1>Facturas</h1>
          <p className="sub">{nombreMes(mes)} · para que ninguna nos coja por sorpresa.</p>
        </div>
      </div>

      <div className="grid2">
        <div className="tarjeta mostaza">
          <span className="etiqueta">Por pagar</span>
          <div className="cifra">{dinero(pendiente, perfil.moneda)}</div>
        </div>
        <div className="tarjeta">
          <span className="etiqueta">Total del mes</span>
          <div className="cifra">{dinero(totalMes, perfil.moneda)}</div>
        </div>
      </div>

      {permiso === 'default' && (
        <div className="tarjeta fila entre envolver">
          <div className="col" style={{ flex: 1 }}>
            <span className="negrita">Recordatorios</span>
            <span className="chica suave">Un aviso cuando algo venza en 3 días o menos (al abrir la app).</span>
          </div>
          <button className="btn chico secundario" onClick={pedirPermiso}>
            Activar
          </button>
        </div>
      )}

      {lista.length === 0 ? (
        <Vacio emoji="📬" texto="Agrega las facturas fijas: arriendo, luz, internet, celular, tarjeta..." />
      ) : (
        <div className="tarjeta">
          {lista.map(({ f, dias, pagada }) => (
            <div className={`item ${pagada ? 'pagada' : ''}`} key={f.id}>
              <button className={`check ${pagada ? 'on' : ''}`} onClick={() => marcar(f, !pagada)} aria-label="Marcar pagada">
                {pagada ? '✓' : ''}
              </button>
              <div className="cuerpo" onClick={() => setEditando({ ...f })} style={{ cursor: 'pointer' }}>
                <div className={`titulo ${pagada ? 'tachado' : ''}`}>{f.nombre}</div>
                <div className="chica suave">
                  {pagada ? (
                    'pagada este mes'
                  ) : (
                    <>
                      <span className={dias <= 2 ? 'negrita' : ''} style={dias <= 2 ? { color: '#b1402a' } : undefined}>
                        {dias < 0 ? `vencida hace ${-dias} d` : dias === 0 ? 'vence hoy' : dias === 1 ? 'vence mañana' : `vence en ${dias} d`}
                      </span>
                      {' · '}día {f.diaVence} · {nombreDe(perfil, f.responsable)}
                    </>
                  )}
                </div>
              </div>
              <div className="monto">{dinero(f.monto, perfil.moneda)}</div>
            </div>
          ))}
        </div>
      )}

      <button className="btn flotante" onClick={() => setEditando(nueva())} aria-label="Nueva factura">
        +
      </button>

      {editando && (
        <Modal titulo={editando.id ? 'Editar factura' : 'Nueva factura'} onCerrar={() => setEditando(null)}>
          <div className="pila">
            <Campo label="Nombre">
              <input autoFocus value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="Ej: Internet" />
            </Campo>
            <div className="grid2">
              <Campo label="Monto">
                <InputMonto valor={editando.monto} onCambio={(monto) => setEditando({ ...editando, monto })} />
              </Campo>
              <Campo label="Día que vence">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={editando.diaVence}
                  onChange={(e) => setEditando({ ...editando, diaVence: Number(e.target.value) })}
                />
              </Campo>
            </div>
            <Campo label="¿Quién la paga?">
              <Segmento<Persona | 'ambos'>
                valor={editando.responsable}
                onCambio={(responsable) => setEditando({ ...editando, responsable })}
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
                    dispatch({ tipo: 'factura/borrar', id: editando.id! })
                    setEditando(null)
                  }}
                >
                  Borrar
                </button>
              )}
              <button className="btn" disabled={!editando.nombre.trim() || editando.monto <= 0} onClick={guardar}>
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
