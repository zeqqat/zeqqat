# components/

## Side menu: push on wide screens, drawer below 900px, animated both ways

The side menu in `AppShell.tsx` has two modes:

- **900px and up:** it sits beside the page in the normal layout. Opening it pushes the page right; there is no scrim, and it can stay open while the person works. It remembers open/closed in the `zq_menu` cookie; with no choice yet it starts open.
- **Below 900px (Gaita, 2026-11-17):** it is a drawer that slides over the page with a dimmed backdrop (`.is-drawer` on `.zq-shell`, `.zq-side-scrim`). Tapping the backdrop, pressing Escape or picking a page closes it. It is never remembered, so a phone always opens on the page. Don't turn the narrow mode back into a push: on a phone that squeezes the page into a sliver.

The styles live in the `/* side menu (push on wide screens, drawer below 900px) */` section of `app/globals.css`.

It opens with a smooth animation and closes with a smooth animation, in both modes. Both directions are requirements, not decoration. Do not remove or simplify either one.

**Why:** this has regressed before, when one direction was kept and the other dropped. The usual cause is hiding the menu instantly (`hidden`, `display: none`, or unmounting) at the moment it closes, which cuts the closing transition off. `tests/e2e/side-menu.spec.ts` checks both directions, the push layout on wide screens and the drawer on narrow ones.
