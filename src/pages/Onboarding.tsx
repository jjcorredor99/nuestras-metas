import { useState } from 'react'
import { useStore } from '../store'
import { Campo } from '../components/ui'
import { Cuenta } from '../components/Cuenta'
import { useSync } from '../sync'

export function Onboarding() {
  const { dispatch } = useStore()
  const [a, setA] = useState('Juan José')
  const [b, setB] = useState('Luisa')
  const [pareja, setPareja] = useState('')
  const [moneda, setMoneda] = useState('COP')
  const [unirme, setUnirme] = useState(false)
  const sync = useSync()

  const listo = a.trim() && b.trim()

  if (unirme) {
    return (
      <div className="bienvenida">
        <div className="corazon">🔗</div>
        <h1 className="centrado">Unirme a nuestro hogar</h1>
        <p className="centrado suave">
          Entra con tu correo y escribe el código que te compartieron. Todo lo que ya está en el hogar aparece aquí.
        </p>
        <Cuenta soloUnirse />
        <button className="btn fantasma" onClick={() => setUnirme(false)}>
          Volver
        </button>
      </div>
    )
  }

  return (
    <div className="bienvenida">
      <div className="corazon">🤍</div>
      <h1 className="centrado">Nuestras Metas</h1>
      <p className="centrado suave">
        Un lugar para los gastos, las facturas, las deudas que vamos a tumbar y los retos que
        vamos a cumplir. Empezamos por lo básico:
      </p>
      <Campo label="¿Cómo te llamas?">
        <input value={a} onChange={(e) => setA(e.target.value)} placeholder="Tu nombre" autoFocus />
      </Campo>
      <Campo label="¿Y ella?">
        <input value={b} onChange={(e) => setB(e.target.value)} placeholder="Su nombre" />
      </Campo>
      <Campo label="¿Cómo le decimos a lo nuestro? (opcional)">
        <input
          value={pareja}
          onChange={(e) => setPareja(e.target.value)}
          placeholder={a && b ? `${a} & ${b}` : 'Ej: Los dos, Equipo, La casa...'}
        />
      </Campo>
      <Campo label="Moneda">
        <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
          <option value="COP">Pesos colombianos (COP)</option>
          <option value="USD">Dólares (USD)</option>
          <option value="EUR">Euros (EUR)</option>
          <option value="MXN">Pesos mexicanos (MXN)</option>
        </select>
      </Campo>
      <button
        className="btn ancho"
        disabled={!listo}
        onClick={() =>
          dispatch({
            tipo: 'perfil',
            perfil: {
              nombreA: a.trim(),
              nombreB: b.trim(),
              nombrePareja: pareja.trim() || `${a.trim()} & ${b.trim()}`,
              moneda,
              onboarded: true,
            },
          })
        }
      >
        Empezar
      </button>
      {sync.estadoSync !== 'sin-config' && (
        <button className="btn fantasma" onClick={() => setUnirme(true)}>
          La otra persona ya creó el hogar: unirme con código
        </button>
      )}
      <p className="centrado mini suave">
        {sync.estadoSync === 'sin-config'
          ? 'Todo se guarda en este dispositivo. Nada sale a internet.'
          : 'Los datos se guardan en el celular y, si quieren, se sincronizan entre los dos desde Ajustes.'}
      </p>
    </div>
  )
}
