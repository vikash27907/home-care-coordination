(function agentProfileController() {
  const shell = document.querySelector("[data-agent-profile]");
  const form = document.getElementById("agentProfileForm");
  const shareButton = document.querySelector("[data-agent-share]");
  const toggleButton = document.getElementById("agentProfileEditToggle");
  const cancelButton = document.getElementById("agentProfileCancelBtn");
  const saveButton = document.getElementById("agentProfileSaveBtn");
  const editToggleButtons = Array.from(document.querySelectorAll("[data-edit-toggle]"));

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
    if (!flash) return null;

    const message = flash.textContent.trim();
    const type = flash.classList.contains("error")
      ? "error"
      : (flash.classList.contains("success") ? "success" : "info");

    if (message) {
      showToast(message, type);
    }

    flash.hidden = true;
    return type;
  }

  if (shareButton) {
    shareButton.addEventListener("click", async () => {
      const sharePath = String(shareButton.getAttribute("data-agent-share") || "").trim();
      const shareUrl = sharePath ? new URL(sharePath, window.location.origin).toString() : window.location.href;

      if (navigator.share) {
        try {
          await navigator.share({
            title: "Agent Profile",
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
          showToast("Profile link copied.", "success");
          return;
        } catch (error) {
          // Fall through to prompt.
        }
      }

      window.prompt("Copy this profile link:", shareUrl);
    });
  }

  if (!shell || !form) {
    hideFlashIntoToast();
    return;
  }

  const flashType = hideFlashIntoToast();
  const textInputs = Array.from(form.querySelectorAll("input:not([type='file'])"));
  const fileInputs = Array.from(form.querySelectorAll("input[type='file']"));
  const triggers = Array.from(document.querySelectorAll("[data-file-trigger]"));
  const avatarImages = Array.from(document.querySelectorAll("[data-agent-avatar]"));
  const statusNodes = Array.from(form.querySelectorAll("[data-file-name]"));
  const actionButtons = [toggleButton, cancelButton, saveButton].filter(Boolean);
  const snapshot = new Map(textInputs.map((input) => [input.name, input.value]));
  const previewState = {};
  const objectUrls = {};
  const initialEditing = flashType === "error";

  statusNodes.forEach((node) => {
    node.dataset.initialText = node.textContent;
  });

  form.querySelectorAll("[data-preview-shell]").forEach((previewShell) => {
    const key = previewShell.getAttribute("data-preview-shell");
    previewState[key] = {
      type: previewShell.getAttribute("data-preview-type") || "empty",
      src: previewShell.getAttribute("data-initial-src") || ""
    };
  });

  const revokeObjectUrl = (key) => {
    if (objectUrls[key]) {
      URL.revokeObjectURL(objectUrls[key]);
      delete objectUrls[key];
    }
  };

  const getStatusNode = (key) => form.querySelector(`[data-file-name="${key}"]`);
  const getPreviewShell = (key) => form.querySelector(`[data-preview-shell="${key}"]`);

  function renderPreview(key, type, src) {
    const previewShell = getPreviewShell(key);
    if (!previewShell) return;

    previewShell.innerHTML = "";

    if (type === "image" && src) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = key === "profileImage" ? "Selected profile image preview" : "Selected Aadhaar document preview";
      image.className = key === "profileImage"
        ? "agent-upload-preview__image"
        : "agent-upload-preview__image agent-upload-preview__image--document";
      previewShell.appendChild(image);

      const hint = document.createElement("span");
      hint.className = "agent-upload-preview__tap-hint";
      hint.textContent = "Tap to change";
      previewShell.appendChild(hint);

      if (key === "profileImage") {
        avatarImages.forEach((avatar) => {
          avatar.src = src;
        });
      }
      return;
    }

    if (type === "pdf" && src) {
      const frame = document.createElement("iframe");
      frame.src = src;
      frame.title = "Selected Aadhaar document preview";
      frame.className = "agent-upload-preview__frame";
      previewShell.appendChild(frame);

      const hint = document.createElement("span");
      hint.className = "agent-upload-preview__tap-hint";
      hint.textContent = "Tap to change";
      previewShell.appendChild(hint);
      return;
    }

    const emptyState = document.createElement("div");
    emptyState.className = "agent-upload-preview__empty";
    emptyState.innerHTML = "<strong>No document uploaded</strong><span>Your Aadhaar or ID file preview will appear here.</span>";
    previewShell.appendChild(emptyState);

    const hint = document.createElement("span");
    hint.className = "agent-upload-preview__tap-hint";
    hint.textContent = "Tap to change";
    previewShell.appendChild(hint);
  }

  function resetPreview(key) {
    revokeObjectUrl(key);
    const initialState = previewState[key] || { type: "empty", src: "" };
    renderPreview(key, initialState.type, initialState.src);
  }

  function updateDirtyState() {
    const hasTextChanges = textInputs.some((input) => snapshot.get(input.name) !== input.value);
    const hasFileChanges = fileInputs.some((input) => input.files && input.files.length > 0);
    shell.classList.toggle("has-unsaved-changes", hasTextChanges || hasFileChanges);
  }

  function setEditing(isEditing, options = {}) {
    shell.classList.toggle("is-editing", isEditing);
    form.classList.toggle("is-readonly", !isEditing);

    textInputs.forEach((input) => {
      input.readOnly = !isEditing;
    });

    fileInputs.forEach((input) => {
      input.disabled = !isEditing;
    });

    triggers.forEach((trigger) => {
      const fileTarget = trigger.getAttribute("data-file-trigger");
      if (!fileTarget) return;
      trigger.setAttribute("aria-disabled", String(!isEditing));
      if (trigger.tagName === "BUTTON" && !trigger.hasAttribute("data-agent-avatar-trigger")) {
        trigger.disabled = !isEditing;
      }
    });

    if (toggleButton) {
      toggleButton.innerHTML = isEditing
        ? '<span class="agent-profile__icon-inline"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg></span><span>Editing Profile</span>'
        : '<span class="agent-profile__icon-inline"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4l9.6-9.6a1.8 1.8 0 000-2.5l-1.5-1.5a1.8 1.8 0 00-2.5 0L4 16v4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12.5 7.5l4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span><span>Edit Profile</span>';
    }

    if (saveButton) {
      saveButton.disabled = !isEditing;
    }
    if (cancelButton) {
      cancelButton.disabled = !isEditing;
    }

    if (isEditing && options.focusFirst !== false && textInputs[0]) {
      textInputs[0].focus();
    }

    if (!isEditing) {
      shell.classList.remove("has-unsaved-changes");
    }
  }

  triggers.forEach((trigger) => {
    const openInput = (event) => {
      const inputId = trigger.getAttribute("data-file-trigger");
      const input = inputId ? document.getElementById(inputId) : null;
      if (!input) return;
      if (!shell.classList.contains("is-editing")) {
        setEditing(true);
      }
      event.preventDefault();
      event.stopPropagation();
      input.click();
    };

    trigger.addEventListener("click", openInput);

    if (trigger.getAttribute("role") === "button" || trigger.tagName !== "BUTTON") {
      trigger.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          openInput(event);
        }
      });
    }
  });

  fileInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.getAttribute("data-file-input");
      const statusNode = getStatusNode(key);
      const file = input.files && input.files[0] ? input.files[0] : null;

      revokeObjectUrl(key);

      if (!file) {
        if (statusNode) {
          statusNode.textContent = statusNode.dataset.initialText || "";
        }
        resetPreview(key);
        updateDirtyState();
        return;
      }

      if (statusNode) {
        statusNode.textContent = file.name;
      }

      const objectUrl = URL.createObjectURL(file);
      objectUrls[key] = objectUrl;

      if (file.type.startsWith("image/")) {
        renderPreview(key, "image", objectUrl);
      } else if (file.type === "application/pdf") {
        renderPreview(key, "pdf", objectUrl);
      }

      updateDirtyState();
      showToast("Preview updated. Save changes when ready.", "info");
    });
  });

  textInputs.forEach((input) => {
    input.addEventListener("input", updateDirtyState);
  });

  actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!shell.classList.contains("is-editing") && button === saveButton) {
        setEditing(true);
      }
    });
  });

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      const isEditing = shell.classList.contains("is-editing");
      setEditing(!isEditing);
    });
  }

  editToggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setEditing(true);
    });
  });

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      textInputs.forEach((input) => {
        if (snapshot.has(input.name)) {
          input.value = snapshot.get(input.name);
        }
      });
      fileInputs.forEach((input) => {
        input.value = "";
      });
      Object.keys(previewState).forEach((key) => {
        const statusNode = getStatusNode(key);
        if (statusNode) {
          statusNode.textContent = statusNode.dataset.initialText || "";
        }
        resetPreview(key);
      });
      setEditing(false, { focusFirst: false });
      updateDirtyState();
    });
  }

  form.addEventListener("submit", () => {
    if (!saveButton) return;
    saveButton.disabled = true;
    saveButton.classList.add("is-loading");
  });

  setEditing(initialEditing, { focusFirst: initialEditing });
  updateDirtyState();
})();
