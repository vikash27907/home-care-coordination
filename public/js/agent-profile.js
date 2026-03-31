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

  const inputs = Array.from(form.querySelectorAll("input"));
  const snapshot = new Map(inputs.map((input) => [input.name, input.value]));

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      shell.classList.toggle("is-editing");
      const isEditing = shell.classList.contains("is-editing");
      toggleButton.textContent = isEditing ? "Editing Profile" : "Edit Profile";
      if (isEditing && inputs[0]) {
        inputs[0].focus();
      }
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      inputs.forEach((input) => {
        if (snapshot.has(input.name)) {
          input.value = snapshot.get(input.name);
        }
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
