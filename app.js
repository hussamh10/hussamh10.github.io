/* global d3 */

const ROOT_ID = "Root";

const NODE_RADIUS = 14;
const ICON_SIZE = 28;
const HIT_RADIUS = 22;
const LABEL_GAP = 18;
const LABEL_WRAP_CHARS = 20;
const LABEL_BASELINE_EXTRA = 0;
const LINK_END_INSET_EXTRA = 6; // extra gap (px) between link strokes and node visuals

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function $(selector) {
  return document.querySelector(selector);
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function nodeScale(node) {
  const raw = Number(node?.size);
  const pct = Number.isFinite(raw) ? raw : 100;
  return clamp(pct / 100, 0.25, 4);
}

function nodeHasIcon(node) {
  return isNonEmptyString(node?.icon) || node?.type === "image";
}

function nodeWantsTriangle(node) {
  // Support multiple shapes encodings:
  // - type: "shape:triangle"  (current graph.json)
  // - shape: "triangle"
  // - type: { shape: "triangle" }
  const t = node?.type;
  if (typeof t === "string" && /\btriangle\b/i.test(t)) return true;
  if (t && typeof t === "object" && t.shape === "triangle") return true;
  if (node?.shape === "triangle") return true;
  return false;
}

function nodeVisualRadius(node) {
  const s = nodeScale(node);
  return nodeHasIcon(node) ? (ICON_SIZE * s) / 2 : NODE_RADIUS * s;
}

function nodeHitRadius(node) {
  // Keep a minimum hit area for usability.
  const s = nodeScale(node);
  return Math.max(18, HIT_RADIUS * s);
}

function nodeLabelDy(node) {
  return nodeVisualRadius(node) + LABEL_GAP + LABEL_BASELINE_EXTRA;
}

function wrapLineToChars(line, maxChars) {
  const src = isNonEmptyString(line) ? line.trim() : "";
  if (!src) return [];

  const words = src.split(/\s+/g).filter(Boolean);
  const out = [];
  let cur = "";

  for (const w of words) {
    // Only wrap on spaces. If a single word is longer than maxChars, keep it intact.
    if (!cur) {
      cur = w;
      continue;
    }
    const candidate = `${cur} ${w}`;
    if (candidate.length <= maxChars) cur = candidate;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function wrapLabelToLines(label, maxChars = LABEL_WRAP_CHARS) {
  const text = isNonEmptyString(label) ? label : "";
  // Honor explicit newlines first, then wrap each line to ~maxChars.
  const hardLines = text.split("\n");
  const out = [];
  for (const hl of hardLines) out.push(...wrapLineToChars(hl, maxChars));
  return out.length ? out : [""];
}

function applyWrappedNodeLabel(textEl, node) {
  const raw = node?.label ?? node?.id ?? "";
  const lines = wrapLabelToLines(String(raw), LABEL_WRAP_CHARS);
  const textSel = d3.select(textEl);
  textSel.text(null);
  for (let i = 0; i < lines.length; i += 1) {
    const t = textSel.append("tspan").attr("x", 0).text(lines[i]);
    // Don't set dy on the first line: let the parent <text dy=...> control baseline placement.
    if (i > 0) t.attr("dy", "1.15em");
  }
}

function hashStringToUnit(str) {
  // Deterministic 0..1 hash (FNV-1a-ish)
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Convert to [0,1)
  return ((h >>> 0) % 1000000) / 1000000;
}

function nodeTiltDeg(nodeId) {
  const u = hashStringToUnit(`tilt:${nodeId}`);
  // Slight rotation: -6..+6 degrees, biased toward 0
  const signed = (u - 0.5) * 2;
  return signed * 6;
}

function buildOutgoingAdj(links) {
  const adj = new Map();
  for (const l of links || []) {
    const s = l?.source;
    const t = l?.target;
    if (!isNonEmptyString(s) || !isNonEmptyString(t)) continue;
    if (!adj.has(s)) adj.set(s, []);
    adj.get(s).push(t);
  }
  return adj;
}

function computeViewBox(nodes, padding = 140) {
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = (maxX - minX) + padding * 2;
  const h = (maxY - minY) + padding * 2;
  return {
    x: minX - padding,
    y: minY - padding,
    width: w || 1,
    height: h || 1,
  };
}

function zigzagPathForLink(linkKey, sx, sy, tx, ty, sInset, tInset) {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  // Keep ends slightly inset so strokes don't overlap node centers too much.
  const ssx = sx + ux * sInset;
  const ssy = sy + uy * sInset;
  const ttx = tx - ux * tInset;
  const tty = ty - uy * tInset;

  // Subtle, organic "hand-jagged" polyline:
  // - fewer kinks
  // - smaller perpendicular jitter
  // - envelope so jitter fades near endpoints
  const baseAmp = Math.max(2.2, Math.min(8.0, len * 0.020));
  const segCount = Math.max(4, Math.min(9, Math.round(len / 80)));

  let d = `M ${ssx} ${ssy}`;
  for (let i = 1; i <= segCount; i += 1) {
    const t = i / (segCount + 1);

    // Envelope: keep some jitter even near ends (less "smooth" overall).
    const env = 0.28 + 0.72 * Math.sin(Math.PI * t);

    // Deterministic irregularity per segment.
    const r1 = (hashStringToUnit(`j:${linkKey}:${i}:a`) - 0.5) * 2; // [-1..1]
    const r2 = (hashStringToUnit(`j:${linkKey}:${i}:b`) - 0.5) * 2; // [-1..1]

    // Not perfectly alternating: sign comes from hash.
    const sign = r2 >= 0 ? 1 : -1;
    const amp = baseAmp * env * (0.55 + 0.55 * Math.abs(r1));

    const ox = px * amp * sign;
    const oy = py * amp * sign;

    // A touch of along-line jitter so it feels less geometric.
    const along = (baseAmp * 0.18) * env * r2;

    const x = ssx + (ttx - ssx) * t + ox + ux * along;
    const y = ssy + (tty - ssy) * t + oy + uy * along;
    d += ` L ${x} ${y}`;
  }
  d += ` L ${ttx} ${tty}`;
  return d;
}

function normalizePanelSource(source) {
  if (!isNonEmptyString(source)) return "";
  // Keep as-is; caller provides project-relative paths like "panels/about".
  return source.replace(/\/+$/, "");
}

const panelCssLoadCache = new Map(); // href -> Promise<void>
function ensurePanelCssLoaded(source) {
  const href = `${source}/panel.css`;
  const id = `panel-css:${source}`;
  if (panelCssLoadCache.has(href)) return panelCssLoadCache.get(href);

  const existing = document.getElementById(id);
  const link = existing || document.createElement("link");
  if (!existing) {
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  // Wait for the stylesheet to load so we don't flash unstyled (FOUC).
  const p = new Promise((resolve, reject) => {
    if (link.sheet) return resolve();
    const onLoad = () => resolve();
    const onError = () => reject(new Error(`Failed to load panel CSS from ${href}`));
    link.addEventListener("load", onLoad, { once: true });
    link.addEventListener("error", onError, { once: true });
  });
  panelCssLoadCache.set(href, p);
  return p;
}

const htmlPanelCache = new Map(); // source -> Promise<string>
async function loadHtmlPanelHtml(source) {
  if (htmlPanelCache.has(source)) return await htmlPanelCache.get(source);
  const p = (async () => {
    const res = await fetch(`${source}/panel.html`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load panel (${res.status}) from ${source}`);
    return await res.text();
  })();
  htmlPanelCache.set(source, p);
  return await p;
}

let activePanelFitCleanup = null;
function clearActivePanelFit() {
  if (typeof activePanelFitCleanup === "function") {
    try {
      activePanelFitCleanup();
    } catch (e) {
      console.warn("panel fit cleanup failed", e);
    }
  }
  activePanelFitCleanup = null;
}

let activePanelJsCleanup = null;
function clearActivePanelJs() {
  if (typeof activePanelJsCleanup === "function") {
    try {
      activePanelJsCleanup();
    } catch (e) {
      console.warn("panel js cleanup failed", e);
    }
  }
  activePanelJsCleanup = null;
}

const panelJsModuleCache = new Map(); // url -> Promise<any>
async function initPanelJsIfPresent(source, hostEl) {
  clearActivePanelJs();
  if (!isNonEmptyString(source) || !hostEl) return;

  const jsPath = `${source}/panel.js`;

  let exists = false;
  try {
    const head = await fetch(jsPath, { method: "HEAD", cache: "no-store" });
    exists = head.ok;
  } catch (e) {
    // Some dev servers may not support HEAD; fall back to GET probe.
    try {
      const get = await fetch(jsPath, { method: "GET", cache: "no-store" });
      exists = get.ok;
    } catch (e2) {
      exists = false;
    }
  }
  if (!exists) return;

  try {
    const url = new URL(jsPath, window.location.href).href;
    let p = panelJsModuleCache.get(url);
    if (!p) {
      p = import(url);
      panelJsModuleCache.set(url, p);
    }

    const mod = await p;
    const init = mod?.init;
    if (typeof init !== "function") return;

    const panelRoot = hostEl.querySelector(".detail__panelFitInner") || hostEl;
    const cleanup = await init(panelRoot);
    if (typeof cleanup === "function") activePanelJsCleanup = cleanup;
  } catch (e) {
    // Optional behavior; don't break panel rendering if JS fails.
    console.debug("panel js init skipped", e);
  }
}

function setupHtmlPanelFit(hostEl) {
  const wrapper = hostEl?.querySelector(".detail__panelFit");
  const inner = hostEl?.querySelector(".detail__panelFitInner");
  if (!wrapper || !inner) return () => {};

  function measureAndFit() {
    const availW = wrapper.clientWidth || 0;
    const availH = wrapper.clientHeight || 0;
    if (availW <= 0 || availH <= 0) return;

    // Leave a little breathing room so panels don't feel edge-to-edge.
    const FIT_MARGIN = 0.90; // 10% inset

    // Temporarily set our transform to 1 so we can measure "natural" size.
    inner.style.transformOrigin = "center center";
    inner.style.transform = "scale(1)";

    const rect = inner.getBoundingClientRect();
    const naturalW = rect.width || 0;
    const naturalH = rect.height || 0;
    if (naturalW <= 0 || naturalH <= 0) return;

    const scale = Math.min((availW * FIT_MARGIN) / naturalW, (availH * FIT_MARGIN) / naturalH);
    inner.style.transformOrigin = "center center";
    inner.style.transform = `scale(${scale})`;
  }

  const ro = new ResizeObserver(() => {
    // Avoid measurement loops
    requestAnimationFrame(measureAndFit);
  });
  ro.observe(wrapper);
  ro.observe(inner);

  requestAnimationFrame(measureAndFit);
  return () => ro.disconnect();
}

function normalizeCitationLinks(markdown) {
  if (!isNonEmptyString(markdown)) return "";
  // Turn [[1](url)] into a link whose clickable text is "[1]" (no URL shown).
  // Markdown needs escaping for literal brackets inside link text.
  return markdown.replace(/\[\[([^\]]+)\]\(([^)]+)\)\]/g, (m, label, url) => {
    return `[\\[${label}\\]](${url})`;
  });
}

const markdownCache = new Map(); // source -> Promise<string>
async function loadMarkdown(source) {
  if (markdownCache.has(source)) return await markdownCache.get(source);
  const p = (async () => {
    const res = await fetch(source, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load markdown (${res.status}) from ${source}`);
    return await res.text();
  })();
  markdownCache.set(source, p);
  return await p;
}

function renderMarkdownToHtml(markdown) {
  const markedLib = globalThis.marked;
  if (!markedLib) throw new Error('Markdown renderer not found. Expected "marked" on window/globalThis.');

  // Customize link output for safer defaults.
  const renderer = new markedLib.Renderer();
  renderer.link = (href, title, text) => {
    // marked's renderer.link signature varies by version:
    // - older: (href, title, text)
    // - newer: (token) where token = { href, title, text, ... }
    if (href && typeof href === "object") {
      const token = href;
      href = token.href;
      title = token.title;
      text = token.text;
    }

    const safeHref = href || "";
    const safeTitle = title ? ` title="${String(title).replace(/"/g, "&quot;")}"` : "";
    // Always open external links in a new tab.
    return `<a href="${safeHref}"${safeTitle} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  markedLib.setOptions({
    renderer,
    mangle: false,
    headerIds: false,
  });

  return markedLib.parse(markdown);
}

function renderDefaultDetail(hostEl, node) {
  if (!hostEl) return;
  clearActivePanelFit();
  hostEl.classList.remove("detail--panel");
  hostEl.classList.remove("detail--markdown");
  hostEl.classList.remove("detail--img");
  hostEl.classList.remove("detail--website");
  hostEl.classList.remove("detail--loading");
  const safeLabel = node?.label ?? node?.id ?? "None";
  const metaLines = !node
    ? []
    : [
        `id: ${node.id ?? ""}`,
        `type: ${node.type ?? ""}`,
        `x: ${node.x ?? ""}`,
        `y: ${node.y ?? ""}`,
        node.icon ? `icon: ${node.icon}` : null,
        node.color ? `color: ${node.color}` : null,
      ].filter(Boolean);

  hostEl.innerHTML = `
    <div class="detail__title">Selected Node</div>
    <div class="detail__label"></div>
    <div class="detail__meta"></div>
  `;
  const labelEl = hostEl.querySelector(".detail__label");
  const metaEl = hostEl.querySelector(".detail__meta");
  if (labelEl) labelEl.textContent = safeLabel;
  if (metaEl) metaEl.textContent = metaLines.join("\n");
}

function normalizeWebsiteUrl(source) {
  if (!isNonEmptyString(source)) return "";
  try {
    const u = new URL(source, window.location.href);
    // Avoid dangerous schemes.
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
}

function renderWebsiteDetail(hostEl, node, url) {
  if (!hostEl) return;

  clearActivePanelFit();
  clearActivePanelJs();

  hostEl.classList.remove("detail--panel");
  hostEl.classList.remove("detail--markdown");
  hostEl.classList.remove("detail--img");
  hostEl.classList.add("detail--website");
  hostEl.classList.remove("detail--loading");

  hostEl.textContent = "";

  const titleEl = document.createElement("div");
  titleEl.className = "detail__title";
  titleEl.textContent = "Website";

  const labelEl = document.createElement("div");
  labelEl.className = "detail__label";
  labelEl.textContent = String(node?.label ?? node?.id ?? "Website");

  const card = document.createElement("a");
  card.className = "detail__webCard";
  card.href = url;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  const top = document.createElement("div");
  top.className = "detail__webCardTop";

  const urlEl = document.createElement("div");
  urlEl.className = "detail__webUrl";
  urlEl.textContent = url;

  const hintEl = document.createElement("div");
  hintEl.className = "detail__webHint";
  hintEl.textContent = "Click to open ↗";

  top.appendChild(urlEl);
  top.appendChild(hintEl);

  const preview = document.createElement("div");
  preview.className = "detail__webPreview";

  const iframe = document.createElement("iframe");
  iframe.className = "detail__webFrame";
  iframe.src = url;
  iframe.loading = "lazy";
  iframe.referrerPolicy = "no-referrer";
  // Keep the preview non-interactive so a click always opens a new tab.
  iframe.setAttribute("tabindex", "-1");
  // Allow typical site rendering while preventing it from escaping to top-level navigation by default.
  iframe.setAttribute("sandbox", "allow-forms allow-scripts allow-same-origin allow-popups");

  preview.appendChild(iframe);
  card.appendChild(top);
  card.appendChild(preview);

  hostEl.appendChild(titleEl);
  hostEl.appendChild(labelEl);
  hostEl.appendChild(card);
}

let activeDetailRequestId = 0;
function renderDetailLoading(hostEl, node, label = "loading...") {
  if (!hostEl) return;

  clearActivePanelFit();
  clearActivePanelJs();

  hostEl.classList.remove("detail--panel");
  hostEl.classList.remove("detail--markdown");
  hostEl.classList.remove("detail--img");
  hostEl.classList.remove("detail--website");
  hostEl.classList.add("detail--loading");

  const title = String(node?.label ?? node?.id ?? "Loading");
  hostEl.innerHTML = `
    <div class="detail__title">Selected Node</div>
    <div class="detail__label"></div>
    <div class="detail__loading" aria-live="polite"></div>
  `;
  const labelEl = hostEl.querySelector(".detail__label");
  const loadingEl = hostEl.querySelector(".detail__loading");
  if (labelEl) labelEl.textContent = title;
  if (loadingEl) loadingEl.textContent = label;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

async function renderDetail(node) {
  const hostEl = document.getElementById("detailHost");
  if (!hostEl) return;

  const reqId = ++activeDetailRequestId;

  const panelType = node?.["panel-type"];
  const source = normalizePanelSource(node?.source);

  if (panelType === "html" && isNonEmptyString(source)) {
    try {
      renderDetailLoading(hostEl, node, "loading...");
      await ensurePanelCssLoaded(source);
      const html = await loadHtmlPanelHtml(source);
      if (reqId !== activeDetailRequestId) return;
      hostEl.classList.remove("detail--loading");
      hostEl.classList.add("detail--panel");
      hostEl.classList.remove("detail--markdown");
      hostEl.classList.remove("detail--img");
      hostEl.classList.remove("detail--website");
      hostEl.innerHTML = `<div class="detail__panelFit"><div class="detail__panelFitInner">${html}</div></div>`;
      activePanelFitCleanup = setupHtmlPanelFit(hostEl);
      await initPanelJsIfPresent(source, hostEl);
      return;
    } catch (err) {
      console.error(err);
      // Fall back to default view with an inline error.
      if (reqId !== activeDetailRequestId) return;
      hostEl.classList.remove("detail--loading");
      renderDefaultDetail(hostEl, node);
      const metaEl = hostEl.querySelector(".detail__meta");
      if (metaEl) {
        metaEl.textContent = `${metaEl.textContent}\n\npanel error: ${String(err?.message || err)}`.trim();
      }
      return;
    }
  }

  if (panelType === "markdown" && isNonEmptyString(source)) {
    try {
      renderDetailLoading(hostEl, node, "loading...");
      const mdRaw = await loadMarkdown(source);
      if (reqId !== activeDetailRequestId) return;
      const md = normalizeCitationLinks(mdRaw);
      const html = renderMarkdownToHtml(md);
      hostEl.classList.remove("detail--loading");
      hostEl.classList.remove("detail--panel");
      hostEl.classList.add("detail--markdown");
      hostEl.classList.remove("detail--img");
      hostEl.classList.remove("detail--website");
      hostEl.innerHTML = `<div class="detail__markdown md">${html}</div>`;
      return;
    } catch (err) {
      console.error(err);
      if (reqId !== activeDetailRequestId) return;
      hostEl.classList.remove("detail--loading");
      renderDefaultDetail(hostEl, node);
      const metaEl = hostEl.querySelector(".detail__meta");
      if (metaEl) {
        metaEl.textContent = `${metaEl.textContent}\n\nmarkdown error: ${String(err?.message || err)}`.trim();
      }
      return;
    }
  }

  if (panelType === "img" && isNonEmptyString(source)) {
    const ref = node?.ref;
    const href = isNonEmptyString(ref) ? ref : "";
    const alt = String(node?.label ?? node?.id ?? "Image");

    renderDetailLoading(hostEl, node, "loading...");

    try {
      await loadImage(source);
      if (reqId !== activeDetailRequestId) return;

      hostEl.classList.remove("detail--panel");
      hostEl.classList.remove("detail--markdown");
      hostEl.classList.add("detail--img");
      hostEl.classList.remove("detail--website");
      hostEl.classList.remove("detail--loading");

      const imgHtml = `<img class="detail__img" src="${source}" alt="${alt}" loading="eager" decoding="async" />`;

      if (href) {
        hostEl.innerHTML = `
          <div class="detail__imgFit">
            <a class="detail__imgLink" href="${href}" target="_blank" rel="noopener noreferrer">
              ${imgHtml}
            </a>
          </div>
        `;
      } else {
        hostEl.innerHTML = `
          <div class="detail__imgFit">
            ${imgHtml}
          </div>
        `;
      }
      return;
    } catch (err) {
      console.error(err);
      if (reqId !== activeDetailRequestId) return;
      hostEl.classList.remove("detail--loading");
      renderDefaultDetail(hostEl, node);
      const metaEl = hostEl.querySelector(".detail__meta");
      if (metaEl) {
        metaEl.textContent = `${metaEl.textContent}\n\nimage error: ${String(err?.message || err)}`.trim();
      }
      return;
    }
  }

  if (panelType === "website") {
    const url = normalizeWebsiteUrl(node?.source);
    if (isNonEmptyString(url)) {
      renderWebsiteDetail(hostEl, node, url);
      return;
    }
  }

  hostEl.classList.remove("detail--loading");
  renderDefaultDetail(hostEl, node);
}

async function loadGraph() {
  if (location.protocol === "file:") {
    throw new Error(
      'This app loads "graph.json" via fetch(), which is blocked by most browsers on file://. Run a local server (e.g. `python3 -m http.server`) and open http://localhost:8000/'
    );
  }

  const res = await fetch("graph.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load graph.json (${res.status})`);
  const json = await res.json();
  return json;
}

function main(graph) {
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const links = Array.isArray(graph?.links) ? graph.links : [];

  const nodes = rawNodes.map((n) => ({
    ...n,
    x: Number(n?.x) || 0,
    y: Number(n?.y) || 0,
  }));

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  if (!nodeById.has(ROOT_ID)) {
    throw new Error(`Root node not found (expected id "${ROOT_ID}")`);
  }

  const outgoingAdj = buildOutgoingAdj(links);

  // State
  let selectedId = ROOT_ID;
  const visibleIds = new Set([ROOT_ID]);
  for (const child of outgoingAdj.get(ROOT_ID) || []) visibleIds.add(child);

  const svg = d3.select("#graph");
  const bg = svg.select("rect.bg");
  const viewport = svg.select("g.viewport");
  const gLinks = svg.select("g.links");
  const gNodes = svg.select("g.nodes");

  // Size the background rect to the rendered SVG size, so zoom can start from empty space.
  function resizeBg() {
    const rect = svg.node().getBoundingClientRect();
    bg.attr("width", rect.width).attr("height", rect.height);
  }
  resizeBg();
  window.addEventListener("resize", resizeBg);
  // Mobile browsers may change viewport size without a reliable window resize
  // (e.g., address bar collapse/expand). Observe the SVG itself.
  try {
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(resizeBg);
    });
    ro.observe(svg.node());
  } catch {
    // ResizeObserver not available; window resize handler is a reasonable fallback.
  }

  // Fixed coordinate system via viewBox from node extents.
  const vb = computeViewBox(nodes);
  svg.attr("viewBox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);

  const rootNode = nodeById.get(ROOT_ID);
  // Default start position: near center, nudged slightly up and to the right.
  // Expressed in viewBox (user) coordinates so it scales consistently.
  const START_X_FRAC = 0.48; // > 0.5 => a bit to the right
  const START_Y_FRAC = 0.44; // < 0.5 => a bit higher
  const isMobile = window.matchMedia?.("(max-width: 900px)")?.matches;
  const initialScale = isMobile ? 2.5 : 1;
  const defaultTransform = d3.zoomIdentity
    .translate(vb.x + vb.width * START_X_FRAC, vb.y + vb.height * START_Y_FRAC)
    .scale(initialScale)
    .translate(-(rootNode?.x ?? 0), -(rootNode?.y ?? 0));

  // Zoom / pan
  const zoom = d3
    .zoom()
    .scaleExtent([0.3, 5])
    .on("zoom", (event) => {
      viewport.attr("transform", event.transform);
    });
  svg.call(zoom);
  // Disable default dblclick-to-zoom; we use dblclick to reset instead.
  svg.on("dblclick.zoom", null);

  function centerOnNode(node) {
    if (!node) return;
    // Keep current scale; just translate so the node becomes the center of the viewport.
    svg
      .transition()
      .duration(240)
      .call(zoom.translateTo, node.x, node.y);
  }

  function getVisibleNodes() {
    return nodes.filter((n) => visibleIds.has(n.id));
  }

  function getVisibleLinks() {
    return links.filter((l) => visibleIds.has(l.source) && visibleIds.has(l.target));
  }

  function render() {
    const visibleNodes = getVisibleNodes();
    const visibleLinks = getVisibleLinks();

    // Highlight set: selected + its direct neighbors (undirected) among visible links.
    const neighborIds = new Set();
    for (const l of visibleLinks) {
      if (l.source === selectedId) neighborIds.add(l.target);
      else if (l.target === selectedId) neighborIds.add(l.source);
    }
    const activeNodeIds = new Set([selectedId, ...neighborIds]);
    const activeLinkKeys = new Set();
    for (const l of visibleLinks) {
      const k = `${l.source}→${l.target}`;
      const connectsSelected =
        (l.source === selectedId && neighborIds.has(l.target)) ||
        (l.target === selectedId && neighborIds.has(l.source));
      if (connectsSelected) activeLinkKeys.add(k);
    }

    // Links (optional but helpful to read expansion)
    const linkSel = gLinks.selectAll("path.link").data(
      visibleLinks,
      (d) => `${d.source}→${d.target}`
    );

    linkSel
      .join(
        (enter) => enter.append("path").attr("class", "link").attr("fill", "none"),
        (update) => update,
        (exit) => exit.remove()
      )
      .style("opacity", (d) => (activeLinkKeys.has(`${d.source}→${d.target}`) ? 1 : 0.18))
      .attr("d", (d) => {
        const s = nodeById.get(d.source);
        const t = nodeById.get(d.target);
        if (!s || !t) return "";
        const key = `${d.source}→${d.target}`;
        // Add a little extra breathing room so edges don't hug nodes.
        const sInset = nodeVisualRadius(s) + LINK_END_INSET_EXTRA;
        const tInset = nodeVisualRadius(t) + LINK_END_INSET_EXTRA;
        return zigzagPathForLink(key, s.x, s.y, t.x, t.y, sInset, tInset);
      });

    // Nodes
    const nodeSel = gNodes.selectAll("g.node").data(visibleNodes, (d) => d.id);

    const nodeEnter = nodeSel
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x}, ${d.y}) rotate(${nodeTiltDeg(d.id)})`)
      .style("cursor", "pointer")
      .on("click", async (event, d) => {
        event.stopPropagation();
        selectedId = d.id;
        await renderDetail(d);
        for (const child of outgoingAdj.get(d.id) || []) visibleIds.add(child);
        render();
        centerOnNode(d);
      });

    // Hit target for easier clicking
    nodeEnter.append("circle").attr("class", "node-hit").attr("r", (d) => nodeHitRadius(d));

    // Content: image or circle
    nodeEnter.each(function (d) {
      const g = d3.select(this);
      const s = nodeScale(d);
      const hasIcon = nodeHasIcon(d);
      if (hasIcon) {
        const href = d.icon || "";
        const size = ICON_SIZE * s;
        g.append("image")
          .attr("class", "node-image")
          .attr("href", href)
          .attr("x", -size / 2)
          .attr("y", -size / 2)
          .attr("width", size)
          .attr("height", size);
      } else {
        const fill = isNonEmptyString(d.color) ? d.color : "#64748b";
        const r = NODE_RADIUS * s;
        if (nodeWantsTriangle(d)) {
          // Equilateral triangle centered at (0,0) using circumradius r.
          const x = r * 0.8660254037844386; // cos(30°)
          const y = r * 0.5; // sin(30°)
          g.append("polygon")
            .attr("class", "node-triangle")
            .attr("points", `0,${-r} ${x},${y} ${-x},${y}`)
            .attr("fill", fill);
        } else {
          g.append("circle").attr("class", "node-circle").attr("r", r).attr("fill", fill);
        }
      }
    });

    // Label
    nodeEnter
      .append("text")
      .attr("class", "node-label")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => nodeLabelDy(d))
      .each(function (d) {
        applyWrappedNodeLabel(this, d);
      });

    // Update + enter merged
    const nodeMerged = nodeEnter.merge(nodeSel);
    nodeMerged.attr("transform", (d) => `translate(${d.x}, ${d.y}) rotate(${nodeTiltDeg(d.id)})`);
    nodeMerged.style("opacity", (d) => (activeNodeIds.has(d.id) ? 1 : 0.22));

    nodeSel.exit().remove();
  }

  // Click on background: just select Root (optional convenience), without collapsing.
  svg.on("click", () => {
    selectedId = ROOT_ID;
    renderDetail(rootNode);
    render();
    centerOnNode(rootNode);
  });

  // Double click: reset zoom/pan to default transform.
  svg.on("dblclick", (event) => {
    event.preventDefault();
    svg
      .transition()
      .duration(220)
      .call(zoom.transform, defaultTransform);
  });

  // Initial UI
  renderDetail(nodeById.get(ROOT_ID));
  render();

  // Start with Root near center, slightly up/right.
  svg.call(zoom.transform, defaultTransform);
}

(async () => {
  try {
    const graph = await loadGraph();
    main(graph);
  } catch (err) {
    console.error(err);
    const labelEl = document.getElementById("detailLabel");
    const metaEl = document.getElementById("detailMeta");
    if (labelEl) labelEl.textContent = "Failed to load graph";
    if (metaEl) metaEl.textContent = String(err?.message || err);
  }
})();


