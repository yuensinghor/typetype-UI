# typetype.fun — Starter Files

## Quick Setup (Next.js + Tailwind)

### 1. Install dependency

```bash
npm install framer-motion
```

### 2. Add fonts to your layout

In `app/layout.tsx` (or your root layout):

```tsx
import { Fredoka, DM_Sans } from 'next/font/google'

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

// Add both variables to <body>:
<body className={`${fredoka.variable} ${dmSans.variable} ...`}>
```

### 3. Add CSS

Copy `typetype-fun.css` contents into your `globals.css`.

### 4. Drop in the component

Copy `TypetypeFunHome.tsx` wherever you need it, then:

```tsx
import TypetypeFunHome from './TypetypeFunHome'

// Use as your page or component:
<TypetypeFunHome />
```

### 5. Connect the Start button

Replace the Start button's `onClick` to navigate to your game screen:

```tsx
// In TypetypeFunHome.tsx, add to the Start button:
onClick={() => router.push('/game')}  // or whatever your game route is
```

## Files

| File | What it does |
|------|-------------|
| `TypetypeFunHome.tsx` | The main screen component (self-contained) |
| `typetype-fun.css` | Color palette, dot pattern, shadows, scrollbar |

## Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Cream bg | `#FFF8F0` | Page background |
| Coral | `#FF6B6B` | Primary, Start button |
| Orange | `#FF8C42` | Accent |
| Yellow | `#FFD166` | Highlight |
| Mint | `#7ECEC1` | Secondary |
| Dark text | `#2D3436` | Body text |
| Muted | `#8B7E74` | Secondary text |
| Border | `#E8DDD3` | Borders, dots |

## Customizing

- **Floating numbers**: Edit the `FLOATING_NUMS` array — change `n`, position (`x`/`y`), size (`s`), rotation, speed
- **Key colors**: Edit the `keyColors` array in `NumberKey`
- **Title colors**: Edit the `COLORS` array
- **Add more number keys**: Add items to the keys row or change which numbers show