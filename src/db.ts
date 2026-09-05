// Fotos guardadas en IndexedDB (localStorage se queda corto con imágenes).
const DB = 'nuestras-metas'
const STORE = 'fotos'

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function guardarFoto(id: string, blob: Blob): Promise<void> {
  const db = await abrir()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function leerFoto(id: string): Promise<Blob | undefined> {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result as Blob | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function borrarFoto(id: string): Promise<void> {
  const db = await abrir()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listarFotos(): Promise<Record<string, Blob>> {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    const out: Record<string, Blob> = {}
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
    req.onsuccess = () => {
      const cur = req.result
      if (!cur) return resolve(out)
      out[String(cur.key)] = cur.value as Blob
      cur.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

/** Reduce la imagen para que no pese tanto (máx. 1400px por lado). */
export function comprimirImagen(file: File, max = 1400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const escala = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * escala)
      canvas.height = Math.round(img.height * escala)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('sin canvas'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('sin blob'))), 'image/jpeg', 0.86)
    }
    img.onerror = () => reject(new Error('imagen inválida'))
    img.src = url
  })
}

export function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function dataUrlABlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}
