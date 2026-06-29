---
name: Academic Excellence
colors:
  surface: '#fcf9f3'
  surface-dim: '#dcdad4'
  surface-bright: '#fcf9f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ed'
  surface-container: '#f0eee8'
  surface-container-high: '#ebe8e2'
  surface-container-highest: '#e5e2dc'
  on-surface: '#1c1c18'
  on-surface-variant: '#44474d'
  inverse-surface: '#31312d'
  inverse-on-surface: '#f3f0ea'
  outline: '#74777e'
  outline-variant: '#c4c6ce'
  surface-tint: '#4c5f7f'
  primary: '#00030c'
  on-primary: '#ffffff'
  primary-container: '#071d3a'
  on-primary-container: '#7386a8'
  inverse-primary: '#b4c7ec'
  secondary: '#425e92'
  on-secondary: '#ffffff'
  secondary-container: '#a8c4fe'
  on-secondary-container: '#345083'
  tertiary: '#040200'
  on-tertiary: '#ffffff'
  tertiary-container: '#291a00'
  on-tertiary-container: '#ad7c0e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#b4c7ec'
  on-primary-fixed: '#051b38'
  on-primary-fixed-variant: '#354766'
  secondary-fixed: '#d7e2ff'
  secondary-fixed-dim: '#acc7ff'
  on-secondary-fixed: '#001a40'
  on-secondary-fixed-variant: '#294678'
  tertiary-fixed: '#ffdea9'
  tertiary-fixed-dim: '#f6bd50'
  on-tertiary-fixed: '#271900'
  on-tertiary-fixed-variant: '#5e4100'
  background: '#fcf9f3'
  on-background: '#1c1c18'
  surface-variant: '#e5e2dc'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  tagline:
    fontFamily: Montserrat
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.15em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

This design system is built for Global Diaspora University, establishing a digital presence that feels prestigious, established, and authoritative. The aesthetic bridges traditional collegiate heritage with a modern, global perspective. It utilizes a **Corporate / Modern** framework with high-contrast editorial accents to evoke a sense of trust, legacy, and intellectual rigor.

The user experience focuses on clarity and institutional stability. We employ high-quality whitespace, crisp structural lines, and a classic "Ivy League" color story to ensure the institution feels both globally accessible and academically elite.

## Colors

The palette is rooted in a foundation of Deep and Royal Navies to represent stability and expertise. **University Gold** is used sparingly as a high-value accent to denote prestige and "the standard."

- **Primary Surfaces:** Use `surface-white` for data-heavy views and `surface-ivory` for editorial or section backgrounds to soften the contrast.
- **Action Colors:** Primary buttons and critical links utilize `deep-navy`.
- **Accents:** Gold should be reserved for highlights, icons, and subtle decorative borders to maintain its "precious" quality without overwhelming the user.

## Typography

The typographic hierarchy creates an "Editorial-Academic" feel. 

- **Headlines:** `Playfair Display` provides a traditional serif authority. Large displays should use tighter tracking.
- **Body:** `Inter` is chosen for its exceptional legibility in digital contexts, balancing the classic feel of the headings with modern utility.
- **Taglines/Captions:** `Montserrat` is used for auxiliary information and branding taglines. To achieve the "Empowering" look requested, it should always be set in uppercase with increased letter spacing (tracking).

## Layout & Spacing

This design system utilizes a **Fixed Grid** on desktop (12 columns) and a **Fluid Grid** on mobile (4 columns). 

- **Rhythm:** An 8px linear scale governs all padding and margins. 
- **Margins:** Generous page margins (`margin-desktop`) are essential to convey luxury and focus.
- **Alignment:** All text elements should align to a clear vertical axis. Editorial layouts should use asymmetrical column spans (e.g., a 4-column sidebar with an 8-column content area) to create visual interest.

## Elevation & Depth

To maintain a formal and traditional tone, this design system avoids heavy shadows. Instead, it relies on **Tonal Layers** and **Low-contrast Outlines**.

- **Surfaces:** Depth is created by placing `surface-white` cards onto `surface-ivory` backgrounds.
- **Borders:** Use 1px solid borders in `royal-navy` (at 10-15% opacity) or `soft-gold` to define sections.
- **Shadows:** When necessary for interactivity (like a hovering card), use a single, very soft, "Ambient" shadow: `0px 4px 20px rgba(7, 29, 58, 0.08)`. This uses the primary navy rather than black for a more integrated, high-end feel.

## Shapes

The shape language is structured and formal.
- **Buttons:** Nearly sharp corners (2px) to reflect architectural stability and professional rigor.
- **Cards:** Slightly softened (6px) to provide a modern container for content without appearing "playful."
- **Inputs:** A middle-ground radius (4px) ensures they feel like functional tools.

## Components

### Buttons
- **Primary:** Solid `deep-navy` background, `surface-white` text, 2px radius. Use `tagline` typography (Montserrat, Uppercase).
- **Secondary:** Transparent background, `deep-navy` 1px border, `deep-navy` text.
- **Tertiary/Ghost:** No border, `university-gold` text, bold weight.

### Cards
- **Style:** `surface-white` background, 6px radius, 1px border in `surface-ivory` or extremely light navy. 
- **Header:** Optional `university-gold` top-border (2px) for featured program cards.

### Input Fields
- **Default:** `surface-white` fill, 1px border (`text-muted`), 4px radius. 
- **Focus:** 2px border in `royal-navy`. Label text should use `label-sm` (Inter, Bold).

### Headers
- **Global Navigation:** `deep-navy` background.
- **Logo:** Displayed in `surface-white`.
- **Navigation Links:** `surface-white` text, with a `university-gold` underline effect on hover.

### Chips & Tags
- **Style:** `surface-ivory` background with `deep-navy` text. 0px roundedness for a "stamp" or "seal" appearance.