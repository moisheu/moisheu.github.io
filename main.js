/* ==========================================================================
   Graph view — an Obsidian-style force-directed map of this site.

   The graph is generated from the page itself:
     - every <section data-graph="Label"> becomes a hub node
     - every element with data-node="Label" becomes a leaf linked to its section
     - data-links="id id ..." adds extra edges between any two nodes
   So adding a publication/project/news item in index.html automatically
   adds it to the graph. No graph data lives in this file.
   ========================================================================== */

(() => {
  "use strict";

  // Node colors per section, validated for the dark surface (#101317).
  const GROUP_COLORS = {
    about:        "#3987e5",
    news:         "#199e70",
    publications: "#c98500",
    research:     "#9085e9",
    experience:   "#e66767",
    leadership:   "#d55181",
    contact:      "#d95926",
  };
  const HOME_COLOR = "#e8eaed";
  const EDGE_COLOR = "rgba(232, 234, 237, 0.13)";
  const EDGE_HI    = "rgba(232, 234, 237, 0.45)";

  /* ---------- build graph data from the DOM ---------- */

  const nodes = [];
  const edges = [];
  const byId = new Map();

  function addNode(id, label, group, kind, el) {
    const n = {
      id, label, group, kind, el,
      x: (Math.random() - 0.5) * 60,
      y: (Math.random() - 0.5) * 60,
      vx: 0, vy: 0,
      r: kind === "home" ? 15 : kind === "hub" ? 9 : 5.5,
      degree: 0,
    };
    nodes.push(n);
    byId.set(id, n);
    return n;
  }

  function addEdge(a, b, rest) {
    if (!a || !b || a === b) return;
    edges.push({ a, b, rest });
    a.degree++; b.degree++;
  }

  const brand = document.querySelector(".brand");
  const home = addNode("home", brand ? brand.textContent.replace(/\s+/g, " ") : "Home",
                       "home", "home", document.getElementById("about"));

  document.querySelectorAll("section[data-graph]").forEach((sec) => {
    const hub = addNode(sec.id, sec.dataset.graph, sec.id, "hub", sec);
    addEdge(home, hub, 230);
    sec.querySelectorAll("[data-node]").forEach((el, i) => {
      if (!el.id) el.id = `${sec.id}-item-${i}`;
      addEdge(hub, addNode(el.id, el.dataset.node, sec.id, "leaf", el), 120);
    });
  });

  // Cross-links between leaves (e.g. paper -> research project)
  document.querySelectorAll("[data-links]").forEach((el) => {
    el.dataset.links.trim().split(/\s+/).forEach((target) => {
      addEdge(byId.get(el.id), byId.get(target), 130);
    });
  });

  nodes.forEach((n) => { if (n.kind === "hub") n.r = 8 + Math.min(n.degree, 8) * 0.7; });

  const neighbors = new Map(nodes.map((n) => [n, new Set()]));
  edges.forEach(({ a, b }) => { neighbors.get(a).add(b); neighbors.get(b).add(a); });

  /* ---------- group filters (toggled from the legend) ---------- */

  const hiddenGroups = new Set();
  const isVisible = (n) => n.kind === "home" || !hiddenGroups.has(n.group);
  let active = nodes, activeEdges = edges;
  function refreshActive() {
    active = nodes.filter(isVisible);
    activeEdges = edges.filter((e) => isVisible(e.a) && isVisible(e.b));
  }

  /* ---------- simulation ---------- */

  const REPULSION = 9000;
  const SPRING = 0.03;
  const GRAVITY = 0.006;
  const DAMPING = 0.86;
  const MAX_SPEED = 14;

  let alpha = 1; // cooling factor; reheated by interaction

  function tick() {
    // pairwise repulsion (n is small; O(n^2) is fine)
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        const f = Math.min(REPULSION / d2, 6) * alpha;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }
    // springs along edges
    for (const { a, b, rest } of activeEdges) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - rest) * SPRING * alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    // gentle pull to the origin + integrate
    for (const n of active) {
      n.vx -= n.x * GRAVITY * alpha;
      n.vy -= n.y * GRAVITY * alpha;
      n.vx *= DAMPING; n.vy *= DAMPING;
      const s = Math.hypot(n.vx, n.vy);
      if (s > MAX_SPEED) { n.vx *= MAX_SPEED / s; n.vy *= MAX_SPEED / s; }
      if (n !== dragNode) { n.x += n.vx; n.y += n.vy; }
    }
    alpha = Math.max(alpha * 0.995, 0.05);
  }

  /* ---------- rendering ---------- */

  const view = document.getElementById("graph-view");
  const canvas = document.getElementById("graph-canvas");
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, DPR = 1;
  let scale = 1, panX = 0, panY = 0;
  let hoverNode = null, dragNode = null;

  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = view.clientWidth; H = view.clientHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
  }

  const toWorld = (px, py) => [(px - W / 2 - panX) / scale, (py - H / 2 - panY) / scale];

  function nodeAt(px, py) {
    const [wx, wy] = toWorld(px, py);
    let best = null, bestD = Infinity;
    for (const n of active) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d < n.r + 6 / scale && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  function color(n) { return n.kind === "home" ? HOME_COLOR : GROUP_COLORS[n.group] || "#888"; }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W / 2 + panX, H / 2 + panY);
    ctx.scale(scale, scale);

    const focus = hoverNode || dragNode;
    const near = focus ? neighbors.get(focus) : null;

    // edges
    ctx.lineWidth = 1 / scale;
    for (const { a, b } of activeEdges) {
      const hi = focus && (a === focus || b === focus);
      ctx.strokeStyle = hi ? EDGE_HI : EDGE_COLOR;
      ctx.globalAlpha = focus && !hi ? 0.25 : 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // nodes
    for (const n of active) {
      const active = !focus || n === focus || near.has(n);
      ctx.globalAlpha = active ? 1 : 0.18;
      if (n === focus) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 5 / scale, 0, Math.PI * 2);
        ctx.fillStyle = color(n);
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = color(n);
      ctx.fill();
    }

    // labels: hubs always; leaves fade in with zoom or focus
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const n of active) {
      const isFocusish = focus && (n === focus || near.has(n));
      let a1;
      if (n.kind === "leaf") {
        a1 = isFocusish ? 1 : Math.max(0.35, Math.min(1, (scale - 0.6) * 1.6));
      } else {
        a1 = !focus || isFocusish ? 1 : 0.25;
      }
      if (a1 <= 0.02) continue;
      const size = (n.kind === "home" ? 13 : n.kind === "hub" ? 11.5 : 10) / scale;
      ctx.font = `500 ${size}px Inter, system-ui, sans-serif`;
      ctx.globalAlpha = a1;
      ctx.fillStyle = n === focus ? "#ffffff" : n.kind === "leaf" ? "#9aa0a6" : "#c9cdd2";
      ctx.fillText(n.label, n.x, n.y + n.r + 4 / scale);
    }
    ctx.globalAlpha = 1;
  }

  let rafId = null;
  function loop() {
    tick();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  /* ---------- interaction ---------- */

  let panning = false;
  let downX = 0, downY = 0, downT = 0, moved = false;
  const pointers = new Map();
  let pinchDist = 0;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinchDist = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
      dragNode = null; panning = false;
      return;
    }
    downX = e.offsetX; downY = e.offsetY; downT = performance.now(); moved = false;
    const n = nodeAt(e.offsetX, e.offsetY);
    if (n) { dragNode = n; alpha = Math.max(alpha, 0.5); }
    else panning = true;
    canvas.classList.add("dragging");
  });

  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.offsetX, e.offsetY]);

    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      const d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
      if (pinchDist > 0) zoomAt((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, d / pinchDist);
      pinchDist = d;
      return;
    }

    if (Math.hypot(e.offsetX - downX, e.offsetY - downY) > 4) moved = true;

    if (dragNode) {
      const [wx, wy] = toWorld(e.offsetX, e.offsetY);
      dragNode.x = wx; dragNode.y = wy;
      dragNode.vx = 0; dragNode.vy = 0;
      alpha = Math.max(alpha, 0.35);
    } else if (panning) {
      panX += e.movementX; panY += e.movementY;
    } else {
      hoverNode = nodeAt(e.offsetX, e.offsetY);
      canvas.classList.toggle("over-node", !!hoverNode);
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    pinchDist = 0;
    const clicked = dragNode && !moved && performance.now() - downT < 400;
    if (clicked) visit(dragNode);
    dragNode = null;
    panning = false;
    canvas.classList.remove("dragging");
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => { hoverNode = null; canvas.classList.remove("over-node"); });

  function zoomAt(px, py, factor) {
    const next = Math.min(3.5, Math.max(0.3, scale * factor));
    const applied = next / scale;
    // keep the point under the cursor fixed
    panX = px - W / 2 - (px - W / 2 - panX) * applied;
    panY = py - H / 2 - (py - H / 2 - panY) * applied;
    scale = next;
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  /* ---------- view switching ---------- */

  let fitted = false;
  function fitToView() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of active) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    }
    const spanX = Math.max(maxX - minX, 1), spanY = Math.max(maxY - minY, 1);
    scale = Math.min(3.5, Math.max(0.3, Math.min((W * 0.72) / spanX, (H * 0.68) / spanY)));
    panX = -((minX + maxX) / 2) * scale;
    panY = -((minY + maxY) / 2) * scale;
  }

  const toggle = document.getElementById("view-toggle");
  const toggleLabel = toggle.querySelector(".toggle-label");
  const standard = document.getElementById("standard-view");

  function setView(mode, persist = true) {
    const graph = mode === "graph";
    document.body.classList.toggle("graph-mode", graph);
    view.hidden = !graph;
    standard.hidden = graph;
    toggle.setAttribute("aria-pressed", String(graph));
    toggleLabel.textContent = graph ? "List" : "Graph";
    if (persist) try { localStorage.setItem("view", mode); } catch (_) {}
    if (graph) {
      resize();
      if (!fitted) { fitToView(); fitted = true; }
      showTip();
      alpha = Math.max(alpha, 0.6);
      if (!rafId) loop();
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function visit(node) {
    setView("standard");
    const el = node.el;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: node.kind === "leaf" ? "center" : "start" });
    if (node.kind === "leaf") {
      el.classList.remove("node-flash");
      void el.offsetWidth; // restart the animation
      el.classList.add("node-flash");
    }
  }

  toggle.addEventListener("click", () =>
    setView(document.body.classList.contains("graph-mode") ? "standard" : "graph"));

  document.querySelectorAll("[data-open-graph]").forEach((b) =>
    b.addEventListener("click", () => setView("graph")));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("graph-mode")) setView("standard");
  });

  // nav links exit graph mode so anchors work
  document.querySelectorAll('.site-nav nav a, .brand').forEach((a) =>
    a.addEventListener("click", () => setView("standard", false)));

  window.addEventListener("resize", () => {
    if (document.body.classList.contains("graph-mode")) { resize(); alpha = Math.max(alpha, 0.3); }
  });

  /* ---------- legend ---------- */

  const legend = document.querySelector(".graph-legend");
  document.querySelectorAll("section[data-graph]").forEach((sec) => {
    const li = document.createElement("li");
    const dot = document.createElement("i");
    dot.style.setProperty("--dot", GROUP_COLORS[sec.id] || "#888");
    li.append(dot, sec.dataset.graph);
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-pressed", "true");
    li.title = "Click to hide or show this group";
    const toggleGroup = () => {
      const off = !hiddenGroups.has(sec.id);
      if (off) hiddenGroups.add(sec.id); else hiddenGroups.delete(sec.id);
      li.classList.toggle("off", off);
      li.setAttribute("aria-pressed", String(!off));
      refreshActive();
      hoverNode = null;
      alpha = Math.max(alpha, 0.5);
      fitToView();
      dismissTip();
    };
    li.addEventListener("click", toggleGroup);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleGroup(); }
    });
    legend.append(li);
  });

  // one-time hint that the legend filters the graph
  const tip = document.querySelector(".graph-tip");
  let tipTimer = null;
  function dismissTip() {
    if (!tip || tip.hidden) return;
    tip.hidden = true;
    clearTimeout(tipTimer);
    try { localStorage.setItem("graph-tip-seen", "1"); } catch (_) {}
  }
  function showTip() {
    if (!tip) return;
    let seen = false;
    try { seen = localStorage.getItem("graph-tip-seen") === "1"; } catch (_) {}
    if (seen) return;
    tip.hidden = false;
    // sit just under the key on wide screens; CSS places it above the key on phones
    tip.style.top = window.matchMedia("(min-width: 621px)").matches
      ? `${legend.offsetTop + legend.offsetHeight + 10}px` : "";
    clearTimeout(tipTimer);
    tipTimer = setTimeout(dismissTip, 9000);
  }
  if (tip) tip.querySelector(".graph-tip-close").addEventListener("click", dismissTip);

  /* ---------- init ---------- */

  resize();
  // pre-settle so the graph doesn't fly apart on first open
  for (let i = 0; i < 200; i++) tick();

  // Always default to the standard view; only open graph via an explicit #graph link.
  if (location.hash === "#graph") setView("graph", false);
})();
