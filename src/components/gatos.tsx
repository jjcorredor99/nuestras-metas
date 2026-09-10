/**
 * Los tres gatos de la casa.
 *
 * No son adorno suelto: cada uno vive en una tarjeta y siempre en la misma,
 * para que uno aprenda dónde encontrarlos. El gordito duerme sobre la caja
 * del mes, el siamés cuida el hito y el flaco se asoma por el borde de las
 * categorías, como cuando se suben a la mesa a mirar qué estamos haciendo.
 *
 * Van dibujados a mano en SVG con la misma paleta de la piel, así que escalan
 * sin pixelarse y no pesan nada. El clip de cada mancha lleva un id propio
 * (useId) porque puede haber varios gatos en la misma pantalla.
 */
import { useId } from 'react'

const NEGRO = '#33352f'
const BLANCO = '#fbfaf6'
const CREMA = '#faf5ea'
const CAFE = '#6b584a'
const NARIZ = '#c98d6b'

/** El gordito blanco y negro, hecho una hogaza y dormido. */
export function GatoGordo() {
  const id = useId()
  return (
    <svg className="gato gordo" viewBox="0 0 176 120" fill="none" aria-hidden>
      <defs>
        <clipPath id={`${id}-cuerpo`}>
          <ellipse cx="100" cy="84" rx="62" ry="33" />
        </clipPath>
        <clipPath id={`${id}-cabeza`}>
          <circle cx="50" cy="62" r="32" />
        </clipPath>
      </defs>
      <path d="M146 98c24-2 24 20 4 20" stroke={NEGRO} strokeWidth="12" strokeLinecap="round" />
      <path d="M26 42 14 10l36 22z" fill={NEGRO} />
      <path d="M74 42 88 12 54 32z" fill={NEGRO} />
      <ellipse cx="100" cy="84" rx="62" ry="33" fill={BLANCO} />
      <g clipPath={`url(#${id}-cuerpo)`}>
        <ellipse cx="138" cy="72" rx="46" ry="38" transform="rotate(-14 138 72)" fill={NEGRO} />
      </g>
      <circle cx="50" cy="62" r="32" fill={BLANCO} />
      <g clipPath={`url(#${id}-cabeza)`}>
        <ellipse cx="66" cy="36" rx="30" ry="22" transform="rotate(-22 66 36)" fill={NEGRO} />
      </g>
      <path
        d="M31 63c3.5 5.5 11 5.5 14.5 0M56 63c3.5 5.5 11 5.5 14.5 0"
        stroke={NEGRO}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path d="M45.5 73h10L50.5 79z" fill={NARIZ} />
      <path
        d="M50.5 79c-2.5 3.5-7 3-8.5-.5M50.5 79c2.5 3.5 7 3 8.5-.5"
        stroke={NEGRO}
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".7"
      />
      <path
        d="M12 68 30 71M12 79 30 76M89 68 71 71M89 79 71 76"
        stroke={NEGRO}
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity=".6"
      />
      <ellipse cx="56" cy="104" rx="15" ry="8.5" fill={BLANCO} />
      <ellipse cx="84" cy="106" rx="15" ry="8.5" fill={BLANCO} />
    </svg>
  )
}

/** El siamés, sentado y con la cola en el suelo. */
export function GatoSiames() {
  const id = useId()
  return (
    <svg className="gato siames" viewBox="0 0 124 146" fill="none" aria-hidden>
      <defs>
        <clipPath id={`${id}-cabeza`}>
          <circle cx="60" cy="54" r="31" />
        </clipPath>
      </defs>
      <path d="M60 66c23 0 35 30 35 64H25c0-34 12-64 35-64Z" fill={CREMA} />
      <path d="M32 46 22 8l36 22z" fill={CAFE} />
      <path d="M88 46 98 8 62 30z" fill={CAFE} />
      <circle cx="60" cy="54" r="31" fill={CREMA} />
      <g clipPath={`url(#${id}-cabeza)`}>
        <ellipse cx="60" cy="60" rx="20" ry="17" fill={CAFE} />
      </g>
      <path d="M40 52c4.5-4.5 11-4 14 1.5-4 4.5-11 4.5-14-1.5Z" fill="#9dc0d4" />
      <path d="M80 52c-4.5-4.5-11-4-14 1.5 4 4.5 11 4.5 14-1.5Z" fill="#9dc0d4" />
      <path d="M46.5 50v6M73.5 50v6" stroke="#2f2a26" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M55 60h10l-5 5z" fill={NARIZ} />
      <path
        d="M60 65v3.5M60 68.5c-3 3.5-7.5 3-9-.5M60 68.5c3 3.5 7.5 3 9-.5"
        stroke={CREMA}
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".85"
      />
      <path
        d="M24 62 44 65M24 73 44 70M96 62 76 65M96 73 76 70"
        stroke={CREMA}
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity=".8"
      />
      <path d="M80 130c16 4 28-2 28-16" stroke={CAFE} strokeWidth="10" strokeLinecap="round" />
      <ellipse cx="45" cy="128" rx="12" ry="6.5" fill={CAFE} />
      <ellipse cx="74" cy="128" rx="12" ry="6.5" fill={CAFE} />
    </svg>
  )
}

/** El flaco blanco y negro, asomado por el borde de una tarjeta. */
export function GatoAsomado() {
  const id = useId()
  return (
    <svg className="gato asomado" viewBox="0 0 134 98" fill="none" aria-hidden>
      <defs>
        <clipPath id={`${id}-cabeza`}>
          <circle cx="67" cy="52" r="33" />
        </clipPath>
      </defs>
      <path d="M46 36 30 4l34 20z" fill={NEGRO} />
      <path d="M88 36 104 4 70 24z" fill={NEGRO} />
      <circle cx="67" cy="52" r="33" fill={BLANCO} />
      <g clipPath={`url(#${id}-cabeza)`}>
        <ellipse cx="44" cy="30" rx="29" ry="22" transform="rotate(-22 44 30)" fill={NEGRO} />
      </g>
      <ellipse cx="54" cy="52" rx="6.5" ry="7" fill="#a8c199" />
      <ellipse cx="80" cy="52" rx="6.5" ry="7" fill="#5f7a58" />
      <path d="M54 48v8M80 48v8" stroke="#2a2f28" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M62 63h10l-5 5z" fill={NARIZ} />
      <path
        d="M67 68c-2.5 3.5-7 3-8.5-.5M67 68c2.5 3.5 7 3 8.5-.5"
        stroke="#7d8a7a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M30 58 48 61M30 69 48 66M104 58 86 61M104 69 86 66"
        stroke="#7d8a7a"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <ellipse cx="44" cy="90" rx="14" ry="8.5" fill={BLANCO} stroke="#cfd8ca" strokeWidth="1.6" />
      <ellipse cx="90" cy="90" rx="14" ry="8.5" fill={BLANCO} stroke="#cfd8ca" strokeWidth="1.6" />
    </svg>
  )
}
