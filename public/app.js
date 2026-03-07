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
const notificationCenter = document.getElementById("notificationCenter");
const notificationBell = document.getElementById("notificationBell");
const notificationDropdown = document.getElementById("notificationDropdown");
const notificationBadge = document.getElementById("notification-count");
const notificationList = document.getElementById("notification-list");
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

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
