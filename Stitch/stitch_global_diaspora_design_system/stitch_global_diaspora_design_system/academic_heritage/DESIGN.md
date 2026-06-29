---
name: Academic Heritage
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
  secondary: '#7d5800'
  on-secondary: '#ffffff'
  secondary-container: '#fdc355'
  on-secondary-container: '#725000'
  tertiary: '#00030d'
  on-tertiary: '#ffffff'
  tertiary-container: '#001c43'
  on-tertiary-container: '#6a85bb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#b4c7ec'
  on-primary-fixed: '#051b38'
  on-primary-fixed-variant: '#354766'
  secondary-fixed: '#ffdea9'
  secondary-fixed-dim: '#f6bd50'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5e4100'
  tertiary-fixed: '#d7e2ff'
  tertiary-fixed-dim: '#acc7ff'
  on-tertiary-fixed: '#001a40'
  on-tertiary-fixed-variant: '#294678'
  background: '#fcf9f3'
  on-background: '#1c1c18'
  surface-variant: '#e5e2dc'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-sm:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  tagline:
    fontFamily: Montserrat
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.15em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
---

## Brand & Style
The design system for Global Diaspora University (GDU) is rooted in **Academic Traditionalism**. It evokes the gravitas of a centuries-old institution combined with a clear Christian mission. The visual language is authoritative, formal, and sophisticated, designed to instill trust and prestige in students, faculty, and global partners.

The aesthetic follows a **Corporate/Modern** framework with a classical editorial influence. It prioritizes symmetry, structured information hierarchy, and a restrained use of ornamentation. High-quality whitespace and strong vertical alignment communicate stability, while the interplay of navy and gold accents reinforces a sense of heritage and divine purpose.

## Colors
The palette is dominated by the **Deep Navy (#071D3A)**, representing wisdom and depth. **University Gold (#B8861B)** is used as a primary accent for high-importance elements, symbolizing excellence and the university's Christian core.

- **Primary (Deep Navy):** Use for headlines, primary buttons, and navigational backgrounds.
- **Secondary (University Gold):** Use for key call-to-actions, borders of distinction, and iconography.
- **Neutral (Ivory):** Use as a subtle section background to soften the starkness of pure white and provide a "parchment" feel for academic content.
- **Surface White:** The primary background for readability and modern clarity.

## Typography
The typography strategy creates a bridge between tradition and modern utility. 

- **Headlines:** **Playfair Display** provides an editorial, sophisticated look. Use for main titles and section headers. Use tight letter-spacing for large displays.
- **Body:** **Inter** ensures high legibility for long-form academic papers, course descriptions, and administrative data. It maintains a clean, modern balance against the serif headings.
- **Taglines & Utility:** **Montserrat** is utilized exclusively for taglines and small uppercase labels to provide a rhythmic contrast. Always apply a generous letter-spacing (15%) to Montserrat to maintain its formal, authoritative presence.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy on desktop to maintain the structured feel of a printed academic journal.

- **Grid:** A 12-column grid with 24px gutters. Content is centered within a 1280px max-width container.
- **Vertical Rhythm:** Based on an 8px base unit. Section spacing should be generous (80px to 120px) to allow the content to "breathe" and convey prestige.
- **Mobile:** Transition to a 4-column fluid grid with 20px side margins. Typography scales down specifically for the Display-LG level to prevent awkward wrapping.

## Elevation & Depth
Depth is communicated through **Tonal Layers** and **Low-Contrast Outlines** rather than aggressive shadows.

- **Surfaces:** Use Ivory (#F8F5EF) containers on White (#FFFFFF) backgrounds to create subtle hierarchy.
- **Outlines:** Key cards and input fields use a 1px border in a muted navy (10% opacity) or Soft Gold.
- **Shadows:** When necessary (e.g., modals), use a very soft, diffused shadow: `0 4px 20px rgba(7, 29, 58, 0.08)`. The shadow should be tinted with the Deep Navy primary color to maintain a cohesive atmospheric tone.

## Shapes
The shape language is strictly **Structured and Sharp**. 

- **Buttons:** Use a 2px radius to maintain a professional, almost-rectilinear appearance.
- **Cards & Containers:** Use a 6px radius. This is soft enough to feel modern but sharp enough to appear disciplined and formal.
- **Icons:** Use sharp corners or very minimal rounding (stroke-join: miter) to align with the Cinzel/Playfair serif influence.

## Components
- **Buttons:** Primary buttons are solid Deep Navy with White text, using the 2px radius. Secondary buttons use a University Gold outline with Deep Navy text.
- **Cards:** Cards should have a 1px border in University Gold for high-prestige content (e.g., Featured Programs) and a 1px soft grey border for standard content.
- **Input Fields:** Use Ivory backgrounds with a 1px Deep Navy bottom border to mimic traditional formal documents.
- **Chips/Labels:** Use Montserrat (tagline style) inside small rectangular boxes with a University Gold background and Deep Navy text.
- **Lists:** Use custom gold-leaf or cross iconography for bullet points in religious or high-importance sections.
- **Specialty Components:** 
    - *The Seal:* Always placed with significant clear space, often used as a subtle watermark or centered at the top of formal landing pages.
    - *Scripture Callouts:* Playfair Display Italic text, centered, with gold horizontal dividers above and below.