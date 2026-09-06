import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseKey, supabaseUrl } from '../supabase'
import { useSync } from '../sync'
import { useStore } from '../store'
import { useEntrantes } from '../entrantes'
import { Campo, Segmento } from './ui'
import type { Persona } from '../types'

/**
 * El Atajo del iPhone manda aquí el texto del SMS. Esta sección entrega los tres
 * datos que pide (dirección, clave y token) y explica cómo armarlo.
 */
export function AtajoSms({ avisar }: { avisar: (m: string) => void }) {
  const { estado } = useStore()
  const { perfil } = estado
  const { estadoSync } = useSync()
  const { faltaSql } = useEntrantes()
  const [token, setToken] = useState<string | null>(null)
  const [persona, setPersona] = useState<Persona>('a')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const url = `${supabaseUrl}/rest/v1/rpc/entrada_sms`
  const listo = estadoSync === 'listo'

  useEffect(() => {
    if (!supabase || !listo) return
    let vivo = true
    supabase
      .from('tokens_sms')
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

  const generar = useCallback(async () => {
    if (!supabase) return
    setOcupado(true)
    setError(null)
    const { data, error } = await supabase.rpc('crear_token_sms', { p_persona: persona })
    setOcupado(false)
    if (error) {
      setError(/does not exist|schema cache/i.test(error.message) ? 'Falta correr supabase/mensajes.sql' : error.message)
      return
    }
    setToken(data as string)
    avisar('Token listo')
  }, [persona, avisar])

  const copiar = async (texto: string, que: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      avisar(`${que} copiado`)
    } catch {
      avisar('No pude copiar: selecciónalo a mano')
    }
  }

  if (!supabase) {
    return (
      <p className="chica suave">
        Sin Supabase configurado los mensajes no pueden llegar solos, pero el botón 📩 de Gastos sigue
        funcionando: copia el mensaje del banco y pégalo ahí.
      </p>
    )
  }

  return (
    <div className="pila">
      <p className="chica suave">
        Un Atajo del iPhone puede mandar solo cada SMS del banco. La app lo lee al abrirla: lo que se
        entiende completo queda anotado, y lo dudoso te espera en "por confirmar".
      </p>

      {!listo && (
        <p className="chica">Primero vinculen los dos celulares aquí arriba, en "Sincronizar entre los dos".</p>
      )}

      {listo && faltaSql && (
        <p className="chica">Falta correr <code>supabase/mensajes.sql</code> en el SQL Editor de Supabase.</p>
      )}

      {listo && (
        <>
          <Campo label="¿Cuál de los dos es este celular?">
            <Segmento<Persona>
              valor={persona}
              onCambio={setPersona}
              opciones={[
                { valor: 'a', texto: perfil.nombreA || 'Persona 1' },
                { valor: 'b', texto: perfil.nombreB || 'Persona 2' },
              ]}
            />
          </Campo>
          <p className="mini suave">Los gastos que lleguen por este celular quedan a nombre de quien elijas.</p>

          <button className="btn secundario" onClick={generar} disabled={ocupado}>
            {token ? 'Generar un token nuevo' : 'Generar mi token'}
          </button>
          {error && <p className="chica">{error}</p>}

          {token && (
            <div className="pila">
              <p className="chica negrita">Los tres datos del Atajo:</p>
              <div className="fila envolver" style={{ gap: 8 }}>
                <button className="btn chico fantasma" onClick={() => copiar(url, 'Enlace')}>
                  Copiar enlace
                </button>
                <button className="btn chico fantasma" onClick={() => copiar(supabaseKey, 'Clave')}>
                  Copiar clave
                </button>
                <button className="btn chico fantasma" onClick={() => copiar(token, 'Token')}>
                  Copiar token
                </button>
              </div>
              <p className="mini suave" style={{ wordBreak: 'break-all' }}>
                Token: {token}
              </p>
            </div>
          )}

          <details>
            <summary className="chica negrita" style={{ cursor: 'pointer' }}>
              Cómo armar el Atajo (una sola vez)
            </summary>
            <ol className="chica suave" style={{ paddingLeft: 18, marginTop: 8 }}>
              <li>Abre <b>Atajos</b> → pestaña <b>Automatización</b> → <b>+</b> → <b>Mensaje</b>.</li>
              <li>
                En "Remitente" escribe <b>Bancolombia</b> (o marca "Mensaje contiene" y pon el nombre del
                banco). Elige <b>Ejecutar inmediatamente</b>.
              </li>
              <li>Agrega la acción <b>Obtener contenido de URL</b> y pega ahí el <b>enlace</b>.</li>
              <li>
                Ábrela con la flechita: Método <b>POST</b>. En Encabezados agrega <b>apikey</b> con la{' '}
                <b>clave</b>, y <b>Content-Type</b> con <b>application/json</b>.
              </li>
              <li>
                En Cuerpo de la solicitud elige <b>JSON</b> y crea dos campos de texto: <b>p_token</b> con tu{' '}
                <b>token</b>, y <b>p_texto</b> con la variable <b>Contenido del mensaje</b>.
              </li>
              <li>Listo. Repite el Atajo por cada banco que les escriba, y en el celular de cada uno.</li>
            </ol>
            <p className="mini suave">
              Ojo: esto solo funciona con mensajes que lleguen a la app Mensajes. Las alertas que llegan como
              notificación de la app del banco se anotan con el botón 📩 de Gastos.
            </p>
          </details>
        </>
      )}
    </div>
  )
}
