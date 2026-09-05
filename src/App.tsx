import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { SyncProvider } from './sync'
import { Onboarding } from './pages/Onboarding'
import { Inicio } from './pages/Inicio'
import { Gastos } from './pages/Gastos'
import { Facturas } from './pages/Facturas'
import { Deudas } from './pages/Deudas'
import { Retos } from './pages/Retos'
import { Metas } from './pages/Metas'
import { Muro } from './pages/Muro'
import { Ajustes } from './pages/Ajustes'

const PAGINAS = [
  { id: 'inicio', texto: 'Inicio', ico: '🏡' },
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
  const h = location.hash.replace('#', '') as Pagina
  return PAGINAS.some((p) => p.id === h) ? h : 'inicio'
}

function Shell() {
  const { estado } = useStore()
  const [pagina, setPagina] = useState<Pagina>(desdeHash)

  useEffect(() => {
    const onHash = () => setPagina(desdeHash())
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
            className={`${pagina === p.id ? 'activo' : ''} ${p.id === 'ajustes' ? 'solo-escritorio' : ''}`}
            onClick={() => ir(p.id)}
          >
            <span className="ico">{p.ico}</span>
            <span>{p.texto}</span>
          </button>
        ))}
      </nav>
      <main className="contenido">
        {pagina === 'inicio' && <Inicio ir={ir} />}
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
        <Shell />
      </SyncProvider>
    </StoreProvider>
  )
}
