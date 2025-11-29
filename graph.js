document.addEventListener("DOMContentLoaded", () => {
  fetch("graph-data.json")
    .then((r) => r.json())
    .then((graphData) => initGraph(graphData))
    .catch((err) => {
      console.error("Error loading graph-data.json", err);
    });
});

function wrapLabel(text, maxChars = 20) {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  const lines = [];
  let current = "";

  const flushCurrent = () => {
    if (current) {
      lines.push(current);
      current = "";
    }
  };

  for (const word of words) {
    if (word.length > maxChars) {
      flushCurrent();
      let index = 0;
      while (index < word.length) {
        const segment = word.slice(index, index + maxChars);
        index += maxChars;
        if (segment.length === maxChars && index < word.length) {
          lines.push(segment);
        } else {
          current = segment;
        }
      }
      continue;
    }

    const test = current ? `${current} ${word}` : word;
    if (test.length <= maxChars) {
      current = test;
      continue;
    }

    if (current) {
      flushCurrent();
      current = word;
    } else {
      lines.push(word);
    }
  }

  flushCurrent();
  return lines;
}

function appendSuperscriptArrows(container, text, svgNS) {
  const arrowPattern = /↗/g;
  let lastIndex = 0;
  let match;

  while ((match = arrowPattern.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) {
      container.appendChild(document.createTextNode(before));
    }

    const arrowTspan = document.createElementNS(svgNS, "tspan");
    arrowTspan.setAttribute("class", "node-label-arrow");
    arrowTspan.setAttribute("baseline-shift", "super");
    arrowTspan.setAttribute("font-size", "9");
    arrowTspan.textContent = "↗";
    container.appendChild(arrowTspan);

    lastIndex = match.index + 1;
  }

  const remaining = text.slice(lastIndex);
  if (remaining) {
    container.appendChild(document.createTextNode(remaining));
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInlineMarkdown(text) {
  // Extract and replace links with placeholders before HTML escaping
  const linkPlaceholders = [];
  let processed = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    const placeholder = `__LINK_PLACEHOLDER_${linkPlaceholders.length}__`;
    linkPlaceholders.push({
      text: escapeHtml(linkText.trim()),
      url: escapeHtml(url.trim())
    });
    return placeholder;
  });
  
  // Escape HTML for the remaining text
  let escaped = escapeHtml(processed);
  
  // Replace placeholders with actual link HTML
  linkPlaceholders.forEach((link, index) => {
    escaped = escaped.replace(
      `__LINK_PLACEHOLDER_${index}__`,
      `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.text}</a>`
    );
  });
  
  // Process other formatting
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/__(.+?)__/g, "<strong>$1</strong>");
  escaped = escaped.replace(/\*(.+?)\*/g, "<em>$1</em>");
  escaped = escaped.replace(/_(.+?)_/g, "<em>$1</em>");
  escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
  return escaped;
}

