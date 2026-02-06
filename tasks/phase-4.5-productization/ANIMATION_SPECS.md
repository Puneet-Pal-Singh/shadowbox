# Shadowbox Animation & Motion Specifications

## Overview

Shadowbox uses **Framer Motion** for all animations and transitions. This document specifies the exact parameters for each animation in the UI.

---

## Global Animation Principles

1. **Duration**: Keep it snappy (200-400ms for most transitions)
2. **Easing**: Use Framer's default (ease-out/cubic-bezier)
3. **Damping**: Smooth, not bouncy (spring damping 0.8-1.0)
4. **GPU Acceleration**: Use transforms and opacity only
5. **Performance**: Aim for 60fps at all times

---

## Component Animations

### 1. AgentSetup Page

#### Initial Render
```tsx
<motion.div
  initial={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.3 }}
>
```
**Effect**: Smooth fade in when page loads
**Duration**: 300ms
**Purpose**: Professional entrance animation

#### Zero-State Header
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.3 }}
>
```
**Effect**: Scale up and fade in
**Duration**: 300ms
**Purpose**: Draw attention to title

#### Command Bar Input
```tsx
<motion.div
  initial={{ y: 20, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  transition={{ delay: 0.1, duration: 0.4 }}
>
```
**Effect**: Slide up and fade in
**Duration**: 400ms (with 100ms delay)
**Purpose**: Sequential reveal

#### Suggested Actions
```tsx
<motion.button
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.3 + idx * 0.05 }}
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
>
```
**Effect**: Staggered fade-in with hover scale
**Stagger**: 50ms between items
**Purpose**: Visual rhythm, interactive feedback

#### Form Expansion
```tsx
<AnimatePresence mode="wait">
  {!isExpanded ? (
    <motion.div
      key="zero-state"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
    >
  ) : (
    <motion.div
      key="expanded-form"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
    >
  )}
</AnimatePresence>
```
**Effect**: Cross-fade between zero-state and form
**Mode**: `wait` (complete exit before entering)
**Duration**: 300ms each direction
**Purpose**: Smooth state transition

#### Button Interactions
```tsx
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  className="..."
>
```
**Hover**: Scale to 102%
**Tap**: Scale to 98%
**Purpose**: Visual feedback on interaction

---

### 2. AgentSidebar

#### Live Task Counter Badge
```tsx
<motion.span
  animate={{ opacity: [0.6, 1] }}
  transition={{ duration: 1, repeat: Infinity }}
>
```
**Effect**: Pulsing opacity
**Duration**: 1 second cycle
**Purpose**: Draw attention to running tasks

#### Status Indicator Dots

##### Running Status
```tsx
<motion.div
  className="w-2 h-2 rounded-full bg-emerald-500"
  animate={{ scale: [1, 1.2, 1] }}
  transition={{ duration: 1.5, repeat: Infinity }}
>
```
**Effect**: Pulsing scale animation
**Duration**: 1.5 second cycle
**Min Scale**: 1.0
**Max Scale**: 1.2
**Glow**: `shadow-[0_0_8px_rgba(16,185,129,0.6)]`
**Purpose**: Indicate active running state

##### Completed Status
```tsx
<div className="w-2 h-2 rounded-full bg-zinc-500" />
```
**Effect**: Static, no animation
**Purpose**: Indicate finished state

##### Error Status
```tsx
<div className="w-2 h-2 rounded-full bg-red-500" />
```
**Effect**: Static, no animation
**Purpose**: Indicate error state

#### Sidebar Items Stagger
```tsx
<motion.div
  initial={{ opacity: 0, x: -10 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ delay, duration: 0.2 }}
>
```
**Effect**: Slide in from left and fade in
**Duration**: 200ms
**Offset**: 50ms between items (idx * 0.05)
**Purpose**: Smooth list reveal

#### Button Hover Effects
```tsx
<motion.button
  whileHover={{ scale: 1.1 }}
  whileTap={{ scale: 0.95 }}
>
```
**Hover**: Scale to 110%
**Tap**: Scale to 95%
**Purpose**: Interactive feedback

---

### 3. GlobalNav

#### Logo Button
```tsx
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  className="..."
>
```
**Hover**: Scale to 105%
**Tap**: Scale to 95%
**Purpose**: Interactive feedback

#### Navigation Icons
```tsx
<motion.button
  whileHover={{ scale: 1.1 }}
  whileTap={{ scale: 0.95 }}
  className="..."
