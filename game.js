(() => {
  const SIZE = 8;
  const TYPES = [
    { id: "crater", name: "크레이터" },
    { id: "cloud", name: "구름" },
    { id: "stripe", name: "줄무늬" },
    { id: "ring", name: "고리" },
    { id: "moon", name: "위성" },
    { id: "asteroid", name: "소행성" },
  ];
  const SPECIAL_NAMES = {
    "special-line": "줄클리어",
    "special-bomb": "폭발",
    "special-square": "사각 특수",
  };

  const START_MOVES = 20;
  const GOAL_TYPE = "crater";
  const GOAL_COUNT = 12;

  const boardEl = document.getElementById("board");
  const fxLayer = document.getElementById("fx-layer");
  const movesEl = document.getElementById("moves");
  const scoreEl = document.getElementById("score");
  const goalLeftEl = document.getElementById("goal-left");
  const messageEl = document.getElementById("message");
  const restartBtn = document.getElementById("restart");
  const overlayEl = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySub = document.getElementById("overlay-sub");
  const overlayScore = document.getElementById("overlay-score");
  const overlayMoves = document.getElementById("overlay-moves");
  const overlayBadge = document.getElementById("overlay-badge");
  const overlayRestart = document.getElementById("overlay-restart");
  const goalFill = document.getElementById("goal-fill");

  let grid = [];
  let selected = null;
  let busy = false;
  let moves = START_MOVES;
  let score = 0;
  let goalLeft = GOAL_COUNT;
  let gameOver = false;
  let lastSwap = null;

  function makeTile(type, special = null) {
    return { type, special };
  }

  function randType() {
    return TYPES[Math.floor(Math.random() * TYPES.length)].id;
  }

  function cell(r, c) {
    return grid[r * SIZE + c];
  }

  function setCell(r, c, tile) {
    grid[r * SIZE + c] = tile;
  }

  function sameBase(a, b) {
    return a && b && !a.special && !b.special && a.type === b.type;
  }

  function typeAt(r, c) {
    const t = cell(r, c);
    return t ? t.type : null;
  }

  function wouldMatchAt(r, c, type) {
    if (c >= 2 && typeAt(r, c - 1) === type && typeAt(r, c - 2) === type) return true;
    if (r >= 2 && typeAt(r - 1, c) === type && typeAt(r - 2, c) === type) return true;
    return false;
  }

  function fillNoMatch() {
    grid = new Array(SIZE * SIZE);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        let type;
        do {
          type = randType();
        } while (wouldMatchAt(r, c, type));
        setCell(r, c, makeTile(type));
      }
    }
  }

  function collectRuns() {
    const runs = [];
    for (let r = 0; r < SIZE; r++) {
      let run = 1;
      for (let c = 1; c <= SIZE; c++) {
        const same =
          c < SIZE &&
          typeAt(r, c) &&
          typeAt(r, c) === typeAt(r, c - 1);
        if (same) run++;
        else {
          if (run >= 3) {
            const cells = [];
            for (let k = 0; k < run; k++) cells.push({ r, c: c - 1 - k });
            runs.push({ dir: "h", len: run, cells, type: typeAt(r, c - 1) });
          }
          run = 1;
        }
      }
    }
    for (let c = 0; c < SIZE; c++) {
      let run = 1;
      for (let r = 1; r <= SIZE; r++) {
        const same =
          r < SIZE &&
          typeAt(r, c) &&
          typeAt(r, c) === typeAt(r - 1, c);
        if (same) run++;
        else {
          if (run >= 3) {
            const cells = [];
            for (let k = 0; k < run; k++) cells.push({ r: r - 1 - k, c });
            runs.push({ dir: "v", len: run, cells, type: typeAt(r - 1, c) });
          }
          run = 1;
        }
      }
    }
    return runs;
  }

  function findSquares() {
    const squares = [];
    for (let r = 0; r < SIZE - 1; r++) {
      for (let c = 0; c < SIZE - 1; c++) {
        const t = typeAt(r, c);
        if (
          t &&
          typeAt(r, c + 1) === t &&
          typeAt(r + 1, c) === t &&
          typeAt(r + 1, c + 1) === t
        ) {
          squares.push({
            type: t,
            cells: [
              { r, c },
              { r, c: c + 1 },
              { r: r + 1, c },
              { r: r + 1, c: c + 1 },
            ],
          });
        }
      }
    }
    return squares;
  }

  function analyzeMatches() {
    const matched = new Set();
    const specials = []; // { idx, special, type }
    const runs = collectRuns();
    const coveredByLong = new Set();

    for (const run of runs) {
      for (const p of run.cells) matched.add(p.r * SIZE + p.c);
      if (run.len >= 5) {
        const spawn = pickSpawn(run.cells);
        specials.push({
          idx: spawn.r * SIZE + spawn.c,
          special: "special-bomb",
          type: run.type,
        });
        run.cells.forEach((p) => coveredByLong.add(p.r * SIZE + p.c));
      } else if (run.len === 4) {
        const spawn = pickSpawn(run.cells);
        // 줄클리어: 매치 방향과 수직으로 터지게 — h매치→세로줄, v매치→가로줄
        specials.push({
          idx: spawn.r * SIZE + spawn.c,
          special: "special-line",
          type: run.type,
          axis: run.dir === "h" ? "v" : "h",
        });
        run.cells.forEach((p) => coveredByLong.add(p.r * SIZE + p.c));
      }
    }

    for (const sq of findSquares()) {
      const idxs = sq.cells.map((p) => p.r * SIZE + p.c);
      // 이미 4/5 특수로 커버된 칸만 있는 2x2는 스킵
      if (idxs.every((i) => coveredByLong.has(i))) continue;
      idxs.forEach((i) => matched.add(i));
      const spawn = pickSpawn(sq.cells);
      specials.push({
        idx: spawn.r * SIZE + spawn.c,
        special: "special-square",
        type: sq.type,
      });
    }

    // 특수 타일 자체도 같은 색 매치에 포함되면 matched에 넣기 위해
    // 인접 특수: 특수끼리/특수+일반 스왑 발동은 onPick에서 처리
    return { matched, specials, runs };
  }

  function pickSpawn(cells) {
    if (lastSwap) {
      const hit = cells.find(
        (p) =>
          (p.r === lastSwap.a.r && p.c === lastSwap.a.c) ||
          (p.r === lastSwap.b.r && p.c === lastSwap.b.c)
      );
      if (hit) return hit;
    }
    return cells[Math.floor(cells.length / 2)];
  }

  function expandSpecialClear(startIdx, special, axis) {
    const clear = new Set([startIdx]);
    const r0 = Math.floor(startIdx / SIZE);
    const c0 = startIdx % SIZE;

    if (special === "special-line") {
      if (axis === "h") {
        for (let c = 0; c < SIZE; c++) clear.add(r0 * SIZE + c);
      } else {
        for (let r = 0; r < SIZE; r++) clear.add(r * SIZE + c0);
      }
    } else if (special === "special-bomb") {
      // 5연속 폭발: 5×5
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) clear.add(r * SIZE + c);
        }
      }
    } else if (special === "special-square") {
      // 2×2 사각: 3×3
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) clear.add(r * SIZE + c);
        }
      }
    }
    return clear;
  }

  function gatherClears(matched) {
    const clear = new Set(matched);
    const queue = [...matched];
    const seenSpecial = new Set();

    while (queue.length) {
      const idx = queue.pop();
      const tile = grid[idx];
      if (!tile || !tile.special || seenSpecial.has(idx)) continue;
      seenSpecial.add(idx);
      const extra = expandSpecialClear(idx, tile.special, tile.axis || "h");
      extra.forEach((i) => {
        if (!clear.has(i)) {
          clear.add(i);
          queue.push(i);
        }
      });
    }
    return clear;
  }

  function tileCenter(idx) {
    const tile = boardEl.children[idx];
    if (!tile || !fxLayer) return null;
    const br = boardEl.getBoundingClientRect();
    const tr = tile.getBoundingClientRect();
    return {
      x: tr.left - br.left + tr.width / 2,
      y: tr.top - br.top + tr.height / 2,
    };
  }

  function isLiteFx() {
    return (
      window.matchMedia("(max-width: 720px)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    );
  }

  const BURST_STYLE = {
    crater: { shape: "dust", colors: ["#ffb4a2", "#e86a5a", "#ffd0c0"], n: 8, liteN: 5 },
    cloud: { shape: "puff", colors: ["#ffffff", "#b8f0ff", "#5eb8e8"], n: 6, liteN: 4 },
    stripe: { shape: "shard", colors: ["#e2d0ff", "#8b6ad4", "#c9a8f5"], n: 7, liteN: 5 },
    ring: { shape: "ring", colors: ["#ffe9c8", "#ffc48a", "#f08a3a"], n: 1, liteN: 1 },
    moon: { shape: "orb", colors: ["#fff6d5", "#b8f5d8", "#4ecf9a"], n: 5, liteN: 3 },
    asteroid: { shape: "rock", colors: ["#e0c4a0", "#9a7b5c", "#6a4a30"], n: 7, liteN: 5 },
    "special-line": { shape: "beam", colors: ["#fff8d0", "#ffd76a", "#fff"], n: 5, liteN: 3 },
    "special-bomb": { shape: "flash", colors: ["#ffe0ff", "#ff5ec8", "#9b2bff"], n: 9, liteN: 6 },
    "special-square": { shape: "box", colors: ["#e8ffff", "#3ad0ff", "#7ee0ff"], n: 5, liteN: 3 },
  };

  function spawnBursts(matched) {
    if (!fxLayer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lite = isLiteFx();
    let budget = lite ? 48 : 120;
    matched.forEach((idx) => {
      if (budget <= 0) return;
      const center = tileCenter(idx);
      if (!center) return;
      const tile = grid[idx];
      const key = tile?.special || tile?.type || "crater";
      const style = BURST_STYLE[key] || BURST_STYLE.crater;
      const want = lite ? style.liteN : style.n;
      const n = Math.min(want, budget);
      budget -= n;

      // 폰에서도 형태가 확 다르게: ring은 큰 링, puff는 큰 구름, shard는 가늘고 김
      if (style.shape === "ring") {
        const ring = document.createElement("span");
        ring.className = "burst burst-ring" + (lite ? " burst-lite" : "");
        ring.style.left = `${center.x}px`;
        ring.style.top = `${center.y}px`;
        ring.style.borderColor = style.colors[0];
        fxLayer.appendChild(ring);
        setTimeout(() => ring.remove(), lite ? 420 : 560);
        return;
      }

      for (let i = 0; i < n; i++) {
        const spark = document.createElement("span");
        spark.className = `burst burst-${style.shape}` + (lite ? " burst-lite" : "");
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        const dist = (lite ? 16 : 18) + Math.random() * (lite ? 18 : 26);
        spark.style.left = `${center.x}px`;
        spark.style.top = `${center.y}px`;
        spark.style.background = style.colors[i % style.colors.length];
        spark.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
        spark.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
        spark.style.setProperty("--rot", `${(Math.random() * 80 - 40).toFixed(1)}deg`);
        fxLayer.appendChild(spark);
        setTimeout(() => spark.remove(), lite ? 420 : 580);
      }
    });
  }

  function spawnSpecialFx(origins) {
    // origins: [{ idx, special, axis }]
    if (!fxLayer || !origins?.length) return;
    origins.forEach(({ idx, special, axis }) => {
      const center = tileCenter(idx);
      if (!center) return;
      const fx = document.createElement("span");
      const kind =
        special === "special-line"
          ? "fx-line"
          : special === "special-bomb"
            ? "fx-bomb"
            : "fx-square";
      fx.className = `special-fx ${kind}`;
      if (special === "special-line") fx.dataset.axis = axis || "h";
      fx.style.left = `${center.x}px`;
      fx.style.top = `${center.y}px`;
      fxLayer.appendChild(fx);
      setTimeout(() => fx.remove(), 650);
    });
  }

  function render(matched = new Set(), swapPulse = null, spawnIn = false, fallFrom = null) {
    boardEl.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const idx = r * SIZE + c;
        const tile = cell(r, c);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tile" + (spawnIn ? " spawn-in" : "");
        btn.dataset.r = r;
        btn.dataset.c = c;
        if (fallFrom && fallFrom.has(idx) && fallFrom.get(idx) > 0) {
          const rows = fallFrom.get(idx);
          btn.classList.add("falling");
          btn.style.transform = `translateY(calc(-1 * ${rows} * (var(--tile) + var(--gap))))`;
        }
        if (selected && selected.r === r && selected.c === c) btn.classList.add("selected");
        if (matched.has(idx)) {
          btn.classList.add("matched");
          const mt = tile?.special || tile?.type;
          if (mt) btn.classList.add(`match-${mt}`);
        }
        if (
          swapPulse &&
          ((swapPulse.a.r === r && swapPulse.a.c === c) ||
            (swapPulse.b.r === r && swapPulse.b.c === c))
        ) {
          btn.classList.add("swap-pulse");
        }
        if (tile) {
          const p = document.createElement("div");
          if (tile.special) {
            p.className = `planet ${tile.special} tint-${tile.type}`;
            p.title = SPECIAL_NAMES[tile.special] || tile.special;
            if (tile.special === "special-line" && tile.axis === "v") {
              p.style.transform = "rotate(90deg)";
            }
          } else {
            p.className = `planet ${tile.type}`;
            p.title = TYPES.find((t) => t.id === tile.type)?.name || tile.type;
          }
          btn.appendChild(p);
        }
        btn.addEventListener("pointerdown", onPointerDown);
        btn.addEventListener("pointerup", finishPointer);
        btn.addEventListener("pointercancel", finishPointer);
        boardEl.appendChild(btn);
      }
    }
    movesEl.textContent = String(moves);
    scoreEl.textContent = String(score);
    goalLeftEl.textContent = String(Math.max(0, goalLeft));
    if (goalFill) {
      const done = Math.min(1, (GOAL_COUNT - Math.max(0, goalLeft)) / GOAL_COUNT);
      goalFill.style.width = `${Math.round(done * 100)}%`;
    }
  }

  function adjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function swap(a, b) {
    const tmp = cell(a.r, a.c);
    setCell(a.r, a.c, cell(b.r, b.c));
    setCell(b.r, b.c, tmp);
  }

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  function activateSpecialSwap(a, b) {
    // 특수 타일을 스왑하면 바로 발동
    const clear = new Set();
    const ta = cell(a.r, a.c);
    const tb = cell(b.r, b.c);
    if (ta?.special) {
      expandSpecialClear(a.r * SIZE + a.c, ta.special, ta.axis || (a.c !== b.c ? "h" : "v")).forEach(
        (i) => clear.add(i)
      );
    }
    if (tb?.special) {
      expandSpecialClear(b.r * SIZE + b.c, tb.special, tb.axis || (a.c !== b.c ? "h" : "v")).forEach(
        (i) => clear.add(i)
      );
    }
    return clear;
  }

  async function clearAndRefill(clearSet, spawnSpecials = [], specialFx = []) {
    render(clearSet);
    requestAnimationFrame(() => {
      spawnBursts(clearSet);
      spawnSpecialFx(specialFx);
    });
    await sleep(240);

    let clearedGoal = 0;
    clearSet.forEach((idx) => {
      const t = grid[idx];
      if (t && !t.special && t.type === GOAL_TYPE) clearedGoal++;
      grid[idx] = null;
      score += 10;
    });
    goalLeft = Math.max(0, goalLeft - clearedGoal);

    // 특수 생성: 클리어된 칸에 스폰 (우선순위 bomb > line > square, 같은 칸이면 강한 쪽)
    const spawnMap = new Map();
    for (const s of spawnSpecials) {
      if (!clearSet.has(s.idx) && grid[s.idx] != null) continue;
      const prev = spawnMap.get(s.idx);
      const rank = { "special-bomb": 3, "special-line": 2, "special-square": 1 };
      if (!prev || (rank[s.special] || 0) > (rank[prev.special] || 0)) {
        spawnMap.set(s.idx, s);
      }
    }
    spawnMap.forEach((s, idx) => {
      grid[idx] = makeTile(s.type, s.special);
      if (s.axis) grid[idx].axis = s.axis;
    });

    const fallFrom = new Map();
    for (let c = 0; c < SIZE; c++) {
      let write = SIZE - 1;
      for (let r = SIZE - 1; r >= 0; r--) {
        if (cell(r, c)) {
          if (write !== r) fallFrom.set(write * SIZE + c, write - r);
          setCell(write, c, cell(r, c));
          if (write !== r) setCell(r, c, null);
          write--;
        }
      }
      const newCount = write + 1;
      for (let r = write; r >= 0; r--) {
        setCell(r, c, makeTile(randType()));
        fallFrom.set(r * SIZE + c, newCount);
      }
    }
    render(new Set(), null, false, fallFrom);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    boardEl.querySelectorAll(".tile.falling").forEach((el) => {
      el.style.transform = "";
    });
    await sleep(260);
  }

  function collectSpecialFx(clearSet) {
    const fx = [];
    clearSet.forEach((idx) => {
      const t = grid[idx];
      if (t?.special) fx.push({ idx, special: t.special, axis: t.axis || "h" });
    });
    return fx;
  }


  function wouldCreateMatchAfterSwap(a, b) {
    swap(a, b);
    const { matched } = analyzeMatches();
    const special =
      (cell(a.r, a.c) && cell(a.r, a.c).special) ||
      (cell(b.r, b.c) && cell(b.r, b.c).special);
    swap(a, b);
    return matched.size > 0 || !!special;
  }

  function hasValidMove() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (c + 1 < SIZE && wouldCreateMatchAfterSwap({ r, c }, { r, c: c + 1 })) return true;
        if (r + 1 < SIZE && wouldCreateMatchAfterSwap({ r, c }, { r: r + 1, c })) return true;
      }
    }
    return false;
  }

  function shuffleBoardKeepSpecials() {
    const normals = [];
    const slots = [];
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i];
      if (t && !t.special) {
        normals.push(t);
        slots.push(i);
      }
    }
    for (let i = normals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [normals[i], normals[j]] = [normals[j], normals[i]];
    }
    slots.forEach((idx, n) => {
      grid[idx] = normals[n];
    });
  }

  async function ensureMoves() {
    if (gameOver || hasValidMove()) return;
    messageEl.textContent = "수 없음 — 보드 섞는 중…";
    render();
    await sleep(200);
    let tries = 0;
    do {
      shuffleBoardKeepSpecials();
      tries++;
    } while (!hasValidMove() && tries < 40);
    if (!hasValidMove()) {
      // 최후: 특수 유지한 채 전체 재배치 실패 시 일반만 재생성
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] && !grid[i].special) grid[i] = makeTile(randType());
      }
      // 초기 매치 제거
      let guard = 0;
      while (analyzeMatches().matched.size && guard++ < 30) {
        const { matched } = analyzeMatches();
        matched.forEach((idx) => {
          if (grid[idx] && !grid[idx].special) grid[idx] = makeTile(randType());
        });
      }
    }
    messageEl.textContent = "보드를 섞었어";
    render();
    await sleep(500);
    if (!gameOver) messageEl.textContent = "";
  }

  async function resolveBoard(initialClear = null) {
    if (initialClear && initialClear.size) {
      await clearAndRefill(initialClear, [], collectSpecialFx(initialClear));
    }

    let cascading = true;
    while (cascading) {
      const { matched, specials } = analyzeMatches();
      if (matched.size === 0) {
        cascading = false;
        break;
      }
      const clear = gatherClears(matched);
      await clearAndRefill(clear, specials, collectSpecialFx(clear));
    }
    await ensureMoves();
  }

  function showOverlay(win) {
    if (!overlayEl) return;
    const card = overlayEl.querySelector(".overlay-card");
    card.classList.toggle("win-state", win);
    card.classList.toggle("lose-state", !win);
    overlayBadge.className = `overlay-badge ${win ? "win" : "lose"}`;
    overlayTitle.textContent = win ? "클리어!" : "실패…";
    overlaySub.textContent = win ? "행성을 뿌셨어" : "수가 모자라";
    overlayScore.textContent = String(score);
    overlayMoves.textContent = String(Math.max(0, moves));
    overlayEl.classList.remove("hidden");
  }

  function hideOverlay() {
    if (overlayEl) overlayEl.classList.add("hidden");
  }

  function checkEnd() {
    if (goalLeft <= 0) {
      gameOver = true;
      messageEl.textContent = "클리어! 행성을 뿌셨어 🎉";
      showOverlay(true);
      return true;
    }
    if (moves <= 0) {
      gameOver = true;
      messageEl.textContent = "수 부족… 다시 도전해 봐";
      showOverlay(false);
      return true;
    }
    return false;
  }

  const SWIPE_PX = 28;
  let pointerGesture = null;

  function inBounds(pos) {
    return pos.r >= 0 && pos.r < SIZE && pos.c >= 0 && pos.c < SIZE;
  }

  function onPointerDown(e) {
    if (busy || gameOver) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const r = Number(e.currentTarget.dataset.r);
    const c = Number(e.currentTarget.dataset.c);
    pointerGesture = {
      r,
      c,
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      swiped: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  }

  function finishPointer(e) {
    if (!pointerGesture || pointerGesture.id !== e.pointerId) return;
    const g = pointerGesture;
    pointerGesture = null;
    if (busy || gameOver) return;

    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX >= SWIPE_PX || absY >= SWIPE_PX) {
      const to =
        absX > absY
          ? { r: g.r, c: g.c + (dx > 0 ? 1 : -1) }
          : { r: g.r + (dy > 0 ? 1 : -1), c: g.c };
      if (inBounds(to)) void attemptSwap({ r: g.r, c: g.c }, to);
      return;
    }

    onTap({ r: g.r, c: g.c });
  }

  function onTap(pos) {
    if (busy || gameOver) return;

    if (!selected) {
      selected = pos;
      render();
      return;
    }

    if (selected.r === pos.r && selected.c === pos.c) {
      selected = null;
      render();
      return;
    }

    if (!adjacent(selected, pos)) {
      selected = pos;
      render();
      return;
    }

    void attemptSwap(selected, pos);
  }

  async function attemptSwap(from, pos) {
    if (busy || gameOver) return;
    if (!adjacent(from, pos)) return;

    busy = true;
    selected = null;
    lastSwap = { a: from, b: pos };
    swap(from, pos);
    render(new Set(), { a: from, b: pos });
    await sleep(150);

    const aTile = cell(from.r, from.c);
    const bTile = cell(pos.r, pos.c);
    const specialMove = (aTile && aTile.special) || (bTile && bTile.special);

    if (specialMove) {
      moves -= 1;
      // 줄클리어 축: 스왑 방향 기준으로 보정
      [from, pos].forEach((p) => {
        const t = cell(p.r, p.c);
        if (t && t.special === "special-line" && !t.axis) {
          t.axis = from.c !== pos.c ? "h" : "v";
        }
      });
      const clear = activateSpecialSwap(from, pos);
      await resolveBoard(clear);
      lastSwap = null;
      checkEnd();
      render();
      busy = false;
      return;
    }

    const { matched } = analyzeMatches();
    if (matched.size === 0) {
      swap(from, pos);
      render();
      lastSwap = null;
      busy = false;
      return;
    }

    moves -= 1;
    await resolveBoard();
    lastSwap = null;
    checkEnd();
    render();
    busy = false;
  }

  function restart() {
    moves = START_MOVES;
    score = 0;
    goalLeft = GOAL_COUNT;
    gameOver = false;
    selected = null;
    busy = false;
    lastSwap = null;
    messageEl.textContent = "";
    hideOverlay();
    if (fxLayer) fxLayer.innerHTML = "";
    fillNoMatch();
    render();
    ensureMoves();
  }

  restartBtn.addEventListener("click", restart);
  if (overlayRestart) overlayRestart.addEventListener("click", restart);
  restart();
})();
