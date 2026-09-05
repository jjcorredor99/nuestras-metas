export type Persona = 'a' | 'b'

export interface Perfil {
  nombreA: string
  nombreB: string
  nombrePareja: string
  moneda: string
  onboarded: boolean
}

export type Categoria =
  | 'mercado'
  | 'comida'
  | 'transporte'
  | 'hogar'
  | 'servicios'
  | 'salud'
  | 'diversion'
  | 'ropa'
  | 'regalos'
  | 'viajes'
  | 'otros'

export interface Gasto {
  id: string
  fecha: string // YYYY-MM-DD
  monto: number
  categoria: Categoria
  pagadoPor: Persona
  compartido: boolean
  nota: string
}

export interface Factura {
  id: string
  nombre: string
  monto: number
  diaVence: number // 1..31
  responsable: Persona | 'ambos'
  pagadaEn: string[] // meses 'YYYY-MM' en los que ya se pagó
  activa: boolean
}

export interface Abono {
  id: string
  fecha: string
  monto: number
  por: Persona
}

export interface Deuda {
  id: string
  nombre: string
  de: Persona | 'ambos'
  montoInicial: number
  tasaMensual: number // porcentaje, informativo
  pagoMinimo: number
  abonos: Abono[]
  creadaEn: string
}

export type TipoReto = 'ahorro' | 'habito' | 'limite'

export interface Reto {
  id: string
  titulo: string
  descripcion: string
  tipo: TipoReto
  meta: number // ahorro: monto; habito: días/veces; limite: monto máximo
  progreso: number
  fechaLimite: string // YYYY-MM-DD
  emoji: string
  completado: boolean
  completadoEn?: string
  recompensa: string
}

export interface AporteMeta {
  id: string
  fecha: string
  monto: number
  por: Persona
}

export interface Meta {
  id: string
  titulo: string
  descripcion: string
  emoji: string
  fecha: string // YYYY-MM-DD
  montoObjetivo: number
  aportes: AporteMeta[]
  color: string
  fija: boolean // no se puede borrar (Grecia)
}

export interface Foto {
  id: string
  titulo: string
  creadaEn: string
  // la imagen vive en IndexedDB con este mismo id
}

export interface Estado {
  version: 1
  perfil: Perfil
  gastos: Gasto[]
  facturas: Factura[]
  deudas: Deuda[]
  retos: Reto[]
  metas: Meta[]
  fotos: Foto[]
}
