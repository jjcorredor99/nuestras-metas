import { useEffect, useState, type ReactNode } from 'react'

export function Modal({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string
  onCerrar: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onCerrar])
  return (
    <div className="fondo" onClick={onCerrar}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="fila entre" style={{ marginBottom: 14 }}>
          <h2 style={{ marginBottom: 0 }}>{titulo}</h2>
          <button className="btn-icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Campo({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="campo">
      <label>{label}</label>
      {children}
    </div>
  )
}

export function Segmento<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: { valor: T; texto: string }[]
  valor: T
  onCambio: (v: T) => void
}) {
  return (
    <div className="segmento">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          className={o.valor === valor ? 'activo' : ''}
          onClick={() => onCambio(o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

export function Barra({
  valor,
  color = '',
}: {
  valor: number
  color?: 'oliva' | 'egeo' | 'mostaza' | 'blanca' | ''
}) {
  return (
    <div className={`barra ${color}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
    </div>
  )
}

export function Vacio({ emoji, texto, hijo }: { emoji: string; texto: string; hijo?: ReactNode }) {
  return (
    <div className="vacio">
      <div className="grande">{emoji}</div>
      <p>{texto}</p>
      {hijo && <div className="mt">{hijo}</div>}
    </div>
  )
}

export function EmojiPicker({
  opciones,
  valor,
  onCambio,
}: {
  opciones: string[]
  valor: string
  onCambio: (e: string) => void
}) {
  return (
    <div className="emojis">
      {opciones.map((e) => (
        <button key={e} type="button" className={e === valor ? 'activo' : ''} onClick={() => onCambio(e)}>
          {e}
        </button>
      ))}
    </div>
  )
}

const COLORES = ['#d9634a', '#6b8f4e', '#e0a83a', '#3a7ca5', '#e88a8a', '#8b6bb1']

export function Confeti({ activo }: { activo: boolean }) {
  const [piezas, setPiezas] = useState<{ x: number; c: string; d: number; r: number }[]>([])
  useEffect(() => {
    if (!activo) return
    setPiezas(
      Array.from({ length: 70 }, () => ({
        x: Math.random() * 100,
        c: COLORES[Math.floor(Math.random() * COLORES.length)],
        d: Math.random() * 0.6,
        r: Math.random() * 360,
      })),
    )
    const t = setTimeout(() => setPiezas([]), 2600)
    return () => clearTimeout(t)
  }, [activo])
  if (!piezas.length) return null
  return (
    <div className="confeti" aria-hidden>
      {piezas.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.x}%`,
            background: p.c,
            animationDelay: `${p.d}s`,
            transform: `rotate(${p.r}deg)`,
          }}
        />
      ))}
    </div>
  )
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2200)
    return () => clearTimeout(t)
  }, [msg])
  const Toast = msg ? <div className="toast">{msg}</div> : null
  return { mostrar: setMsg, Toast }
}

/** Input numérico que muestra separadores de miles mientras escribes. */
export function InputMonto({
  valor,
  onCambio,
  placeholder = '0',
  autoFocus,
}: {
  valor: number
  onCambio: (n: number) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const texto = valor ? valor.toLocaleString('es-CO') : ''
  return (
    <input
      inputMode="decimal"
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={texto}
      onChange={(e) => {
        const limpio = e.target.value.replace(/[^\d,]/g, '').replace(',', '.')
        const n = Number(limpio)
        onCambio(Number.isFinite(n) ? n : 0)
      }}
    />
  )
}
