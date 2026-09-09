import { useMemo, useRef, useState } from 'react'
import { useStore, nombreDe } from '../store'
import type { Ambito, Bolsillo } from '../types'
import { dinero, hoy, mesActual, nombreMes, fechaCorta, pct } from '../format'
import { CATEGORIAS, catInfo } from '../categorias'
import { Modal, Campo, Segmento, Barra, Vacio, InputMonto, EmojiPicker, useToast } from '../components/ui'
import { IngresoModal, fuenteInfo, type BorradorIngreso } from '../components/IngresoModal'
import { ArmarCaja } from '../components/ArmarCaja'
import {
  resumenMes,
  vistaBolsillo,
  vigentes,
  gastosDe,
  sinBolsillo,
  disponible,
  esFueraDeCasa,
  vistaUnSueldo,
  reparto,
  avanceAvanzar,
  type VistaBolsillo,
} from '../caja'

const EMOJIS = ['🛒', '🍕', '🚕', '💡', '📦', '🍦', '📤', '🏠', '💊', '🎬', '👗', '🎁', '✈️', '☕', '🐶', '💰', '🎯']

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

type Seccion = 'fuera' | 'vivir' | 'avanzar'

function Cabecera({ titulo, resumen, abierta, onToggle }: { titulo: string; resumen: string; abierta: boolean; onToggle: () => void }) {
  return (
    <div className="fila entre" onClick={onToggle} style={{ cursor: 'pointer' }} role="button" aria-expanded={abierta}>
      <h3>{titulo}</h3>
      <span className="chica suave">
        {resumen} {abierta ? '▾' : '▸'}
      </span>
    </div>
  )
}

function FilaReparto({
  emoji,
  titulo,
  plan,
  detalle,
  onClick,
  moneda,
}: {
  emoji: string
  titulo: string
  plan: number
  detalle: string
  onClick: () => void
  moneda: string
}) {
  return (
    <div className="item" onClick={onClick} style={{ cursor: 'pointer', paddingLeft: 0, paddingRight: 0 }}>
      <div className="cuerpo">
        <div className="titulo">
          {emoji} {titulo}
        </div>
        <div className="mini suave">{detalle}</div>
      </div>
      <div className="monto" style={plan < 0 ? { color: '#b1402a' } : undefined}>
        − {dinero(plan, moneda)}
      </div>
    </div>
  )
}

function FilaBolsillo({ v, moneda, sufijo, onClick }: { v: VistaBolsillo; moneda: string; sufijo?: string; onClick: () => void }) {
  return (
    <div className="item" onClick={onClick} style={{ cursor: 'pointer', display: 'block' }}>
      <div className="fila entre">
        <span className="negrita">
          {v.bolsillo.emoji} {v.bolsillo.nombre}
          {sufijo && <span className="suave"> · {sufijo}</span>}{' '}
          <span className="mini suave" style={{ fontWeight: 600 }}>
            {v.bolsillo.acumula ? '· guarda' : '· se reinicia'}
          </span>
        </span>
        <span className="monto" style={v.disponible < 0 ? { color: '#b1402a' } : undefined}>
          {dinero(v.disponible, moneda)}
        </span>
      </div>
      <div style={{ marginTop: 6 }}>
        <Barra valor={v.avance} color={colorBarra(v)} />
      </div>
      <div className="mini suave" style={{ marginTop: 4 }}>
        gastado {dinero(v.gastado, moneda)} de {dinero(v.tope, moneda)}
        {v.estado === 'rojo' && ' · en rojo'}
        {v.estado === 'amarillo' && ' · casi'}
      </div>
    </div>
  )
}

