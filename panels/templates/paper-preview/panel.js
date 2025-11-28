const linkEl = container.querySelector(".paper-panel__preview");
const imageEl = container.querySelector(".paper-panel__image");
const actionsEl = container.querySelector(".paper-panel__actions");
const downloadEl = container.querySelector(".paper-panel__action--download");

const node = (context && context.node) || {};
const panelId = context && context.panelId ? context.panelId : "panel";
const config = node.panelData || {};

const fallbackImage = `panels/${panelId}/paper.webp`;
const fallbackPdf = `panels/${panelId}/paper.pdf`;

const previewSrc = config.image || config.previewImage || fallbackImage;
const linkHref = config.link || config.href || config.url || fallbackPdf;
const downloadHref = config.download || config.pdf || linkHref;
const openInNewTab = config.openInNewTab !== false;

if (imageEl) {
  imageEl.src = previewSrc;
  const altText =
    config.alt ||
    config.imageAlt ||
    node.title ||
    node.label ||
    "Paper preview thumbnail";
  imageEl.alt = altText;
}

if (linkEl) {
  if (linkHref) {
    linkEl.href = linkHref;
    if (openInNewTab) {
      linkEl.target = "_blank";
      linkEl.rel = "noopener noreferrer";
    } else {
      linkEl.target = "_self";
      linkEl.removeAttribute("rel");
    }
  } else {
    linkEl.removeAttribute("href");
    linkEl.classList.add("paper-panel__preview--disabled");
  }
}

if (actionsEl && downloadEl) {
  if (downloadHref) {
    actionsEl.hidden = false;
    downloadEl.href = downloadHref;
    downloadEl.textContent = config.downloadLabel || "Download PDF";
    downloadEl.target = "_blank";
    downloadEl.rel = "noopener noreferrer";
  } else {
    actionsEl.hidden = true;
  }
}

return null;