function markdownToHtml(markdown) {
  if (!markdown) return "";

  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      html.push("</blockquote>");
      inBlockquote = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeLists();
      closeBlockquote();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      const tag = `h${level}`;
      html.push(`<${tag}>${formatInlineMarkdown(headingMatch[2])}</${tag}>`);
      continue;
    }

    if (line.startsWith(">")) {
      closeLists();
      const content = formatInlineMarkdown(line.replace(/^>\s?/, ""));
      if (!inBlockquote) {
        html.push("<blockquote>");
        inBlockquote = true;
      }
      html.push(`<p>${content}</p>`);
      continue;
    }

    const unorderedMatch = line.match(/^[*-]\s+(.*)$/);
    if (unorderedMatch) {
      closeBlockquote();
      if (!inUl) {
        closeLists();
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${formatInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      closeBlockquote();
      if (!inOl) {
        closeLists();
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${formatInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    closeLists();
    closeBlockquote();
    html.push(`<p>${formatInlineMarkdown(line)}</p>`);
  }

  closeLists();
  closeBlockquote();

  return html.join("");
}

async function fetchOptionalText(url) {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      if (response.status !== 404) {
        console.warn(`Panel asset request failed for ${url}: ${response.status}`);
      }
      return null;
    }
    return await response.text();
  } catch (error) {
    console.warn(`Panel asset request threw for ${url}`, error);
    return null;
  }
}

function isValidPanelId(panelId) {
  return typeof panelId === "string" && /^[a-zA-Z0-9_-]+$/.test(panelId);
}

function createPanelManager(detailContent) {
  const head = document.head;
  let currentStyles = [];
  let cleanupFn = null;
  let loadToken = 0;
  let activePanelId = null;

  function runCleanup() {
    if (cleanupFn) {
      try {
        cleanupFn();
      } catch (error) {
        console.error(`Error cleaning up panel ${activePanelId}`, error);
      }
    }
    cleanupFn = null;
    activePanelId = null;
  }

  function removeStyles() {
    currentStyles.forEach((styleEl) => styleEl.remove());
    currentStyles = [];
  }

  function clearDataset() {
    delete detailContent.dataset.panelId;
    delete detailContent.dataset.panelTemplate;
  }

  function clearPanel({ resetContent = true } = {}) {
    loadToken++;
    runCleanup();
    removeStyles();
    detailContent.classList.remove("panel-active");
    clearDataset();
    if (resetContent) {
      detailContent.innerHTML = "";
    }
  }

  async function loadPanel(panelId, node) {
    if (!isValidPanelId(panelId)) {
      clearPanel();
      detailContent.innerHTML = `<div class="panel-error">Panel "${panelId}" is not available.</div>`;
      return;
    }

    const token = ++loadToken;
    runCleanup();
    removeStyles();

    detailContent.classList.add("panel-active");
    detailContent.dataset.panelId = panelId;
    const templateId =
      node && typeof node.panelTemplate === "string" && node.panelTemplate.trim().length > 0
        ? node.panelTemplate.trim()
        : null;
    if (templateId) {
      detailContent.dataset.panelTemplate = templateId;
    } else {
      delete detailContent.dataset.panelTemplate;
    }
    detailContent.innerHTML = '<div class="panel-loading">Loading panel…</div>';

    const basePath = `panels/${panelId}`;
    const templateBasePath = templateId ? `panels/templates/${templateId}` : null;

    async function loadFirstAvailableHtml() {
      const sources = [];
      if (templateBasePath) sources.push(`${templateBasePath}/panel.html`);
      sources.push(`${basePath}/panel.html`);
      for (const src of sources) {
        const htmlText = await fetchOptionalText(src);
        if (token !== loadToken) return null;
        if (htmlText) return htmlText;
      }
      return null;
    }

    const html = await loadFirstAvailableHtml();
    if (token !== loadToken) return;

    if (!html) {
      detailContent.innerHTML = `<div class="panel-error">Panel content for "${panelId}" could not be loaded.</div>`;
      clearDataset();
      detailContent.classList.remove("panel-active");
      return;
    }

    const cssSources = [];
    if (templateBasePath) cssSources.push(`${templateBasePath}/panel.css`);
    cssSources.push(`${basePath}/panel.css`);

    for (const cssPath of cssSources) {
      const cssText = await fetchOptionalText(cssPath);
      if (token !== loadToken) return;
      if (!cssText) continue;
      const styleEl = document.createElement("style");
      styleEl.textContent = cssText;
      styleEl.dataset.panelId = panelId;
      styleEl.classList.add("panel-style");
      head.appendChild(styleEl);
      currentStyles.push(styleEl);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "panel-container";
    wrapper.innerHTML = html;
    detailContent.replaceChildren(wrapper);

    const jsSources = [];
    if (templateBasePath) jsSources.push(`${templateBasePath}/panel.js`);
    jsSources.push(`${basePath}/panel.js`);

    const cleanupStack = [];
    for (const jsPath of jsSources) {
      const jsText = await fetchOptionalText(jsPath);
      if (token !== loadToken) return;
      if (!jsText) continue;
      try {
        const factory = new Function("container", "context", jsText);
        const context = { panelId, node, templateId };
        const result = factory(wrapper, context);
        if (typeof result === "function") {
          cleanupStack.push(result);
        } else if (result && typeof result === "object" && typeof result.cleanup === "function") {
          cleanupStack.push(() => result.cleanup());
        }
      } catch (error) {
        console.error(`Error executing script for panel ${panelId}`, error);
      }
    }
    cleanupFn =
      cleanupStack.length > 0
        ? () => {
            for (let i = cleanupStack.length - 1; i >= 0; i -= 1) {
              try {
                cleanupStack[i]();
              } catch (error) {
                console.error(`Error running cleanup for panel ${panelId}`, error);
              }
            }
          }
        : null;

    activePanelId = panelId;
  }

  return {
    loadPanel,
    clearPanel,
  };
}

function initGraph(graphData) {
  const svg = document.getElementById("graph");
  const detailPanel = document.getElementById("detail-panel");
  const detailTitle = document.getElementById("detail-title");
  const detailContent = document.getElementById("detail-content");
  const panelManager = createPanelManager(detailContent);
  const svgNS = "http://www.w3.org/2000/svg";
  const xlinkNS = "http://www.w3.org/1999/xlink";

  const defs = document.createElementNS(svgNS, "defs");
  svg.appendChild(defs);

  const rootGroup = document.createElementNS(svgNS, "g");
  rootGroup.setAttribute("id", "graph-root");
  svg.appendChild(rootGroup);

  const linkLayer = document.createElementNS(svgNS, "g");
  linkLayer.setAttribute("class", "link-layer");
  const nodeLayer = document.createElementNS(svgNS, "g");
  nodeLayer.setAttribute("class", "node-layer");

  rootGroup.appendChild(linkLayer);
  rootGroup.appendChild(nodeLayer);

  const markdownCache = new Map();
  let markdownLoadToken = 0;

  const nodeById = {};
  graphData.nodes.forEach((n) => (nodeById[n.id] = n));

  const adjacency = {};
  const ensureEntry = (id) => {
    if (!adjacency[id]) {
      adjacency[id] = new Set();
    }
    return adjacency[id];
  };

  graphData.links.forEach((link) => {
    const { source, target } = link;
    if (!nodeById[source] || !nodeById[target]) return;
    ensureEntry(source).add(target);
    ensureEntry(target).add(source);
  });

  const visibleNodes = new Set(["root"]);
  let activeNodeId = null;
  let highlightedNodes = new Set(["root"]);
  let highlightedLinks = new Set();

  const imageClipCache = new Map();

  const parentById = {};
  const depthById = {};
  const childrenById = {};

  function ensureChildrenSet(id) {
    if (!childrenById[id]) {
      childrenById[id] = new Set();
    }
    return childrenById[id];
  }

  function edgeKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function buildHierarchy() {
    const rootId = "root";
    if (!nodeById[rootId]) return;

    const queue = [rootId];
    parentById[rootId] = null;
    depthById[rootId] = 0;
    ensureChildrenSet(rootId);

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = adjacency[current];
      if (!neighbors) continue;

      neighbors.forEach((neighborId) => {
        if (parentById.hasOwnProperty(neighborId)) return;
        parentById[neighborId] = current;
        depthById[neighborId] = depthById[current] + 1;
        ensureChildrenSet(current).add(neighborId);
        ensureChildrenSet(neighborId);
        queue.push(neighborId);
      });
    }
  }

  buildHierarchy();

  function updateHighlights(targetId) {
    const newHighlightedNodes = new Set();
    const newHighlightedLinks = new Set();

    if (!nodeById[targetId]) {
      highlightedNodes = newHighlightedNodes;
      highlightedLinks = newHighlightedLinks;
      return;
    }

    let currentId = targetId;
    while (currentId) {
      newHighlightedNodes.add(currentId);
      const parentId = parentById[currentId];
      if (parentId) {
        newHighlightedNodes.add(parentId);
        newHighlightedLinks.add(edgeKey(currentId, parentId));
      }
      currentId = parentId;
    }

    const children = childrenById[targetId];
    if (children) {
      children.forEach((childId) => {
        newHighlightedNodes.add(childId);
        newHighlightedLinks.add(edgeKey(targetId, childId));
      });
    }

    highlightedNodes = newHighlightedNodes;
    highlightedLinks = newHighlightedLinks;
  }

  const parseNumber = (value, fallback) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  function getImageDimensions(node) {
    if (!node || !node.image) return null;
    const width = parseNumber(node.imageWidth, 80);
    const height = parseNumber(node.imageHeight, width);
    return {
      width,
      height,
    };
  }

  function ensureImageClipPath(nodeId, width, height, cornerRadius) {
    const clipId = `node-image-clip-${nodeId}`;
    let clipPath = imageClipCache.get(clipId);
    if (!clipPath) {
      clipPath = document.createElementNS(svgNS, "clipPath");
      clipPath.setAttribute("id", clipId);
      clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
      defs.appendChild(clipPath);
      imageClipCache.set(clipId, clipPath);
    }

    while (clipPath.firstChild) {
      clipPath.removeChild(clipPath.firstChild);
    }

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", (-width / 2).toString());
    rect.setAttribute("y", (-height / 2).toString());
    rect.setAttribute("width", width.toString());
    rect.setAttribute("height", height.toString());
    if (cornerRadius > 0) {
      rect.setAttribute("rx", cornerRadius.toString());
      rect.setAttribute("ry", cornerRadius.toString());
    }
    clipPath.appendChild(rect);

    return clipId;
  }

  function getNodePadding(node) {
    const imageDimensions = getImageDimensions(node);
    if (imageDimensions) {
      return Math.max(imageDimensions.width, imageDimensions.height) / 2;
    }

    switch (node.kind) {
      case "root":
        return 26;
      case "icon":
        return 22;
      case "doc":
        return 24;
      case "label":
        return 18;
      default:
        return 16;
    }
  }

  function showNodeDetail(nodeId) {
    const node = nodeById[nodeId];
    if (!node) return;
    updateHighlights(nodeId);
    activeNodeId = nodeId;

    const title = ""; // node.title || node.label || node.id;
    const isPanelContent = node.contentType === "panel";
    const isHtmlContent = node.contentType === "html";
    const isMarkdownContent = !isPanelContent && !isHtmlContent;
    const usePlainLayout = isPanelContent || isHtmlContent;
    detailPanel.classList.toggle("detail-panel--plain", usePlainLayout);
    detailPanel.classList.toggle("detail-panel--panel", isPanelContent);
    detailPanel.classList.toggle("detail-panel--html", isHtmlContent);
    detailPanel.classList.toggle("detail-panel--markdown", isMarkdownContent);
    detailTitle.textContent = usePlainLayout ? "" : title;

    if (isPanelContent) {
      const panelId = node.panelId || node.id;
      panelManager.loadPanel(panelId, node);
    } else {
      panelManager.clearPanel();
      if (isHtmlContent) {
        detailContent.innerHTML = node.content || "";
      } else {
        const fallbackMarkdown =
          typeof node.content === "string" && node.content.trim().length > 0 ? node.content : "";
        const renderMarkdown = (markdownText) => {
          const finalText =
            typeof markdownText === "string" && markdownText.length > 0
              ? markdownText
              : fallbackMarkdown;
          if (finalText) {
            detailContent.innerHTML = markdownToHtml(finalText);
          } else {
            detailContent.innerHTML =
              '<div class="panel-loading">Content coming soon. Add markdown text for this node.</div>';
          }
        };

        const markdownPath =
          typeof node.markdownFile === "string" && node.markdownFile.trim().length > 0
            ? node.markdownFile.trim()
            : null;

        if (markdownPath) {
          const cachedMarkdown = markdownCache.get(markdownPath);
          if (cachedMarkdown !== undefined) {
            renderMarkdown(cachedMarkdown);
          } else {
            const token = ++markdownLoadToken;
            detailContent.innerHTML = '<div class="panel-loading">Loading content…</div>';
            fetchOptionalText(markdownPath).then((text) => {
              if (token !== markdownLoadToken || activeNodeId !== node.id) {
                return;
              }
              const normalized = typeof text === "string" ? text : fallbackMarkdown;
              if (typeof text === "string") {
                markdownCache.set(markdownPath, text);
              }
              if (normalized) {
                renderMarkdown(normalized);
              } else {
                detailContent.innerHTML = `<div class="panel-error">Markdown file "${markdownPath}" could not be loaded.</div>`;
              }
            });
          }
        } else {
          renderMarkdown(fallbackMarkdown);
        }
      }
    }
  }

  function createNodeElement(node) {
    const g = document.createElementNS(svgNS, "g");
    g.classList.add("graph-node");
    g.dataset.nodeId = node.id;
    g.setAttribute("transform", `translate(${node.x},${node.y})`);
    const opensUrl = typeof node.url === "string" && node.url.trim().length > 0;

    let halfHeight = 0;

    const shapeGroup = document.createElementNS(svgNS, "g");
    const hasImage = typeof node.image === "string" && node.image.trim().length > 0;

    if (!hasImage) {
      // Random rotation for shapes (between -8 and 8 degrees)
      const randomRotation = (Math.random() - 0.5) * 16;
      shapeGroup.setAttribute("transform", `rotate(${randomRotation})`);
    }

    if (hasImage) {
      g.classList.add("node-with-image");
      const { width, height } = getImageDimensions(node);
      const cornerRadius = parseNumber(
        node.imageCornerRadius,
        Math.min(width, height) / 6
      );
      const borderWidth = parseNumber(node.imageBorderWidth, 2);
      const hasBorder = borderWidth > 0;
      const backgroundColor =
        node.imageBackgroundColor === undefined
          ? "#ffffff"
          : node.imageBackgroundColor || "transparent";
      const borderColor = node.imageBorderColor || "#111111";

      if (backgroundColor !== "transparent" || hasBorder) {
        const frame = document.createElementNS(svgNS, "rect");
        frame.setAttribute("x", (-width / 2).toString());
        frame.setAttribute("y", (-height / 2).toString());
        frame.setAttribute("width", width.toString());
        frame.setAttribute("height", height.toString());
        if (cornerRadius > 0) {
          frame.setAttribute("rx", cornerRadius.toString());
          frame.setAttribute("ry", cornerRadius.toString());
        }
        frame.setAttribute("fill", backgroundColor);
        frame.setAttribute("stroke", hasBorder ? borderColor : "none");
        if (hasBorder) {
          frame.setAttribute("stroke-width", borderWidth.toString());
        }
        frame.classList.add("node-image-frame");
        shapeGroup.appendChild(frame);
      }

      const image = document.createElementNS(svgNS, "image");
      image.setAttribute("x", (-width / 2).toString());
      image.setAttribute("y", (-height / 2).toString());
      image.setAttribute("width", width.toString());
      image.setAttribute("height", height.toString());
      image.classList.add("node-image");
      image.setAttribute("href", node.image);
      image.setAttributeNS(xlinkNS, "href", node.image);
      if (cornerRadius > 0) {
        const clipId = ensureImageClipPath(node.id, width, height, cornerRadius);
        image.setAttribute("clip-path", `url(#${clipId})`);
      }
      shapeGroup.appendChild(image);
      halfHeight = height / 2;
    } else if (node.kind === "root") {
      const r = 20;
      halfHeight = r;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", r);
      circle.classList.add("node-root-circle");
      g.classList.add("node-root");
      shapeGroup.appendChild(circle);
    } else if (node.kind === "icon") {
      const size = 28;
      halfHeight = size / 2;
      const poly = document.createElementNS(svgNS, "polygon");
      let points;

      if (node.orientation === "down") {
        points = `0,${size / 2} ${-size / 2},${-size / 2} ${size / 2},${-size / 2}`;
      } else {
        points = `0,${-size / 2} ${-size / 2},${size / 2} ${size / 2},${size / 2}`;
      }

      poly.setAttribute("points", points);
      poly.setAttribute("class", "icon-shape");
      poly.setAttribute("fill", node.color || "#ddd");
      shapeGroup.appendChild(poly);
    } else if (node.kind === "doc") {
      const w = 20;
      const h = 26;
      halfHeight = h / 2;

      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", -w / 2);
      rect.setAttribute("y", -h / 2);
      rect.setAttribute("width", w);
      rect.setAttribute("height", h);
      rect.setAttribute("rx", 2);
      rect.setAttribute("ry", 2);
      rect.setAttribute("class", "doc-rect");
      shapeGroup.appendChild(rect);

      const fold = document.createElementNS(svgNS, "polyline");
      fold.setAttribute(
        "points",
        `${0},${-h / 2} ${w / 2 - 3},${-h / 2} ${w / 2 - 3},${-h / 2 + 5}`
      );
      fold.setAttribute("class", "doc-fold");
      shapeGroup.appendChild(fold);

      const line1 = document.createElementNS(svgNS, "line");
      line1.setAttribute("x1", -w / 2 + 2);
      line1.setAttribute("y1", -2);
      line1.setAttribute("x2", w / 2 - 2);
      line1.setAttribute("y2", -2);
      line1.setAttribute("class", "doc-line");
      shapeGroup.appendChild(line1);

      const line2 = document.createElementNS(svgNS, "line");
      line2.setAttribute("x1", -w / 2 + 2);
      line2.setAttribute("y1", 1);
      line2.setAttribute("x2", w / 2 - 2);
      line2.setAttribute("y2", 1);
      line2.setAttribute("class", "doc-line");
      shapeGroup.appendChild(line2);

      const line3 = document.createElementNS(svgNS, "line");
      line3.setAttribute("x1", -w / 2 + 2);
      line3.setAttribute("y1", 4);
      line3.setAttribute("x2", w / 2 - 2);
      line3.setAttribute("y2", 4);
      line3.setAttribute("class", "doc-line");
      shapeGroup.appendChild(line3);
    } else if (node.kind === "label") {
      const r = typeof node.radius === "number" ? node.radius : 14;
      halfHeight = r;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", r);
      circle.setAttribute("class", "node-label-shape");
      // Remove border
      circle.style.stroke = "none";
      // Apply custom color if provided (use style to override CSS)
      if (node.color) {
        circle.style.fill = node.color;
      }
      shapeGroup.appendChild(circle);
    }

    g.appendChild(shapeGroup);
    g.style.opacity =
      highlightedNodes.size === 0 || highlightedNodes.has(node.id) ? "1" : "0.15";

    if (node.label && node.label.trim().length > 0) {
      const lines = wrapLabel(node.label);
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("class", "node-label");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "hanging");
      text.setAttribute("alignment-baseline", "hanging");

      const baseY = halfHeight + 24;
      const lineHeight = 18;

      lines.forEach((line, i) => {
        const tspan = document.createElementNS(svgNS, "tspan");
        tspan.setAttribute("x", 0);
        tspan.setAttribute("y", baseY + i * lineHeight);
        appendSuperscriptArrows(tspan, line, svgNS);
        text.appendChild(tspan);
      });

      g.appendChild(text);
    }

    g.addEventListener("click", (event) => {
      event.stopPropagation();
      if (opensUrl) {
        const target = node.openInNewTab === false ? "_self" : "_blank";
        const newWindow = window.open(node.url, target, "noopener,noreferrer");
        if (newWindow && target === "_blank") {
          newWindow.opener = null;
        }
      }
      showNodeDetail(node.id);
      revealNeighbors(node.id);
      centerNode(node.id);
    });

    return g;
  }

  function createLinkElement(sourceNode, targetNode) {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("class", "link");
    const key = edgeKey(sourceNode.id, targetNode.id);
    path.style.opacity =
      highlightedLinks.size === 0 || highlightedLinks.has(key) ? "1" : "0.15";

    const dx = targetNode.x - sourceNode.x;
    const dy = targetNode.y - sourceNode.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

    const startPadding = getNodePadding(sourceNode);
    const endPadding = getNodePadding(targetNode);

    const startX = sourceNode.x + (dx / distance) * startPadding;
    const startY = sourceNode.y + (dy / distance) * startPadding;
    const endX = targetNode.x - (dx / distance) * endPadding;
    const endY = targetNode.y - (dy / distance) * endPadding;

    // Create jittery path with random perturbations
    const segments = 8; // Number of segments for jitter
    const jitterAmount = 5; // Max pixels to jitter
    const points = [`M ${startX} ${startY}`];
    
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const x = startX + (endX - startX) * t + (Math.random() - 0.5) * jitterAmount;
      const y = startY + (endY - startY) * t + (Math.random() - 0.5) * jitterAmount;
      points.push(`L ${x} ${y}`);
    }
    
    points.push(`L ${endX} ${endY}`);
    path.setAttribute("d", points.join(" "));

    return path;
  }

  function renderGraph() {
    while (linkLayer.firstChild) {
      linkLayer.removeChild(linkLayer.firstChild);
    }
    while (nodeLayer.firstChild) {
      nodeLayer.removeChild(nodeLayer.firstChild);
    }

    graphData.links.forEach((link) => {
      const { source, target } = link;
      if (!visibleNodes.has(source) || !visibleNodes.has(target)) return;

      const sourceNode = nodeById[source];
      const targetNode = nodeById[target];
      if (!sourceNode || !targetNode) return;

      linkLayer.appendChild(createLinkElement(sourceNode, targetNode));
    });

    graphData.nodes.forEach((node) => {
      if (!visibleNodes.has(node.id)) return;
      nodeLayer.appendChild(createNodeElement(node));
    });

    if (!activeNodeId || !visibleNodes.has(activeNodeId)) {
      showNodeDetail("root");
    }
  }

  function revealNeighbors(nodeId) {
    const neighbors = adjacency[nodeId];
    if (!neighbors) return;
    neighbors.forEach((neighborId) => visibleNodes.add(neighborId));
    renderGraph();
  }

  showNodeDetail("root");
  revealNeighbors("root");

  const container = document.getElementById("graph-container");
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  const DOUBLE_TAP_DELAY = 350;
  const DOUBLE_TAP_DISTANCE = 30;

  function getDefaultGraphOffset() {
    const rootNode = nodeById["root"];
    if (rootNode) {
      const containerRect = container.getBoundingClientRect();
      return {
        x: containerRect.width / 2 - rootNode.x,
        y: containerRect.height / 2 - rootNode.y,
      };
    }

    if (graphData.nodes.length === 0) {
      return { x: 0, y: 0 };
    }

    const xValues = graphData.nodes.map((n) => n.x);
    const yValues = graphData.nodes.map((n) => n.y);
    const minX = Math.min(...xValues);
    const minY = Math.min(...yValues);
    const initialPadding = 40;

    return {
      x: initialPadding - minX,
      y: initialPadding - minY,
    };
  }

  function applyGraphOffset(offset) {
    currentX = offset.x;
    currentY = offset.y;
    rootGroup.setAttribute("transform", `translate(${currentX},${currentY})`);
  }

  applyGraphOffset(getDefaultGraphOffset());

  function centerNode(nodeId, duration = 600) {
    const node = nodeById[nodeId];
    if (!node) return;
    
    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    
    // Calculate target position to center the node
    const targetX = centerX - node.x;
    const targetY = centerY - node.y;
    
    // Animate from current position to target
    const startX = currentX;
    const startY = currentY;
    const startTime = performance.now();
    
    function animate(time) {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      currentX = startX + (targetX - startX) * easeProgress;
      currentY = startY + (targetY - startY) * easeProgress;
      
      rootGroup.setAttribute("transform", `translate(${currentX},${currentY})`);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }
    
    requestAnimationFrame(animate);
  }

  function resetGraphPosition({ animate = true } = {}) {
    if (animate && nodeById["root"]) {
      centerNode("root");
      return;
    }
    applyGraphOffset(getDefaultGraphOffset());
  }

  function handleDoubleTap(e) {
    if (e.pointerType !== "touch") {
      return false;
    }

    const now = performance.now();
    const timeDiff = now - lastTapTime;
    const distance = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);

    if (timeDiff > 0 && timeDiff < DOUBLE_TAP_DELAY && distance < DOUBLE_TAP_DISTANCE) {
      lastTapTime = 0;
      resetGraphPosition();
      return true;
    }

    lastTapTime = now;
    lastTapX = e.clientX;
    lastTapY = e.clientY;
    return false;
  }

  function pointerDown(e) {
    if (handleDoubleTap(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.pointerType !== "touch" && e.button !== 0) return;

    // Don't initiate panning when interacting with a node so that click events fire
    if (e.target.closest && e.target.closest(".graph-node")) {
      return;
    }

    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    container.setPointerCapture(e.pointerId);
    container.classList.add("dragging");
    e.preventDefault();
  }

  function pointerMove(e) {
    if (!isPanning) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    rootGroup.setAttribute(
      "transform",
      `translate(${currentX + dx},${currentY + dy})`
    );
  }

  function pointerUp(e) {
    if (!isPanning) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    currentX += dx;
    currentY += dy;
    isPanning = false;
    container.classList.remove("dragging");
    try {
      container.releasePointerCapture(e.pointerId);
    } catch (err) {
      // ignore
    }
  }

  container.addEventListener("pointerdown", pointerDown);
  container.addEventListener("pointermove", pointerMove);
  container.addEventListener("pointerup", pointerUp);
  container.addEventListener("pointercancel", pointerUp);
  container.addEventListener("dblclick", (event) => {
    event.preventDefault();
    resetGraphPosition();
  });
}
