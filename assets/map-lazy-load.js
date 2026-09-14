document.addEventListener("DOMContentLoaded", () => {
  const lazyMaps = [...document.querySelectorAll("iframe[data-map-src]")].map(
    (frame) => {
      const panel = frame.parentElement;
      const source = frame.dataset.mapSrc;
      const template = frame.cloneNode(false);

      if (!panel || !source) return null;

      // 直接以既有的地图面板作为观察目标；不额外包一层 div，故不会裁切
      // Google Maps 的 banner，也不会改变 iframe 原有尺寸。
      panel.replaceChildren();
      panel.setAttribute("aria-busy", "true");
      return { panel, source, template };
    },
  ).filter(Boolean);

  const mountMap = ({ panel, source, template }) => {
    if (panel.firstElementChild) return;

    const frame = template.cloneNode(false);
    frame.src = source;
    frame.loading = "eager";
    panel.appendChild(frame);
    panel.setAttribute("aria-busy", "true");
    frame.addEventListener("load", () => panel.setAttribute("aria-busy", "false"), {
      once: true,
    });
  };

  const unmountMap = ({ panel }) => {
    if (!panel.firstElementChild) return;
    panel.replaceChildren();
    panel.setAttribute("aria-busy", "true");
  };

  if (!lazyMaps.length) return;

  if (!("IntersectionObserver" in window)) {
    lazyMaps.forEach(mountMap);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const map = lazyMaps.find(({ panel }) => panel === entry.target);
        if (!map) return;
        if (entry.isIntersecting) mountMap(map);
        else unmountMap(map);
      });
    },
    // 在地图进入视口前约 250px 就开始载入，避免滚动到地图时出现空白。
    { rootMargin: "250px 0px" },
  );

  lazyMaps.forEach(({ panel }) => observer.observe(panel));
});
