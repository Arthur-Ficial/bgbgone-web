/* ==========================================================================
   app.js — bgbgone.franzai.com
   --------------------------------------------------------------------------
   Vanilla JS. No framework. No build step. Concerns:
     - nav scroll state
     - copy-to-clipboard buttons (every [data-copy])
     - the live algorithm-switcher gallery (subject × algorithm)
   Every image the gallery shows is a real .cut.png already on disk; an
   algorithm button only exists when its file exists — nothing is faked.
   ========================================================================== */
(() => {
  "use strict";

  // Cache-busting for images this script builds at runtime. deploy.sh stamps
  // <html data-v="<hash>"> with a content hash of every deployed asset, so a
  // reload on any device always fetches the newest gallery cuts. Empty locally.
  const ASSET_V = document.documentElement.getAttribute("data-v");
  const V = ASSET_V ? "?v=" + ASSET_V : "";

  /* ----- nav scroll state ----- */
  const nav = document.getElementById("nav");
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 12) nav.classList.add("scrolled");
      else nav.classList.remove("scrolled");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ----- copy-to-clipboard ----- */
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
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

  /* ----- live algorithm-switcher gallery ----- */
  // id → { cli filename for the readout, real algorithm cuts on disk }
  // file = name shown in the CLI readout; algos = real cuts on disk;
  // w/h = the pair's real pixel size (src and every cut share it), used to
  // set the slider's aspect-ratio so before/after render at identical boxes.
  // def = the best algorithm for that subject — selected by default when the
  // subject is picked (a person → person segmentation; everything else → the
  // foreground-instance mask, "auto").
  const SUBJECTS = {
    "red-panda":           { file: "red-panda.jpg",    algos: ["auto", "saliency"],            def: "auto",   w: 1200, h: 795 },
    "corgi-puppy":         { file: "corgi-puppy.jpg",  algos: ["auto", "saliency"],            def: "auto",   w: 801,  h: 1200 },
    "woman-singer":        { file: "woman-singer.jpg", algos: ["auto", "person", "saliency"],  def: "person", w: 1200, h: 800 },
    "1984-mccandless-eva": { file: "astronaut.jpg",    algos: ["auto", "person", "saliency"],  def: "auto",   w: 1200, h: 1200 },
    "gallery-car":         { file: "car.jpg",          algos: ["auto", "saliency"],            def: "auto",   w: 1200, h: 900 },
    "gallery-plane":       { file: "plane.jpg",        algos: ["auto", "saliency"],            def: "auto",   w: 1200, h: 730 },
  };

  const subjectBtns = document.querySelectorAll(".subj");
  const algoBtns    = document.querySelectorAll(".algo");
  const slider      = document.getElementById("demo-slider");
  const beforeImg   = document.getElementById("demo-before");
  const afterImg    = document.getElementById("demo-after");
  const cli         = document.getElementById("demo-cli");

  if (subjectBtns.length && algoBtns.length && beforeImg && afterImg && cli) {
    let currentSubject = "red-panda";
    let currentAlgo    = "auto";

    const setCli = (file, algo) => {
      cli.innerHTML =
        '<span class="c-prompt">$</span> ' +
        '<span class="c-cmd">bgbgone ' + file + ' --algo ' + algo + '</span>';
    };

    const renderAlgo = () => {
      const meta = SUBJECTS[currentSubject];
      afterImg.src = "assets/pairs/" + currentSubject + "." + currentAlgo + ".cut.png" + V;
      afterImg.alt = "The same photograph with its background removed by bgbgone using the " +
        currentAlgo + " algorithm";
      setCli(meta.file, currentAlgo);
      algoBtns.forEach((b) => {
        const on = b.getAttribute("data-algo") === currentAlgo;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    };

    // Lock the slider box to the loaded image's REAL ratio. The before/after
    // pair are byte-for-byte the same dimensions, and object-fit:cover on a box
    // of that exact ratio fills both identically — so the two halves can never
    // drift out of alignment. We set it from the static map immediately (no
    // layout jump) and again from naturalWidth once the file decodes (so it is
    // correct even if the map and the file ever disagree).
    // Size the slider to the pair's real ratio. Landscape/square fill the
    // column width; tall PORTRAIT subjects (e.g. the corgi) are capped in
    // height and centred so they don't tower over the page or slide under the
    // sticky nav. Either way the box keeps the image's exact ratio, so
    // object-fit:cover never letterboxes and before == after, pixel for pixel.
    const sizeSlider = (w, h) => {
      if (!slider || !w || !h) return;
      slider.style.aspectRatio = w + " / " + h;
      if (h > w) {
        // Portrait: cap the height BUT never exceed the container width — so it
        // can't overflow and get clipped on a narrow/tall phone. Width is the
        // smaller of (100% of the column) and (capped-height × ratio); height
        // then follows from aspect-ratio, so before == after, no letterbox,
        // no crop, on every device.
        const ar = (w / h).toFixed(4);
        slider.style.width  = "min(100%, calc(min(70vh, 560px) * " + ar + "))";
        slider.style.height = "auto";
      } else {
        slider.style.width  = "100%";
        slider.style.height = "auto";
      }
    };

    const renderSubject = () => {
      const meta = SUBJECTS[currentSubject];
      if (meta.w && meta.h) sizeSlider(meta.w, meta.h);
      beforeImg.onload = () => sizeSlider(beforeImg.naturalWidth, beforeImg.naturalHeight);
      beforeImg.src = "assets/pairs/" + currentSubject + ".src.jpg" + V;
      if (beforeImg.complete) sizeSlider(beforeImg.naturalWidth, beforeImg.naturalHeight);
      // Only expose algorithm buttons that have a real cut on disk.
      algoBtns.forEach((b) => {
        const algo = b.getAttribute("data-algo");
        b.hidden = !meta.algos.includes(algo);
      });
      // default each subject to its best algorithm
      currentAlgo = (meta.def && meta.algos.includes(meta.def)) ? meta.def : meta.algos[0];
      subjectBtns.forEach((b) => {
        const on = b.getAttribute("data-subject") === currentSubject;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderAlgo();
    };

    subjectBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-subject");
        if (!id || !SUBJECTS[id] || id === currentSubject) return;
        currentSubject = id;
        renderSubject();
      });
    });

    algoBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const algo = b.getAttribute("data-algo");
        if (!algo || b.hidden || algo === currentAlgo) return;
        currentAlgo = algo;
        renderAlgo();
      });
    });

    // Normalise initial DOM to match state (also hides unavailable algos).
    renderSubject();
  }

})();
