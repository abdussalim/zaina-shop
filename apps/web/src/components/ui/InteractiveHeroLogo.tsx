import { useEffect, useRef, useState } from 'react'

interface Offset {
  x: number
  y: number
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function InteractiveHeroLogo({ className = '' }: { className?: string | undefined }) {
  const containerRef = useRef<HTMLButtonElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const bounceTimerRef = useRef<number | null>(null)
  const [look, setLook] = useState<Offset>({ x: 0, y: 0 })
  const [isHappyBounce, setIsHappyBounce] = useState(false)

  function triggerHappyBounce() {
    if (prefersReducedMotion()) return
    setIsHappyBounce(true)
    if (bounceTimerRef.current !== null) {
      window.clearTimeout(bounceTimerRef.current)
    }
    bounceTimerRef.current = window.setTimeout(() => {
      setIsHappyBounce(false)
      bounceTimerRef.current = null
    }, 950)
  }

  useEffect(() => {
    if (prefersReducedMotion()) return

    let lastPointerTime = 0

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      lastPointerTime = Date.now()
      const clientX = event.clientX
      const clientY = event.clientY

      if (rafRef.current !== null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const el = containerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return

        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const dx = clientX - centerX
        const dy = clientY - centerY
        const distance = Math.hypot(dx, dy)
        const maxDistance = 320
        const strength = Math.min(1, distance / maxDistance)
        const angle = Math.atan2(dy, dx)

        const nextX = Math.cos(angle) * strength * 7.5
        const nextY = Math.sin(angle) * strength * 4.5
        setLook({ x: Number(nextX.toFixed(2)), y: Number(nextY.toFixed(2)) })
      })
    }

    const handlePointerLeave = () => {
      setLook({ x: 0, y: 0 })
    }

    // Periodic playful "tuing-tuing" bounce + smile every ~5.8s
    const bounceInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        triggerHappyBounce()
      }
    }, 5800)

    // Gentle idle glance when no cursor has moved recently (great on mobile too)
    let glanceStep = 0
    const glancePoints: readonly Offset[] = [
      { x: 0, y: 0 },
      { x: -4.2, y: 0.5 },
      { x: 0, y: -1 },
      { x: 4.2, y: 0.5 },
    ]
    const glanceInterval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastPointerTime < 3500) return
      glanceStep = (glanceStep + 1) % glancePoints.length
      setLook(glancePoints[glanceStep]!)
    }, 2800)

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('mouseleave', handlePointerLeave)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('mouseleave', handlePointerLeave)
      window.clearInterval(bounceInterval)
      window.clearInterval(glanceInterval)
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
      if (bounceTimerRef.current !== null) window.clearTimeout(bounceTimerRef.current)
    }
  }, [])

  const reduced = prefersReducedMotion()
  const showSmilingEyes = reduced || isHappyBounce

  const eyeX = showSmilingEyes ? 0 : look.x
  const eyeY = showSmilingEyes ? 0 : look.y
  const faceX = showSmilingEyes ? 0 : Number((look.x * 0.42).toFixed(2))
  const faceY = showSmilingEyes ? 0 : Number((look.y * 0.35).toFixed(2))
  const awningX = showSmilingEyes ? 0 : Number((look.x * 0.16).toFixed(2))
  const awningY = showSmilingEyes ? 0 : Number((look.y * 0.12).toFixed(2))

  return (
    <button
      ref={containerRef}
      type="button"
      className={`hero-logo-medallion ${isHappyBounce ? 'hero-logo-medallion--tuing' : ''} ${className}`.trim()}
      onClick={triggerHappyBounce}
      onMouseEnter={triggerHappyBounce}
      aria-label="Logo interaktif Zaina Arsyi"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 164"
        className="brand-logo__mark hero-logo-medallion__svg"
        aria-hidden="true"
      >
        {/* Minimalist 3-Scallop Shop Awning */}
        <g
          className="hero-logo__layer hero-logo__awning"
          style={{ transform: `translate(${awningX}px, ${awningY}px)` }}
        >
          <path
            d="M 26 18 H 174 L 188 66 C 188 82 168 88 156 88 C 144 88 132 80 128 72 C 122 82 112 88 100 88 C 88 88 78 82 72 72 C 68 80 56 88 44 88 C 32 88 12 82 12 66 Z"
            fill="#1F5146"
          />
          <path
            d="M 78 18 H 122 L 126 68 C 122 78 112 84 100 84 C 88 84 78 78 74 68 Z"
            fill="#E6F1EE"
          />
          <path
            d="M 26 18 H 174 L 188 66 C 188 82 168 88 156 88 C 144 88 132 80 128 72 C 122 82 112 88 100 88 C 88 88 78 82 72 72 C 68 80 56 88 44 88 C 32 88 12 82 12 66 Z"
            fill="none"
            stroke="#1F5146"
            strokeWidth="6"
            strokeLinejoin="round"
          />
        </g>

        {/* Blush Cheeks & Smile (gentle parallax) */}
        <g
          className="hero-logo__layer hero-logo__face"
          style={{ transform: `translate(${faceX}px, ${faceY}px)` }}
        >
          <ellipse
            cx="48"
            cy="140"
            rx={isHappyBounce ? 13 : 11}
            ry={isHappyBounce ? 7 : 6}
            fill="#E8927C"
            opacity={isHappyBounce ? 0.96 : 0.86}
          />
          <ellipse
            cx="152"
            cy="140"
            rx={isHappyBounce ? 13 : 11}
            ry={isHappyBounce ? 7 : 6}
            fill="#E8927C"
            opacity={isHappyBounce ? 0.96 : 0.86}
          />
          <path
            d={
              isHappyBounce
                ? 'M 84 132 Q 100 152 116 132'
                : 'M 89 135 Q 100 146 111 135'
            }
            fill="none"
            stroke="#1F5146"
            strokeWidth="7.5"
            strokeLinecap="round"
          />
        </g>

        {/* Cursor-Tracking Eyes / Happy Smiling Arcs during Tuing-Tuing */}
        <g
          className="hero-logo__layer hero-logo__eyes"
          style={{ transform: `translate(${eyeX}px, ${eyeY}px)` }}
        >
          {showSmilingEyes ? (
            <>
              <path
                d="M 60 124 Q 70 111 80 124"
                fill="none"
                stroke="#1F5146"
                strokeWidth="7.5"
                strokeLinecap="round"
              />
              <path
                d="M 120 124 Q 130 111 140 124"
                fill="none"
                stroke="#1F5146"
                strokeWidth="7.5"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <circle cx="70" cy="121" r="7.6" fill="#1F5146" />
              <circle cx="72.4" cy="118.6" r="2.3" fill="#FFFDF8" />
              <circle cx="130" cy="121" r="7.6" fill="#1F5146" />
              <circle cx="132.4" cy="118.6" r="2.3" fill="#FFFDF8" />
            </>
          )}
        </g>
      </svg>
    </button>
  )
}
