(() => {
  const moveFooter = () => {
    const wrapper = document.querySelector(".wrapper");
    const header = wrapper?.querySelector(":scope > header");
    const footer = wrapper?.querySelector(":scope > footer");
    if (!wrapper || !header || !footer) return;

    // 用注释节点记录 footer 在窄屏正文流中的原始位置，切回窄屏时可精确放回。
    const marker = document.createComment("sidebar-footer-position");
    footer.before(marker);
    const wideSidebar = window.matchMedia("(min-width: 1250px)");

    const updatePosition = () => {
      // 宽屏把 footer 收入左侧栏；窄屏恢复为正文之后的全宽页脚。
      if (wideSidebar.matches) {
        header.appendChild(footer);
      } else {
        marker.after(footer);
      }
    };

    wideSidebar.addEventListener("change", updatePosition);
    updatePosition();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", moveFooter, { once: true });
  } else {
    moveFooter();
  }
})();
