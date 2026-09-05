import { useState } from 'react'
import { useStore } from '../store'
import { Campo } from '../components/ui'

export function Onboarding() {
  const { dispatch } = useStore()
  const [a, setA] = useState('Juan José')
  const [b, setB] = useState('Luisa')
  const [pareja, setPareja] = useState('')
  const [moneda, setMoneda] = useState('COP')

  const listo = a.trim() && b.trim()

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
      <p className="centrado mini suave">Todo se guarda en este dispositivo. Nada sale a internet.</p>
    </div>
  )
}
