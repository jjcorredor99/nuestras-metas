const CLAVE = 'nuestras-metas:mensaje-pendiente'
const EVENTO = 'nm:mensaje-pendiente'

/**
 * Un enlace tipo `#gastos?texto=...` (por ejemplo desde un Atajo o desde el escritorio)
 * trae el mensaje del banco. Lo guardamos y limpiamos la barra de direcciones, para que
 * sobreviva al onboarding y a una recarga, y para que no se anote dos veces al refrescar.
 * Devuelve true si el enlace traía mensaje.
 */
export function capturarMensajeDelEnlace(): boolean {
  try {
    const hash = location.hash.replace(/^#/, '')
    const [pagina, consulta] = hash.split('?')
    const params = new URLSearchParams(consulta ?? '')
    const texto = params.get('texto') ?? new URLSearchParams(location.search).get('texto')
    if (!texto) return false
    localStorage.setItem(CLAVE, texto)
    const destino = pagina || 'gastos'
    history.replaceState(null, '', `${location.pathname}#${destino}`)
    // La app puede estar abierta ya: avisamos para que Gastos lo recoja.
    window.dispatchEvent(new Event(EVENTO))
    return true
  } catch {
    /* si algo falla, simplemente no hay mensaje pendiente */
    return false
  }
}

/** Avisa cuando llega un mensaje por la URL con la app ya abierta. */
export function alLlegarMensaje(cb: () => void): () => void {
  window.addEventListener(EVENTO, cb)
  return () => window.removeEventListener(EVENTO, cb)
}

/** Devuelve (una sola vez) el mensaje que trajo el enlace. */
export function tomarMensajePendiente(): string | null {
  try {
    const t = localStorage.getItem(CLAVE)
    if (t) localStorage.removeItem(CLAVE)
    return t
  } catch {
    return null
  }
}
