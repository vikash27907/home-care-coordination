document.querySelectorAll(".btn-secondary").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Agent Profile",
          url: window.location.href
        });
      } catch (error) {
        // User cancelled share dialog.
      }
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        alert("Profile link copied!");
      } catch (error) {
        alert("Unable to copy link automatically.");
      }
      return;
    }

    alert("Copy this link: " + window.location.href);
  });
});
