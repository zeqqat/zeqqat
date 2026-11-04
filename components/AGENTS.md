# components/

## Side menu: push, not overlay, and animated both ways

The side menu in `AppShell.tsx` sits beside the page in the normal layout. Opening it pushes the page right; there is no scrim or overlay, and it can stay open while the person works. It remembers open/closed in the `zq_menu` cookie; with no choice yet it's open at 900px and up and closed below. The styles live in the `/* side menu (push, not overlay) */` section of `app/globals.css`.

It opens with a smooth animation and closes with a smooth animation. Both directions are requirements, not decoration. Do not remove or simplify either one, and don't turn it back into an overlay drawer.

**Why:** this has regressed before, when one direction was kept and the other dropped. The usual cause is hiding the menu instantly (`hidden`, `display: none`, or unmounting) at the moment it closes, which cuts the closing transition off. `tests/e2e/side-menu.spec.ts` checks both directions and the push layout.
