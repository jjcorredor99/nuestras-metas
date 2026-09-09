import type { Categoria } from './types'

export const CATEGORIAS: { id: Categoria; nombre: string; emoji: string }[] = [
  { id: 'mercado', nombre: 'Mercado', emoji: '🛒' },
  { id: 'comida', nombre: 'Salidas y comida', emoji: '🍕' },
  { id: 'transporte', nombre: 'Transporte', emoji: '🚕' },
  { id: 'hogar', nombre: 'Hogar', emoji: '🏠' },
  { id: 'servicios', nombre: 'Servicios', emoji: '💡' },
  { id: 'salud', nombre: 'Salud', emoji: '💊' },
  { id: 'diversion', nombre: 'Planes', emoji: '🎬' },
  { id: 'ropa', nombre: 'Ropa', emoji: '👗' },
  { id: 'regalos', nombre: 'Regalos', emoji: '🎁' },
  { id: 'viajes', nombre: 'Viajes', emoji: '✈️' },
  { id: 'fuera', nombre: 'Fuera de casa', emoji: '📤' },
  { id: 'otros', nombre: 'Otros', emoji: '📦' },
]

export const catInfo = (id: Categoria) => CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[CATEGORIAS.length - 1]
