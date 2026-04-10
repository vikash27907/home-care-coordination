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

function setupImagePreview() {
  const modal = document.getElementById("imagePreviewModal");
  const previewImage = document.getElementById("previewImage");

  const setOpenState = (isOpen) => {
    if (!modal) {
      return;
    }

    modal.classList.toggle("is-open", Boolean(isOpen));
    modal.setAttribute("aria-hidden", isOpen ? "false" : "true");

    if (isOpen) {
      if (!modal.dataset.previousOverflow) {
        modal.dataset.previousOverflow = document.body.style.overflow || "";
      }
      document.body.style.overflow = "hidden";
      return;
    }

    document.body.style.overflow = modal.dataset.previousOverflow || "";
    delete modal.dataset.previousOverflow;

    if (previewImage) {
      previewImage.removeAttribute("src");
      previewImage.alt = "Preview";
    }
  };

  window.openImagePreview = (src, label) => {
    const imageUrl = String(src || "").trim();
    if (!imageUrl || !modal || !previewImage) {
      return false;
    }

    previewImage.onerror = function handlePreviewError() {
      console.error("Failed to load preview image:", this.currentSrc || this.src);
      this.onerror = null;
      setOpenState(false);
    };
    previewImage.src = imageUrl;
    previewImage.alt = String(label || "Preview").trim() || "Preview";
    setOpenState(true);
    return false;
  };

  window.closeImagePreview = () => {
    setOpenState(false);
    return false;
  };

  if (!modal || !previewImage) {
    return;
  }

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      setOpenState(false);
    }
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element
      ? event.target.closest("[data-preview-image]")
      : null;

    if (!trigger) {
      return;
    }

    const src = String(trigger.getAttribute("data-preview-image") || "").trim();
    if (!src) {
      return;
    }

    const label = String(
      trigger.getAttribute("data-preview-label")
      || trigger.getAttribute("alt")
      || "Preview"
    ).trim();

    event.preventDefault();
    window.openImagePreview(src, label);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      setOpenState(false);
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const active = document.activeElement instanceof Element
      ? document.activeElement.closest("[data-preview-image]")
      : null;

    if (!active) {
      return;
    }

    const src = String(active.getAttribute("data-preview-image") || "").trim();
    if (!src) {
      return;
    }

    const label = String(
      active.getAttribute("data-preview-label")
      || active.getAttribute("alt")
      || "Preview"
    ).trim();

    event.preventDefault();
    window.openImagePreview(src, label);
  });
}

window.openProfile = function (slug) {
  window.location.href = `/nurse/${slug}`;
};

window.requestNurse = function (nurse) {
  const message = `Hello Prisha Home Care,

I want to request nurse:

Name: ${nurse.name}
Experience: ${nurse.experience}
Qualification: ${nurse.qualification}
City: ${nurse.city}

Profile: https://prishahomecare.com/nurse/${nurse.slug}`;

  const url = `https://wa.me/919138913355?text=${encodeURIComponent(message)}`;

  window.open(url, "_blank");
};

window.triggerQualificationUpload = (index) => {
  const input = document.getElementById(`qualInput_${index}`);
  if (!(input instanceof HTMLInputElement)) {
    console.error("Qualification input not found:", index);
    return;
  }

  input.value = "";
  input.click();
};

window.submitQualification = (input) => {
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  if (!input.files || !input.files[0]) {
    return;
  }

  const form = document.getElementById("assetUploadForm");
  if (!(form instanceof HTMLFormElement)) {
    console.error("Upload form not found");
    return;
  }

  const nameField = form.querySelector('[name="qualificationName"]');
  if (nameField instanceof HTMLInputElement) {
    nameField.value = String(input.dataset.name || "").trim();
  }

  form.submit();
};

async function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const environment = document.body && document.body.dataset
    ? document.body.dataset.env
    : "development";
  const assetVersion = document.body && document.body.dataset
    ? document.body.dataset.assetVersion
    : "1";

  if (environment !== "production") {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    }
    return;
  }

  const registration = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(assetVersion)}`);

  if (registration.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (window.__prishaSwReloaded) {
      return;
    }

    window.__prishaSwReloaded = true;
    window.location.reload();
  });

  await registration.update();
}

window.addEventListener("load", () => {
  setupServiceWorker().catch(() => {
    // Service worker stays optional and should never block the app.
  });
});

setupRevealAnimations();
setupHeroRotator();
setupMenuDropdown();
setupNotificationCenter();
setupNavMenu();
setupImagePreview();
