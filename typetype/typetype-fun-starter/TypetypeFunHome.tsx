'use client'

import { motion } from 'framer-motion'

const TITLE_CHARS = 'typetype.fun'.split('')
const COLORS = ['#FF6B6B', '#FF8C42', '#FFD166', '#7ECEC1']

const FLOATING_NUMS = [
  { n: '4', x: '5%', y: '10%', s: 0.7, rot: -12, delay: 0, dur: 5 },
  { n: '7', x: '82%', y: '14%', s: 0.6, rot: 8, delay: 1.3, dur: 6 },
  { n: '9', x: '8%', y: '74%', s: 0.65, rot: 6, delay: 0.7, dur: 5.5 },
  { n: '5', x: '84%', y: '70%', s: 0.75, rot: -9, delay: 2.0, dur: 6.5 },
  { n: '0', x: '3%', y: '42%', s: 0.55, rot: 4, delay: 2.5, dur: 5.8 },
  { n: '8', x: '90%', y: '44%', s: 0.6, rot: -5, delay: 0.4, dur: 5.2 },
  { n: '6', x: '75%', y: '88%', s: 0.5, rot: -7, delay: 3.0, dur: 5.4 },
  { n: '2', x: '18%', y: '90%', s: 0.45, rot: -4, delay: 2.2, dur: 5.6 },
]

function FloatingKey({ n, x, y, s, rot, delay, dur }: {
  n: string; x: string; y: string; s: number; rot: number; delay: number; dur: number
}) {
  return (
    <motion.div
      className="absolute pointer-events-none select-none"
      style={{ left: x, top: y }}
      animate={{
        x: [0, 5, -3, 0],
        y: [0, -6, 2, 0],
        rotate: [rot, rot + 2, rot - 1.5, rot],
      }}
      transition={{
        duration: dur,
        repeat: Infinity,
        delay,
        ease: 'easeInOut',
      }}
    >
      <div
        className="rounded-lg flex items-center justify-center font-bold text-white"
        style={{
          width: 36 * s,
          height: 36 * s,
          fontSize: 18 * s,
          fontFamily: 'var(--font-fredoka), sans-serif',
          background: 'linear-gradient(135deg, #FFD1D1, #FFE4C9, #FFF5C9, #D4F5E0, #D1E8FF)',
          border: '1.5px solid rgba(255,255,255,0.5)',
          opacity: 0.35,
        }}
      >
        {n}
      </div>
    </motion.div>
  )
}

function NumberKey({ number, index }: { number: string; index: number }) {
  const keyColors = [
    ['#FFB3BA', '#FF8A95'],  // 1 - pink
    ['#FFDFBA', '#FFBE7D'],  // 2 - orange
    ['#BAFFC9', '#7ECEC1'],  // 3 - mint
  ]
  const [bg, border] = keyColors[index]

  return (
    <motion.button
      className="relative cursor-pointer select-none focus:outline-none"
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 220,
        damping: 15,
        delay: 0.5 + index * 0.1,
      }}
      whileTap={{ scale: 0.88 }}
    >
      <div
        className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${bg}, ${border})`,
          border: '2.5px solid rgba(255,255,255,0.6)',
          boxShadow: `0 4px 16px ${border}33, 0 1px 4px rgba(139,126,116,0.06)`,
        }}
      >
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.5) 0%, transparent 55%)',
          }}
        />
        <span
          className="relative text-2xl font-bold text-white"
          style={{
            fontFamily: 'var(--font-fredoka), sans-serif',
            textShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          {number}
        </span>
      </div>
    </motion.button>
  )
}

export default function TypetypeFunHome() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center relative overflow-hidden pattern-dots">
      {/* ── Floating background numbers ── */}
      {FLOATING_NUMS.map((k, i) => (
        <FloatingKey key={i} {...k} />
      ))}

      {/* ── Main content ── */}
      <div className="relative z-10 text-center px-6">
        {/* ── Title ── */}
        <h1
          className="text-4xl font-bold tracking-tight mb-10"
          style={{ fontFamily: 'var(--font-fredoka), sans-serif' }}
        >
          {TITLE_CHARS.map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              style={{ color: COLORS[i % COLORS.length] }}
              initial={{ y: -24, opacity: 0, rotate: -10 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{
                type: 'spring',
                stiffness: 180,
                damping: 12,
                delay: 0.06 * i,
              }}
            >
              {char}
            </motion.span>
          ))}
        </h1>

        {/* ── Three number keys ── */}
        <div className="flex items-center justify-center gap-3 mb-7">
          <NumberKey number="1" index={0} />
          <NumberKey number="2" index={1} />
          <NumberKey number="3" index={2} />
        </div>

        {/* ── Start button ── */}
        <motion.button
          className="relative cursor-pointer select-none focus:outline-none"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.4 }}
          whileTap={{ scale: 0.95 }}
        >
          <div
            className="px-8 py-3 rounded-xl text-base font-bold text-white"
            style={{
              fontFamily: 'var(--font-fredoka), sans-serif',
              background: 'linear-gradient(135deg, #FF8A95 0%, #FF6B6B 100%)',
              boxShadow: '0 3px 14px rgba(255, 107, 107, 0.3)',
              border: '2px solid rgba(255,255,255,0.4)',
            }}
          >
            Start
          </div>
        </motion.button>
      </div>
    </div>
  )
}