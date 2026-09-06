import type { Categoria } from './types'

/**
 * Comercio -> categoría. Se recorre en orden y gana la primera palabra que aparezca
 * dentro del nombre, así que lo específico va antes que lo genérico.
 * El nombre llega normalizado: mayúsculas, sin tildes.
 */
const MAPA: [string, Categoria][] = [
  // Mercado
  ['EXITO', 'mercado'], ['CARULLA', 'mercado'], ['OLIMPICA', 'mercado'], ['JUMBO', 'mercado'],
  ['SURTIMAX', 'mercado'], ['SURTIFRUVER', 'mercado'], ['SUPERINTER', 'mercado'], ['MAKRO', 'mercado'],
  ['ZAPATOCA', 'mercado'], ['LA 14', 'mercado'], ['MERCADO', 'mercado'], ['SUPERMERCADO', 'mercado'],
  ['D1', 'mercado'], ['ARA', 'mercado'], ['ISIMO', 'mercado'],

  // Salidas y comida
  ['RAPPI', 'comida'], ['DIDI FOOD', 'comida'], ['MCDONALD', 'comida'], ['BURGER KING', 'comida'],
  ['KFC', 'comida'], ['DOMINO', 'comida'], ['PAPA JOHN', 'comida'], ['FRISBY', 'comida'],
  ['EL CORRAL', 'comida'], ['CREPES', 'comida'], ['JUAN VALDEZ', 'comida'], ['TOSTAO', 'comida'],
  ['STARBUCKS', 'comida'], ['DUNKIN', 'comida'], ['SUBWAY', 'comida'], ['ARCHIES', 'comida'],
  ['PRESTO', 'comida'], ['SIERRA NEVADA', 'comida'], ['RESTAURANTE', 'comida'], ['PANADERIA', 'comida'],
  ['PIZZA', 'comida'], ['SUSHI', 'comida'], ['CAFE', 'comida'], ['HELADER', 'comida'],

  // Transporte
  ['UBER', 'transporte'], ['DIDI', 'transporte'], ['CABIFY', 'transporte'], ['INDRIVE', 'transporte'],
  ['TERPEL', 'transporte'], ['PRIMAX', 'transporte'], ['BIOMAX', 'transporte'], ['ESSO', 'transporte'],
  ['MOBIL', 'transporte'], ['TEXACO', 'transporte'], ['PEAJE', 'transporte'], ['PARQUEADERO', 'transporte'],
  ['TRANSMILENIO', 'transporte'], ['TULLAVE', 'transporte'], ['TAXI', 'transporte'],
  ['ESTACION DE SERVICIO', 'transporte'], ['GASOLINA', 'transporte'],

  // Servicios
  ['CLARO', 'servicios'], ['MOVISTAR', 'servicios'], ['TIGO', 'servicios'], ['ETB', 'servicios'],
  ['WOM', 'servicios'], ['EPM', 'servicios'], ['ENEL', 'servicios'], ['CODENSA', 'servicios'],
  ['VANTI', 'servicios'], ['GAS NATURAL', 'servicios'], ['ACUEDUCTO', 'servicios'], ['EMCALI', 'servicios'],
  ['AFINIA', 'servicios'], ['AIR-E', 'servicios'], ['DIRECTV', 'servicios'], ['INTERNET', 'servicios'],

  // Salud
  ['FARMATODO', 'salud'], ['CRUZ VERDE', 'salud'], ['LA REBAJA', 'salud'], ['DROGUERIA', 'salud'],
  ['LOCATEL', 'salud'], ['COLSANITAS', 'salud'], ['COMPENSAR', 'salud'], ['CLINICA', 'salud'],
  ['ODONTO', 'salud'], ['OPTICA', 'salud'], ['LABORATORIO', 'salud'],

  // Planes
  ['NETFLIX', 'diversion'], ['SPOTIFY', 'diversion'], ['DISNEY', 'diversion'], ['HBO', 'diversion'],
  ['PRIME VIDEO', 'diversion'], ['YOUTUBE', 'diversion'], ['CINE COLOMBIA', 'diversion'],
  ['CINEMARK', 'diversion'], ['ROYAL FILMS', 'diversion'], ['PROCINAL', 'diversion'],
  ['PLAYSTATION', 'diversion'], ['XBOX', 'diversion'], ['STEAM', 'diversion'], ['NINTENDO', 'diversion'],
  ['TICKETMASTER', 'diversion'], ['TUBOLETA', 'diversion'], ['APPLE.COM', 'diversion'],

  // Ropa
  ['FALABELLA', 'ropa'], ['ZARA', 'ropa'], ['H&M', 'ropa'], ['PULL&BEAR', 'ropa'], ['BERSHKA', 'ropa'],
  ['ARTURO CALLE', 'ropa'], ['TENNIS', 'ropa'], ['KOAJ', 'ropa'], ['STUDIO F', 'ropa'],
  ['ADIDAS', 'ropa'], ['NIKE', 'ropa'], ['VELEZ', 'ropa'], ['BOSI', 'ropa'], ['TOTTO', 'ropa'],

  // Hogar
  ['HOMECENTER', 'hogar'], ['SODIMAC', 'hogar'], ['EASY', 'hogar'], ['ALKOSTO', 'hogar'],
  ['KTRONIX', 'hogar'], ['IKEA', 'hogar'], ['FERRETERIA', 'hogar'], ['ADMINISTRACION', 'hogar'],
  ['ARRIENDO', 'hogar'],

  // Viajes
  ['AVIANCA', 'viajes'], ['LATAM', 'viajes'], ['WINGO', 'viajes'], ['VIVA AIR', 'viajes'],
  ['COPA AIRLINES', 'viajes'], ['BOOKING', 'viajes'], ['AIRBNB', 'viajes'], ['DESPEGAR', 'viajes'],
  ['EXPEDIA', 'viajes'], ['HOTEL', 'viajes'], ['HOSTAL', 'viajes'],
]

/**
 * Clave con la que se recuerda la categoría que ustedes eligieron para un comercio.
 * Usa la primera palabra larga (EXITO SUBA y EXITO CHAPINERO comparten "EXITO"),
 * y si no hay ninguna, el nombre completo.
 */
export function claveComercio(comercio: string): string {
  const limpio = comercio.replace(/[^A-Z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
  const primera = limpio.split(' ').find((p) => p.length >= 4 && !/^\d+$/.test(p))
  return primera ?? limpio
}

/**
 * La palabra tiene que empezar donde empieza una palabra del comercio (así ZARA no cae en ARA).
 * Las cortas piden calce exacto; las largas admiten cola, para que DOMINO agarre DOMINOS.
 */
const PALABRAS: [RegExp, Categoria][] = MAPA.map(([palabra, categoria]) => {
  const clave = palabra.trim()
  const escapada = clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re =
    clave.length <= 4
      ? new RegExp(`(^|[^A-Z0-9])${escapada}([^A-Z0-9]|$)`)
      : new RegExp(`(^|[^A-Z0-9])${escapada}`)
  return [re, categoria]
})

/** Categoría del comercio, o null si no lo conocemos (eso baja la confianza del mensaje). */
export function categoriaDe(comercio: string, aprendidos: Record<string, Categoria> = {}): Categoria | null {
  const nombre = comercio.toUpperCase().trim()
  if (!nombre) return null

  const aprendido = aprendidos[nombre] ?? aprendidos[claveComercio(comercio)]
  if (aprendido) return aprendido

  return PALABRAS.find(([re]) => re.test(nombre))?.[1] ?? null
}
