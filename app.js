(function () {
  "use strict";

  var STORAGE_KEY = "ketek-draft-v1";

  var EXAMPLES = {
    storm: {
      forward: "Above silence, the illuminating storms",
      pivot: "dying",
      overrides: { 0: "above", 1: "silence", 3: "illuminate" }
    },
    wind: {
      forward: "Alight, winds approach",
      pivot: "deadly",
      overrides: { 0: "alight.", 2: "approaching" }
    }
  };

  var state = {
    forward: "",
    pivot: "",
    overrides: {} // forwardWordIndex -> custom mirror text
  };

  var forwardInput = document.getElementById("forward-input");
  var pivotInput = document.getElementById("pivot-input");
  var mirrorOutput = document.getElementById("mirror-output");
  var statsEl = document.getElementById("stats");
  var previewEl = document.getElementById("preview");
  var exampleSelect = document.getElementById("example-select");
  var clearBtn = document.getElementById("clear-btn");

  function tokenize(text) {
    return text.trim().length ? text.trim().split(/\s+/) : [];
  }

  function renderMirror() {
    var words = tokenize(state.forward);
    mirrorOutput.innerHTML = "";

    for (var j = 0; j < words.length; j++) {
      var k = words.length - 1 - j;
      var hasOverride = Object.prototype.hasOwnProperty.call(state.overrides, k);
      var text = hasOverride ? state.overrides[k] : words[k];

      var span = document.createElement("span");
      span.className = "mirror-word " + (hasOverride ? "edited" : "ghost");
      span.contentEditable = "true";
      span.spellcheck = false;
      span.dataset.k = String(k);
      span.dataset.default = words[k];
      span.title = hasOverride ? "auto: " + words[k] + " (double-click to reset)" : "";
      span.textContent = text;
      mirrorOutput.appendChild(span);

      if (j < words.length - 1) {
        mirrorOutput.appendChild(document.createTextNode(" "));
      }
    }
  }

  function updatePreviewAndStats() {
    var words = tokenize(state.forward);
    var mirrorWords = [];
    for (var j = 0; j < words.length; j++) {
      var k = words.length - 1 - j;
      var hasOverride = Object.prototype.hasOwnProperty.call(state.overrides, k);
      mirrorWords.push(hasOverride ? state.overrides[k] : words[k]);
    }

    var pivot = state.pivot.trim();
    var parts = [state.forward.trim(), pivot, mirrorWords.join(" ")].filter(function (p) {
      return p.length > 0;
    });
    previewEl.textContent = parts.join(" ") || "Your ketek will appear here.";

    var n = words.length;
    var total = n * 2 + (pivot ? 1 : 0);
    var bits = [
      n + " word" + (n === 1 ? "" : "s") + " forward",
      n + " mirrored"
    ];
    if (pivot) bits.push("1 pivot");
    bits.push(total + " total");
    statsEl.textContent = bits.join(" · ");
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* localStorage unavailable — draft just won't persist */
    }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state.forward = parsed.forward || "";
        state.pivot = parsed.pivot || "";
        state.overrides = parsed.overrides || {};
      }
    } catch (e) {
      /* corrupt draft — start fresh */
    }
  }

  function renderAll() {
    forwardInput.value = state.forward;
    pivotInput.value = state.pivot;
    renderMirror();
    updatePreviewAndStats();
  }

  forwardInput.addEventListener("input", function () {
    state.forward = forwardInput.value;
    renderMirror();
    updatePreviewAndStats();
    saveState();
  });

  pivotInput.addEventListener("input", function () {
    state.pivot = pivotInput.value;
    updatePreviewAndStats();
    saveState();
  });

  mirrorOutput.addEventListener("input", function (e) {
    var target = e.target;
    if (!target.classList || !target.classList.contains("mirror-word")) return;
    var k = Number(target.dataset.k);
    var text = target.textContent;

    if (text === target.dataset.default) {
      delete state.overrides[k];
      target.classList.remove("edited");
      target.classList.add("ghost");
      target.title = "";
    } else {
      state.overrides[k] = text;
      target.classList.remove("ghost");
      target.classList.add("edited");
      target.title = "auto: " + target.dataset.default + " (double-click to reset)";
    }
    updatePreviewAndStats();
    saveState();
  });

  mirrorOutput.addEventListener("keydown", function (e) {
    var target = e.target;
    if (!target.classList || !target.classList.contains("mirror-word")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      target.blur();
    }
  });

  mirrorOutput.addEventListener("dblclick", function (e) {
    var target = e.target;
    if (!target.classList || !target.classList.contains("mirror-word")) return;
    if (!target.classList.contains("edited")) return;
    var k = Number(target.dataset.k);
    delete state.overrides[k];
    target.textContent = target.dataset.default;
    target.classList.remove("edited");
    target.classList.add("ghost");
    target.title = "";
    updatePreviewAndStats();
    saveState();
  });

  exampleSelect.addEventListener("change", function () {
    var key = exampleSelect.value;
    if (!key || !EXAMPLES[key]) return;
    if (state.forward.trim() && !confirm("Load example and replace your current draft?")) {
      exampleSelect.value = "";
      return;
    }
    var ex = EXAMPLES[key];
    state.forward = ex.forward;
    state.pivot = ex.pivot;
    state.overrides = Object.assign({}, ex.overrides);
    renderAll();
    saveState();
    exampleSelect.value = "";
  });

  clearBtn.addEventListener("click", function () {
    if (!state.forward.trim() && !state.pivot.trim()) return;
    if (!confirm("Clear the current draft?")) return;
    state.forward = "";
    state.pivot = "";
    state.overrides = {};
    renderAll();
    saveState();
  });

  loadState();
  renderAll();
})();
