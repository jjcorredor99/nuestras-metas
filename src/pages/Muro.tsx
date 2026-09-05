import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Foto } from '../types'
import { uid, hoy } from '../format'
import { guardarFoto, borrarFoto, listarFotos, comprimirImagen } from '../db'
import { Modal, Campo, useToast } from '../components/ui'

/** Carga las imágenes de IndexedDB y devuelve URLs de objeto. */
function useFotos(fotos: Foto[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const ids = fotos.map((f) => f.id).join(',')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const on = () => setTick((t) => t + 1)
    window.addEventListener('fotos-actualizadas', on)
    return () => window.removeEventListener('fotos-actualizadas', on)
  }, [])
  useEffect(() => {
    let vivo = true
    listarFotos().then((blobs) => {
      if (!vivo) return
      const nuevas: Record<string, string> = {}
      for (const f of fotos) if (blobs[f.id]) nuevas[f.id] = URL.createObjectURL(blobs[f.id])
      setUrls((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u))
        return nuevas
      })
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, tick])
  return urls
}

const LEMAS = [
  'Hazlo por nosotros.',
  'Por nosotros.',
  'Por esto vale la pena.',
  'Acuérdate de esto cuando quieras pedir domicilio.',
  'Un día menos para Grecia.',
  'Mira quién te está mirando.',
]

export function Muro() {
  const { estado, dispatch } = useStore()
  const { fotos, perfil } = estado
  const urls = useFotos(fotos)
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [editando, setEditando] = useState<Foto | null>(null)
  const [lema] = useState(() => LEMAS[Math.floor(Math.random() * LEMAS.length)])
  const { mostrar, Toast } = useToast()

  const onArchivos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setSubiendo(true)
    try {
      for (const file of Array.from(files)) {
        const blob = await comprimirImagen(file)
        const id = uid()
        await guardarFoto(id, blob)
        dispatch({ tipo: 'foto/agregar', foto: { id, titulo: '', creadaEn: hoy() } })
      }
      mostrar(files.length === 1 ? 'Foto colgada 📸' : `${files.length} fotos colgadas 📸`)
    } catch {
      mostrar('No pude leer esa imagen')
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const borrar = async (f: Foto) => {
    if (!window.confirm('¿Quitar esta foto del muro?')) return
    await borrarFoto(f.id)
    dispatch({ tipo: 'foto/borrar', id: f.id })
    setEditando(null)
  }

  return (
    <div className="pila">
      <div className="cabecera">
        <div>
          <h1>Por nosotros</h1>
          <p className="sub">El muro que nos recuerda para qué es todo esto.</p>
        </div>
      </div>

      <div className="tarjeta" style={{ background: 'var(--mostaza-suave)', borderStyle: 'dashed' }}>
        <p className="lema">
          {lema}
          <small>{perfil.nombrePareja}</small>
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => onArchivos(e.target.files)}
      />

      {fotos.length === 0 ? (
        <div className="vacio">
          <div className="grande">🖼️</div>
          <p>
            Todavía no hay fotos. Cuelga las que quieran ver cada vez que toque decir que no a un antojo:
            ustedes dos, el destino, la casa soñada, el perro que van a tener.
          </p>
        </div>
      ) : (
        <div className="muro">
          {fotos.map((f, i) => (
            <div
              className={`polaroid ${i % 3 === 0 ? 'cinta' : ''}`}
              key={f.id}
              style={{ ['--giro' as never]: `${((i * 37) % 7) - 3}deg` }}
              onClick={() => setEditando(f)}
            >
              {urls[f.id] ? <img src={urls[f.id]} alt={f.titulo || 'foto'} /> : <div style={{ aspectRatio: 1, background: 'var(--crema)' }} />}
              <div className="pie">{f.titulo || '♥'}</div>
            </div>
          ))}
        </div>
      )}

      <button className="btn flotante" disabled={subiendo} onClick={() => inputRef.current?.click()} aria-label="Agregar foto">
        {subiendo ? '…' : '📷'}
      </button>

      {editando && (
        <Modal titulo="Esta foto" onCerrar={() => setEditando(null)}>
          <div className="pila">
            {urls[editando.id] && (
              <img src={urls[editando.id]} alt="" style={{ width: '100%', borderRadius: 12, maxHeight: '50vh', objectFit: 'contain', background: '#fff' }} />
            )}
            <Campo label="Pie de foto">
              <input
                autoFocus
                value={editando.titulo}
                onChange={(e) => setEditando({ ...editando, titulo: e.target.value })}
                placeholder="Ej: Santorini nos espera"
              />
            </Campo>
            <div className="acciones">
              <button className="btn peligro" onClick={() => borrar(editando)}>
                Quitar
              </button>
              <button
                className="btn"
                onClick={() => {
                  dispatch({ tipo: 'foto/editar', foto: editando })
                  setEditando(null)
                }}
              >
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

/** Vista previa del muro para la pantalla de inicio. */
export function MuroMini({ ir }: { ir: (p: string) => void }) {
  const { estado } = useStore()
  const fotos = estado.fotos.slice(0, 3)
  const urls = useFotos(fotos)
  return (
    <div className="tarjeta clic" onClick={() => ir('muro')}>
      <div className="fila entre mb">
        <h3>Por nosotros</h3>
        <span className="chica suave">{estado.fotos.length === 0 ? 'Cuelga fotos ›' : 'Ver muro ›'}</span>
      </div>
      {fotos.length === 0 ? (
        <p className="chica suave">Las fotos que nos recuerdan para qué estamos ahorrando.</p>
      ) : (
        <div className="fila" style={{ gap: 12, justifyContent: 'center', padding: '6px 0' }}>
          {fotos.map((f, i) => (
            <div className="polaroid" key={f.id} style={{ width: 96, padding: 6, ['--giro' as never]: `${i * 4 - 4}deg` }}>
              {urls[f.id] ? <img src={urls[f.id]} alt="" /> : <div style={{ aspectRatio: 1 }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
