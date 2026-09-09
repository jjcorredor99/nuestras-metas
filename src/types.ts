export type Persona = 'a' | 'b'

export interface Perfil {
  nombreA: string
  nombreB: string
  nombrePareja: string
  moneda: string
  onboarded: boolean
  /** Comercios cuya categoría corrigieron a mano, para acertar la próxima vez. */
  aprendidos?: Record<string, Categoria>
  /** Lo que cada uno espera que le entre al mes (para planear los bolsillos). */
  ingresoEsperado?: { a: number; b: number }
  /** Tres cajas: con qué sueldo se vive y cómo se reparte lo que sobra. */
  plan?: PlanCaja
}

/**
 * La regla de la casa: se vive con un solo sueldo ('menor' = el más bajo de los dos esperados)
 * y lo que sobra, tras las obligaciones fuera de casa, se reparte entre deudas y ahorro.
 */
export interface PlanCaja {
  sueldoVivir: Persona | 'menor'
  avanzar: { deudas: number; ahorro: number }
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
  | 'fuera'
  | 'otros'

/** De dónde salió un gasto que no se escribió a mano. */
export interface OrigenGasto {
  fuente: 'sms' | 'pegado'
  /** Huella del mensaje, para no anotarlo dos veces. */
  hash: string
  banco?: string
}

export interface Gasto {
  id: string
  fecha: string // YYYY-MM-DD
  monto: number
  categoria: Categoria
  pagadoPor: Persona
  compartido: boolean
  nota: string
  origen?: OrigenGasto
  /** Bolsillo elegido a mano; sin esto, cae por categoría. */
  bolsilloId?: string
}

/** De quién es un bolsillo: de la casa o de una persona. */
export type Ambito = 'hogar' | Persona

/** Meter, sacar o mover plata de un bolsillo (monto con signo). */
export interface AjusteBolsillo {
  id: string
  fecha: string
  monto: number
  nota: string
}

export interface Bolsillo {
  id: string
  nombre: string
  emoji: string
  ambito: Ambito
  asignacion: number // lo que se le mete cada mes
  acumula: boolean // true: lo que sobra pasa al mes siguiente; false: se reinicia
  categorias: Categoria[] // [] = recibe lo que no tenga bolsillo en su ámbito
  saldoInicial: number // solo pesa si acumula
  desde: string // 'YYYY-MM' desde cuándo cuenta
  ajustes: AjusteBolsillo[]
}

export type FuenteIngreso = 'nomina' | 'extra' | 'devolucion' | 'otro'

export interface Ingreso {
  id: string
  fecha: string // YYYY-MM-DD
  monto: number
  de: Persona
  fuente: FuenteIngreso
  nota: string
  origen?: OrigenGasto
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
  bolsillos: Bolsillo[]
  ingresos: Ingreso[]
}
