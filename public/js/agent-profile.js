(function () {
  const shell = document.querySelector("[data-agent-profile]");
  const form = document.getElementById("agentProfileForm");
  const shareButton = document.querySelector("[data-agent-share]");
  const toggleButton = document.getElementById("agentProfileEditToggle");
  const cancelButton = document.getElementById("agentProfileCancelBtn");
  const saveButton = document.getElementById("agentProfileSaveBtn");

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
          window.alert("Profile link copied.");
          return;
        } catch (error) {
          // Fall through to prompt.
        }
      }

      window.prompt("Copy this profile link:", shareUrl);
    });
  }

  if (!shell || !form) {
    return;
  }

  const textInputs = Array.from(form.querySelectorAll("input:not([type='file'])"));
  const fileInputs = Array.from(form.querySelectorAll("input[type='file']"));
  const triggers = Array.from(form.querySelectorAll("[data-file-trigger]"));
  const avatarImages = Array.from(document.querySelectorAll("[data-agent-avatar]"));
  const statusNodes = Array.from(form.querySelectorAll("[data-file-name]"));
  const snapshot = new Map(textInputs.map((input) => [input.name, input.value]));
  const previewState = {};
  const objectUrls = {};

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

  const renderPreview = (key, type, src) => {
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
      return;
    }

    const emptyState = document.createElement("div");
    emptyState.className = "agent-upload-preview__empty";
    emptyState.innerHTML = "<strong>No document uploaded</strong><span>Your Aadhaar or ID file preview will appear here.</span>";
    previewShell.appendChild(emptyState);
  };

  const resetPreview = (key) => {
    revokeObjectUrl(key);
    const initialState = previewState[key] || { type: "empty", src: "" };
    renderPreview(key, initialState.type, initialState.src);
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const inputId = trigger.getAttribute("data-file-trigger");
      const input = inputId ? document.getElementById(inputId) : null;
      if (input) {
        input.click();
      }
    });
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
        return;
      }

      if (statusNode) {
        statusNode.textContent = file.name;
      }

      const objectUrl = URL.createObjectURL(file);
      objectUrls[key] = objectUrl;

      if (file.type.startsWith("image/")) {
        renderPreview(key, "image", objectUrl);
        return;
      }

      if (file.type === "application/pdf") {
        renderPreview(key, "pdf", objectUrl);
      }
    });
  });

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      shell.classList.toggle("is-editing");
      const isEditing = shell.classList.contains("is-editing");
      toggleButton.textContent = isEditing ? "Editing Profile" : "Edit Profile";
      if (isEditing && textInputs[0]) {
        textInputs[0].focus();
      }
    });
  }

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
      shell.classList.remove("is-editing");
      if (toggleButton) {
        toggleButton.textContent = "Edit Profile";
      }
    });
  }

  form.addEventListener("submit", () => {
    if (!saveButton) return;
    saveButton.disabled = true;
    saveButton.classList.add("is-loading");
  });
})();
