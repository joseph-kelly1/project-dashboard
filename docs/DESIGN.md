# Design reference

Project Ledger uses a calm, practical dashboard interface. This reference covers the tokens and component patterns used by the app. The implemented styles live in [`src/app/globals.css`](../src/app/globals.css).

## Principles

- Put the current task first and let interface chrome recede.
- Make financial values and relationship state easy to understand and verify.
- Use familiar controls and progressive disclosure for less frequent actions.
- Keep empty states inviting and labels in sentence case.
- Add personality through useful details rather than dashboard decoration.
- Support keyboard navigation, visible focus states, and reduced motion.
- Communicate status with text as well as color. Reordering must have a keyboard-accessible path.

## Colors

Tokens are CSS custom properties. Reuse these values rather than introducing a separate theme system.

| Token | Value |
| --- | --- |
| `--green` | `#00ed64` |
| `--green-dark` | `#00684a` |
| `--green-mid` | `#00a35c` |
| `--green-soft` | `#c3f0d2` |
| `--mint` | `#e3fcef` |
| `--teal-deep` | `#001e2b` |
| `--ink` | `#001e2b` |
| `--charcoal` | `#1c2d38` |
| `--slate` | `#3d4f5b` |
| `--steel` | `#5c6c7a` |
| `--stone` | `#7c8c9a` |
| `--muted` | `#a8b3bc` |
| `--canvas` | `#ffffff` |
| `--surface` | `#f9fbfa` |
| `--surface-soft` | `#f4f7f6` |
| `--hairline` | `#e1e5e8` |
| `--hairline-soft` | `#eceff1` |
| `--hairline-strong` | `#c1ccd6` |
| `--warning-bg` | `#fff8e0` |
| `--warning-text` | `#946f3f` |

Use bright green for primary actions, dark green for links and positive values, and warning colors for overdue reminders and negative values. White cards sit on the light surface background. Borders supply separation without heavy shadows.

## Typography

The application uses **Plus Jakarta Sans**, loaded through `next/font` in [`src/app/layout.tsx`](../src/app/layout.tsx).

| Role | Size | Weight | Line height |
| --- | --- | --- | --- |
| Page heading | 28px | 500 | 1.3 |
| Section heading | 22px | 500 | 1.35 |
| Subheading | 18px | 600 | 1.4 |
| Body | 16px | Default | 1.55 |
| Metric value | 36px | 500 | 1.2 |
| Primary button | 14px | 600 | 1.3 |
| Table text | 14px | Default | Inherited |
| Metric annotation | 13px | Default | Inherited |
| Eyebrow label | 11px | 600 | Inherited |

Financial table cells use tabular numerals and right alignment. Supporting text uses the steel color. Uppercase labels are reserved for small eyebrows and table headings.

## Spacing and shape

- Base spacing scale: 4, 8, 12, 16, 20, 24, 32, and 40px.
- Standard page width: 1100px; notes board width: 1280px.
- Standard page padding: 32px 24px 96px, with 32px between sections.
- Standard card padding: 24px, with 16px between metric cards.
- Buttons and tab links use a pill shape with a 9999px radius.

| Radius token | Value |
| --- | --- |
| `--radius-sm` | `6px` |
| `--radius-md` | `8px` |
| `--radius-lg` | `12px` |

## Core components

| Component | Pattern |
| --- | --- |
| Cards | White surface, subtle border, 12px corners, and clear headings |
| Primary buttons | Bright green fill, dark text, and pill shape |
| Secondary buttons | Transparent fill, dark text, and a subtle outline |
| Tab links | Wrapping pill links; dark fill and white text for the selected tab |
| Forms | Native server-action forms, labeled inputs, and grouped fields |
| Add and edit controls | Inline `<details>` sections; notes use a full-screen editor |
| Tables | Subtle row borders, compact headings, and aligned numeric values |
| Status indicators | Plain-language labels with semantic colors |
| Notes | Responsive cards with tags, expansion, copying, and reorder controls |

## Responsive behavior

Metric cards use an auto-fitting grid. Below 720px, navigation wraps, the notes board uses one column, and note-editor controls stack. Note-card transitions are disabled when reduced motion is requested.

Keep new components in plain CSS and reuse existing tokens. Avoid marketing sections, promotional banners, and unrelated presentation patterns in the dashboard.
