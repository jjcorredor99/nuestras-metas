import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseUrl } from '../supabase'
import { useSync } from '../sync'
import { useStore } from '../store'
import { Campo, Segmento } from './ui'
import type { Persona } from '../types'

/**
 * El enlace del conector de Claude: con él, Claude lee y anota en el hogar desde el chat.
 * El token va dentro del enlace, así que el enlace se cuida como una contraseña.
 */
export function ConectorClaude({ avisar }: { avisar: (m: string) => void }) {
  const { estado } = useStore()
  const { perfil } = estado
  const { estadoSync } = useSync()
  const [token, setToken] = useState<string | null>(null)
  const [persona, setPersona] = useState<Persona>('a')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listo = estadoSync === 'listo'
  const enlace = token ? `${supabaseUrl}/functions/v1/mcp/${token}` : ''

  useEffect(() => {
    if (!supabase || !listo) return
    let vivo = true
    supabase
      .from('tokens_claude')
      .select('token, persona')
      .limit(1)
      .then(({ data }) => {
        if (!vivo || !data?.length) return
        setToken(data[0].token as string)
        setPersona(data[0].persona as Persona)
      })
    return () => {
      vivo = false
    }
  }, [listo])

  const faltaSql = (m: string) => (/does not exist|schema cache/i.test(m) ? 'Falta correr supabase/claude.sql' : m)

  const generar = useCallback(async () => {
    if (!supabase) return
    setOcupado(true)
    setError(null)
    const { data, error } = await supabase.rpc('crear_token_claude', { p_persona: persona })
    setOcupado(false)
    if (error) return setError(faltaSql(error.message))
    setToken(data as string)
    avisar('Enlace listo')
  }, [persona, avisar])

  const desconectar = useCallback(async () => {
    if (!supabase) return
    setOcupado(true)
    const { error } = await supabase.rpc('borrar_token_claude')
    setOcupado(false)
    if (error) return setError(faltaSql(error.message))
    setToken(null)
    avisar('Claude quedó desconectado')
  }, [avisar])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace)
      avisar('Enlace copiado')
    } catch {
      avisar('No pude copiar: selecciónalo a mano')
    }
  }

  if (!supabase) {
    return <p className="chica suave">El conector necesita Supabase: los datos tienen que estar en la nube para que Claude los vea.</p>
  }

  return (
    <div className="pila">
      <p className="chica suave">
        Pregúntenle a Claude "¿cómo vamos este mes?", "¿cuánto llevamos en mercado?" o díganle "anota 45 mil en el
        Éxito, compartido". Ve lo mismo que la app y lo que anote aparece en los dos celulares. También puede
        llevarles apuntes: pendientes, ideas para Grecia, decisiones.
      </p>

      {!listo && <p className="chica">Primero vinculen los dos celulares aquí arriba, en "Sincronizar entre los dos".</p>}

      {listo && (
        <>
          <Campo label="¿Quién va a hablar con Claude?">
            <Segmento<Persona>
              valor={persona}
              onCambio={setPersona}
              opciones={[
                { valor: 'a', texto: perfil.nombreA || 'Persona 1' },
                { valor: 'b', texto: perfil.nombreB || 'Persona 2' },
              ]}
            />
          </Campo>
          <p className="mini suave">Lo que le pidan anotar sin decir de quién queda a nombre de quien elijas.</p>

          <button className="btn secundario" onClick={generar} disabled={ocupado}>
            {token ? 'Generar un enlace nuevo' : 'Generar mi enlace'}
          </button>
          {error && <p className="chica">{error}</p>}

          {token && (
            <div className="pila">
              <div className="fila envolver" style={{ gap: 8 }}>
                <button className="btn chico fantasma" onClick={copiar}>
                  Copiar enlace
                </button>
                <button className="btn chico fantasma" onClick={desconectar} disabled={ocupado}>
                  Desconectar
                </button>
              </div>
              <p className="mini suave" style={{ wordBreak: 'break-all' }}>
                {enlace}
              </p>
              <p className="mini suave">
                Quien tenga este enlace puede ver y anotar en su plata: no lo compartan. Si se filtra, generen uno
                nuevo y el viejo deja de servir.
              </p>
            </div>
          )}

          <details>
            <summary className="chica negrita" style={{ cursor: 'pointer' }}>
              Cómo agregarlo en Claude (una sola vez)
            </summary>
            <ol className="chica suave" style={{ paddingLeft: 18, marginTop: 8 }}>
              <li>
                En <b>claude.ai</b> (o la app de escritorio): <b>Configuración</b> → <b>Conectores</b> →{' '}
                <b>Agregar conector personalizado</b>.
              </li>
              <li>
                Nombre: <b>Nuestras Metas</b>. URL: pega el <b>enlace</b>. No lleva nada en OAuth.
              </li>
              <li>Listo. En la app del celular aparece solo, porque es la misma cuenta.</li>
              <li>
                En un chat, activa el conector desde el botón de herramientas y pregunta. Cada uno lo agrega en su
                propia cuenta de Claude con su propio enlace.
              </li>
            </ol>
          </details>
        </>
      )}
    </div>
  )
}
