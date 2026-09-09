import { useMemo } from 'react'
import { useStore, saldoDeuda, ahorradoMeta, GRECIA_ID } from '../store'
import { dinero, hoy, mesActual, nombreMes, diasParaVencer, diasHasta, pct, sumar } from '../format'
import { Barra, Pulso } from '../components/ui'
import { catInfo } from '../categorias'
import { MuroMini } from './Muro'
import { useSync } from '../sync'
import { useEntrantes } from '../entrantes'
import { resumenMes, comparacion, fraseComparacion, alertasBolsillos, vistaUnSueldo } from '../caja'

export function Inicio({ ir }: { ir: (p: string) => void }) {
  const { estado } = useStore()
  const sync = useSync()
  const { pendientes: porConfirmar } = useEntrantes()
  const { perfil, gastos, facturas, deudas, retos, metas, bolsillos, ingresos } = estado
  const mes = mesActual()

  const gastosMes = useMemo(() => gastos.filter((g) => g.fecha.startsWith(mes)), [gastos, mes])
  const totalMes = sumar(gastosMes.map((g) => g.monto))
  const porPersona = {
    a: sumar(gastosMes.filter((g) => g.pagadoPor === 'a').map((g) => g.monto)),
    b: sumar(gastosMes.filter((g) => g.pagadoPor === 'b').map((g) => g.monto)),
  }

  const pendientes = facturas
    .filter((f) => f.activa && !f.pagadaEn.includes(mes))
    .map((f) => ({ ...f, dias: diasParaVencer(f.diaVence) }))
    .sort((x, y) => x.dias - y.dias)
    .slice(0, 3)

  const deudaInicial = sumar(deudas.map((d) => d.montoInicial))
  const deudaActual = sumar(deudas.map(saldoDeuda))
  const deudaPagadaPct = pct(deudaInicial - deudaActual, deudaInicial)

  const retosActivos = retos.filter((r) => !r.completado)
  const retosHechos = retos.filter((r) => r.completado).length

  const grecia = metas.find((m) => m.id === GRECIA_ID)
  const greciaAhorro = grecia ? ahorradoMeta(grecia) : 0
  const greciaDias = grecia ? diasHasta(grecia.fecha) : 0

  const saludo = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 19) return 'Buenas tardes'
    return 'Buenas noches'
  })()

  const hayCaja = bolsillos.length > 0 || ingresos.length > 0 || !!perfil.ingresoEsperado
  const caja = useMemo(() => resumenMes(estado, mes), [estado, mes])
  const frase = useMemo(
    () =>
      fraseComparacion(
        comparacion(estado, mes, Number(hoy().slice(8, 10))),
        (c) => catInfo(c).nombre,
        (n) => dinero(n, perfil.moneda),
      ),
    [estado, mes, perfil.moneda],
  )
  const alertas = useMemo(() => alertasBolsillos(estado, mes), [estado, mes])
  const unSueldo = useMemo(() => vistaUnSueldo(estado, mes), [estado, mes])
  const conRegla = !!perfil.plan && unSueldo.tope > 0

  // Los últimos siete días de gasto, para ver el ritmo de la semana de un vistazo.
  const pulso = useMemo(() => {
    const letras = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
    const base = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const f = new Date(base)
      f.setDate(base.getDate() - (6 - i))
      const iso = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
      return { letra: letras[f.getDay()], valor: sumar(gastos.filter((g) => g.fecha === iso).map((g) => g.monto)) }
    })
  }, [gastos])

  const topCats = useMemo(() => {
    const m = new Map<string, number>()
    gastosMes.forEach((g) => m.set(g.categoria, (m.get(g.categoria) ?? 0) + g.monto))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [gastosMes])

  return (
    <div className="pila">
      <div className="cabecera">
        <div>
          <p className="sub">{saludo}</p>
          <h1>{perfil.nombrePareja}</h1>
        </div>
        <div className="fila" style={{ gap: 6 }}>
          {sync.estadoSync !== 'sin-config' && (
            <button
              className="btn-icono"
              onClick={() => ir('ajustes')}
              aria-label="Sincronización"
              title={
                sync.estadoSync === 'listo'
                  ? sync.error
                    ? 'Problema al sincronizar'
                    : sync.pendientes > 0
                      ? 'Subiendo cambios'
                      : 'Sincronizado con la otra persona'
                  : 'Sin sincronizar. Toca para vincular.'
              }
              style={sync.estadoSync !== 'listo' ? { opacity: 0.55 } : undefined}
            >
              {sync.estadoSync !== 'listo' ? '☁️' : sync.error ? '⚠️' : sync.pendientes > 0 ? '⏳' : '☁️'}
            </button>
          )}
          <button className="btn-icono" onClick={() => ir('ajustes')} aria-label="Ajustes" title="Ajustes">
            ⚙️
          </button>
        </div>
      </div>

      {porConfirmar.length > 0 && (
        <div className="tarjeta clic" onClick={() => ir('gastos')}>
          <div className="fila entre">
            <span className="titulo">
              📩 {porConfirmar.length === 1 ? 'Un movimiento por confirmar' : `${porConfirmar.length} movimientos por confirmar`}
            </span>
            <span className="chica suave">Revisar →</span>
          </div>
          <p className="mini suave" style={{ marginTop: 4 }}>Llegaron por mensaje del banco.</p>
        </div>
      )}

      {!hayCaja ? (
        <div className="tarjeta mostaza clic" onClick={() => ir('caja')}>
          <div className="fila entre">
            <span className="titulo">💰 Arma tu caja</span>
            <span className="chica suave">Empezar →</span>
          </div>
          <p className="chica suave" style={{ marginTop: 4 }}>
            Reparte lo que entra en bolsillos y sabrás cuánto queda de verdad cada mes.
          </p>
        </div>
      ) : caja.base === 0 ? (
        <div className="tarjeta mostaza clic" onClick={() => ir('caja')}>
          <span className="titulo">💰 Cuéntanos cuánto entra</span>
          <p className="chica suave" style={{ marginTop: 4 }}>
            Sin ingresos este mes ni un esperado, la caja no sabe cuánto queda.
          </p>
        </div>
      ) : conRegla ? (
        <div className={`tarjeta ${unSueldo.estado === 'rojo' ? 'coral' : 'turquesa'} clic`} onClick={() => ir('caja')}>
          <div className="fila entre">
            <span className="etiqueta">Vivimos con un sueldo · {nombreMes(mes).split(' ')[0]}</span>
            <span className={`chip ${unSueldo.estado === 'rojo' ? 'coral' : unSueldo.estado === 'amarillo' ? 'mostaza' : 'oliva'}`}>
              {unSueldo.estado === 'rojo' ? 'nos pasamos' : unSueldo.estado === 'amarillo' ? 'casi' : 'vamos bien'}
            </span>
          </div>
          <div className="cifra grande">{dinero(unSueldo.disponible, perfil.moneda)}</div>
          <p className="chica" style={{ marginTop: 2 }}>
            {unSueldo.disponible >= 0 ? 'quedan' : 'de más'} del sueldo de {unSueldo.persona ? (unSueldo.persona === 'a' ? perfil.nombreA : perfil.nombreB) : '—'}
          </p>
          <div style={{ marginTop: 8 }}>
            <Barra valor={unSueldo.avance} color="blanca" />
          </div>
          <p className="mini suave" style={{ marginTop: 6 }}>
            Gastado {dinero(unSueldo.gastado, perfil.moneda)} de {dinero(unSueldo.tope, perfil.moneda)} · queda del mes{' '}
            {dinero(caja.queda, perfil.moneda)}
          </p>
          <Pulso dias={pulso} />
          {frase && <p className="chica" style={{ marginTop: 10 }}>{frase}</p>}
          {alertas.length > 0 && (
            <div className="fila envolver" style={{ gap: 6, marginTop: 8 }}>
              {alertas.map((v) => (
                <span key={v.bolsillo.id} className={`chip ${v.estado === 'rojo' ? 'coral' : 'mostaza'}`}>
                  {v.bolsillo.emoji} {v.bolsillo.nombre} {v.estado === 'rojo' ? 'en rojo' : 'casi'}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="tarjeta clic" onClick={() => ir('caja')}>
          <div className="fila entre">
            <span className="etiqueta">Nos queda · {nombreMes(mes).split(' ')[0]}</span>
            <span className="chica suave">Caja →</span>
          </div>
          <div className="cifra grande" style={caja.queda < 0 ? { color: 'var(--alerta)' } : undefined}>
            {dinero(caja.queda, perfil.moneda)}
          </div>
          <p className="chica" style={{ marginTop: 4 }}>
            Libre de verdad <b>{dinero(caja.libre, perfil.moneda)}</b>
          </p>
          <p className="mini suave" style={{ marginTop: 2 }}>
            Entró {dinero(caja.base, perfil.moneda)}
            {caja.usaEsperado && ' (esperado)'} · Salió {dinero(caja.salidas, perfil.moneda)}
          </p>
          <Pulso dias={pulso} />
          {frase && <p className="chica" style={{ marginTop: 10 }}>{frase}</p>}
          {alertas.length > 0 && (
            <div className="fila envolver" style={{ gap: 6, marginTop: 8 }}>
              {alertas.map((v) => (
                <span key={v.bolsillo.id} className={`chip ${v.estado === 'rojo' ? 'coral' : 'mostaza'}`}>
                  {v.bolsillo.emoji} {v.bolsillo.nombre} {v.estado === 'rojo' ? 'en rojo' : 'casi'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {grecia && (
        <div className="tarjeta egeo clic" onClick={() => ir('metas')}>
          <div className="fila entre">
            <span className="etiqueta">Hito · {grecia.emoji} Grecia 2027</span>
            <span className="chip" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
              {greciaDias > 0 ? `faltan ${greciaDias} días` : '¡Es hoy!'}
            </span>
          </div>
          <div className="cifra grande" style={{ marginTop: 8 }}>
            {dinero(greciaAhorro, perfil.moneda)}
          </div>
          <p className="chica" style={{ opacity: 0.85, marginBottom: 10 }}>
            de {dinero(grecia.montoObjetivo, perfil.moneda)} · {pct(greciaAhorro, grecia.montoObjetivo)}%
          </p>
          <Barra valor={pct(greciaAhorro, grecia.montoObjetivo)} color="blanca" />
        </div>
      )}

      <div className="grid2">
        <div className="tarjeta clic" onClick={() => ir('gastos')}>
          <span className="etiqueta">Gastos · {nombreMes(mes).split(' ')[0]}</span>
          <div className="cifra">{dinero(totalMes, perfil.moneda)}</div>
          <p className="mini suave" style={{ marginTop: 6 }}>
            {perfil.nombreA}: {dinero(porPersona.a, perfil.moneda)}
            <br />
            {perfil.nombreB}: {dinero(porPersona.b, perfil.moneda)}
          </p>
        </div>
        <div className="tarjeta clic" onClick={() => ir('deudas')}>
          <span className="etiqueta">Deuda que falta</span>
          <div className="cifra">{dinero(deudaActual, perfil.moneda)}</div>
          <div style={{ marginTop: 8 }}>
            <Barra valor={deudaPagadaPct} color="oliva" />
            <p className="mini suave" style={{ marginTop: 4 }}>
              {deudaInicial > 0 ? `${deudaPagadaPct}% tumbada` : 'Sin deudas registradas'}
            </p>
          </div>
        </div>
      </div>

      <div className="tarjeta">
        <div className="fila entre mb">
          <h3>Facturas que vienen</h3>
          <button className="btn chico fantasma" onClick={() => ir('facturas')}>
            Ver todas
          </button>
        </div>
        {pendientes.length === 0 ? (
          <p className="suave chica">
            {facturas.length === 0 ? 'Todavía no hay facturas. Agrégalas para no olvidarlas.' : 'Todo pago este mes. 🙌'}
          </p>
        ) : (
          pendientes.map((f) => (
            <div className="item" key={f.id}>
              <div className="icono">{f.dias <= 2 ? '🔥' : f.dias <= 7 ? '⏰' : '📄'}</div>
              <div className="cuerpo">
                <div className="titulo">{f.nombre}</div>
                <div className="chica suave">
                  {f.dias < 0
                    ? `vencida hace ${-f.dias} días`
                    : f.dias === 0
                      ? 'vence hoy'
                      : f.dias === 1
                        ? 'vence mañana'
                        : `vence en ${f.dias} días`}
                </div>
              </div>
              <div className="monto">{dinero(f.monto, perfil.moneda)}</div>
            </div>
          ))
        )}
      </div>

      <div className="tarjeta oliva clic" onClick={() => ir('retos')}>
        <div className="fila entre">
          <h3>Retos</h3>
          <span className="chip oliva">{retosHechos} cumplidos</span>
        </div>
        {retosActivos.length === 0 ? (
          <p className="chica suave mt">Sin retos activos. Toca para proponer uno.</p>
        ) : (
          retosActivos.slice(0, 2).map((r) => (
            <div key={r.id} className="mt">
              <div className="fila entre chica">
                <span className="negrita">
                  {r.emoji} {r.titulo}
                </span>
                <span className="suave">{pct(r.progreso, r.meta)}%</span>
              </div>
              <div style={{ marginTop: 4 }}>
                <Barra valor={pct(r.progreso, r.meta)} color="oliva" />
              </div>
            </div>
          ))
        )}
      </div>

      {topCats.length > 0 && (
        <div className="tarjeta">
          <h3 className="mb">En qué se nos fue</h3>
          {topCats.map(([c, v]) => {
            const info = catInfo(c as never)
            return (
              <div className="cat-fila" key={c}>
                <span>{info.emoji}</span>
                <div>
                  <div className="fila entre chica">
                    <span>{info.nombre}</span>
                    <span className="negrita">{dinero(v, perfil.moneda)}</span>
                  </div>
                  <Barra valor={pct(v, totalMes)} />
                </div>
                <span />
              </div>
            )
          })}
        </div>
      )}

      <MuroMini ir={ir} />
    </div>
  )
}
