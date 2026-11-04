# moisheu.github.io

Academic portfolio site. Plain HTML/CSS/JS — no build step, deploys as-is on GitHub Pages.

## Files

- `index.html` — all content (about, news, publications, research, experience, leadership, contact)
- `styles.css` — ink-on-paper theme for the standard layout + dark theme for the graph view
- `main.js` — the view toggle and the force-directed graph engine

## Editing content

Everything lives in `index.html`. The graph view is **generated from the page**, so
editing HTML is all you ever need to do:

- Each `<section data-graph="Label">` becomes a hub node.
- Any element with `data-node="Short label"` becomes a leaf node linked to its section.
  Give it an `id` so it can be cross-referenced (one is auto-generated otherwise).
- `data-links="some-id other-id"` draws extra edges between nodes, e.g. connecting a
  publication to the research project it belongs to.
- `<li data-theme="Label">` (the chips under Research interests) becomes a theme node, drawn
  as a ring. `data-themes="theme-id ..."` on any node draws a dashed edge to each theme, which
  is how work in different sections is tied together.
- `data-preview="..."` overrides the text shown in the hover tooltip; otherwise the node's own
  text is used.

## Graph view

Toggle with the button in the nav, or open `/#graph` directly. Drag nodes, scroll or
pinch to zoom, drag the background to pan, click a node to jump to its page. `Esc`
returns to the standard layout. Hover a node for a preview. Click a group in the key to hide
or show it. The chosen view is remembered in `localStorage`.