export function Caja() {
  const { estado, dispatch } = useStore()
  const { perfil, gastos, ingresos, bolsillos } = estado
  const [mes, setMes] = useState(mesActual())
  const [armando, setArmando] = useState<'completo' | 'plan' | null>(null)
  const [abierta, setAbierta] = useState<Seccion | null>('vivir')
  const [verIngresos, setVerIngresos] = useState(false)
  const refs = { fuera: useRef<HTMLDivElement>(null), vivir: useRef<HTMLDivElement>(null), avanzar: useRef<HTMLDivElement>(null) }
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
  const hayPlan = !!perfil.plan
  const un = useMemo(() => vistaUnSueldo(estado, mes), [estado, mes])
  const rep = useMemo(() => reparto(estado, mes), [estado, mes])
  const av = useMemo(() => avanceAvanzar(estado, mes), [estado, mes])
  const vistasFuera = useMemo(
    () => vigentes(estado, mes).filter(esFueraDeCasa).map((b) => vistaBolsillo(b, estado, mes)),
    [estado, mes],
  )
  const sinFuera = useMemo(() => {
    const lista = gastos.filter((g) => g.fecha.startsWith(mes) && g.categoria === 'fuera' && !vistasFuera.some((v) => gastosDe(v.bolsillo, gastos, bolsillos, mes).includes(g)))
    return { n: lista.length, monto: lista.reduce((acc, g) => acc + g.monto, 0) }
  }, [gastos, bolsillos, mes, vistasFuera])

  const abrir = (sec: Seccion) => {
    setAbierta(sec)
    setTimeout(() => refs[sec].current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const irA = (pagina: string) => {
    location.hash = pagina
    window.scrollTo({ top: 0 })
  }

  const secciones = useMemo(() => {
    const lista: { ambito: Ambito; titulo: string; vistas: VistaBolsillo[]; sin: { n: number; monto: number } }[] = [
      { ambito: 'hogar', titulo: 'De la casa', vistas: [], sin: { n: 0, monto: 0 } },
      { ambito: 'a', titulo: `De ${perfil.nombreA}`, vistas: [], sin: { n: 0, monto: 0 } },
      { ambito: 'b', titulo: `De ${perfil.nombreB}`, vistas: [], sin: { n: 0, monto: 0 } },
    ]
    for (const s of lista) {
      s.vistas = vigentes(estado, mes)
        .filter((b) => b.ambito === s.ambito && !esFueraDeCasa(b))
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
          texto="Una regla sencilla: la casa vive con un sueldo y el otro tumba deudas. La caja lleva la cuenta."
          hijo={
            <button className="btn" onClick={() => setArmando('completo')}>
              Armar mi caja
            </button>
          }
        />
      ) : (
        <>
          {hayPlan ? (
            <div className="tarjeta terracota">
              <div className="fila entre">
                <span className="etiqueta">Vivimos con un sueldo · {nombreMes(mes)}</span>
                <span className="chip" style={{ background: 'rgba(255,255,255,.22)', color: '#fff', whiteSpace: 'nowrap' }}>
                  {un.estado === 'rojo' ? '🔴 nos pasamos' : un.estado === 'amarillo' ? '🟡 casi' : '🟢 vamos bien'}
                </span>
              </div>
              <div className="cifra grande">{dinero(un.disponible, perfil.moneda)}</div>
              <p className="chica" style={{ opacity: 0.92, marginTop: 2 }}>
                {un.disponible >= 0 ? 'quedan' : 'de más'} del sueldo de {un.persona ? nombreDe(perfil, un.persona) : '—'}
              </p>
              <div style={{ marginTop: 10 }}>
                <Barra valor={un.avance} color="blanca" />
              </div>
              <p className="mini" style={{ opacity: 0.85, marginTop: 6 }}>
                Gastado {dinero(un.gastado, perfil.moneda)} de {dinero(un.tope, perfil.moneda)} · queda del mes{' '}
                {dinero(r.queda, perfil.moneda)} · libre de verdad {dinero(r.libre, perfil.moneda)}
              </p>
            </div>
          ) : (
            <div className="tarjeta mostaza clic" onClick={() => setArmando('plan')}>
              <div className="fila entre">
                <span className="titulo">💡 Completar el plan</span>
                <span className="chica suave">Empezar →</span>
              </div>
              <p className="chica suave" style={{ marginTop: 4 }}>
                Falta la regla: con qué sueldo vive la casa, qué sale primero y cuánto va a deudas. Los bolsillos quedan igual.
              </p>
            </div>
          )}

          <div className="tarjeta">
            <div className="fila entre">
              <h3>Reparto del mes</h3>
              {hayPlan && (rep.avanzar.plan < 0 || rep.avanzar.sinRepartir !== 0) && (
                <span className="chip terracota">
                  {rep.avanzar.plan < 0
                    ? 'no cierra'
                    : rep.avanzar.sinRepartir > 0
                      ? `${dinero(rep.avanzar.sinRepartir, perfil.moneda)} sin repartir`
                      : `te pasaste por ${dinero(-rep.avanzar.sinRepartir, perfil.moneda)}`}
                </span>
              )}
            </div>
            <div className="fila entre chica" style={{ marginTop: 10 }}>
              <span className="negrita">💵 Entra</span>
              <span className="negrita">{dinero(rep.entra, perfil.moneda)}</span>
            </div>
            <FilaReparto
              emoji="📤"
              titulo="Obligaciones fuera de casa"
              plan={rep.fuera.plan}
              detalle={`salió ${dinero(rep.fuera.real, perfil.moneda)}`}
              onClick={() => abrir('fuera')}
              moneda={perfil.moneda}
            />
            <FilaReparto
              emoji="🏠"
              titulo="Vivir · un sueldo"
              plan={rep.vivir.tope}
              detalle={`gastado ${dinero(rep.vivir.gastado, perfil.moneda)} · colchón ${dinero(rep.vivir.colchon, perfil.moneda)}`}
              onClick={() => abrir('vivir')}
              moneda={perfil.moneda}
            />
            <FilaReparto
              emoji="💪"
              titulo="Avanzar"
              plan={rep.avanzar.plan}
              detalle={
                hayPlan
                  ? `deudas ${dinero(rep.avanzar.deudas, perfil.moneda)} · Grecia ${dinero(rep.avanzar.ahorro, perfil.moneda)} · van ${dinero(rep.avanzar.real, perfil.moneda)}`
                  : 'sin plan todavía'
              }
              onClick={() => abrir('avanzar')}
              moneda={perfil.moneda}
            />
            <div className="fila envolver mt" style={{ gap: 8 }}>
              <button
                className="btn chico fantasma"
                onClick={() => setEsperados({ a: perfil.ingresoEsperado?.a ?? 0, b: perfil.ingresoEsperado?.b ?? 0 })}
              >
                Ingresos esperados
              </button>
              <button className="btn chico fantasma" onClick={() => setArmando('plan')}>
                {hayPlan ? 'Editar plan' : 'Completar plan'}
              </button>
              <button className="btn chico secundario" onClick={() => setEditando(nuevoBolsillo('hogar'))}>
                + Bolsillo
              </button>
            </div>
          </div>

          {/* ---- 📤 Obligaciones fuera de casa ---- */}
          <div className="tarjeta" ref={refs.fuera}>
            <Cabecera
              titulo="📤 Obligaciones fuera de casa"
              resumen={`${dinero(rep.fuera.real, perfil.moneda)} de ${dinero(rep.fuera.plan, perfil.moneda)}`}
              abierta={abierta === 'fuera'}
              onToggle={() => setAbierta(abierta === 'fuera' ? null : 'fuera')}
            />
            {abierta === 'fuera' && (
              <div style={{ marginTop: 8 }}>
                {vistasFuera.length === 0 && (
                  <p className="chica suave">
                    Ningún bolsillo todavía. Lo que cada uno manda a su familia u otras obligaciones fijas va aquí, y no cuenta
                    como plata para vivir.
                  </p>
                )}
                {vistasFuera.map((v) => (
                  <FilaBolsillo key={v.bolsillo.id} v={v} moneda={perfil.moneda} sufijo={nombreDe(perfil, v.bolsillo.ambito as 'a' | 'b')} onClick={() => setDetalle(v.bolsillo.id)} />
                ))}
                {sinFuera.n > 0 && (
                  <p className="mini suave" style={{ marginTop: 8 }}>
                    Sin bolsillo: {sinFuera.n} {sinFuera.n === 1 ? 'gasto' : 'gastos'} · {dinero(sinFuera.monto, perfil.moneda)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ---- 🏠 Vivir ---- */}
          <div className="tarjeta" ref={refs.vivir}>
            <Cabecera
              titulo="🏠 Vivir"
              resumen={`${dinero(rep.vivir.gastado, perfil.moneda)} de ${dinero(rep.vivir.tope, perfil.moneda)}`}
              abierta={abierta === 'vivir'}
              onToggle={() => setAbierta(abierta === 'vivir' ? null : 'vivir')}
            />
            {abierta === 'vivir' && (
              <div className="pila" style={{ marginTop: 8 }}>
                {secciones.length === 0 && (
                  <p className="chica suave centrado">Ningún bolsillo existía todavía en {nombreMes(mes)}.</p>
                )}
                {secciones.map((s) => (
                  <div key={s.ambito}>
                    <h3 className="mb">{s.titulo}</h3>
                    {s.vistas.map((v) => (
                      <FilaBolsillo key={v.bolsillo.id} v={v} moneda={perfil.moneda} onClick={() => setDetalle(v.bolsillo.id)} />
                    ))}
                    {s.sin.n > 0 && (
                      <p className="mini suave" style={{ marginTop: 8 }}>
                        Sin bolsillo: {s.sin.n} {s.sin.n === 1 ? 'gasto' : 'gastos'} · {dinero(s.sin.monto, perfil.moneda)}
                      </p>
                    )}
                  </div>
                ))}
                {hayPlan && (
                  <p className="mini suave">
                    Asignado {dinero(rep.vivir.asignado, perfil.moneda)} del sueldo de {dinero(rep.vivir.tope, perfil.moneda)}
                    {rep.vivir.colchon >= 0
                      ? ` · colchón ${dinero(rep.vivir.colchon, perfil.moneda)} para lo que se salga del plan.`
                      : ` · te pasaste por ${dinero(-rep.vivir.colchon, perfil.moneda)}.`}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ---- 💪 Avanzar ---- */}
          <div className="tarjeta" ref={refs.avanzar}>
            <Cabecera
              titulo="💪 Avanzar"
              resumen={`${dinero(av.abonos + av.aportes, perfil.moneda)} de ${dinero(av.metaDeudas + av.metaAhorro, perfil.moneda)}`}
              abierta={abierta === 'avanzar'}
              onToggle={() => setAbierta(abierta === 'avanzar' ? null : 'avanzar')}
            />
            {abierta === 'avanzar' && (
              <div className="pila" style={{ marginTop: 8 }}>
                {!hayPlan && <p className="chica suave">Completa el plan para fijar cuánto va a deudas y cuánto a Grecia cada mes.</p>}
                <div>
                  <div className="fila entre">
                    <span className="negrita">Deudas · en equipo</span>
                    <span className="negrita">
                      {dinero(av.abonos, perfil.moneda)} <span className="mini suave">de {dinero(av.metaDeudas, perfil.moneda)}</span>
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Barra valor={pct(av.abonos, av.metaDeudas)} color="oliva" />
                  </div>
                  <div className="mini suave" style={{ marginTop: 4 }}>
                    {perfil.nombreA}: {dinero(av.abonosPor.a, perfil.moneda)} · {perfil.nombreB}: {dinero(av.abonosPor.b, perfil.moneda)}
                    {av.metaDeudas > av.abonos && ` · faltan ${dinero(av.metaDeudas - av.abonos, perfil.moneda)}`}
                    {av.metaDeudas > 0 && av.abonos >= av.metaDeudas && ' · ¡meta cumplida! 🎉'}
                  </div>
                </div>
                <div>
                  <div className="fila entre">
                    <span className="negrita">Grecia y ahorro</span>
                    <span className="negrita">
                      {dinero(av.aportes, perfil.moneda)} <span className="mini suave">de {dinero(av.metaAhorro, perfil.moneda)}</span>
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Barra valor={pct(av.aportes, av.metaAhorro)} color="egeo" />
                  </div>
                  <div className="mini suave" style={{ marginTop: 4 }}>
                    {perfil.nombreA}: {dinero(av.aportesPor.a, perfil.moneda)} · {perfil.nombreB}: {dinero(av.aportesPor.b, perfil.moneda)}
                  </div>
                </div>
                <div className="fila" style={{ gap: 8 }}>
                  <button className="btn chico fantasma" onClick={() => irA('deudas')}>
                    Ir a Deudas
                  </button>
                  <button className="btn chico fantasma" onClick={() => irA('metas')}>
                    Ir a Hitos
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="tarjeta">
            <Cabecera
              titulo="Ingresos del mes"
              resumen={`${ingresosMes.length} · ${dinero(r.ingresosReales, perfil.moneda)}`}
              abierta={verIngresos}
              onToggle={() => setVerIngresos(!verIngresos)}
            />
            {verIngresos &&
              (ingresosMes.length === 0 ? (
                <p className="chica suave" style={{ marginTop: 8 }}>
                  Nada anotado todavía. Cuando llegue la nómina, anótala con el +.
                </p>
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
              ))}
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

      {armando && <ArmarCaja modo={armando} onCerrar={() => setArmando(null)} />}
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

