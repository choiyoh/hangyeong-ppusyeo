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
  const FALL_MS = 260;
  const SWAP_MS = 150;
  const MATCH_MS = 340;

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
  let pointerGesture = null;
  let dragGhost = null;

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

  function typeAt(r, c) {
    const t = cell(r, c);
    return t && !t.special ? t.type : t ? t.type : null;
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
        const same = c < SIZE && typeAt(r, c) && typeAt(r, c) === typeAt(r, c - 1);
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
        const same = r < SIZE && typeAt(r, c) && typeAt(r, c) === typeAt(r - 1, c);
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

  function analyzeMatches() {
    const matched = new Set();
    const specials = [];
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
      if (idxs.every((i) => coveredByLong.has(i))) continue;
      idxs.forEach((i) => matched.add(i));
      const spawn = pickSpawn(sq.cells);
      specials.push({
        idx: spawn.r * SIZE + spawn.c,
        special: "special-square",
        type: sq.type,
      });
    }

    return { matched, specials, runs };
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
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) clear.add(r * SIZE + c);
        }
      }
    } else if (special === "special-square") {
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

  REMAINDER_TRUNCATED_SEE_DISK_FILE
