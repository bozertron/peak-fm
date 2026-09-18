> **ARCHIVED.** These five documents describe the previous product direction and
> a stack this repository does not use (Prisma, NextAuth, Stripe Connect). They
> are retained as history. Do not implement from them — see `../README.md`.

# Peak Rentals: Aesthetic System

## Design Philosophy

**"Sophisticated Ski Chalet"** — The warmth of a well-appointed mountain lodge with the precision of thoughtful design. Not rustic-kitsch, not sterile-corporate. The feeling of a vacation home owned by someone with excellent taste.

### Core Principles

1. **Warmth over coldness** — Wood tones, cream backgrounds, soft shadows
2. **Framed objects** — Items and people appear "curated," like art on a wall
3. **Generous breathing room** — Luxury is space, not density
4. **Natural materials vocabulary** — Wood, wool, brass, stone, glass
5. **Confident restraint** — One accent color at a time, never busy

---

## Color Palette

### Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        peak: {
          // === PRIMARY ===
          cream: "#FAF7F2",        // Primary background - warm off-white
          charcoal: "#2C3E50",     // Primary text - blue-black, not pure black
          
          // === WOOD TONES ===
          wood: {
            light: "#D4A574",      // Light oak / ash
            DEFAULT: "#8B6914",    // Medium walnut
            dark: "#5D4037",       // Dark mahogany
          },
          
          // === ACCENT COLORS ===
          forest: "#2D5A47",       // Deep forest green - primary action
          burgundy: "#722F37",     // Wine red - secondary action
          navy: "#1E3A5F",         // Deep navy - tertiary
          
          // === METAL ACCENTS ===
          brass: "#B8860B",        // Brass/gold accents
          copper: "#B87333",       // Copper touches
          
          // === SUPPORTING ===
          snow: "#FFFFFF",         // Pure white for cards
          slate: "#64748B",        // Muted text
          stone: "#E7E5E4",        // Borders, dividers
        }
      },
      fontFamily: {
        // Serif for headings - elegant, lodge-like
        serif: ['"Libre Baskerville"', '"Playfair Display"', 'Georgia', 'serif'],
        // Sans for body - clean, readable
        sans: ['"Inter"', '"Source Sans Pro"', 'system-ui', 'sans-serif'],
        // Mono for specs/data - technical but warm
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        'peak': '0 2px 8px -2px rgba(44, 62, 80, 0.08), 0 4px 16px -4px rgba(44, 62, 80, 0.12)',
        'peak-lg': '0 4px 16px -4px rgba(44, 62, 80, 0.12), 0 8px 32px -8px rgba(44, 62, 80, 0.16)',
        'peak-frame': '0 0 0 1px rgba(139, 105, 20, 0.1), 0 2px 8px -2px rgba(44, 62, 80, 0.1)',
      },
      borderRadius: {
        'peak': '0.625rem', // 10px - slightly softer than default
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      }
    }
  },
  plugins: [],
}
```

### CSS Custom Properties

```css
/* app/globals.css - Add these at the top */

@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  /* Colors */
  --peak-cream: #FAF7F2;
  --peak-charcoal: #2C3E50;
  --peak-wood: #8B6914;
  --peak-wood-light: #D4A574;
  --peak-wood-dark: #5D4037;
  --peak-forest: #2D5A47;
  --peak-burgundy: #722F37;
  --peak-navy: #1E3A5F;
  --peak-brass: #B8860B;
  --peak-copper: #B87333;
  --peak-snow: #FFFFFF;
  --peak-slate: #64748B;
  --peak-stone: #E7E5E4;

  /* Typography */
  --font-serif: 'Libre Baskerville', Georgia, serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
  --space-3xl: 4rem;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
  --transition-slow: 400ms ease;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(44, 62, 80, 0.05);
  --shadow-base: 0 2px 8px -2px rgba(44, 62, 80, 0.08), 0 4px 16px -4px rgba(44, 62, 80, 0.12);
  --shadow-lg: 0 4px 16px -4px rgba(44, 62, 80, 0.12), 0 8px 32px -8px rgba(44, 62, 80, 0.16);
  --shadow-frame: 0 0 0 1px rgba(139, 105, 20, 0.1), 0 2px 8px -2px rgba(44, 62, 80, 0.1);
}

