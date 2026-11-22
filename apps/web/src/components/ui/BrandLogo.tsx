export interface BrandLogoProps {
  variant?: 'mark' | 'lockup' | undefined
  tone?: 'light' | 'dark' | undefined
  className?: string | undefined
  decorative?: boolean | undefined
}

const TONE_PALETTE = {
  light: {
    awningFill: '#1F5146',
    stripeFill: '#E6F1EE',
    stroke: '#1F5146',
    blush: '#E8927C',
    blushOpacity: 0.88,
  },
  dark: {
    awningFill: '#FFFDF8',
    stripeFill: '#CBE2DA',
    stroke: '#FFFDF8',
    blush: '#F2A48E',
    blushOpacity: 0.92,
  },
} as const

export function BrandLogo({
  variant = 'mark',
  tone = 'light',
  className = '',
  decorative = true,
}: BrandLogoProps) {
  const palette = TONE_PALETTE[tone]
  const accessibilityProps = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': 'Logo Zaina Arsyi' } as const)

  const markSvg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 160"
      className={
        variant === 'mark'
          ? `brand-logo__mark ${className}`.trim()
          : 'brand-logo__mark'
      }
      {...(variant === 'mark' ? accessibilityProps : { 'aria-hidden': true })}
    >
      <path
        d="M 26 18 H 174 L 188 66 C 188 82 168 88 156 88 C 144 88 132 80 128 72 C 122 82 112 88 100 88 C 88 88 78 82 72 72 C 68 80 56 88 44 88 C 32 88 12 82 12 66 Z"
        fill={palette.awningFill}
      />
      <path
        d="M 78 18 H 122 L 126 68 C 122 78 112 84 100 84 C 88 84 78 78 74 68 Z"
        fill={palette.stripeFill}
      />
      <path
        d="M 26 18 H 174 L 188 66 C 188 82 168 88 156 88 C 144 88 132 80 128 72 C 122 82 112 88 100 88 C 88 88 78 82 72 72 C 68 80 56 88 44 88 C 32 88 12 82 12 66 Z"
        fill="none"
        stroke={palette.stroke}
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d="M 60 124 Q 70 112 80 124"
        fill="none"
        stroke={palette.stroke}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <path
        d="M 120 124 Q 130 112 140 124"
        fill="none"
        stroke={palette.stroke}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <path
        d="M 88 134 Q 100 148 112 134"
        fill="none"
        stroke={palette.stroke}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <ellipse
        cx="48"
        cy="140"
        rx="11"
        ry="6"
        fill={palette.blush}
        opacity={palette.blushOpacity}
      />
      <ellipse
        cx="152"
        cy="140"
        rx="11"
        ry="6"
        fill={palette.blush}
        opacity={palette.blushOpacity}
      />
    </svg>
  )

  if (variant === 'mark') {
    return markSvg
  }

  return (
    <span
      className={`brand-logo brand-logo--lockup brand-logo--${tone} ${className}`.trim()}
      {...accessibilityProps}
    >
      {markSvg}
      <span className="brand-logo__text">
        <span className="brand-logo__wordmark">Zaina Arsyi</span>
        <span className="brand-logo__submark">TOKO PERABOT RUMAH</span>
      </span>
    </span>
  )
}
