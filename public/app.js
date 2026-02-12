if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Service worker is optional for this pilot build.
    });
  });
}

const revealNodes = document.querySelectorAll("[data-reveal]");
if (revealNodes.length) {
  revealNodes.forEach((node, index) => {
    node.style.transitionDelay = `${Math.min(index * 70, 420)}ms`;
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );

  revealNodes.forEach((node) => observer.observe(node));
}
