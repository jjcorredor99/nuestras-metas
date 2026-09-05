export const hoy = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const mesActual = (): string => hoy().slice(0, 7)

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function dinero(monto: number, moneda = 'COP'): string {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: moneda,
      maximumFractionDigits: moneda === 'COP' ? 0 : 2,
    }).format(monto)
  } catch {
    return `${moneda} ${Math.round(monto).toLocaleString('es-CO')}`
  }
}

export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function nombreMes(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  const fecha = new Date(y, m - 1, 1)
  const s = fecha.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function diasHasta(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const objetivo = new Date(y, m - 1, d)
  const ahora = new Date()
  ahora.setHours(0, 0, 0, 0)
  return Math.round((objetivo.getTime() - ahora.getTime()) / 86400000)
}

/** Días que faltan para el próximo vencimiento de una factura con día fijo. */
export function diasParaVencer(diaVence: number): number {
  const ahora = new Date()
  ahora.setHours(0, 0, 0, 0)
  const ultimoDiaMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate()
  const dia = Math.min(diaVence, ultimoDiaMes)
  let objetivo = new Date(ahora.getFullYear(), ahora.getMonth(), dia)
  if (objetivo < ahora) {
    const ultimoDiaProx = new Date(ahora.getFullYear(), ahora.getMonth() + 2, 0).getDate()
    objetivo = new Date(ahora.getFullYear(), ahora.getMonth() + 1, Math.min(diaVence, ultimoDiaProx))
  }
  return Math.round((objetivo.getTime() - ahora.getTime()) / 86400000)
}

export function sumar(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}

export function pct(parte: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((parte / total) * 100)))
}

export function mesesRestantes(iso: string): number {
  const [y, m] = iso.split('-').map(Number)
  const ahora = new Date()
  return Math.max(0, (y - ahora.getFullYear()) * 12 + (m - 1 - ahora.getMonth()))
}
