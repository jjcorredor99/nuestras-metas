import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { SyncProvider } from './sync'
import { EntrantesProvider } from './entrantes'
import { capturarMensajeDelEnlace } from './enlace'
import { Onboarding } from './pages/Onboarding'
import { Inicio } from './pages/Inicio'
import { Gastos } from './pages/Gastos'
import { Facturas } from './pages/Facturas'
import { Deudas } from './pages/Deudas'
import { Retos } from './pages/Retos'
import { Metas } from './pages/Metas'
import { Muro } from './pages/Muro'
import { Ajustes } from './pages/Ajustes'
import { Caja } from './pages/Caja'

const PAGINAS = [
  { id: 'inicio', texto: 'Inicio', ico: '🏡' },
  { id: 'caja', texto: 'Caja', ico: '💰' },
  { id: 'gastos', texto: 'Gastos', ico: '🧾' },
  { id: 'facturas', texto: 'Facturas', ico: '📬' },
  { id: 'deudas', texto: 'Deudas', ico: '⛰️' },
  { id: 'retos', texto: 'Retos', ico: '🔥' },
  { id: 'metas', texto: 'Hitos', ico: '🇬🇷' },
  { id: 'muro', texto: 'Muro', ico: '📸' },
  { id: 'ajustes', texto: 'Ajustes', ico: '⚙️' },
] as const

type Pagina = (typeof PAGINAS)[number]['id']

const desdeHash = (): Pagina => {
  // El hash puede traer parámetros (#gastos?texto=...): la página es lo de antes del "?".
  const h = location.hash.replace('#', '').split('?')[0] as Pagina
  return PAGINAS.some((p) => p.id === h) ? h : 'inicio'
}

function Shell() {
  const { estado } = useStore()
  const [pagina, setPagina] = useState<Pagina>(desdeHash)

  useEffect(() => {
    // Si el enlace nuevo trae un mensaje del banco, se guarda y el hash queda limpio.
    const onHash = () => {
      capturarMensajeDelEnlace()
      setPagina(desdeHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const ir = (p: string) => {
    location.hash = p
    window.scrollTo({ top: 0 })
  }

  if (!estado.perfil.onboarded) return <Onboarding />

  return (
    <div className="app">
      <nav className="nav">
        <div className="marca">Nuestras Metas</div>
        {PAGINAS.map((p) => (
          <button
            key={p.id}
            className={`${pagina === p.id ? 'activo' : ''} ${p.id === 'ajustes' || p.id === 'muro' ? 'solo-escritorio' : ''}`}
            onClick={() => ir(p.id)}
          >
            <span className="ico">{p.ico}</span>
            <span>{p.texto}</span>
          </button>
        ))}
      </nav>
      <main className="contenido">
        {pagina === 'inicio' && <Inicio ir={ir} />}
        {pagina === 'caja' && <Caja />}
        {pagina === 'gastos' && <Gastos />}
        {pagina === 'facturas' && <Facturas />}
        {pagina === 'deudas' && <Deudas />}
        {pagina === 'retos' && <Retos />}
        {pagina === 'metas' && <Metas />}
        {pagina === 'muro' && <Muro />}
        {pagina === 'ajustes' && <Ajustes />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <SyncProvider>
        <EntrantesProvider>
          <Shell />
        </EntrantesProvider>
      </SyncProvider>
    </StoreProvider>
  )
}
