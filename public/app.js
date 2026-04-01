function setAriaExpanded(control, isExpanded) {
  control.setAttribute("aria-expanded", isExpanded ? "true" : "false");
}

function setupRevealAnimations() {
  const revealNodes = document.querySelectorAll("[data-reveal]");
  if (!revealNodes.length) {
    return;
  }

  revealNodes.forEach((node, index) => {
    node.style.transitionDelay = `${Math.min(index * 70, 420)}ms`;
  });

  if (typeof IntersectionObserver !== "function") {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14 }
  );

  revealNodes.forEach((node) => observer.observe(node));
}

function setupHeroRotator() {
  const heroRotator = document.querySelector("[data-hero-rotator]");
  if (!heroRotator) {
    return;
  }

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

function setupDismissibleToggle(options) {
  const {
    toggle,
    container,
    openClass = "show",
    onOpen,
    onClose
  } = options;

  if (!toggle || !container) {
    return null;
  }

  const isOpen = () => container.classList.contains(openClass);
  setAriaExpanded(toggle, isOpen());

  const close = () => {
    if (!isOpen()) {
      return;
    }

    container.classList.remove(openClass);
    setAriaExpanded(toggle, false);

    if (typeof onClose === "function") {
      onClose();
    }
  };

  toggle.addEventListener("click", async (event) => {
    event.stopPropagation();

    if (isOpen()) {
      close();
      return;
    }

    container.classList.add(openClass);
    setAriaExpanded(toggle, true);

    if (typeof onOpen === "function") {
      await onOpen();
    }
  });

  document.addEventListener("click", (event) => {
    if (!container.contains(event.target) && !toggle.contains(event.target)) {
      close();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });

  return { close, isOpen };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString();
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
  }
  return response.json();
}

function renderNotificationList(notificationList, items) {
  if (!Array.isArray(items) || items.length === 0) {
    notificationList.innerHTML = '<p class="notification-empty">No recent notifications.</p>';
    return;
  }

  notificationList.innerHTML = items
    .slice(0, 10)
    .map((item) => {
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
    })
    .join("");
}

function setupNotificationCenter() {
  const notificationCenter = document.getElementById("notificationCenter");
  const notificationBell = document.getElementById("notificationBell");
  const notificationBadge = document.getElementById("notification-count");
  const notificationList = document.getElementById("notification-list");

  if (!notificationCenter || !notificationBell || !notificationBadge || !notificationList) {
    return;
  }

  const loadNotificationCount = async () => {
    try {
      const data = await fetchJson("/notifications/unread-count");
      const count = Number.parseInt(data && data.count, 10) || 0;

      if (count > 0) {
        notificationBadge.style.display = "inline-block";
        notificationBadge.textContent = String(count);
        return;
      }

      notificationBadge.style.display = "none";
      notificationBadge.textContent = "0";
    } catch (error) {
      // Silent fail: polling should never block UI interactions.
    }
  };

  const loadNotificationPreview = async () => {
    try {
      const data = await fetchJson("/notifications?limit=10");
      renderNotificationList(notificationList, data);
    } catch (error) {
      renderNotificationList(notificationList, []);
    }
  };

  setupDismissibleToggle({
    toggle: notificationBell,
    container: notificationCenter,
    openClass: "is-open",
    onOpen: async () => {
      await loadNotificationPreview();
      await loadNotificationCount();
    }
  });

  loadNotificationCount();
  window.setInterval(loadNotificationCount, 30000);
}

function setupMenuDropdown() {
  const menuBtn = document.getElementById("menu-toggle");
  const dropdown = document.querySelector(".dropdown-menu");

  setupDismissibleToggle({
    toggle: menuBtn,
    container: dropdown
  });
}

function setupNavMenu() {
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  const controls = setupDismissibleToggle({
    toggle: navToggle,
    container: navLinks
  });

  if (!navLinks || !controls) {
    return;
  }

  navLinks.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      controls.close();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      controls.close();
    }
  });
}

function setupCardNavigation() {
  const nurseCards = document.querySelectorAll("[data-card-url]");
  if (!nurseCards.length) {
    return;
  }

  const isCardActionTarget = (target) => Boolean(
    target && target.closest("[data-card-action], a, button, form, input, select, textarea, label")
  );

  const openCardUrl = (card) => {
    const nextUrl = String(card.getAttribute("data-card-url") || "").trim();
    if (!nextUrl) {
      return;
    }

    const target = String(card.getAttribute("data-card-target") || "").trim().toLowerCase();
    if (target === "_blank") {
      window.open(nextUrl, "_blank", "noopener,noreferrer");
      return;
    }

    window.location.href = nextUrl;
  };

  nurseCards.forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.defaultPrevented || isCardActionTarget(event.target)) {
        return;
      }

      openCardUrl(card);
    });

    card.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key) || isCardActionTarget(event.target)) {
        return;
      }

      event.preventDefault();
      openCardUrl(card);
    });
  });
}

function setupShareButtons() {
  const shareButtons = document.querySelectorAll("[data-share-url]");
  if (!shareButtons.length) {
    return;
  }

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
          if (error && error.name === "AbortError") {
            return;
          }
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

function setupDownloadButtons() {
  const downloadButtons = document.querySelectorAll("[data-download-card]");
  if (!downloadButtons.length) {
    return;
  }

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
      if (!card) {
        return;
      }
      const captureTarget = card.querySelector("[data-card-capture]") || card;

      try {
        button.disabled = true;
        const htmlToImage = await loadHtmlToImage();
        const dataUrl = await htmlToImage.toPng(captureTarget, {
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Service worker is optional for this pilot build.
    });
  });
}

setupRevealAnimations();
setupHeroRotator();
setupMenuDropdown();
setupNotificationCenter();
setupNavMenu();
setupCardNavigation();
setupShareButtons();
setupDownloadButtons();
