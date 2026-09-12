document.addEventListener("DOMContentLoaded", () => {
  const bannerHeight = 60;
  const mapSelector = 'iframe[src*="google.com/maps"]';

  document.querySelectorAll(mapSelector).forEach((frame) => {
    if (frame.parentElement?.classList.contains("map-embed-crop")) return;

    const visibleHeight = Number.parseInt(frame.getAttribute("height"), 10);
    if (!Number.isFinite(visibleHeight) || visibleHeight <= bannerHeight) return;

    const crop = document.createElement("div");
    crop.className = "map-embed-crop";
    crop.style.setProperty("--map-visible-height", `${visibleHeight}px`);
    crop.style.setProperty("--map-banner-height", `${bannerHeight}px`);
    frame.parentNode?.insertBefore(crop, frame);
    crop.appendChild(frame);
  });
});
