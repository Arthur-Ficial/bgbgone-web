/* ==========================================================================
   app.js — bgbgone.franzai.com
   --------------------------------------------------------------------------
   Vanilla JS. No framework. No build step. Concerns:
     - nav scroll state
     - copy-to-clipboard buttons (every [data-copy])
     - algorithm tabs in the Examples section
   ========================================================================== */
(() => {
  "use strict";

  // ----- nav scroll state -----
  const nav = document.getElementById("nav");
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 12) nav.classList.add("scrolled");
      else nav.classList.remove("scrolled");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ----- copy-to-clipboard -----
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // fallback: synthesize a textarea
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (_) {}
        document.body.removeChild(ta);
      }
      const label = btn.querySelector(".copy-label");
      const prev = label ? label.textContent : "";
      btn.classList.add("copied");
      if (label) label.textContent = "Copied!";
      setTimeout(() => {
        btn.classList.remove("copied");
        if (label) label.textContent = prev || "Copy";
      }, 1500);
    });
  });

  // ----- algorithm tabs -----
  const algoTabs = document.querySelectorAll(".algo-tab");
  const algoCmd = document.getElementById("algo-cmd");
  const algoComments = {
    "auto":     "# public foreground-instance mask (default)",
    "vn-mask":  "# VNGenerateForegroundInstanceMaskRequest (macOS 14+)",
    "person":   "# VNGeneratePersonSegmentationRequest (macOS 12+)",
    "saliency": "# VNGenerateObjectnessBasedSaliencyImageRequest"
  };
  algoTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      algoTabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const algo = tab.getAttribute("data-algo");
      if (algoCmd && algo) {
        algoCmd.innerHTML =
          '<span class="c-prompt">$</span> ' +
          '<span class="c-cmd">bgbgone in.jpg --algo ' + algo + '</span>' +
          '       <span class="c-comment">' + (algoComments[algo] || "") + '</span>';
      }
    });
  });

})();
