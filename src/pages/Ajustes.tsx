import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { Estado } from '../types'
import { listarFotos, blobADataUrl, dataUrlABlob, guardarFoto } from '../db'
import { Campo, InputMonto, useToast } from '../components/ui'
import { Cuenta } from '../components/Cuenta'
import { AtajoSms } from '../components/AtajoSms'
import { useSync } from '../sync'

export function Ajustes() {
  const { estado, dispatch } = useStore()
  const { perfil } = estado
  const [nombreA, setNombreA] = useState(perfil.nombreA)
  const [nombreB, setNombreB] = useState(perfil.nombreB)
  const [nombrePareja, setNombrePareja] = useState(perfil.nombrePareja)
  const [moneda, setMoneda] = useState(perfil.moneda)
  const [ingresoA, setIngresoA] = useState(perfil.ingresoEsperado?.a ?? 0)
  const [ingresoB, setIngresoB] = useState(perfil.ingresoEsperado?.b ?? 0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { mostrar, Toast } = useToast()
  const sync = useSync()

  const guardarPerfil = () => {
    dispatch({
      tipo: 'perfil',
      perfil: {
        nombreA: nombreA.trim(),
        nombreB: nombreB.trim(),
        nombrePareja: nombrePareja.trim(),
        moneda,
        ingresoEsperado: { a: ingresoA, b: ingresoB },
      },
    })
    mostrar('Guardado')
  }

  const exportar = async () => {
    const blobs = await listarFotos()
    const fotos: Record<string, string> = {}
    for (const [id, b] of Object.entries(blobs)) fotos[id] = await blobADataUrl(b)
    const respaldo = { estado, fotos, exportadoEn: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(respaldo)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nuestras-metas-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importar = async (file: File | undefined) => {
    if (!file) return
    try {
      const texto = await file.text()
      const data = JSON.parse(texto) as { estado?: Estado; fotos?: Record<string, string> }
      if (!data.estado || data.estado.version !== 1) throw new Error('formato')
      if (!window.confirm('Esto reemplaza todo lo que hay en este dispositivo con el respaldo. ¿Seguimos?')) return
      for (const [id, dataUrl] of Object.entries(data.fotos ?? {})) {
        await guardarFoto(id, await dataUrlABlob(dataUrl))
      }
      dispatch({ tipo: 'importar', estado: data.estado })
      mostrar('Respaldo cargado')
    } catch {
      mostrar('Ese archivo no es un respaldo válido')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="pila">
      <div className="cabecera">
        <div>
          <h1>Ajustes</h1>
          <p className="sub">Nombres, moneda y respaldos.</p>
        </div>
      </div>

      <div className="tarjeta pila">
        <h3>Nosotros</h3>
        <div className="grid2">
          <Campo label="Nombre 1">
            <input value={nombreA} onChange={(e) => setNombreA(e.target.value)} />
          </Campo>
          <Campo label="Nombre 2">
            <input value={nombreB} onChange={(e) => setNombreB(e.target.value)} />
          </Campo>
        </div>
        <Campo label="Cómo le decimos a lo nuestro">
          <input value={nombrePareja} onChange={(e) => setNombrePareja(e.target.value)} />
        </Campo>
        <div className="grid2">
          <Campo label={`Ingreso mensual de ${nombreA || 'Nombre 1'}`}>
            <InputMonto valor={ingresoA} onCambio={setIngresoA} />
          </Campo>
          <Campo label={`Ingreso mensual de ${nombreB || 'Nombre 2'}`}>
            <InputMonto valor={ingresoB} onCambio={setIngresoB} />
          </Campo>
        </div>
        <p className="mini suave">Lo esperado en un mes normal. Con eso la Caja reparte los bolsillos.</p>
        <Campo label="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="COP">Pesos colombianos (COP)</option>
            <option value="USD">Dólares (USD)</option>
            <option value="EUR">Euros (EUR)</option>
            <option value="MXN">Pesos mexicanos (MXN)</option>
          </select>
        </Campo>
        <button className="btn" disabled={!nombreA.trim() || !nombreB.trim()} onClick={guardarPerfil}>
          Guardar
        </button>
      </div>

      <div className="tarjeta pila">
        <h3>Sincronizar entre los dos</h3>
        <p className="chica suave">
          Con una cuenta cada uno y un código compartido, lo que anote uno le aparece al otro en segundos. Fotos incluidas.
        </p>
        <Cuenta />
      </div>

      <div className="tarjeta pila">
        <h3>Anotar desde mensajes</h3>
        <AtajoSms avisar={mostrar} />
      </div>

      <div className="tarjeta pila">
        <h3>Respaldo</h3>
        <p className="chica suave">
          Todo vive en este dispositivo. Para tenerlo en el celular de los dos, exporta aquí y carga el archivo
          en el otro. Hazlo cada tanto para no perder nada.
        </p>
        <div className="fila envolver" style={{ gap: 8 }}>
          <button className="btn secundario" onClick={exportar}>
            Exportar respaldo
          </button>
          <button className="btn fantasma" onClick={() => inputRef.current?.click()}>
            Cargar respaldo
          </button>
          <input ref={inputRef} type="file" accept="application/json" hidden onChange={(e) => importar(e.target.files?.[0])} />
        </div>
      </div>

      <div className="tarjeta pila">
        <h3>Instalar en el celular</h3>
        <p className="chica suave">
          En Safari (iPhone): Compartir → "Agregar a inicio". En Chrome (Android): menú ⋮ → "Instalar app". Queda
          como una app más, con ícono y todo.
        </p>
      </div>

      <div className="tarjeta pila">
        <h3>Zona de peligro</h3>
        <button
          className="btn peligro"
          onClick={() => {
            const aviso =
              sync.estadoSync === 'listo'
                ? '¿Borrar TODO y empezar de cero? Como están sincronizados, también se borra en el otro celular.'
                : '¿Borrar TODO y empezar de cero? Las fotos del muro se quedan guardadas hasta que las quites.'
            if (window.confirm(aviso)) {
              dispatch({ tipo: 'reiniciar' })
            }
          }}
        >
          Empezar de cero
        </button>
      </div>
      {Toast}
    </div>
  )
}