/* Base styles */
html {
  background-color: var(--peak-cream);
  color: var(--peak-charcoal);
  font-family: var(--font-sans);
}

body {
  min-height: 100vh;
  line-height: 1.6;
}

/* Typography utilities */
.heading-1 {
  font-family: var(--font-serif);
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.heading-2 {
  font-family: var(--font-serif);
  font-size: 1.875rem;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.heading-3 {
  font-family: var(--font-serif);
  font-size: 1.5rem;
  font-weight: 400;
  line-height: 1.4;
}

.body-large {
  font-size: 1.125rem;
  line-height: 1.7;
}

.body-small {
  font-size: 0.875rem;
  line-height: 1.6;
}

.caption {
  font-size: 0.75rem;
  line-height: 1.5;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--peak-slate);
}

/* The "Frame" - Used for items, cards, photos */
.peak-frame {
  background: var(--peak-snow);
  border-radius: 0.625rem;
  box-shadow: var(--shadow-frame);
  border: 1px solid rgba(139, 105, 20, 0.08);
  overflow: hidden;
  transition: box-shadow var(--transition-base), transform var(--transition-base);
}

.peak-frame:hover {
  box-shadow: var(--shadow-base);
  transform: translateY(-2px);
}

/* Wood accent bar - subtle warmth indicator */
.peak-wood-accent {
  height: 3px;
  background: linear-gradient(
    90deg,
    var(--peak-wood-light) 0%,
    var(--peak-wood) 50%,
    var(--peak-wood-dark) 100%
  );
  border-radius: 2px;
}
```

---

## Component Patterns

### 1. The Peak Card (Item/Equipment)

```tsx
// components/ui/PeakCard.tsx

interface PeakCardProps {
  image?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  price?: number;
  onClick?: () => void;
  children?: React.ReactNode;
}

export function PeakCard({ 
  image, 
  title, 
  subtitle, 
  meta, 
  price, 
  onClick,
  children 
}: PeakCardProps) {
  return (
    <div 
      className="peak-frame cursor-pointer group"
      onClick={onClick}
    >
      {/* Image with frame */}
      {image && (
        <div className="aspect-[4/3] relative overflow-hidden">
          <img 
            src={image} 
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 
                       group-hover:scale-105"
          />
          {/* Subtle vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-peak-charcoal/20 to-transparent" />
        </div>
      )}
      
      {/* Content */}
      <div className="p-4 space-y-2">
        {/* Wood accent */}
        <div className="peak-wood-accent w-12 mb-3" />
        
        <h3 className="font-serif text-lg text-peak-charcoal leading-tight">
          {title}
        </h3>
        
        {subtitle && (
          <p className="text-sm text-peak-slate line-clamp-2">
            {subtitle}
          </p>
        )}
        
        <div className="flex items-center justify-between pt-2">
          {meta && (
            <span className="caption">{meta}</span>
          )}
          {price !== undefined && (
            <span className="font-semibold text-peak-forest">
              ${(price / 100).toFixed(0)}
              <span className="text-peak-slate font-normal text-sm">/day</span>
            </span>
          )}
        </div>
        
        {children}
      </div>
    </div>
  );
}
```

### 2. The Contact Card (Person/Trading Card)

```tsx
// components/ui/ContactCard.tsx

interface ContactCardProps {
  name: string;
  avatar?: string;
  flavor?: string;
  memberSince?: string;
  foundingMember?: boolean;
  itemCount?: number;
  degree?: number; // 1 = direct, 2 = extended
  introducedBy?: string;
  onClick?: () => void;
}

export function ContactCard({
  name,
  avatar,
  flavor,
  memberSince,
  foundingMember,
  itemCount,
  degree,
  introducedBy,
  onClick
}: ContactCardProps) {
  return (
    <div 
      className="peak-frame p-4 cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        {/* Avatar with frame */}
        <div className="relative">
          <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-peak-wood-light/30
                          shadow-sm">
            {avatar ? (
              <img src={avatar} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-peak-forest/10 flex items-center justify-center">
                <span className="text-2xl font-serif text-peak-forest">
                  {name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          
          {/* Founding member badge */}
          {foundingMember && (
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-peak-brass 
                            flex items-center justify-center shadow-sm"
                 title="Founding Member">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
          )}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-serif text-peak-charcoal truncate">{name}</h4>
          
          {flavor && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs 
                             bg-peak-forest/10 text-peak-forest">
              {flavor}
            </span>
          )}
          
          <div className="mt-2 flex items-center gap-3 text-xs text-peak-slate">
            {itemCount !== undefined && (
              <span>{itemCount} items</span>
            )}
            {memberSince && (
              <span>Since {new Date(memberSince).getFullYear()}</span>
            )}
          </div>
          
          {/* Trust chain indicator */}
          {degree && degree > 1 && introducedBy && (
            <p className="mt-2 text-xs text-peak-slate/70">
              via {introducedBy}
            </p>
          )}
        </div>
        
        {/* Connection degree indicator */}
        {degree && (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
                          ${degree === 1 
                            ? 'bg-peak-forest text-white' 
                            : 'bg-peak-stone text-peak-slate'}`}>
            {degree}°
          </div>
        )}
      </div>
    </div>
  );
}
```

### 3. The Peak Button

```tsx
// components/ui/PeakButton.tsx

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface PeakButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}

export const PeakButton = forwardRef<HTMLButtonElement, PeakButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    const baseStyles = `
      inline-flex items-center justify-center gap-2 rounded-peak font-medium
      transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed
    `;
    
    const variants = {
      primary: `
        bg-peak-forest text-white 
        hover:bg-peak-forest/90 
        focus:ring-peak-forest/50
      `,
      secondary: `
        bg-peak-burgundy text-white 
        hover:bg-peak-burgundy/90 
        focus:ring-peak-burgundy/50
      `,
      ghost: `
        bg-transparent text-peak-charcoal 
        hover:bg-peak-stone/50 
        focus:ring-peak-charcoal/20
      `,
      outline: `
        bg-transparent text-peak-charcoal border border-peak-wood/30
        hover:bg-peak-wood/5 hover:border-peak-wood/50
        focus:ring-peak-wood/30
      `,
    };
    
    const sizes = {
      sm: "text-sm px-3 py-1.5",
      md: "text-sm px-4 py-2.5",
      lg: "text-base px-6 py-3",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

PeakButton.displayName = "PeakButton";
```

### 4. The Peak Input

```tsx
// components/ui/PeakInput.tsx

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface PeakInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const PeakInput = forwardRef<HTMLInputElement, PeakInputProps>(
  ({ className, label, error, icon, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-peak-charcoal">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-peak-slate">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              `w-full rounded-peak border border-peak-stone bg-white px-4 py-2.5
               text-peak-charcoal placeholder:text-peak-slate/60
               focus:outline-none focus:ring-2 focus:ring-peak-forest/30 focus:border-peak-forest/50
               transition-all duration-200`,
              icon && "pl-10",
              error && "border-peak-burgundy focus:ring-peak-burgundy/30 focus:border-peak-burgundy",
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-sm text-peak-burgundy">{error}</p>
        )}
      </div>
    );
  }
);

PeakInput.displayName = "PeakInput";
```

---

## Map Pin Design

### Equipment Pin

```tsx
// components/map/EquipmentPin.tsx

interface EquipmentPinProps {
  category: string;
  selected?: boolean;
  onClick?: () => void;
}

const categoryIcons: Record<string, string> = {
  "Telehandler": "🏗️",
  "Boom Lift": "⬆️",
  "Skid Steer": "🚜",
  "Vehicle": "🚗",
  "Tools": "🔧",
  "Recreation": "🎿",
  "default": "📦"
};

export function EquipmentPin({ category, selected, onClick }: EquipmentPinProps) {
  const icon = categoryIcons[category] || categoryIcons.default;
  
  return (
    <button
      onClick={onClick}
      className={`
        relative w-10 h-10 rounded-full 
        flex items-center justify-center text-lg
        transition-all duration-200
        ${selected 
          ? 'bg-peak-forest text-white scale-125 shadow-lg z-10' 
          : 'bg-peak-snow text-peak-charcoal shadow-peak hover:scale-110'}
        border-2 ${selected ? 'border-peak-forest' : 'border-peak-wood-light/50'}
      `}
    >
      <span>{icon}</span>
      
      {/* Drop shadow / pin tail */}
      <div className={`
        absolute -bottom-1 left-1/2 -translate-x-1/2 
        w-2 h-2 rotate-45
        ${selected ? 'bg-peak-forest' : 'bg-peak-snow border-r border-b border-peak-wood-light/50'}
      `} />
    </button>
  );
}
```

---

## Page Layouts

### Main App Shell

```tsx
// components/layout/AppShell.tsx

import { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
  sidebar?: ReactNode;
}

export function AppShell({ children, sidebar }: AppShellProps) {
  return (
    <div className="min-h-screen bg-peak-cream">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-peak-snow/80 backdrop-blur-sm border-b border-peak-stone">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-peak-forest flex items-center justify-center">
              <span className="text-white text-lg">⛰</span>
            </div>
            <span className="font-serif text-xl text-peak-charcoal">
              Peak
            </span>
          </div>
          
          {/* Nav would go here */}
        </div>
      </header>
      
      <div className="flex">
        {/* Optional sidebar */}
        {sidebar && (
          <aside className="w-72 border-r border-peak-stone bg-peak-snow min-h-[calc(100vh-4rem)]">
            {sidebar}
          </aside>
        )}
        
        {/* Main content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
```

---

## Animation Guidelines

```css
/* Subtle, premium animations */

/* Card entrance */
@keyframes peak-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.peak-animate-in {
  animation: peak-fade-in 0.4s ease-out forwards;
}

/* Stagger children */
.peak-stagger > * {
  opacity: 0;
  animation: peak-fade-in 0.4s ease-out forwards;
}

.peak-stagger > *:nth-child(1) { animation-delay: 0.05s; }
.peak-stagger > *:nth-child(2) { animation-delay: 0.1s; }
.peak-stagger > *:nth-child(3) { animation-delay: 0.15s; }
.peak-stagger > *:nth-child(4) { animation-delay: 0.2s; }
.peak-stagger > *:nth-child(5) { animation-delay: 0.25s; }
.peak-stagger > *:nth-child(6) { animation-delay: 0.3s; }

/* Hover lift */
.peak-hover-lift {
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.peak-hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

/* Pulse for notifications */
@keyframes peak-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.peak-pulse {
  animation: peak-pulse 2s ease-in-out infinite;
}
```

---

## Image Treatment

All images should feel "framed" and curated:

```css
/* Image frame treatment */
.peak-image-frame {
  position: relative;
  overflow: hidden;
  border-radius: 0.5rem;
}

.peak-image-frame::before {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid rgba(139, 105, 20, 0.1);
  border-radius: inherit;
  pointer-events: none;
  z-index: 1;
}

.peak-image-frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Polaroid style for gallery */
.peak-polaroid {
  background: var(--peak-snow);
  padding: 0.5rem 0.5rem 1.5rem;
  box-shadow: var(--shadow-frame);
  transform: rotate(var(--rotation, 0deg));
}

.peak-polaroid:nth-child(odd) { --rotation: -2deg; }
.peak-polaroid:nth-child(even) { --rotation: 2deg; }
```

---

## DO NOT

1. **No pure black** — Use `peak-charcoal` (#2C3E50) instead
2. **No harsh borders** — Use subtle shadows and wood-tinted borders
3. **No neon colors** — Stay within the palette
4. **No rounded-full** on cards — Use `rounded-peak` (10px) for subtle softness
5. **No dense layouts** — Generous padding, breathing room
6. **No system fonts alone** — Always load the custom font stack
7. **No hover effects that jump** — Smooth, subtle transitions only
8. **No pure white backgrounds** — Use `peak-cream` for pages, `peak-snow` for cards

---

## Quick Reference: Class Names

| Purpose | Class |
|---------|-------|
| Page background | `bg-peak-cream` |
| Card background | `bg-peak-snow` |
| Primary text | `text-peak-charcoal` |
| Secondary text | `text-peak-slate` |
| Primary action | `bg-peak-forest text-white` |
| Secondary action | `bg-peak-burgundy text-white` |
| Accent/highlight | `text-peak-brass` or `border-peak-wood` |
| Heading font | `font-serif` |
| Body font | `font-sans` |
| Card frame | `peak-frame` |
| Standard radius | `rounded-peak` |
| Standard shadow | `shadow-peak` |
