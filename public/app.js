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

const heroRotator = document.querySelector("[data-hero-rotator]");
if (heroRotator) {
  const items = Array.from(heroRotator.querySelectorAll("[data-rotator-item]"));
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let activeIndex = 0;

  const activateItem = (index) => {
    items.forEach((item, itemIndex) => {
      item.classList.toggle("is-active", itemIndex === index);
    });
  };

  if (items.length > 0) {
    activateItem(activeIndex);
  }

  if (items.length > 1 && !prefersReducedMotion) {
    window.setInterval(() => {
      activeIndex = (activeIndex + 1) % items.length;
      activateItem(activeIndex);
    }, 4500);
  }
}

const navProfile = document.querySelector(".nav-profile");
const navAvatar = document.getElementById("navAvatar");
const navDropdown = document.getElementById("navDropdown");

if (navProfile && navAvatar && navDropdown) {
  const setExpanded = (isExpanded) => {
    navAvatar.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  };

  const closeDropdown = () => {
    navProfile.classList.remove("is-open");
    setExpanded(false);
  };

  const toggleDropdown = () => {
    const isOpen = navProfile.classList.toggle("is-open");
    setExpanded(isOpen);
  };

  navAvatar.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDropdown();
  });

  navAvatar.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleDropdown();
    }
  });

  document.addEventListener("click", (event) => {
    if (!navProfile.contains(event.target)) {
      closeDropdown();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDropdown();
    }
  });
}
