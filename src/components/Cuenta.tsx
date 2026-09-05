import { useState } from 'react'
import { useSync } from '../sync'
import { useStore } from '../store'
import { Campo, Segmento } from './ui'

/** Login, creación de hogar y estado de sincronización. Se usa en Ajustes y en la bienvenida. */
export function Cuenta({ soloUnirse = false }: { soloUnirse?: boolean }) {
  const sync = useSync()
  const { estado } = useStore()
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [codigo, setCodigo] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const correr = async (fn: () => Promise<string | null>) => {
    setOcupado(true)
    setMsg(null)
    const r = await fn()
    setMsg(r)
    setOcupado(false)
  }

  if (sync.estadoSync === 'sin-config') {
    return <p className="chica suave">Esta versión no tiene sincronización configurada. Los datos viven solo en este dispositivo.</p>
  }
  if (sync.estadoSync === 'cargando') {
    return <p className="chica suave">Conectando…</p>
  }

  if (sync.estadoSync === 'sin-sesion') {
    return (
      <div className="pila">
        <Segmento<'entrar' | 'crear'>
          valor={modo}
          onCambio={setModo}
          opciones={[
            { valor: 'entrar', texto: 'Ya tengo cuenta' },
            { valor: 'crear', texto: 'Crear cuenta' },
          ]}
        />
        <Campo label="Correo">
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
        </Campo>
        <Campo label="Contraseña">
          <input
            type="password"
            autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder={modo === 'crear' ? 'Mínimo 6 caracteres' : ''}
          />
        </Campo>
        {msg && <p className="chica" style={{ color: '#b1402a' }}>{msg}</p>}
        <button
          className="btn"
          disabled={ocupado || !email.includes('@') || pass.length < 6}
          onClick={() => correr(() => (modo === 'crear' ? sync.registrarse(email, pass) : sync.entrar(email, pass)))}
        >
          {ocupado ? '…' : modo === 'crear' ? 'Crear cuenta' : 'Entrar'}
        </button>
        <p className="mini suave">Cada uno usa su propio correo. Después se vinculan con un código.</p>
      </div>
    )
  }

  if (sync.estadoSync === 'sin-hogar') {
    return (
      <div className="pila">
        <p className="chica suave">
          Sesión: <b>{sync.usuario?.email}</b>
        </p>
        {!soloUnirse && (
          <div className="tarjeta" style={{ background: 'var(--crema)' }}>
            <div className="negrita">¿Eres el primero?</div>
            <p className="chica suave mb">Crea el hogar y comparte el código que te dé. Todo lo que ya anotaste aquí se sube.</p>
            <button className="btn" disabled={ocupado} onClick={() => correr(() => sync.crearHogar(estado.perfil.nombrePareja))}>
              Crear nuestro hogar
            </button>
          </div>
        )}
        <div className="tarjeta" style={{ background: 'var(--crema)' }}>
          <div className="negrita">{soloUnirse ? 'Escribe el código que te compartieron' : '¿Ya lo creó la otra persona?'}</div>
          <p className="chica suave mb">Al unirte, lo que ya esté en el hogar reemplaza lo de este celular en lo que coincida.</p>
          <div className="fila">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              style={{ flex: 1, border: '1px solid var(--linea)', borderRadius: 12, padding: '11px 12px', fontSize: '1.1rem', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 800 }}
            />
            <button className="btn egeo" disabled={ocupado || codigo.trim().length < 6} onClick={() => correr(() => sync.unirseHogar(codigo))}>
              Unirme
            </button>
          </div>
        </div>
        {msg && <p className="chica" style={{ color: '#b1402a' }}>{msg}</p>}
        <button className="btn fantasma chico" onClick={() => sync.salir()}>
          Cerrar sesión
        </button>
      </div>
    )
  }

  // listo
  return (
    <div className="pila">
      <div className="fila entre envolver">
        <div>
          <div className="negrita">{sync.hogar?.nombre}</div>
          <div className="chica suave">{sync.usuario?.email}</div>
        </div>
        <span className={`chip ${sync.error ? 'terracota' : sync.pendientes > 0 ? 'mostaza' : 'oliva'}`}>
          {sync.error ? 'con problemas' : sync.pendientes > 0 ? `${sync.pendientes} por subir` : 'al día'}
        </span>
      </div>
      <div className="tarjeta centrado" style={{ background: 'var(--egeo-suave)' }}>
        <div className="etiqueta">Código del hogar</div>
        <div className="serif negrita" style={{ fontSize: '2rem', letterSpacing: '0.2em' }}>
          {sync.hogar?.codigo}
        </div>
        <p className="mini suave">Compártelo con la otra persona. Solo cabe una más.</p>
      </div>
      {sync.error && <p className="chica" style={{ color: '#b1402a' }}>{sync.error}</p>}
      {sync.ultimaSync && (
        <p className="mini suave">
          Última sincronización: {new Date(sync.ultimaSync).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {!sync.enLinea && ' · sin conexión'}
        </p>
      )}
      <div className="fila" style={{ gap: 8 }}>
        <button className="btn chico secundario" onClick={() => sync.forzarSync()}>
          Sincronizar ahora
        </button>
        <button className="btn chico fantasma" onClick={() => sync.salir()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
