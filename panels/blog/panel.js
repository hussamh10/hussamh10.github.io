const DESIGN_WIDTH = 1440;
const DESIGN_HEIGHT = 810;

function createBlogPanelScaler(frame, scaled) {
  if (!frame || !scaled) return () => {};

  const applyScale = () => {
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const scaleX = rect.width / DESIGN_WIDTH;
    const scaleY = rect.height / DESIGN_HEIGHT;
    const scale = Math.min(scaleX, scaleY, 1);

    const scaledWidth = DESIGN_WIDTH * scale;
    const scaledHeight = DESIGN_HEIGHT * scale;
    const offsetX = (rect.width - scaledWidth) / 2;
    const offsetY = (rect.height - scaledHeight) / 2;

    scaled.style.transform = `scale(${scale})`;
    scaled.style.left = `${offsetX}px`;
    scaled.style.top = `${offsetY}px`;
  };

  applyScale();

  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(applyScale) : null;
  if (resizeObserver) {
    resizeObserver.observe(frame);
  }

  window.addEventListener("resize", applyScale);

  return () => {
    window.removeEventListener("resize", applyScale);
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  };
}

const frame = container.querySelector(".blog-panel__frame");
const scaled = container.querySelector(".blog-panel__scaled");

if (frame && scaled) {
  const cleanup = createBlogPanelScaler(frame, scaled);
  return () => cleanup();
}

return () => {};