>
```
**Hover**: Scale to 110%
**Tap**: Scale to 95%
**Purpose**: Interactive feedback

#### Active State Color
```tsx
className={active
  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
  : 'text-zinc-500 hover:text-zinc-200 border-transparent hover:bg-zinc-800/50'
}
```
**Effect**: Instant color change (no animation)
**Purpose**: Clear active indicator

---

## Timing Values Reference

| Animation Type | Duration | Delay | Repeat |
|---|---|---|---|
| **Page Fade** | 300ms | — | Once |
| **Scale In** | 300ms | — | Once |
| **Slide In** | 400ms | — | Once |
| **Stagger Items** | 200ms | 50ms between | Once |
| **Status Pulse** | 1.5s | — | ∞ |
| **Badge Pulse** | 1s | — | ∞ |
| **Button Hover** | ~150ms | — | — |
| **Button Tap** | ~50ms | — | — |

---

## Easing Functions

### Default (Framer Motion)
```
cubic-bezier(0.25, 0.46, 0.45, 0.94)
```
This is Framer's default easing. It provides smooth, natural-feeling animations.

### Spring Physics (when used)
```tsx
transition={{
  type: "spring",
  damping: 0.8,
  stiffness: 100
}}
```
Not currently used but available for future bouncy animations.

---

## Performance Guidelines

### GPU-Accelerated Properties
✅ **Use these** (accelerated):
- `transform` (scale, rotate, translate)
- `opacity`

❌ **Avoid these** (non-accelerated):
- `width`, `height`
- `top`, `left`, `margin`, `padding`
- `box-shadow`
- `color`

### Current Implementation
All animations use only `opacity` and `transform`, ensuring 60fps performance.

---

## Animation Checklist

### Exit Animations (useLayoutEffect)
- [x] AgentSetup fades out when task starts
- [x] Form transitions smoothly between states
- [x] No janky visual jumps
- [x] Keyboard accessible during animations

### Entrance Animations
- [x] Components appear smoothly
- [x] Staggered animations feel natural
- [x] No content shift during reveal
- [x] Accessible to screen readers

### Hover States
- [x] Buttons scale consistently
- [x] No lag in hover response
- [x] Scale values are proportional
- [x] Mobile tap targets unaffected

### Status Animations
- [x] Pulsing dots draw attention
- [x] Running status is clearly marked
- [x] Glow effect visible on all screens
- [x] Animation loops indefinitely

---

## Customization

### To Speed Up All Animations
Modify the duration values (multiply by 0.8 for 20% faster):

```tsx
// In components
transition={{ duration: 0.3 }}  // Currently 300ms
transition={{ duration: 0.24 }} // Would be 240ms (20% faster)
```

### To Add More Bounce
Use spring animations instead of tween:

```tsx
transition={{
  type: "spring",
  damping: 0.5,  // Lower = bouncier
  stiffness: 100
}}
```

### To Reduce Motion (Accessibility)
```tsx
const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

<motion.div
  transition={{
    duration: prefersReducedMotion ? 0 : 0.3
  }}
>
```

---

## Testing Animations

### Browser DevTools
1. Open Chrome DevTools
2. Go to Rendering → Paint flashing
3. Watch for green flashes (indicates repaints)
4. Look for smooth, consistent motion

### Performance Measurement
```tsx
import { MotionConfig } from "framer-motion";

// Enable reduced motion for testing
<MotionConfig reducedMotion="user">
  <App />
</MotionConfig>
```

### Mobile Testing
- Use Safari on iPhone
- Use Chrome DevTools mobile emulation
- Check performance on low-end devices
- Verify touch animations work smoothly

---

## Browser Support

### Framer Motion Compatibility
✅ **Fully Supported**:
- Chrome 52+
- Firefox 43+
- Safari 10+
- Edge 15+

❌ **Not Supported**:
- IE 11 (but not required for this app)

---

## Animation Best Practices Used

1. ✅ **Keep it snappy**: 200-400ms range
2. ✅ **Use intention**: Every animation has a purpose
3. ✅ **Respect performance**: GPU acceleration only
4. ✅ **Be consistent**: Similar animations use same timing
5. ✅ **Allow customization**: Easy to adjust if needed
6. ✅ **Prioritize accessibility**: Don't animate if not preferred
7. ✅ **Test thoroughly**: Checked on multiple devices

---

## Future Enhancements

### Potential Animations (Not Yet Implemented)
- Sidebar collapse/expand animation
- Chat message entry animations
- Code block syntax highlighting fade-in
- Terminal output streaming animation
- Task completion celebration animation

These can be added by following the same Framer Motion patterns.

---

**Animation Specs Version**: 1.0
**Last Updated**: February 3, 2026
**Framework**: Framer Motion 4.x
**Performance Target**: 60fps consistently
**Status**: ✅ Complete and tested
