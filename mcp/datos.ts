// Lo que el conector sabe leer y escribir: las mismas filas de `items` que sincroniza la app.
import type { Estado, Perfil, Persona } from '../src/types'

/** Algo que Claude anota para no olvidarlo. La app no lo muestra (ni lo borra): vive solo en la nube. */
export interface Apunte {
  id: string
  texto: string
  etiqueta: string
  por: Persona
  creadoEn: string
  hecho: boolean
  hechoEn?: string
}

export type TipoFila =
  | 'perfil'
  | 'gasto'
  | 'factura'
  | 'deuda'
  | 'reto'
  | 'meta'
  | 'foto'
  | 'bolsillo'
  | 'ingreso'
  | 'producto'
  | 'lista'
  | 'apunte'

export interface FilaItem {
  id: string
  tipo: TipoFila
  data: unknown
}

/** Dónde viven las filas del hogar. En la función es Supabase; en las pruebas, un arreglo. */
export interface Almacen {
  /** Todas las filas vivas (sin borrar) del hogar. */
  leer(): Promise<FilaItem[]>
  /** Crea o reemplaza filas completas. */
  guardar(filas: FilaItem[]): Promise<void>
  /** Marca filas como borradas (la app las quita en los dos celulares). */
  borrar(ids: string[]): Promise<void>
  /** Los mensajes del banco que nadie ha resuelto todavía (lo "por confirmar"). */
  entrantes(): Promise<Entrante[]>
  /**
   * Resuelve (o suelta) un mensaje. Al resolver, solo gana si nadie se adelantó:
   * devuelve false si el otro celular ya lo tomó.
   */
  resolverEntrante(id: string, procesado: boolean): Promise<boolean>
}

/** Un SMS del banco tal como lo dejó el Atajo del celular. */
export interface Entrante {
  id: string
  persona: Persona
  texto: string
  recibido_en: string
}

export interface Datos {
  estado: Estado
  apuntes: Apunte[]
}

const COLECCION = {
  gasto: 'gastos',
  factura: 'facturas',
  deuda: 'deudas',
  reto: 'retos',
  meta: 'metas',
  foto: 'fotos',
  bolsillo: 'bolsillos',
  ingreso: 'ingresos',
  producto: 'productos',
  lista: 'listas',
} as const

const perfilBase: Perfil = { nombreA: '', nombreB: '', nombrePareja: '', moneda: 'COP', onboarded: true }

/** Arma el estado de la app a partir de las filas, igual que lo haría un celular recién sincronizado. */
export function datosDesdeFilas(filas: FilaItem[]): Datos {
  const estado: Estado = {
    version: 1,
    perfil: { ...perfilBase },
    gastos: [],
    facturas: [],
    deudas: [],
    retos: [],
    metas: [],
    fotos: [],
    bolsillos: [],
    ingresos: [],
    productos: [],
    listas: [],
  }
  const apuntes: Apunte[] = []
  for (const f of filas) {
    if (f.tipo === 'perfil') estado.perfil = { ...estado.perfil, ...(f.data as Partial<Perfil>), onboarded: true }
    else if (f.tipo === 'apunte') apuntes.push(f.data as Apunte)
    else if (f.tipo in COLECCION) (estado[COLECCION[f.tipo]] as unknown[]).push(f.data)
  }
  return { estado, apuntes }
}
