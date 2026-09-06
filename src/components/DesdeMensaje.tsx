import { useMemo, useState } from 'react'
import { Modal } from './ui'
import { useStore } from '../store'
import { catInfo } from '../categorias'
import { dinero, fechaCorta } from '../format'
import { esLectura, leerMensaje, MOTIVOS, type Lectura } from '../mensajes'

/**
 * Pegar el mensaje del banco y ver el gasto antes de guardarlo.
 * Es el respaldo para las alertas que no llegan por SMS (las de la app del banco).
 */
export function DesdeMensaje({
  textoInicial = '',
  onCerrar,
  onListo,
  onManual,
}: {
  textoInicial?: string
  onCerrar: () => void
  onListo: (lectura: Lectura) => void
  onManual: (nota: string) => void
}) {
  const { estado } = useStore()
  const [texto, setTexto] = useState(textoInicial)
  const [aviso, setAviso] = useState<string | null>(null)

  const resultado = useMemo(
    () => (texto.trim() ? leerMensaje(texto, estado.perfil.aprendidos ?? {}) : null),
    [texto, estado.perfil.aprendidos],
  )
  const lectura = resultado && esLectura(resultado) ? resultado : null
  const rechazo = resultado && !esLectura(resultado) ? resultado : null

  const pegar = async () => {
    setAviso(null)
    try {
      const t = await navigator.clipboard.readText()
      if (t.trim()) setTexto(t)
      else setAviso('El portapapeles está vacío. Copia el mensaje y vuelve.')
    } catch {
      setAviso('No me dejan leer el portapapeles: pégalo tú en el recuadro (mantén pulsado → Pegar).')
    }
  }

  return (
    <Modal titulo="Desde un mensaje" onCerrar={onCerrar}>
      <div className="pila">
        <button className="btn secundario" type="button" onClick={pegar}>
          📋 Pegar mensaje
        </button>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="Pega aquí el mensaje del banco. Ej: Bancolombia le informa Compra por $45.900 en EXITO..."
          style={{
            width: '100%',
            border: '1px solid var(--linea)',
            borderRadius: 12,
            padding: 10,
            font: 'inherit',
            resize: 'vertical',
          }}
        />

        {aviso && <p className="mini suave">{aviso}</p>}

        {lectura && (
          <div className="tarjeta" style={{ margin: 0 }}>
            <div className="fila entre">
              <span className="etiqueta">{lectura.banco !== 'Desconocido' ? lectura.banco : 'Mensaje'}</span>
              <span className="chica suave">{fechaCorta(lectura.fecha)}</span>
            </div>
            <div className="cifra">{dinero(lectura.monto, estado.perfil.moneda)}</div>
            <p className="chica">
              {catInfo(lectura.categoria).emoji} {lectura.comercio || catInfo(lectura.categoria).nombre}
            </p>
            {lectura.confianza === 'baja' && <p className="mini suave">Revísalo antes de guardar, no estoy seguro.</p>}
          </div>
        )}

        {rechazo && <p className="chica">{MOTIVOS[rechazo.error]} Igual puedes anotarlo a mano.</p>}

        <div className="acciones">
          <button className="btn secundario" type="button" onClick={() => onManual(texto.trim().slice(0, 60))}>
            Anotar a mano
          </button>
          <button className="btn" type="button" disabled={!lectura} onClick={() => lectura && onListo(lectura)}>
            Continuar
          </button>
        </div>
      </div>
    </Modal>
  )
}
