// ============================================================================
// MY PORSCHE : GENESIS 911 — MAIN CONTROLLER & ATMOSPHERIC RENDERER
// Stuttgart-Zuffenhausen Industrial Specification
// ============================================================================

(function () {
  const STORAGE_KEY = "PORSCHE_GENESIS_911_STATE_V2";
  const START_DATE = new Date(2026, 9, 21, 0, 0, 0); // 2026.10.21 (Day 001)
  const TARGET_DATE = new Date(2029, 3, 18, 23, 59, 59); // 2029.04.18 (Day 911)
  const TOTAL_DAYS = 911;

  const defaultState = {
    modelId: "carrera_gts",
    paintId: "guards_red",
    targetPrice: 7800000,
    allocatedFund: 1850000,
    ignitedToday: false,
    lastIgnitionDate: "",
    city: "台北信義區",
    business: "高槓桿事業與資產系統",
    partner: "摯愛的家人與伴侶",
    covenantText:
      "「在這 911 天內，我將全面戒除低價值消耗，專注建構可規模化的高毛利商業資產，以頂尖產出兌換這把鑰匙。」",
    sigCount: 3,
    logs: [
      {
        tag: "FUTURE VLOG",
        day: "DAY 001",
        text: "在信義區路口遇見一輛粉筆灰 992 GTS，大腦 RAS 雷達瞬間鎖定目標。"
      },
      {
        tag: "HIGH-LEVERAGE",
        day: "DAY 001",
        text: "完成核心產品高單價定價重構，推進購車基金第一哩路。"
      }
    ]
  };

  let state = loadState();
  let simDayOverride = null;
  let selectedStageIndex = null;
  let widgetTodIndex = 2; // 0: DAWN, 1: NOON, 2: DUSK
  let activeChapterIdx = 0;
  let activeLineIdx = 0;
  let chapterTimer = null;
  let psycheIdx = 0;
  let scenarioIdx = 0;
  let affirmIdx = 0;
  let strobeTimer = null;

  // Cockpit POV 狀態
  let povMode = "night"; // 'night' | 'cabin360' | 'coast'
  let cabinYaw = 0; // -120 ~ +120
  let roadOffset = 0;
  let currentGear = 5;
  let currentSpeed = 128;
  let currentRpm = 3800;

  // 親口錄音狀態
  let mediaRecorder = null;
  let audioChunks = [];
  let recordedBlobUrl = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultState));
      return Object.assign(JSON.parse(JSON.stringify(defaultState)), JSON.parse(raw));
    } catch (e) {
      return JSON.parse(JSON.stringify(defaultState));
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function getModel() {
    return window.GENESIS_DATA.models.find((m) => m.id === state.modelId) || window.GENESIS_DATA.models[0];
  }

  function getPaint() {
    return window.GENESIS_DATA.paints.find((p) => p.id === state.paintId) || window.GENESIS_DATA.paints[0];
  }

  function pad3(n) {
    return String(n).padStart(3, "0");
  }

  function getDayNumber() {
    if (simDayOverride !== null) return simDayOverride;
    const now = new Date();
    const diff = Math.floor((now.getTime() - START_DATE.getTime()) / 86400000) + 1;
    return Math.max(1, Math.min(TOTAL_DAYS, diff));
  }

  // ==========================================================================
  // 全域遙測與小工具 UI 同步更新
  // ==========================================================================
  function syncAllTelemetry() {
    const model = getModel();
    const paint = getPaint();
    const dayNum = getDayNumber();
    const daysLeft = Math.max(0, TOTAL_DAYS - dayNum);
    const fundPct = Math.min(100, (state.allocatedFund / Math.max(1, state.targetPrice)) * 100);

    document.documentElement.style.setProperty("--car-hex", paint.hex);

    // 頂部狀態列
    document.getElementById("top-model-label").textContent = `PORSCHE ${model.name.toUpperCase()}`;
    document.getElementById("top-day-num").textContent = pad3(dayNum);

    // 即時時分秒毫秒倒數
    const now = new Date();
    const remMs = Math.max(0, TARGET_DATE.getTime() - now.getTime());
    const totalSec = Math.floor(remMs / 1000);
    const hh = String(Math.floor((totalSec % 86400) / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    const tenths = Math.floor((remMs % 1000) / 100);

    const tickerEl = document.getElementById("chrono-live-ticker");
    if (tickerEl) {
      tickerEl.textContent = `T-${daysLeft}D · ${hh}:${mm}:${ss}.${tenths}`;
    }

    const halfwayRem = 456 - dayNum;
    document.getElementById("chrono-halfway-text").textContent =
      halfwayRem > 0
        ? `HALFWAY: 2028.01.19 (T-${halfwayRem}D TO D-456)`
        : `HALFWAY PASSED // FINAL SPRINT TO 2029.04.18`;

    // 更新 Screen 00 (Widgets)
    document.getElementById("widget-lock-inline").textContent = `${model.code}  ·  T-${daysLeft}D  ·  2029.04.18`;
    document.getElementById("widget-chrono-day").textContent = pad3(dayNum);
    document.getElementById("widget-chrono-ratio").textContent = `${pad3(dayNum)}/911`;
    const arcLen = Math.max(8, Math.round((dayNum / TOTAL_DAYS) * 238));
    document.getElementById("widget-chrono-arc").setAttribute("stroke-dasharray", `${arcLen} 240`);
    const angle = (dayNum / TOTAL_DAYS) * 360;
    document.getElementById("widget-chrono-hand").setAttribute("transform", `rotate(${angle} 50 50)`);

    document.getElementById("widget-alloc-pct").textContent = `${fundPct.toFixed(1)}%`;
    document.getElementById("widget-alloc-bar").style.width = `${Math.max(2, fundPct)}%`;
    document.getElementById("widget-ignition-state").textContent = state.ignitedToday ? "ACTIVE" : "READY";
    document.getElementById("widget-tminus-days").textContent = `T-${daysLeft} DAYS`;
    document.getElementById("widget-car-code").textContent = model.code;
    document.getElementById("widget-car-accent-line").setAttribute("stroke", paint.hex);
    document.getElementById("standby-mini-days").textContent = `${daysLeft}D`;

    // StandBy 全螢幕彈窗數據
    document.getElementById("standby-full-days").textContent = `${daysLeft}D`;
    document.getElementById("standby-full-daynum").textContent = `DAY ${pad3(dayNum)} / 911`;
    document.getElementById("standby-full-pct").textContent = `${fundPct.toFixed(1)}%`;

    // 更新 Screen 01 (10階段生產排程與購車資本)
    renderBuildTelemetry(dayNum);
    document.getElementById("fund-pct-inline").textContent = `${fundPct.toFixed(1)}%`;
    document.getElementById("fund-numbers-inline").textContent = `NT$ ${state.allocatedFund.toLocaleString()} / ${state.targetPrice.toLocaleString()}`;
    document.getElementById("chrono-fund-bar").style.width = `${fundPct}%`;

    // 對價契約黑卡
    const shortPaint = paint.name.split(" · ")[0].toUpperCase();
    document.getElementById("card-model-spec").textContent = `${model.code} · ${shortPaint}`;
    document.getElementById("covenant-text-display").textContent = state.covenantText;
  }

  function renderBuildTelemetry(dayNum) {
    const stages = window.GENESIS_DATA.buildStages;
    let currentIdx = 0;
    stages.forEach((s, i) => {
      if (dayNum >= s.day) currentIdx = i;
    });
    const inspectIdx = selectedStageIndex !== null ? selectedStageIndex : currentIdx;
    const st = stages[inspectIdx];

    document.getElementById("build-stage-counter").textContent = `STAGE ${st.stage} / 10`;
    document.getElementById("stage-code-text").textContent = `${st.code} // DAY ${pad3(st.day)}`;
    document.getElementById("stage-status-tag").textContent =
      dayNum >= st.day ? "UNLOCKED" : `LOCKED (D-${st.day})`;
    document.getElementById("stage-title-text").textContent = st.zhTitle;
    document.getElementById("stage-spec-text").textContent = st.spec;

    const bar = document.getElementById("build-segments-bar");
    bar.innerHTML = stages
      .map((s, idx) => {
        const unlocked = dayNum >= s.day;
        const isSelected = idx === inspectIdx;
        const bgClass = unlocked ? "bg-[#D5001C]" : "bg-white/10";
        const ringClass = isSelected ? "ring-1 ring-[#C5A059]" : "";
        return `<button data-sidx="${idx}" class="stage-seg-btn h-2 ${bgClass} ${ringClass} transition" title="${s.zhTitle}"></button>`;
      })
      .join("");

    bar.querySelectorAll(".stage-seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedStageIndex = Number(btn.getAttribute("data-sidx"));
        window.genesisAudio.playTactileClick(820);
        renderBuildTelemetry(getDayNumber());
      });
    });
  }

  // ==========================================================================
  // SCREEN 02: 實景級夜間公路與 360° 座艙光影渲染引擎 (Atmospheric Canvas)
  // ==========================================================================
  function initCockpitCanvas() {
    const canvas = document.getElementById("cockpit-pov-canvas");
    const box = document.getElementById("cockpit-viewport-box");
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      const r = box.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(300, r.width) * dpr;
      canvas.height = Math.max(220, r.height) * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    let dragging = false;
    let lastX = 0;
    box.addEventListener("mousedown", (e) => {
      dragging = true;
      lastX = e.clientX;
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      cabinYaw = Math.max(-110, Math.min(110, cabinYaw - dx * 0.45));
    });
    window.addEventListener("mouseup", () => {
      dragging = false;
    });

    box.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          dragging = true;
          lastX = e.touches[0].clientX;
        }
      },
      { passive: true }
    );
    box.addEventListener(
      "touchmove",
      (e) => {
        if (!dragging || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - lastX;
        lastX = e.touches[0].clientX;
        cabinYaw = Math.max(-110, Math.min(110, cabinYaw - dx * 0.45));
      },
      { passive: true }
    );
    window.addEventListener("touchend", () => {
      dragging = false;
    });

    const renderLoop = (ts) => {
      const w = canvas.width;
      const h = canvas.height;
      const paintHex = getPaint().hex;
      ctx.clearRect(0, 0, w, h);

      roadOffset += 0.045;
      const horizonY = h * 0.42;
      const panPx = -(cabinYaw / 90) * (w * 0.35);

      // 1. 依模式繪製深邃天空與遠景光影
      const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
      if (povMode === "coast") {
        sky.addColorStop(0, "#0D1726");
        sky.addColorStop(0.6, "#2E3D52");
        sky.addColorStop(1, "#C57B57");
      } else {
        sky.addColorStop(0, "#04060A");
        sky.addColorStop(0.6, "#0C121E");
        sky.addColorStop(1, "#07090D");
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // 2. 公路流光透視線與遠方 911 尾燈殘影
      const vanishX = w * 0.5 + panPx * 0.5;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(vanishX - 18, horizonY);
      ctx.lineTo(w * 0.05, h * 0.76);
      ctx.moveTo(vanishX + 18, horizonY);
      ctx.lineTo(w * 0.95, h * 0.76);
      ctx.stroke();

      // 動態黃金中央分隔虛線
      ctx.strokeStyle = "rgba(197, 160, 89, 0.45)";
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 16]);
      ctx.lineDashOffset = -roadOffset * 28;
      ctx.beginPath();
      ctx.moveTo(vanishX, horizonY);
      ctx.lineTo(w * 0.48, h * 0.76);
      ctx.stroke();
      ctx.setLineDash([]);

      // 遠處前車紅光尾燈
      ctx.fillStyle = "#D5001C";
      ctx.fillRect(vanishX - 16, horizonY - 4, 9, 2.5);
      ctx.fillRect(vanishX + 7, horizonY - 4, 9, 2.5);

      // 3. 保時捷前行李廂蓋葉子板微弧光影
      const centerX = w * 0.5 + panPx;
      ctx.fillStyle = paintHex;
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.67);
      ctx.quadraticCurveTo(centerX - w * 0.22, h * 0.60, centerX, h * 0.63);
      ctx.quadraticCurveTo(centerX + w * 0.22, h * 0.60, w, h * 0.67);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // 4. 座艙真皮儀表台剪影與紅光環境氛圍燈帶
      ctx.fillStyle = "#090A0E";
      ctx.beginPath();
      ctx.moveTo(0, h * 0.68);
      ctx.quadraticCurveTo(centerX, h * 0.62, w, h * 0.68);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      // 儀表台紅光暈染
      const glow = ctx.createRadialGradient(centerX - w * 0.08, h * 0.88, 5, centerX - w * 0.08, h * 0.88, w * 0.48);
      glow.addColorStop(0, "rgba(213, 0, 28, 0.36)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, h * 0.55, w, h * 0.45);

      // 貫穿式紅光氣氛燈線
      ctx.strokeStyle = "#D5001C";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.74);
      ctx.quadraticCurveTo(centerX, h * 0.69, w, h * 0.74);
      ctx.stroke();

      // 中控頂部 Sport Chrono 碼錶環
      const chronoX = centerX + w * 0.22;
      const chronoY = h * 0.66;
      ctx.strokeStyle = "#525660";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(chronoX, chronoY, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#D5001C";
      ctx.beginPath();
      ctx.moveTo(chronoX, chronoY);
      ctx.lineTo(chronoX + Math.cos(ts * 0.002) * 10, chronoY + Math.sin(ts * 0.002) * 10);
      ctx.stroke();

      // 駕駛座方向盤極簡精密輪廓
      const wheelX = centerX - w * 0.08;
      const wheelY = h * 0.91;
      const wheelR = Math.min(w * 0.22, 82);
      ctx.strokeStyle = "#22252E";
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.arc(wheelX, wheelY, wheelR, 0, Math.PI * 2);
      ctx.stroke();

      // 12點鐘競速黃回正標記
      ctx.strokeStyle = "#F5C400";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(wheelX, wheelY - wheelR - 5);
      ctx.lineTo(wheelX, wheelY - wheelR + 5);
      ctx.stroke();

      requestAnimationFrame(renderLoop);
    };
    requestAnimationFrame(renderLoop);
  }

  // ==========================================================================
  // SCREEN 03: 《A DAY IN 2029》與富人內外世界渲染
  // ==========================================================================
  function personalizeText(raw) {
    const model = getModel();
    const paint = getPaint();
    const zhColor = paint.name.split(" · ")[1] || paint.name;
    return raw
      .replace(/\{city\}/g, state.city)
      .replace(/\{business\}/g, state.business)
      .replace(/\{partner\}/g, state.partner)
      .replace(/\{model\}/g, model.name)
      .replace(/\{color\}/g, zhColor);
  }

  function renderChapters() {
    const chapters = window.GENESIS_DATA.timelineChapters;
    const ch = chapters[activeChapterIdx];

    document.getElementById("ch-freq-badge").textContent = `${ch.freq} · ${ch.time}`;
    document.getElementById("ch-code-label").textContent = ch.code;
    document.getElementById("ch-title-label").textContent = ch.title;

    const tabsBar = document.getElementById("chapter-tabs-bar");
    tabsBar.innerHTML = chapters
      .map((item, idx) => {
        const active = idx === activeChapterIdx;
        const cls = active
          ? "bg-[#D5001C] text-white font-semibold"
          : "bg-white/5 text-[#8E929B] hover:text-white";
        return `<button data-cidx="${idx}" class="ch-tab-btn py-1.5 rounded transition ${cls}">${item.time.split(" ")[0]}</button>`;
      })
      .join("");

    tabsBar.querySelectorAll(".ch-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeChapterIdx = Number(btn.getAttribute("data-cidx"));
        activeLineIdx = 0;
        window.genesisAudio.playTactileClick(760);
        renderChapters();
      });
    });

    const linesBox = document.getElementById("ch-lines-container");
    linesBox.innerHTML = ch.lines
      .map((line, idx) => {
        const isCurrent = idx === activeLineIdx;
        const cls = isCurrent ? "text-[#F4F3EF] font-medium" : "text-[#8E929B]";
        return `<p data-lidx="${idx}" class="ch-script-line cursor-pointer transition ${cls}">${personalizeText(line)}</p>`;
      })
      .join("");

    linesBox.querySelectorAll(".ch-script-line").forEach((p) => {
      p.addEventListener("click", () => {
        activeLineIdx = Number(p.getAttribute("data-lidx"));
        renderChapters();
        window.genesisAudio.speak(p.textContent);
      });
    });
  }

  function renderPsycheCard() {
    const list = window.GENESIS_DATA.psycheMatrix;
    const item = list[psycheIdx % list.length];
    document.getElementById("psyche-code-text").textContent = item.code;
    document.getElementById("psyche-index-text").textContent = `${(psycheIdx % list.length) + 1} OF ${list.length}`;
    document.getElementById("psyche-title-text").textContent = item.title;
    document.getElementById("psyche-outer-text").textContent = item.outer;
    document.getElementById("psyche-inner-text").textContent = item.inner;
    document.getElementById("psyche-old-text").textContent = `OLD: ${item.oldScript}`;
    document.getElementById("psyche-new-text").textContent = `911 STANDARD: ${item.newScript}`;
  }

  function renderScenarioCard() {
    const list = window.GENESIS_DATA.scenarios;
    const sc = list[scenarioIdx % list.length];
    document.getElementById("sc-code-label").textContent = sc.code;
    document.getElementById("sc-prompt-text").textContent = sc.prompt;
    const analysisBox = document.getElementById("sc-analysis-box");
    analysisBox.classList.add("hidden");

    const choicesBox = document.getElementById("sc-choices-box");
    choicesBox.innerHTML = sc.choices
      .map(
        (c, idx) => `
      <button data-choice="${idx}" class="sc-choice-btn w-full text-left bg-[#090A0C] hover:border-white/40 border border-white/15 rounded-lg p-2.5 text-xs text-[#E8E6E1] transition">
        ${c.label}
      </button>
    `
      )
      .join("");

    choicesBox.querySelectorAll(".sc-choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-choice"));
        const chosen = sc.choices[idx];
        analysisBox.textContent = chosen.analysis;
        analysisBox.classList.remove("hidden");
        window.genesisAudio.playTactileClick(chosen.optimal ? 980 : 340);
      });
    });
  }

  // ==========================================================================
  // SCREEN 04: 369 金屬迎賓門檻手寫簽名板與車主手札
  // ==========================================================================
  function initSignaturePad() {
    const canvas = document.getElementById("signature-pad-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const drawPlateBase = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      canvas.width = Math.max(260, r.width);
      canvas.height = Math.max(88, r.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      ctx.font = "700 22px monospace";
      ctx.textAlign = "center";
      ctx.fillText("PORSCHE 911 // 2029.04.18", canvas.width / 2, canvas.height / 2 + 8);
    };

    setTimeout(drawPlateBase, 80);
    window.addEventListener("resize", drawPlateBase);

    let drawing = false;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: x - r.left, y: y - r.top };
    };

    const start = (e) => {
      drawing = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing) return;
      if (e.cancelable) e.preventDefault();
      const p = pos(e);
      ctx.strokeStyle = "#C5A059";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const end = () => {
      drawing = false;
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);

    document.getElementById("btn-clear-sig").addEventListener("click", () => {
      drawPlateBase();
      window.genesisAudio.playTactileClick(520);
    });

    document.getElementById("btn-commit-sig").addEventListener("click", () => {
      state.sigCount = (state.sigCount % 9) + 1;
      saveState();
      document.getElementById("sig-counter-label").textContent = `${String(state.sigCount).padStart(2, "0")} / 09 COMPLETED`;
      drawPlateBase();
      window.genesisAudio.playTactileClick(1040);
    });
  }

  function renderCustodianLogs() {
    document.getElementById("sig-counter-label").textContent = `${String(state.sigCount).padStart(2, "0")} / 09 COMPLETED`;
    const box = document.getElementById("custodian-log-list");
    box.innerHTML = state.logs
      .map((item, idx) => {
        const borderCol = item.tag === "HIGH-LEVERAGE" ? "border-[#D5001C]" : "border-[#C5A059]";
        return `
        <div class="border-l-2 ${borderCol} pl-2.5 py-0.5">
          <div class="font-mono text-[11px] text-[#8E929B]">${item.day} · ${item.tag}</div>
          <div class="text-xs text-[#E8E6E1] mt-0.5">${item.text}</div>
        </div>
      `;
      })
      .join("");
  }

  // ==========================================================================
  // 匯出 2029.04.18 原廠風格手機鎖定畫面桌布 (PNG Export)
  // ==========================================================================
  function exportLockScreenWallpaper() {
    const c = document.createElement("canvas");
    c.width = 1170;
    c.height = 2532;
    const ctx = c.getContext("2d");
    const model = getModel();
    const paint = getPaint();
    const dayNum = getDayNumber();
    const daysLeft = Math.max(0, TOTAL_DAYS - dayNum);

    // 深邃黑金漸層背景
    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, "#07080A");
    grad.addColorStop(0.5, "#101218");
    grad.addColorStop(1, "#060709");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);

    // 細緻工業網格線
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    ctx.strokeRect(80, 760, c.width - 160, 1180);

    // 品牌與車型標題
    ctx.fillStyle = "#8E929B";
    ctx.font = "600 28px monospace";
    ctx.textAlign = "center";
    ctx.fillText("STUTTGART-ZUFFENHAUSEN // COMMISSIONING ORDER", c.width / 2, 850);

    ctx.fillStyle = "#F4F3EF";
    ctx.font = "700 64px -apple-system, sans-serif";
    ctx.fillText(`PORSCHE ${model.name.toUpperCase()}`, c.width / 2, 950);

    // 車色光帶
    ctx.strokeStyle = paint.hex;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(320, 1010);
    ctx.lineTo(c.width - 320, 1010);
    ctx.stroke();

    // 交車日期與倒數
    ctx.fillStyle = "#C5A059";
    ctx.font = "700 96px monospace";
    ctx.fillText("2029.04.18", c.width / 2, 1180);

    ctx.fillStyle = "#F4F3EF";
    ctx.font = "600 44px monospace";
    ctx.fillText(`DAY ${pad3(dayNum)} / 911  ·  T-${daysLeft} DAYS`, c.width / 2, 1275);

    // 李小龍對價宣言
    ctx.fillStyle = "#8E929B";
    ctx.font = "500 32px -apple-system, sans-serif";
    const text = state.covenantText;
    ctx.fillText(text.slice(0, 26), c.width / 2, 1480);
    if (text.length > 26) ctx.fillText(text.slice(26, 52), c.width / 2, 1540);
    if (text.length > 52) ctx.fillText(text.slice(52), c.width / 2, 1600);

    const link = document.createElement("a");
    link.download = `PORSCHE-911-2029-04-18-DAY${pad3(dayNum)}.png`;
    link.href = c.toDataURL("image/png");
    link.click();
  }

  // ==========================================================================
  // 事件綁定
  // ==========================================================================
  function bindEvents() {
    const screenTitles = {
      s0: "IOS WIDGETKIT & STANDBY",
      s1: "COMMISSIONING CHRONO",
      s2: "360° COCKPIT & NIGHT DRIVE",
      s3: "A DAY IN 2029 & PSYCHE",
      s4: "VOICE LOOP & DRIVER'S LOG"
    };

    // 底部 5 大主畫面切換
    document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        window.genesisAudio.playTactileClick(740);

        document.querySelectorAll(".nav-tab-btn").forEach((b) => {
          b.className = "nav-tab-btn text-[#8E929B] pb-1 transition";
        });
        btn.className = "nav-tab-btn text-[#F4F3EF] font-bold border-b-2 border-[#D5001C] pb-1 transition";

        document.querySelectorAll(".screen-pane").forEach((pane) => {
          pane.classList.toggle("hidden", pane.id !== `screen-${target}`);
        });
        document.getElementById("top-screen-title").textContent = screenTitles[target] || "COMMISSIONING CHRONO";
      });
    });

    // 左側電門點火旋鈕
    const triggerIgnition = () => {
      const btn = document.getElementById("btn-left-ignition");
      const shell = document.getElementById("main-app-shell");
      btn.classList.add("turning");
      shell.classList.add("igniting-vibration");
      document.getElementById("ignition-label-text").textContent = "STARTING...";

      window.genesisAudio.playColdStart(
        (rpm) => {
          document.getElementById("island-code-text").textContent = `${rpm}`;
        },
        () => {
          btn.classList.remove("turning");
          shell.classList.remove("igniting-vibration");
          state.ignitedToday = true;
          state.lastIgnitionDate = new Date().toISOString().slice(0, 10);
          saveState();
          document.getElementById("ignition-label-text").textContent = "IGNITED";
          document.getElementById("island-code-text").textContent = "911";
          syncAllTelemetry();
        }
      );
    };

    document.getElementById("btn-left-ignition").addEventListener("click", triggerIgnition);
    document.getElementById("widget-chrono-tap").addEventListener("click", triggerIgnition);

    // 桌面小工具早中晚視角切換 (防視覺麻痺)
    document.getElementById("btn-cycle-widget-tod").addEventListener("click", () => {
      const views = ["DAWN VIEW · 06:00", "COCKPIT VIEW · 12:00", "DUSK VIEW · 18:00"];
      widgetTodIndex = (widgetTodIndex + 1) % views.length;
      document.getElementById("widget-tod-label").textContent = views[widgetTodIndex];
      affirmIdx = (affirmIdx + 1) % window.GENESIS_DATA.affirmations.length;
      document.getElementById("widget-daily-affirm").textContent = `「${window.GENESIS_DATA.affirmations[affirmIdx]}」`;
      window.genesisAudio.playTactileClick(860);
    });

    document.getElementById("widget-daily-affirm").addEventListener("click", () => {
      affirmIdx = (affirmIdx + 1) % window.GENESIS_DATA.affirmations.length;
      const txt = window.GENESIS_DATA.affirmations[affirmIdx];
      document.getElementById("widget-daily-affirm").textContent = `「${txt}」`;
      window.genesisAudio.speak(txt);
    });

    document.getElementById("btn-export-wallpaper").addEventListener("click", () => {
      window.genesisAudio.playTactileClick(940);
      exportLockScreenWallpaper();
    });

    // 購車基金入帳
    document.getElementById("btn-deposit-fund").addEventListener("click", () => {
      const val = Number(document.getElementById("input-fund-delta").value);
      if (val > 0) {
        state.allocatedFund += val;
        saveState();
        document.getElementById("input-fund-delta").value = "";
        window.genesisAudio.playTactileClick(1020);
        syncAllTelemetry();
      }
    });

    // 對價契約 180° 翻轉與儲存
    const flipCard = document.getElementById("covenant-flip-card");
    document.getElementById("btn-flip-to-back").addEventListener("click", () => {
      document.getElementById("textarea-covenant").value = state.covenantText;
      flipCard.classList.add("is-flipped");
      window.genesisAudio.playTactileClick(780);
    });
    document.getElementById("btn-flip-to-front").addEventListener("click", () => {
      flipCard.classList.remove("is-flipped");
      window.genesisAudio.playTactileClick(720);
    });
    document.getElementById("btn-save-covenant").addEventListener("click", () => {
      const v = document.getElementById("textarea-covenant").value.trim();
      if (v) {
        state.covenantText = v;
        saveState();
        syncAllTelemetry();
      }
      flipCard.classList.remove("is-flipped");
      window.genesisAudio.playTactileClick(980);
    });
    document.getElementById("btn-speak-covenant").addEventListener("click", () => {
      window.genesisAudio.speak(state.covenantText);
    });

    // 911 天時光模擬滑桿
    const simSlider = document.getElementById("slider-day-sim");
    simSlider.addEventListener("input", () => {
      simDayOverride = Number(simSlider.value);
      selectedStageIndex = null;
      syncAllTelemetry();
    });
    document.getElementById("btn-reset-day").addEventListener("click", () => {
      simDayOverride = null;
      selectedStageIndex = null;
      simSlider.value = getDayNumber();
      window.genesisAudio.playTactileClick(800);
      syncAllTelemetry();
    });

    // Screen 02: 夜駕與座艙模式切換
    document.querySelectorAll(".pov-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        povMode = btn.getAttribute("data-pov");
        window.genesisAudio.playTactileClick(780);
        document.querySelectorAll(".pov-mode-btn").forEach((b) => {
          b.className = "pov-mode-btn bg-[#14161B] text-[#8E929B] border border-white/10 py-2 rounded text-center transition";
        });
        btn.className = "pov-mode-btn bg-[#F4F3EF] text-[#090A0C] font-semibold py-2 rounded text-center transition";
      });
    });

    document.getElementById("btn-hud-downshift").addEventListener("click", () => {
      currentGear = Math.max(2, currentGear - 1);
      currentRpm = Math.min(8400, currentRpm + 1600);
      document.getElementById("hud-gear-speed").textContent = `M${currentGear} · ${currentSpeed} KM/H`;
      document.getElementById("hud-rpm-readout").textContent = `${currentRpm.toLocaleString()} RPM`;
      window.genesisAudio.playRevMatchBlip(currentRpm);
      setTimeout(() => {
        currentRpm = 3800;
        currentGear = 5;
        document.getElementById("hud-gear-speed").textContent = `M5 · 128 KM/H`;
        document.getElementById("hud-rpm-readout").textContent = `3,800 RPM`;
      }, 1100);
    });

    document.getElementById("btn-speak-pcm-affirm").addEventListener("click", () => {
      affirmIdx = (affirmIdx + 1) % window.GENESIS_DATA.affirmations.length;
      const line = window.GENESIS_DATA.affirmations[affirmIdx];
      document.getElementById("pcm-affirm-text").textContent = `「${line}」`;
      window.genesisAudio.speak(line);
    });

    const soundBtn = document.getElementById("btn-toggle-soundscape");
    soundBtn.addEventListener("click", () => {
      if (window.genesisAudio.soundscapeActive) {
        window.genesisAudio.stopSoundscape();
        soundBtn.textContent = "START ENGINE AUDIO";
        soundBtn.className = "px-2.5 py-1 rounded bg-[#D5001C] text-white font-semibold transition";
      } else {
        window.genesisAudio.startSoundscape(2800, 6);
        soundBtn.textContent = "STOP ENGINE AUDIO";
        soundBtn.className = "px-2.5 py-1 rounded bg-[#F4F3EF] text-[#090A0C] font-semibold transition";
      }
    });

    const bindMixer = (id, lblId, key) => {
      const el = document.getElementById(id);
      el.addEventListener("input", () => {
        const v = Number(el.value);
        document.getElementById(lblId).textContent = `${Math.round(v * 100)}%`;
        window.genesisAudio.updateLevels({ [key]: v });
      });
    };
    bindMixer("rng-vol-boxer", "lbl-vol-boxer", "boxer");
    bindMixer("rng-vol-rain", "lbl-vol-rain", "rain");
    bindMixer("rng-vol-bin", "lbl-vol-bin", "binaural");

    // Screen 03: 車主一日語音冥想播放
    document.getElementById("btn-play-chapter").addEventListener("click", () => {
      const ch = window.GENESIS_DATA.timelineChapters[activeChapterIdx];
      if (chapterTimer) clearTimeout(chapterTimer);
      window.genesisAudio.startSoundscape(2200, ch.binauralHz);
      activeLineIdx = 0;

      const stepLine = () => {
        if (!window.genesisAudio.soundscapeActive) return;
        if (activeLineIdx >= ch.lines.length) {
          activeLineIdx = 0;
          return;
        }
        renderChapters();
        const txt = personalizeText(ch.lines[activeLineIdx]);
        window.genesisAudio.speak(txt, {
          onEnd: () => {
            if (!window.genesisAudio.soundscapeActive) return;
            chapterTimer = setTimeout(() => {
              activeLineIdx++;
              stepLine();
            }, 1300);
          }
        });
      };
      stepLine();
    });

    document.getElementById("btn-stop-chapter").addEventListener("click", () => {
      if (chapterTimer) clearTimeout(chapterTimer);
      window.genesisAudio.stopSoundscape();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    });

    document.getElementById("btn-next-psyche").addEventListener("click", () => {
      psycheIdx++;
      window.genesisAudio.playTactileClick(760);
      renderPsycheCard();
    });

    document.getElementById("btn-next-scenario").addEventListener("click", () => {
      scenarioIdx++;
      window.genesisAudio.playTactileClick(760);
      renderScenarioCard();
    });

    // Screen 04: 親口錄音與車主手札
    document.getElementById("log-affirm-display").addEventListener("click", () => {
      affirmIdx = (affirmIdx + 1) % window.GENESIS_DATA.affirmations.length;
      const txt = window.GENESIS_DATA.affirmations[affirmIdx];
      document.getElementById("log-affirm-display").textContent = `「${txt}」`;
      window.genesisAudio.speak(txt);
    });

    const recBtn = document.getElementById("btn-rec-voice");
    const loopBtn = document.getElementById("btn-loop-voice");
    const recBadge = document.getElementById("rec-state-badge");
    const audioEl = document.getElementById("self-voice-audio");

    recBtn.addEventListener("click", async () => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        recBtn.textContent = "REC OWN VOICE";
        recBadge.textContent = "● IMPRINT READY";
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        recBadge.textContent = "● MIC UNAVAILABLE";
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: "audio/webm" });
          recordedBlobUrl = URL.createObjectURL(blob);
          audioEl.src = recordedBlobUrl;
          audioEl.loop = true;
          loopBtn.disabled = false;
          stream.getTracks().forEach((t) => t.stop());
        };
        mediaRecorder.start();
        recBtn.textContent = "STOP REC";
        recBadge.textContent = "● RECORDING...";
      } catch (e) {
        recBadge.textContent = "● MIC PERMISSION NEEDED";
      }
    });

    loopBtn.addEventListener("click", () => {
      if (!recordedBlobUrl) return;
      if (audioEl.paused) {
        audioEl.play();
        window.genesisAudio.startSoundscape(2100, 6);
        loopBtn.textContent = "PAUSE LOOP";
      } else {
        audioEl.pause();
        window.genesisAudio.stopSoundscape();
        loopBtn.textContent = "LOOP VOICE";
      }
    });

    document.getElementById("btn-add-log").addEventListener("click", () => {
      const val = document.getElementById("input-log-entry").value.trim();
      const tag = document.getElementById("log-tag-select").value;
      if (val) {
        state.logs.unshift({
          tag,
          day: `DAY ${pad3(getDayNumber())}`,
          text: val
        });
        saveState();
        document.getElementById("input-log-entry").value = "";
        window.genesisAudio.playTactileClick(940);
        renderCustodianLogs();
      }
    });

    // 全螢幕彈窗控制 (StandBy / 60s Strobe / Spec / Huberman)
    const openStandby = () => {
      document.getElementById("modal-standby").classList.remove("hidden");
      document.getElementById("modal-standby").classList.add("flex");
      window.genesisAudio.startSoundscape(1800, 6);
    };
    const closeStandby = () => {
      document.getElementById("modal-standby").classList.add("hidden");
      document.getElementById("modal-standby").classList.remove("flex");
      window.genesisAudio.stopSoundscape();
    };
    document.getElementById("btn-open-standby").addEventListener("click", openStandby);
    document.getElementById("card-standby-launch").addEventListener("click", openStandby);
    document.getElementById("btn-close-standby").addEventListener("click", closeStandby);

    const openStrobe = () => {
      const modal = document.getElementById("modal-strobe");
      modal.classList.remove("hidden");
      modal.classList.add("flex");
      let sec = 60;
      let idx = 0;
      if (strobeTimer) clearInterval(strobeTimer);
      strobeTimer = setInterval(() => {
        idx++;
        const list = window.GENESIS_DATA.affirmations;
        document.getElementById("strobe-main-line").textContent = list[idx % list.length];
        document.getElementById("strobe-meta-tag").textContent =
          idx % 2 === 0
            ? `2029.04.18 // ${getModel().name.toUpperCase()}`
            : `DAY ${pad3(getDayNumber())} OF 911 // STUTTGART`;
        if (idx % 2 === 0) {
          sec = Math.max(0, sec - 1);
          document.getElementById("strobe-countdown").textContent = `${sec}s`;
          window.genesisAudio.playTactileClick(280);
        }
        if (sec <= 0) closeStrobe();
      }, 500);
    };
    const closeStrobe = () => {
      if (strobeTimer) clearInterval(strobeTimer);
      document.getElementById("modal-strobe").classList.add("hidden");
      document.getElementById("modal-strobe").classList.remove("flex");
    };
    document.getElementById("btn-open-strobe").addEventListener("click", openStrobe);
    document.getElementById("btn-launch-strobe-log").addEventListener("click", openStrobe);
    document.getElementById("btn-close-strobe").addEventListener("click", closeStrobe);

    // Spec Configurator
    const modelSel = document.getElementById("cfg-model");
    const paintSel = document.getElementById("cfg-paint");
    modelSel.innerHTML = window.GENESIS_DATA.models
      .map((m) => `<option value="${m.id}">${m.name} (${m.power})</option>`)
      .join("");
    paintSel.innerHTML = window.GENESIS_DATA.paints
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join("");

    modelSel.addEventListener("change", () => {
      const m = window.GENESIS_DATA.models.find((x) => x.id === modelSel.value);
      if (m) document.getElementById("cfg-price").value = m.defaultPrice;
    });

    const openSpec = () => {
      modelSel.value = state.modelId;
      paintSel.value = state.paintId;
      document.getElementById("cfg-price").value = state.targetPrice;
      document.getElementById("cfg-city").value = state.city;
      document.getElementById("cfg-business").value = state.business;
      document.getElementById("modal-spec").classList.remove("hidden");
      document.getElementById("modal-spec").classList.add("flex");
    };
    document.getElementById("btn-open-spec-modal").addEventListener("click", openSpec);
    document.getElementById("btn-mobile-spec").addEventListener("click", openSpec);
    document.getElementById("btn-close-spec").addEventListener("click", () => {
      document.getElementById("modal-spec").classList.add("hidden");
      document.getElementById("modal-spec").classList.remove("flex");
    });
    document.getElementById("btn-save-spec").addEventListener("click", () => {
      state.modelId = modelSel.value;
      state.paintId = paintSel.value;
      state.targetPrice = Math.max(100000, Number(document.getElementById("cfg-price").value) || 7800000);
      state.city = document.getElementById("cfg-city").value.trim() || "台北信義區";
      state.business = document.getElementById("cfg-business").value.trim() || "高槓桿事業";
      saveState();
      syncAllTelemetry();
      renderChapters();
      document.getElementById("modal-spec").classList.add("hidden");
      document.getElementById("modal-spec").classList.remove("flex");
      window.genesisAudio.playRevMatchBlip(6400);
    });

    // Huberman Reality Contrast Modal
    document.getElementById("btn-huberman-protocol").addEventListener("click", () => {
      document.getElementById("modal-huberman").classList.remove("hidden");
      document.getElementById("modal-huberman").classList.add("flex");
      window.genesisAudio.playTactileClick(380);
    });
    document.getElementById("btn-close-huberman").addEventListener("click", () => {
      document.getElementById("modal-huberman").classList.add("hidden");
      document.getElementById("modal-huberman").classList.remove("flex");
    });
    document.getElementById("btn-commit-huberman").addEventListener("click", () => {
      const act = document.getElementById("input-huberman-act").value.trim();
      if (act) {
        state.logs.unshift({
          tag: "HIGH-LEVERAGE",
          day: `DAY ${pad3(getDayNumber())}`,
          text: `[15-MIN INTERVENTION] ${act}`
        });
        saveState();
        document.getElementById("input-huberman-act").value = "";
        renderCustodianLogs();
      }
      document.getElementById("modal-huberman").classList.add("hidden");
      document.getElementById("modal-huberman").classList.remove("flex");
      window.genesisAudio.playRevMatchBlip(7200);
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    syncAllTelemetry();
    initCockpitCanvas();
    renderChapters();
    renderPsycheCard();
    renderScenarioCard();
    initSignaturePad();
    renderCustodianLogs();

    // 10Hz 高精度計時器更新
    setInterval(syncAllTelemetry, 100);
  });
})();
