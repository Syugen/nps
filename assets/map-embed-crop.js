document.addEventListener("DOMContentLoaded", () => {
  const bannerHeight = 62;
  const mapSelector = 'iframe[src*="google.com/maps"]';
  const lazyMapSelector = "iframe[data-map-src]";

  const wrapMap = (frame) => {
    const visibleHeight = Number.parseInt(frame.getAttribute("height"), 10);
    if (!Number.isFinite(visibleHeight) || visibleHeight <= bannerHeight) return null;

    const crop = document.createElement("div");
    crop.className = "map-embed-crop";
    crop.style.setProperty("--map-visible-height", `${visibleHeight}px`);
    crop.style.setProperty("--map-banner-height", `${bannerHeight}px`);
    frame.parentNode?.insertBefore(crop, frame);
    crop.appendChild(frame);
    return crop;
  };

  const lazyMaps = [...document.querySelectorAll(lazyMapSelector)]
    .map((frame) => {
      const crop = wrapMap(frame);
      if (!crop) return null;

      // Keep only an attribute template while off screen. Removing the real
      // iframe destroys its browsing context, so Google Maps can release RAM.
      const template = frame.cloneNode(false);
      const source = template.dataset.mapSrc;
      crop.replaceChildren();
      crop.classList.add("map-embed-placeholder");
      crop.setAttribute("aria-busy", "true");
      return { crop, source, template };
    })
    .filter(Boolean);

  const mountMap = ({ crop, source, template }) => {
    if (crop.firstElementChild || !source) return;

    const frame = template.cloneNode(false);
    frame.src = source;
    frame.loading = "eager";
    crop.replaceChildren(frame);
    crop.classList.remove("map-embed-placeholder");
    crop.setAttribute("aria-busy", "true");
    frame.addEventListener(
      "load",
      () => crop.setAttribute("aria-busy", "false"),
      { once: true },
    );
  };

  const unmountMap = ({ crop }) => {
    if (!crop.firstElementChild) return;

    crop.replaceChildren();
    crop.classList.add("map-embed-placeholder");
    crop.setAttribute("aria-busy", "true");
  };

  if (lazyMaps.length) {
    if (!("IntersectionObserver" in window)) {
      lazyMaps.forEach(mountMap);
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const map = lazyMaps.find(({ crop }) => crop === entry.target);
            if (!map) return;
            if (entry.isIntersecting) mountMap(map);
            else unmountMap(map);
          });
        },
        // Start a little before the map enters view to avoid a blank flash,
        // but keep only the nearby map iframe(s) alive.
        { rootMargin: "250px 0px" },
      );

      lazyMaps.forEach(({ crop }) => observer.observe(crop));
    }
  }

  document.querySelectorAll(mapSelector).forEach((frame) => {
    if (frame.parentElement?.classList.contains("map-embed-crop")) return;
    wrapMap(frame);
  });
});
