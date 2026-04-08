(function agentDashboardController() {
  const dashboard = document.querySelector("[data-agent-dashboard]");

  function ensureToastRoot() {
    let root = document.querySelector("[data-agent-toast-root]");
    if (root) return root;

    root = document.createElement("div");
    root.setAttribute("data-agent-toast-root", "");
    root.style.position = "fixed";
    root.style.right = "16px";
    root.style.bottom = "16px";
    root.style.zIndex = "1200";
    root.style.display = "grid";
    root.style.gap = "10px";
    root.style.maxWidth = "min(360px, calc(100vw - 24px))";
    document.body.appendChild(root);
    return root;
  }

  function showToast(message, type) {
    if (!message) return;

    const root = ensureToastRoot();
    const toast = document.createElement("div");
    const palette = {
      success: {
        background: "rgba(22, 101, 52, 0.96)",
        border: "rgba(22, 101, 52, 0.98)"
      },
      error: {
        background: "rgba(185, 28, 28, 0.96)",
        border: "rgba(185, 28, 28, 0.98)"
      },
      info: {
        background: "rgba(15, 95, 168, 0.96)",
        border: "rgba(15, 95, 168, 0.98)"
      }
    };
    const theme = palette[type] || palette.info;

    toast.textContent = message;
    toast.style.padding = "0.9rem 1rem";
    toast.style.borderRadius = "18px";
    toast.style.color = "#fff";
    toast.style.fontWeight = "700";
    toast.style.lineHeight = "1.45";
    toast.style.background = theme.background;
    toast.style.border = `1px solid ${theme.border}`;
    toast.style.boxShadow = "0 18px 36px rgba(15, 42, 71, 0.2)";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px)";
    toast.style.transition = "opacity 180ms ease, transform 180ms ease";
    root.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      window.setTimeout(() => {
        toast.remove();
      }, 180);
    }, 3200);
  }

  function hideFlashIntoToast() {
    const flash = document.querySelector(".flash");
    if (!flash) return;

    const message = flash.textContent.trim();
    const type = flash.classList.contains("error")
      ? "error"
      : (flash.classList.contains("success") ? "success" : "info");

    if (message) {
      showToast(message, type);
    }

    flash.hidden = true;
  }

  function resolveAbsoluteUrl(value) {
    const href = String(value || "").trim();
    if (!href) return "";

    try {
      return new URL(href, window.location.origin).toString();
    } catch (error) {
      return "";
    }
  }

  function buildShareMessage(intro, name, url) {
    return [
      String(intro || "This is my profile").trim() || "This is my profile",
      String(name || "Nurse").trim() || "Nurse",
      String(url || "").trim()
    ].filter(Boolean).join("\n");
  }

  function openWhatsAppShare(message) {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    const popup = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    if (!popup) {
      window.location.href = whatsappUrl;
    }
  }

  function getCardNode(cardId) {
    const id = String(cardId || "").trim();
    return id ? document.getElementById(id) : null;
  }

  function getCardFileName(card) {
    const fallback = "nurse-card.png";
    return String((card && card.getAttribute("data-card-file-name")) || fallback).trim() || fallback;
  }

  async function exportCardBlob(card) {
    if (!card || typeof htmlToImage === "undefined") {
      throw new Error("Card export is unavailable.");
    }

    const blob = await htmlToImage.toBlob(card, {
      cacheBust: true,
      backgroundColor: "#ffffff",
      pixelRatio: Math.max(window.devicePixelRatio || 1, 2)
    });

    if (!blob) {
      throw new Error("Card export failed.");
    }

    return blob;
  }

  function downloadBlob(blob, fileName) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  }

  function setBusyState(trigger, isBusy) {
    if (!trigger) return;

    if ("disabled" in trigger) {
      trigger.disabled = isBusy;
    }

    if (isBusy) {
      trigger.setAttribute("aria-busy", "true");
    } else {
      trigger.removeAttribute("aria-busy");
    }
  }

  async function shareCard(trigger) {
    const card = getCardNode(trigger.getAttribute("data-card-share"));
    const shareUrl = resolveAbsoluteUrl(trigger.getAttribute("data-share-url"));
    const shareName = String(trigger.getAttribute("data-share-name") || "Nurse").trim() || "Nurse";
    const shareIntro = String(trigger.getAttribute("data-share-intro") || "This is my profile").trim() || "This is my profile";

    if (!card) {
      showToast("Card preview is not available right now.", "error");
      return;
    }
    if (!shareUrl) {
      showToast("Public profile link is not available.", "error");
      return;
    }

    setBusyState(trigger, true);

    try {
      const blob = await exportCardBlob(card);
      const fileName = getCardFileName(card);
      const message = buildShareMessage(shareIntro, shareName, shareUrl);

      if (typeof File !== "undefined" && typeof navigator.share === "function") {
        const file = new File([blob], fileName, { type: "image/png" });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${shareName} | Nurse Card`,
            text: message
          });
          return;
        }
      }

      openWhatsAppShare(message);
      downloadBlob(blob, fileName);
      showToast("WhatsApp opened with the public link. The card image was downloaded because this browser cannot attach files directly.", "info");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      showToast("Unable to share the card image right now.", "error");
    } finally {
      setBusyState(trigger, false);
    }
  }

  async function downloadCard(trigger) {
    const card = getCardNode(trigger.getAttribute("data-card-download"));
    if (!card) {
      showToast("Card preview is not available right now.", "error");
      return;
    }

    setBusyState(trigger, true);

    try {
      const blob = await exportCardBlob(card);
      downloadBlob(blob, getCardFileName(card));
    } catch (error) {
      showToast("Unable to download the card image right now.", "error");
    } finally {
      setBusyState(trigger, false);
    }
  }

  function navigateCard(card) {
    const href = resolveAbsoluteUrl(card.getAttribute("data-card-url"));
    if (!href) return;

    const target = String(card.getAttribute("data-card-target") || "").trim().toLowerCase();
    if (target === "_blank") {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    window.location.href = href;
  }

  function isInteractiveChild(target) {
    return Boolean(target.closest("[data-card-action], a, button, input, select, textarea, form"));
  }

  function bindCardActions() {
    document.addEventListener("click", (event) => {
      const shareTrigger = event.target.closest("[data-card-share]");
      if (shareTrigger) {
        event.preventDefault();
        shareCard(shareTrigger);
        return;
      }

      const downloadTrigger = event.target.closest("[data-card-download]");
      if (downloadTrigger) {
        event.preventDefault();
        downloadCard(downloadTrigger);
        return;
      }

      const card = event.target.closest("[data-card-url]");
      if (!card || isInteractiveChild(event.target)) return;

      event.preventDefault();
      navigateCard(card);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;

      const card = event.target.closest("[data-card-url]");
      if (!card || isInteractiveChild(event.target)) return;

      event.preventDefault();
      navigateCard(card);
    });
  }

  function bindFormLoadingStates() {
    if (!dashboard) return;

    dashboard.querySelectorAll("form").forEach((form) => {
      form.addEventListener("submit", () => {
        const button = form.querySelector('button[type="submit"]');
        if (!button) return;
        button.disabled = true;

        if (button.classList.contains("btn")) {
          button.classList.add("is-loading");
        } else {
          button.style.opacity = "0.65";
        }

        if (button.classList.contains("agent-icon-button")) {
          button.setAttribute("aria-busy", "true");
        }
      });
    });
  }

  hideFlashIntoToast();
  bindCardActions();
  bindFormLoadingStates();

  window.NurseCardSharing = {
    showToast
  };
})();
