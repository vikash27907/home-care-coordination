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

const menuBtn = document.getElementById("menu-toggle");
const dropdown = document.querySelector(".dropdown-menu");
const notificationCenter = document.getElementById("notificationCenter");
const notificationBell = document.getElementById("notificationBell");
const notificationDropdown = document.getElementById("notificationDropdown");
const notificationBadge = document.getElementById("notification-count");
const notificationList = document.getElementById("notification-list");
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

if (menuBtn && dropdown) {
  const setExpanded = (isExpanded) => {
    menuBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  };

  const closeDropdown = () => {
    dropdown.classList.remove("show");
    setExpanded(false);
  };

  menuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = dropdown.classList.toggle("show");
    setExpanded(isOpen);
  });

  document.addEventListener("click", (event) => {
    if (!dropdown.contains(event.target) && !menuBtn.contains(event.target)) {
      closeDropdown();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDropdown();
    }
  });
}

if (notificationCenter && notificationBell && notificationDropdown && notificationBadge && notificationList) {
  const setBellExpanded = (isExpanded) => {
    notificationBell.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  };

  const closeNotificationDropdown = () => {
    notificationCenter.classList.remove("is-open");
    setBellExpanded(false);
  };

  const formatTimestamp = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  };

  const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const renderNotificationList = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      notificationList.innerHTML = '<p class="notification-empty">No recent notifications.</p>';
      return;
    }

    notificationList.innerHTML = items.slice(0, 10).map((item) => {
      const unreadClass = item.is_read ? "" : " unread";
      const safeTitle = escapeHtml(item.title || "Notification");
      const safeMessage = escapeHtml(item.message || "");
      const safeTime = escapeHtml(formatTimestamp(item.created_at));
      return `
        <a class="notification-item${unreadClass}" href="/notifications-page">
          <p class="notification-item-title">${safeTitle}</p>
          <p class="notification-item-message">${safeMessage}</p>
          <div class="notification-item-time">${safeTime}</div>
        </a>
      `;
    }).join("");
  };

  const loadNotificationCount = async () => {
    try {
      const res = await fetch("/notifications/unread-count", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      const count = Number.parseInt(data && data.count, 10) || 0;
      if (count > 0) {
        notificationBadge.style.display = "inline-block";
        notificationBadge.textContent = String(count);
      } else {
        notificationBadge.style.display = "none";
        notificationBadge.textContent = "0";
      }
    } catch (error) {
      // Silent fail: polling should never block UI interactions.
    }
  };

  const loadNotificationPreview = async () => {
    try {
      const res = await fetch("/notifications?limit=10", { credentials: "same-origin" });
      if (!res.ok) {
        renderNotificationList([]);
        return;
      }
      const data = await res.json();
      renderNotificationList(data);
    } catch (error) {
      renderNotificationList([]);
    }
  };

  notificationBell.addEventListener("click", async (event) => {
    event.stopPropagation();
    const isOpen = notificationCenter.classList.toggle("is-open");
    setBellExpanded(isOpen);
    if (isOpen) {
      await loadNotificationPreview();
      await loadNotificationCount();
    }
  });

  document.addEventListener("click", (event) => {
    if (!notificationCenter.contains(event.target)) {
      closeNotificationDropdown();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeNotificationDropdown();
    }
  });

  loadNotificationCount();
  window.setInterval(loadNotificationCount, 30000);
}

if (navToggle && navLinks) {
  const setMenuExpanded = (isExpanded) => {
    navToggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  };

  const closeMenu = () => {
    navLinks.classList.remove("show");
    setMenuExpanded(false);
  };

  navToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = navLinks.classList.toggle("show");
    setMenuExpanded(isOpen);
  });

  navLinks.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      closeMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (!navLinks.contains(event.target) && !navToggle.contains(event.target)) {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeMenu();
    }
  });
}


const nurseCards = document.querySelectorAll("[data-card-url]");
if (nurseCards.length) {
  const isCardActionTarget = (target) => Boolean(
    target && target.closest("[data-card-action], a, button, form, input, select, textarea, label")
  );

  const openCardUrl = (card) => {
    const nextUrl = String(card.getAttribute("data-card-url") || "").trim();
    if (nextUrl) {
      const target = String(card.getAttribute("data-card-target") || "").trim().toLowerCase();
      if (target === "_blank") {
        window.open(nextUrl, "_blank", "noopener,noreferrer");
        return;
      }
      window.location.href = nextUrl;
    }
  };

  nurseCards.forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.defaultPrevented || isCardActionTarget(event.target)) return;
      openCardUrl(card);
    });

    card.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key) || isCardActionTarget(event.target)) return;
      event.preventDefault();
      openCardUrl(card);
    });
  });
}

const shareButtons = document.querySelectorAll("[data-share-url]");
if (shareButtons.length) {
  const resolveAbsoluteUrl = (value) => {
    try {
      return new URL(String(value || "").trim(), window.location.origin).toString();
    } catch (error) {
      return window.location.href;
    }
  };

  shareButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const shareUrl = resolveAbsoluteUrl(button.getAttribute("data-share-url"));
      const shareTitle = String(button.getAttribute("data-share-title") || "Nurse Profile").trim();

      if (navigator.share) {
        try {
          await navigator.share({
            title: shareTitle,
            url: shareUrl
          });
          return;
        } catch (error) {
          if (error && error.name === "AbortError") return;
        }
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          alert("Profile link copied!");
          return;
        } catch (error) {
          // Fall through to manual copy prompt.
        }
      }

      window.prompt("Copy this profile link:", shareUrl);
    });
  });
}

const downloadButtons = document.querySelectorAll("[data-download-card]");
if (downloadButtons.length) {
  let htmlToImageLoader = null;

  const loadHtmlToImage = () => {
    if (window.htmlToImage) {
      return Promise.resolve(window.htmlToImage);
    }
    if (htmlToImageLoader) {
      return htmlToImageLoader;
    }

    htmlToImageLoader = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-html-to-image-loader="true"]');
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.htmlToImage));
        existingScript.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = "/vendor/html-to-image.js";
      script.async = true;
      script.dataset.htmlToImageLoader = "true";
      script.onload = () => {
        if (window.htmlToImage) {
          resolve(window.htmlToImage);
          return;
        }
        reject(new Error("html-to-image failed to load."));
      };
      script.onerror = () => reject(new Error("Unable to load download helper."));
      document.head.appendChild(script);
    });

    return htmlToImageLoader;
  };

  downloadButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const card = button.closest("[data-nurse-card]");
      if (!card) return;

      try {
        button.disabled = true;
        const htmlToImage = await loadHtmlToImage();
        const dataUrl = await htmlToImage.toPng(card, {
          cacheBust: true,
          pixelRatio: Math.max(window.devicePixelRatio || 1, 2)
        });
        const fileName = String(card.getAttribute("data-card-file-name") || "nurse-card.png").trim();
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (error) {
        alert("Unable to download card right now.");
      } finally {
        button.disabled = false;
      }
    });
  });
}
