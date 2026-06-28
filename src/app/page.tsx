"use client";

import React, { useState, useEffect, useRef } from "react";

// Types for logs, history, nutrients
interface LogEntry {
  id: string;
  text: string;
  type: "success" | "error" | "info" | "p1" | "p2" | "system";
  time: string;
}

interface PlacedIdiom {
  id: string;
  word: string;
  row: number; // 0-indexed
  col: number; // 0-indexed
  direction: "H" | "V" | "HR" | "VR";
  player: 1 | 2;
  score: number;
  combo: number;
  chapter?: number;
}

interface Nutrient {
  r: number;
  c: number;
  type: "points" | "time";
}

const COL_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

// Presets
const PRESET_IDIOMS = [
  "一心一意", "意氣風發", "發揚光大", "大言不慚", "蠶食鯨吞",
  "生生不息", "息事寧人", "人山人海", "海闊天空", "空前絕後",
];

const STARTING_IDIOMS = [
  "開天闢地", "一馬當先", "眾志成城", "名列前茅", "風調雨順", "國泰民安", "萬事如意", "蒸蒸日上", "前程似錦", "馬到成功",
];

const RELIC_DETAILS: Record<string, { title: string; desc: string; icon: string }> = {
  membrane: {
    title: "再生細胞膜",
    desc: "最大生命值 +1，且生命值已補滿。",
    icon: "🧬"
  },
  radar: {
    title: "突觸雷達",
    desc: "提示上限與次數各 +2。此後每通過一關，自動補充 1 次提示。",
    icon: "📡"
  },
  prepared: {
    title: "有備無患",
    desc: "提示上限與次數各 +2。使用提示後，下一個成語得分與對 BOSS 傷害提升 50%。",
    icon: "🛡️"
  },
  color: {
    title: "色彩斑斕",
    desc: "放置包含顏色字（紅、白、藍、黃、黑、青、綠、紫）的成語，得分加倍且回復 1 HP (不超上限)。",
    icon: "🎨"
  },
  autophagy: {
    title: "細胞自噬",
    desc: "達成 Combo 2x 或以上時，隨機清除盤面上一個贅字阻擋格或岩石格。",
    icon: "🦠"
  }
};

export default function Home() {
  // --- Theme State ---
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const isLight = !document.documentElement.classList.contains("dark");
    setTheme(isLight ? "light" : "dark");
  }, []);

  // --- Game Modes States ---
  const [gameMode, setGameMode] = useState<"free" | "challenge" | "battle" | "dungeon">("dungeon");
  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">("idle");

  // --- Grid & Placements ---
  const [grid, setGrid] = useState<string[][]>(() =>
    Array(15).fill(null).map(() => Array(15).fill(""))
  );
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [inputWord, setInputWord] = useState<string>("");
  const [direction, setDirection] = useState<"H" | "V" | "HR" | "VR">("H");
  const [history, setHistory] = useState<PlacedIdiom[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // Visual effects: track recently placed cells for flash animation
  const [lastPlacedCells, setLastPlacedCells] = useState<Set<string>>(new Set());
  // Re-key preview animations when preview content changes
  const previewKeyRef = useRef<number>(0);

  // --- Multi-Mode Core States ---
  const [scores, setScores] = useState<{ p1: number; p2: number }>({ p1: 0, p2: 0 });
  const [cellOwners, setCellOwners] = useState<Record<string, 1 | 2>>({});
  const [nutrients, setNutrients] = useState<Nutrient[]>([]);

  // --- Dictionary States ---
  const [idiomsWords, setIdiomsWords] = useState<Set<string>>(new Set());
  const [idiomsWordsArr, setIdiomsWordsArr] = useState<string[]>([]);
  const [idiomsDetails, setIdiomsDetails] = useState<Record<string, any>>({});
  const [loadingDict, setLoadingDict] = useState<boolean>(true);
  const [winnerOverride, setWinnerOverride] = useState<1 | 2 | null>(null);
  const [charMap, setCharMap] = useState<Record<string, string>>({});

  // --- Dungeon / Roguelike States ---
  const [chapter, setChapter] = useState<number>(1);
  const [hp, setHp] = useState<number>(3);
  const [maxHp, setMaxHp] = useState<number>(3);
  const [hintsCount, setHintsCount] = useState<number>(3);
  const [maxHints, setMaxHints] = useState<number>(3);
  const [chapterScore, setChapterScore] = useState<number>(0);
  const [relics, setRelics] = useState<string[]>([]);
  const [relicChoices, setRelicChoices] = useState<string[] | null>(null);
  const [relicCheckpointsTriggered, setRelicCheckpointsTriggered] = useState<Set<number>>(new Set());
  const [preparedBonusActive, setPreparedBonusActive] = useState<boolean>(false);
  const [showVictoryOverlay, setShowVictoryOverlay] = useState<boolean>(false);

  // --- Boss & Obstacles States ---
  const [bossActive, setBossActive] = useState<boolean>(false);
  const [bossHp, setBossHp] = useState<number>(0);
  const [bossMaxHp, setBossMaxHp] = useState<number>(300);
  const [rockCells, setRockCells] = useState<Set<string>>(new Set());

  // --- Chapter 2 Boss [沙漏文曲星] States ---
  const [activeBomb, setActiveBomb] = useState<{
    r: number;
    c: number;
    timeLeft: number;
    char: string;
  } | null>(null);
  const [bombStepCounter, setBombStepCounter] = useState<number>(0);
  const [selectedRelicInfo, setSelectedRelicInfo] = useState<{ title: string; desc: string; icon: string } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ word: string; hpLost: number } | null>(null);

  // --- Chapter 3 Boss [竹簡巨蟒] States ---
  const [pythonBody, setPythonBody] = useState<{ r: number; c: number }[]>([]);
  const [pythonNextMove, setPythonNextMove] = useState<{ r: number; c: number } | null>(null);
  const [pythonStunned, setPythonStunned] = useState<boolean>(false);
  const [inkCells, setInkCells] = useState<Record<string, number>>({});

  // --- Boss Tutorial States ---
  const [showBossTutorial, setShowBossTutorial] = useState<boolean>(false);

  const convertToTraditional = (str: string) => {
    return str.split("").map((char) => charMap[char] || char).join("");
  };
  
  // Battle Mode specific (retained for compatibility/potential future PvP)
  const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(1);
  const [consecutivePasses, setConsecutivePasses] = useState<number>(0);
  const [lives, setLives] = useState<{ p1: number; p2: number }>({ p1: 5, p2: 5 });
  const [damageFlash, setDamageFlash] = useState<{ p1: boolean; p2: boolean }>({ p1: false, p2: false });
  const [screenShake, setScreenShake] = useState<boolean>(false);

  // Time systems
  const [timeLeft, setTimeLeft] = useState<number>(120); // 120s for challenge, 30s per turn for battle
  const [lastTimeBonus, setLastTimeBonus] = useState<number>(0);
  const [timerBonusTrigger, setTimerBonusTrigger] = useState<number>(0);

  // React 19 Ref for timers
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- UI Optimization States ---
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [activeLogTab, setActiveLogTab] = useState<"history" | "system">("history");

  // --- Helper: Add Log ---
  const addLog = (text: string, type: "success" | "error" | "info" | "p1" | "p2" | "system" = "info") => {
    const time = new Date().toLocaleTimeString("zh-TW", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [{ id: Math.random().toString(), text, type, time }, ...prev].slice(0, 50));
  };

  const playExplosionSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      
      oscGain.gain.setValueAtTime(0.6, ctx.currentTime);
      oscGain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 400;
      filter.Q.value = 1.5;
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.5, ctx.currentTime);
      noiseGain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
      
      noise.start();
      noise.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn("Web Audio API not supported or blocked by browser autocomplete policies:", e);
    }
  };

  const triggerDamageEffect = (player: 1 | 2) => {
    setDamageFlash((prev) => ({
      p1: player === 1 ? true : prev.p1,
      p2: player === 2 ? true : prev.p2,
    }));
    setScreenShake(true);
    playExplosionSound();
    setTimeout(() => {
      setDamageFlash({ p1: false, p2: false });
      setScreenShake(false);
    }, 800);
  };

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    addLog(`系統環境變更：已切換至【${nextTheme === "dark" ? "黑夜模式 (Cyberpunk)" : "白天模式 (Futuristic Light)"}】`, "system");
  };

  const getGridSizeForChapter = (ch: number, mode: "free" | "challenge" | "battle" | "dungeon") => {
    if (mode !== "dungeon") return 15;
    if (ch === 1) return 11;
    if (ch === 2) return 13;
    if (ch === 3) return 15;
    if (ch === 4) return 17;
    return 19;
  };

  const getTargetScoreForChapter = (ch: number) => {
    return 500;
  };

  const getRelicCheckpointsForChapter = (ch: number) => {
    return [200, 400];
  };

  const getPythonNextMove = (
    body: { r: number; c: number }[],
    currentGrid: string[][],
    rocks: Set<string>
  ): { r: number; c: number } | null => {
    if (body.length === 0) return null;
    const head = body[0];
    const size = currentGrid.length;
    const candidates = [
      { r: head.r - 1, c: head.c },
      { r: head.r + 1, c: head.c },
      { r: head.r, c: head.c - 1 },
      { r: head.r, c: head.c + 1 }
    ];

    const validCandidates = candidates.filter((cand) => {
      if (cand.r < 0 || cand.r >= size || cand.c < 0 || cand.c >= size) return false;
      if (rocks.has(`${cand.r},${cand.c}`)) return false;
      if (body.some((b) => b.r === cand.r && b.c === cand.c)) return false;
      return true;
    });

    if (validCandidates.length === 0) return null;

    const playerCells: { r: number; c: number }[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const char = currentGrid[r][c];
        if (char !== "") {
          const isBossCell = body.some((b) => b.r === r && b.c === c);
          const isRock = rocks.has(`${r},${c}`);
          if (!isBossCell && !isRock) {
            playerCells.push({ r, c });
          }
        }
      }
    }

    if (playerCells.length === 0) {
      return validCandidates[Math.floor(Math.random() * validCandidates.length)];
    }

    let bestCand = validCandidates[0];
    let minDistance = Infinity;

    for (const cand of validCandidates) {
      let candMinDist = Infinity;
      for (const pCell of playerCells) {
        const dist = Math.abs(cand.r - pCell.r) + Math.abs(cand.c - pCell.c);
        if (dist < candMinDist) {
          candMinDist = dist;
        }
      }
      if (candMinDist < minDistance) {
        minDistance = candMinDist;
        bestCand = cand;
      }
    }

    return bestCand;
  };

  // --- Helper: Spawn Nutrient Cells ---
  const spawnNutrients = (
    targetCount: number,
    currentGrid: string[][],
    existingNutrients: Nutrient[],
    isChallengeMode: boolean
  ) => {
    const list = [...existingNutrients];
    const emptyCells: { r: number; c: number }[] = [];
    const sizeR = currentGrid.length;
    const sizeC = currentGrid[0]?.length || 0;

    for (let r = 0; r < sizeR; r++) {
      for (let c = 0; c < sizeC; c++) {
        if (currentGrid[r][c] === "") {
          const hasNutrient = list.some((n) => n.r === r && n.c === c);
          if (!hasNutrient) {
            emptyCells.push({ r, c });
          }
        }
      }
    }

    while (list.length < targetCount && emptyCells.length > 0) {
      const idx = Math.floor(Math.random() * emptyCells.length);
      const cell = emptyCells.splice(idx, 1)[0];
      // Time nutrients only spawn in Challenge mode (30% probability)
      const type = isChallengeMode && Math.random() < 0.3 ? "time" : "points";
      list.push({ r: cell.r, c: cell.c, type });
    }
    return list;
  };
  // --- Reset Game with confirmation ---
  const resetGame = (mode: "free" | "challenge" | "battle" | "dungeon") => {
    const size = getGridSizeForChapter(1, mode);
    setGrid(Array(size).fill(null).map(() => Array(size).fill("")));
    setScores({ p1: 0, p2: 0 });
    setLives({ p1: 5, p2: 5 });
    setHistory([]);
    setSelectedCell(null);
    setInputWord("");
    setCellOwners({});
    setConsecutivePasses(0);
    setCurrentPlayer(1);
    setGameState("idle");
    setWinnerOverride(null);
    setNutrients([]);
    setLogs([]);
    setTimeLeft(mode === "challenge" ? 120 : mode === "battle" ? 60 : 90);
    setLastTimeBonus(0);
    setTimerBonusTrigger(0);
    
    // Dungeon specific reset
    setChapter(1);
    setHp(3);
    setMaxHp(3);
    setHintsCount(3);
    setMaxHints(3);
    setChapterScore(0);
    setRelics([]);
    setRelicChoices(null);
    setRelicCheckpointsTriggered(new Set());
    setPreparedBonusActive(false);
    setShowVictoryOverlay(false);
    setBossActive(false);
    setBossHp(0);
    setRockCells(new Set());
    setActiveBomb(null);
    setBombStepCounter(0);
    setSelectedRelicInfo(null);
    setDuplicateWarning(null);
    setPythonBody([]);
    setPythonNextMove(null);
    setPythonStunned(false);
    setInkCells({});
  };

  // Switch modes handler
  const handleSwitchMode = (targetMode: typeof gameMode) => {
    if (targetMode === gameMode) return;
    
    const isEmpty = grid.every((row) => row.every((cell) => cell === ""));
    if (gameState === "playing" && !isEmpty) {
      if (!window.confirm("切換模式將清除當前畫布進度。確定要切換嗎？")) {
        return;
      }
    }
    handleStartGame(targetMode);
  };

  const handleStartGame = (modeOverride?: typeof gameMode) => {
    const activeMode = modeOverride || gameMode;
    if (modeOverride) {
      setGameMode(modeOverride);
    }
    setWinnerOverride(null);
    setGameState("playing");
    
    const size = getGridSizeForChapter(1, activeMode);
    setGrid(Array(size).fill(null).map(() => Array(size).fill("")));
    setScores({ p1: 0, p2: 0 });
    setLives({ p1: 5, p2: 5 });
    setHistory([]);
    setSelectedCell(null);
    setInputWord("");
    setCellOwners({});
    setConsecutivePasses(0);
    setCurrentPlayer(1);
    setLastTimeBonus(0);
    setTimerBonusTrigger(0);

    // Dungeon specific initialization
    setChapter(1);
    setHp(3);
    setMaxHp(3);
    setHintsCount(3);
    setMaxHints(3);
    setChapterScore(0);
    setRelics([]);
    setRelicChoices(null);
    setRelicCheckpointsTriggered(new Set());
    setPreparedBonusActive(false);
    setShowVictoryOverlay(false);
    setBossActive(false);
    setBossHp(0);
    setRockCells(new Set());
    setActiveBomb(null);
    setBombStepCounter(0);
    setSelectedRelicInfo(null);
    setDuplicateWarning(null);
    setPythonBody([]);
    setPythonNextMove(null);
    setPythonStunned(false);
    setInkCells({});

    // Auto-place random starter word in center
    const randomWord = STARTING_IDIOMS[Math.floor(Math.random() * STARTING_IDIOMS.length)];
    const centerRow = Math.floor(size / 2);
    const centerCol = Math.floor(size / 2) - 2;
    const newGrid = Array(size).fill(null).map(() => Array(size).fill(""));
    const newCellOwners: Record<string, 1 | 2> = {};

    for (let i = 0; i < randomWord.length; i++) {
      newGrid[centerRow][centerCol + i] = randomWord[i];
      newCellOwners[`${centerRow},${centerCol + i}`] = 1;
    }

    setGrid(newGrid);
    setCellOwners(newCellOwners);

    if (activeMode === "free") {
      setTimeLeft(90);
      setScores({ p1: 100, p2: 0 });
      const initialNutrients = spawnNutrients(8, newGrid, [], false);
      setNutrients(initialNutrients);
      addLog(`【自由練習模式】已開始！首詞為「${randomWord}」，無時間限制。`, "system");
    } else if (activeMode === "challenge") {
      setTimeLeft(120);
      setScores({ p1: 100, p2: 0 });
      const initialNutrients = spawnNutrients(8, newGrid, [], true);
      setNutrients(initialNutrients);
      addLog(`【積分挑戰模式】已開始！首詞為「${randomWord}」，限時 120 秒，吃掉 ⏰ 或正確輸入成語可延長時間。`, "system");
    } else if (activeMode === "battle") {
      setTimeLeft(60);
      setScores({ p1: 0, p2: 0 });
      const initialNutrients = spawnNutrients(8, newGrid, [], false);
      setNutrients(initialNutrients);
      addLog(`【雙人對抗生存模式】已開始！首詞為「${randomWord}」歸藍色阿米巴，目前輪到藍色阿米巴。雙方各有 5 條生命，每回合思考時間為 60 秒！`, "system");
    } else if (activeMode === "dungeon") {
      setTimeLeft(90);
      setScores({ p1: 0, p2: 0 });
      const initialNutrients = spawnNutrients(8, newGrid, [], false);
      setNutrients(initialNutrients);
      addLog(`【地牢冒險模式】已開始！第一章：字林初探。首詞為「${randomWord}」。`, "system");
    }

    setHistory([
      {
        id: Math.random().toString(),
        word: randomWord,
        row: centerRow,
        col: centerCol,
        direction: "H",
        player: 1,
        score: activeMode === "battle" ? 0 : 100,
        combo: 0,
        chapter: activeMode === "dungeon" ? 1 : undefined,
      },
    ]);
    setSelectedCell({ row: centerRow, col: centerCol });
    setDirection("V");
  };

  const handleGiveUp = () => {
    if (gameMode === "battle") {
      if (window.confirm("確定向對手認輸嗎？")) {
        setWinnerOverride(currentPlayer === 1 ? 2 : 1);
        setGameState("gameover");
        addLog(`【系統】玩家 ${currentPlayer === 1 ? "一" : "二"} 選擇認輸！對手直接獲勝。`, "system");
      }
    } else {
      if (window.confirm("確定要放棄此局並結算分數嗎？")) {
        setGameState("gameover");
        addLog("【系統】您已選擇放棄此局，進入分數結算。", "system");
      }
    }
  };

  const handleGetHint = () => {
    if (gameState !== "playing") return;

    if (gameMode === "dungeon") {
      if (hintsCount <= 0) {
        addLog("提示次數已耗盡，無法獲取提示！", "error");
        return;
      }
    } else if (gameMode === "battle") {
      const currentLives = currentPlayer === 1 ? lives.p1 : lives.p2;
      if (currentLives <= 0) {
        addLog("生命值已耗盡，無法獲取提示！", "error");
        return;
      }
      if (!window.confirm("使用提示將扣除 1 點生命值！確定要使用嗎？")) return;
    } else if (gameMode === "challenge") {
      const currentScore = scores.p1;
      if (currentScore < 50) {
        addLog("積分不足 50 分，無法獲取提示！", "error");
        return;
      }
    }

    if (idiomsWordsArr.length === 0) {
      addLog("成語資料庫尚未載入完成，請稍候！", "error");
      return;
    }

    const placedWords = new Set(history.map((h) => h.word));

    // Find all occupied cells on the board
    const occupiedCells: { r: number; c: number; char: string }[] = [];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] !== "") {
          occupiedCells.push({ r, c, char: grid[r][c] });
        }
      }
    }

    if (occupiedCells.length === 0) {
      addLog("網格為空，無法提供接龍提示！請先開始或放置首詞。", "error");
      return;
    }

    // Shuffle occupied cells to give random starting points
    const shuffledCells = [...occupiedCells].sort(() => Math.random() - 0.5);

    // Pick a random starting point in our idioms array to ensure diversity
    const startIdx = Math.floor(Math.random() * idiomsWordsArr.length);

    let hintFound = false;

    // Search for a valid placement
    for (const cell of shuffledCells) {
      const { r, c, char } = cell;

      // Scan our idioms list
      for (let k = 0; k < idiomsWordsArr.length; k++) {
        const wordIdx = (startIdx + k) % idiomsWordsArr.length;
        const word = idiomsWordsArr[wordIdx];

        // Avoid recommending already-used idioms
        if (placedWords.has(word)) continue;

        // Check if the word contains the character
        const firstPos = word.indexOf(char);
        if (firstPos === -1) continue;

        const charIndices: number[] = [];
        let pos = firstPos;
        while (pos !== -1) {
          charIndices.push(pos);
          pos = word.indexOf(char, pos + 1);
        }

        // Try all four directions for all matching letter indices
        const shuffledDirs: Array<"H" | "V" | "HR" | "VR"> = ["H", "V", "HR", "VR"].sort(() => Math.random() - 0.5) as Array<"H" | "V" | "HR" | "VR">;
        for (const dir of shuffledDirs) {
          for (const matchIdx of charIndices) {
            // startR/startC = position of word[0] given char[matchIdx] is at (r, c)
            let startR: number, startC: number;
            if (dir === "H")  { startR = r; startC = c - matchIdx; }
            else if (dir === "V")  { startR = r - matchIdx; startC = c; }
            else if (dir === "HR") { startR = r; startC = c + matchIdx; }
            else                   { startR = r + matchIdx; startC = c; } // VR

            const coords = getCoordinatesForWord(startR, startC, word.length, dir);

            const inBounds = coords.every((co) => co.r >= 0 && co.r < grid.length && co.c >= 0 && co.c < (grid[0]?.length || 15));
            if (!inBounds) continue;

            let hasClash = false;
            for (let j = 0; j < coords.length; j++) {
              const isRock = rockCells.has(`${coords[j].r},${coords[j].c}`);
              const existing = grid[coords[j].r][coords[j].c];
              if (isRock || (existing !== "" && existing !== word[j])) {
                hasClash = true;
                break;
              }
            }
            if (hasClash) continue;

            // Found a valid placement!
            const dirLabel = dir === "H" ? "橫向→" : dir === "V" ? "縱向↓" : dir === "HR" ? "逆橫←" : "逆縱↑";
            setInputWord(word);
            setSelectedCell({ row: startR, col: startC });
            setDirection(dir);

            // Deduct life / score / hint
            if (gameMode === "dungeon") {
              setHintsCount((prev) => prev - 1);
              if (relics.includes("prepared")) {
                setPreparedBonusActive(true);
              }
              addLog(
                `【系統提示】使用提示！剩餘提示次數：${hintsCount - 1}/${maxHints}。建議在 ${COL_LABELS[startC]}${startR + 1} (${dirLabel}) 放置成語「${word}」。已自動為您填寫！`,
                "system"
              );
              if (relics.includes("prepared")) {
                addLog("【有備無患】已激活！下一個放置的成語對 BOSS 的傷害與得分將提升 50%。", "success");
              }
            } else if (gameMode === "battle") {
              setLives((prev) => ({
                p1: currentPlayer === 1 ? prev.p1 - 1 : prev.p1,
                p2: currentPlayer === 2 ? prev.p2 - 1 : prev.p2,
              }));
              triggerDamageEffect(currentPlayer);
              addLog(
                `【系統提示】玩家 ${currentPlayer === 1 ? "一" : "二"} 使用了提示，扣除 1 點生命值！建議在 ${COL_LABELS[startC]}${startR + 1} (${dir === "H" ? "橫向" : "縱向"}) 放置成語「${word}」。已自動為您填寫！`,
                "system"
              );
            } else if (gameMode === "challenge") {
              setScores((prev) => ({ ...prev, p1: Math.max(0, prev.p1 - 50) }));
              addLog(
                `【系統提示】已扣除 50 積分！建議在 ${COL_LABELS[startC]}${startR + 1} (${dir === "H" ? "橫向" : "縱向"}) 放置成語「${word}」。已自動為您填寫！`,
                "system"
              );
            } else {
              addLog(
                `【系統提示】建議在 ${COL_LABELS[startC]}${startR + 1} (${dir === "H" ? "橫向" : "縱向"}) 放置成語「${word}」。已自動為您填寫！`,
                "system"
              );
            }
            hintFound = true;
            break;
          }
          if (hintFound) break;
        }
        if (hintFound) break;
      }
      if (hintFound) break;
    }

    if (!hintFound) {
      addLog("地圖上目前找不到符合接龍規則的可行成語，請重試或點擊重設！", "error");
    }
  };

  // Initialize game on mount
  useEffect(() => {
    // Initial feed
    const initNutrients = spawnNutrients(8, grid, [], false);
    setNutrients(initNutrients);
    addLog("歡迎來到成語阿米巴！點擊網格任一位置為起點，輸入 4 字成語開始接龍。", "system");

    // Load idioms wordlist for quick validation
    addLog("正在載入成語檢索庫...", "system");
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const version = "1.28"; // Cache-busting version parameter matching UI version
    
    fetch(`${basePath}/idioms_words.json?v=${version}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load idioms words");
        return res.json();
      })
      .then((wordsList) => {
        setIdiomsWords(new Set(wordsList));
        setIdiomsWordsArr(wordsList);
        setLoadingDict(false);
        addLog("成語庫載入完成，已啟用嚴格成語驗證！", "success");
      })
      .catch((err) => {
        console.error("Failed to load idioms words:", err);
        addLog("成語庫載入失敗，請重新整理網頁。", "error");
      });

    // Load full details lazily in background
    fetch(`${basePath}/idioms.json?v=${version}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load idioms details");
        return res.json();
      })
      .then((detailsList) => {
        const detailsMap: Record<string, any> = {};
        detailsList.forEach((item: any) => {
          detailsMap[item.word] = item;
        });
        setIdiomsDetails(detailsMap);
      })
      .catch((err) => {
        console.error("Failed to load idioms details:", err);
      });

    // Load character mapping for simplified-to-traditional conversion
    fetch(`${basePath}/simplified_to_traditional.json?v=${version}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load character mapping");
        return res.json();
      })
      .then((map) => {
        setCharMap(map);
      })
      .catch((err) => {
        console.error("Failed to load character mapping:", err);
      });
  }, []);

  // --- Game Loop (Timer) Effect ---
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (gameState !== "playing") return;
    if (gameMode === "free" || gameMode === "dungeon") return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (gameMode === "challenge") {
            setGameState("gameover");
            addLog("時間到！【積分挑戰】已結束，請在面板查看您的最終成績！", "system");
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          } else if (gameMode === "battle") {
            const nextP = currentPlayer === 1 ? 2 : 1;
            addLog(`玩家 ${currentPlayer === 1 ? "一" : "二"} 回合逾時！扣除 1 點生命值並更換回合。`, "error");
            setLives((prev) => ({
              p1: currentPlayer === 1 ? prev.p1 - 1 : prev.p1,
              p2: currentPlayer === 2 ? prev.p2 - 1 : prev.p2,
            }));
            triggerDamageEffect(currentPlayer);
            setCurrentPlayer(nextP);
            return 60;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameMode, gameState, currentPlayer]);

  // --- Check for Battle Mode Game Over (Lives) ---
  useEffect(() => {
    if (gameMode === "battle" && gameState === "playing") {
      if (lives.p1 <= 0) {
        setWinnerOverride(2);
        setGameState("gameover");
        addLog("【系統】藍色阿米巴 P1 生命值歸零，粉色阿米巴 P2 獲得勝利！", "system");
      } else if (lives.p2 <= 0) {
        setWinnerOverride(1);
        setGameState("gameover");
        addLog("【系統】粉色阿米巴 P2 生命值歸零，藍色阿米巴 P1 獲得勝利！", "system");
      }
    }
  }, [lives, gameMode, gameState]);

  // --- Dungeon Chapter 2 Boss Active Bomb Timer ---
  useEffect(() => {
    if (gameState !== "playing" || gameMode !== "dungeon" || !bossActive || !activeBomb) {
      return;
    }

    const bombInterval = setInterval(() => {
      setActiveBomb((prev) => {
        if (!prev) return null;
        if (prev.timeLeft <= 1) {
          clearInterval(bombInterval);
          handleBombExplosion(prev.r, prev.c);
          return null;
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(bombInterval);
  }, [gameState, gameMode, bossActive, activeBomb]);

  // --- Check empty board ---
  const isGridEmpty = () => {
    return grid.every((row) => row.every((cell) => cell === ""));
  };

  // --- Calculate coordinates helper ---
  const getCoordinatesForWord = (
    row: number,
    col: number,
    wordLength: number,
    dir: "H" | "V" | "HR" | "VR"
  ) => {
    const coords = [];
    for (let i = 0; i < wordLength; i++) {
      // H: left→right, V: top→bottom, HR: right→left, VR: bottom→top
      const r = (dir === "H" || dir === "HR") ? row : (dir === "V" ? row + i : row - i);
      const c = (dir === "V" || dir === "VR") ? col : (dir === "H" ? col + i : col - i);
      coords.push({ r, c });
    }
    return coords;
  };

  // --- Preview Logic ---
  const getPreviewState = () => {
    if (!selectedCell || !inputWord || gameState !== "playing") return null;
    const trimmedRaw = inputWord.trim();
    const trimmed = convertToTraditional(trimmedRaw);
    if (trimmed.length === 0) return null;

    const hasNonChinese = /[^\u4e00-\u9fa5]/.test(trimmed);

    const { row, col } = selectedCell;
    const coords = getCoordinatesForWord(row, col, trimmed.length, direction);

    let inBounds = true;
    let hasClash = false;
    let hasOverlap = false;

    const previewGridCells = coords.map((coord, index) => {
      const isWordInBounds = coord.r >= 0 && coord.r < grid.length && coord.c >= 0 && coord.c < (grid[0]?.length || 15);
      if (!isWordInBounds) {
        inBounds = false;
        return { ...coord, char: trimmed[index] || "", inBounds: false, clash: false, overlap: false, slotIndex: index };
      }

      const isRock = rockCells.has(`${coord.r},${coord.c}`);
      const isInk = gameMode === "dungeon" && inkCells[`${coord.r},${coord.c}`] > 0;
      const existingChar = grid[coord.r][coord.c];
      const newChar = trimmed[index] || "";
      const isClash = isRock || isInk || (existingChar !== "" && existingChar !== newChar);
      const isOverlap = !isRock && !isInk && existingChar !== "" && existingChar === newChar;

      if (isClash) hasClash = true;
      if (isOverlap) hasOverlap = true;

      return {
        ...coord,
        char: newChar,
        inBounds: true,
        clash: isClash,
        overlap: isOverlap,
        slotIndex: index,
      };
    });

    const empty = isGridEmpty();
    const isDictValid = loadingDict || idiomsWords.has(trimmed);
    const isValid = inBounds && !hasClash && !hasNonChinese && (trimmed.length === 4 || trimmed.length === 5) && (empty || hasOverlap) && isDictValid;

    // Bump key so preview cells re-animate when content changes
    previewKeyRef.current += 1;

    return {
      cells: previewGridCells,
      isValid,
      inBounds,
      hasClash,
      hasOverlap,
      hasNonChinese,
      isGridEmpty: empty,
      isDictValid,
      previewKey: previewKeyRef.current,
    };
  };

  // --- Keyboard Event Handler for Input ---
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter") {
      e.preventDefault();
      // Only place if valid
      const curPreview = getPreviewState();
      if (selectedCell && inputWord && curPreview?.isValid) {
        handlePlaceIdiom();
      }
    } else if (e.key === " " || e.key === "Spacebar") {
      if (inputWord.length === 0) {
        e.preventDefault();
        setDirection((prev) => prev === "H" ? "V" : prev === "V" ? "HR" : prev === "HR" ? "VR" : "H");
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      setDirection((prev) => prev === "H" ? "V" : prev === "V" ? "HR" : prev === "HR" ? "VR" : "H");
    }
  };

  const preview = getPreviewState();

  // Find idioms in history that cover the selected cell
  const getSelectedCellIdioms = () => {
    if (!selectedCell) return [];
    const { row, col } = selectedCell;
    
    // Filter history for placed idioms that cover the selected row/col
    return history.filter((item) => {
      const len = item.word.length;
      if (item.direction === "H") {
        // left→right: cols item.col … item.col+len-1
        return item.row === row && col >= item.col && col < item.col + len;
      } else if (item.direction === "V") {
        // top→bottom: rows item.row … item.row+len-1
        return item.col === col && row >= item.row && row < item.row + len;
      } else if (item.direction === "HR") {
        // right→left: cols item.col … item.col-len+1
        return item.row === row && col <= item.col && col > item.col - len;
      } else {
        // VR bottom→top: rows item.row … item.row-len+1
        return item.col === col && row <= item.row && row > item.row - len;
      }
    });
  };

  const selectedCellIdioms = getSelectedCellIdioms();

  // --- Dungeon Error & HP Deduction Handler ---
  const handleDungeonFailure = (message: string) => {
    addLog(message, "error");
    if (gameMode === "dungeon") {
      setHp((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          setGameState("gameover");
          addLog("💀 您的生命值已耗盡，地牢冒險失敗！", "error");
        }
        return next;
      });
      setScreenShake(true);
      playExplosionSound();
      setTimeout(() => setScreenShake(false), 800);
    }
  };

  const handleBossDefeated = () => {
    const bossName = chapter === 1 ? "【贅字史萊姆】" : "【沙漏文曲星】";
    addLog(`🎉🎉🎉 恭喜！您成功擊敗了第 ${chapter} 章 BOSS ${bossName}！`, "success");
    setShowVictoryOverlay(true);
    playExplosionSound();
    
    setTimeout(() => {
      setShowVictoryOverlay(false);
      const nextChapter = chapter + 1;
      setChapter(nextChapter);
      setChapterScore(0);
      setRelicCheckpointsTriggered(new Set());
      setBossActive(false);
      setHp(maxHp);
      setHintsCount(maxHints);
      addLog("💖 【關卡獎勵】成功通關！血量與提示次數已完全補滿！", "success");
      
      // Auto-place next starter word with dynamic grid size
      const size = getGridSizeForChapter(nextChapter, gameMode);
      const randomWord = STARTING_IDIOMS[Math.floor(Math.random() * STARTING_IDIOMS.length)];
      const centerRow = Math.floor(size / 2);
      const centerCol = Math.floor(size / 2) - 2;
      const newGrid = Array(size).fill(null).map(() => Array(size).fill(""));
      const newCellOwners: Record<string, 1 | 2> = {};

      for (let i = 0; i < randomWord.length; i++) {
        newGrid[centerRow][centerCol + i] = randomWord[i];
        newCellOwners[`${centerRow},${centerCol + i}`] = 1;
      }

      setHistory((prev) => [
        {
          id: Math.random().toString(),
          word: randomWord,
          row: centerRow,
          col: centerCol,
          direction: "H",
          player: 1,
          score: 100,
          combo: 0,
          chapter: nextChapter,
        },
        ...prev,
      ]);
      
      // Generate rock cells (excluding center starter word and boss 3x3 core)
      const rocks = new Set<string>();
      const centerIdx = Math.floor(size / 2);
      const starterWordCoords = new Set<string>();
      for (let i = 0; i < randomWord.length; i++) {
        starterWordCoords.add(`${centerRow},${centerCol + i}`);
      }
      const bossArea = new Set<string>();
      for (let r = centerIdx - 1; r <= centerIdx + 1; r++) {
        for (let c = centerIdx - 1; c <= centerIdx + 1; c++) {
          bossArea.add(`${r},${c}`);
        }
      }

      const targetRocksCount = nextChapter === 2 ? 3 : nextChapter === 3 ? 5 : nextChapter === 4 ? 7 : nextChapter >= 5 ? 10 : 0;
      while (rocks.size < targetRocksCount) {
        const r = Math.floor(Math.random() * size);
        const c = Math.floor(Math.random() * size);
        const pos = `${r},${c}`;
        if (!starterWordCoords.has(pos) && !bossArea.has(pos) && !rocks.has(pos)) {
          rocks.add(pos);
        }
      }
      setRockCells(rocks);
      setActiveBomb(null);
      setBombStepCounter(0);
      setSelectedRelicInfo(null);
      setDuplicateWarning(null);
      setPythonBody([]);
      setPythonNextMove(null);
      setPythonStunned(false);
      setInkCells({});
      
      setGrid(newGrid);
      setCellOwners(newCellOwners);
      setSelectedCell({ row: centerRow, col: centerCol });
      setDirection("V");
      
      // Spawn nutrients
      const initialNutrients = spawnNutrients(8, newGrid, [], false);
      setNutrients(initialNutrients);
      
      if (relics.includes("radar")) {
        setHintsCount(prev => Math.min(maxHints, prev + 1));
        addLog("【突觸雷達】在章節通關時為您自動補充了 1 次提示！", "success");
      }
      
      addLog(`【地牢冒險】已進入第 ${nextChapter} 章！首詞為「${randomWord}」。`, "system");
    }, 3500);
  };

  const spawnTimeBomb = (currentGrid: string[][]) => {
    const size = currentGrid.length;
    const centerIdx = Math.floor(size / 2);
    
    // Find all cells occupied by user letters (excluding Boss core)
    const candidateCells: { r: number; c: number; char: string }[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const char = currentGrid[r][c];
        if (char !== "") {
          const isBoss = chapter === 1 
            ? (r >= centerIdx - 1 && r <= centerIdx + 1 && c >= centerIdx - 1 && c <= centerIdx + 1)
            : (
                (r === centerIdx - 1 && c === centerIdx) ||
                (r === centerIdx && (c === centerIdx || c === centerIdx + 1)) ||
                (r === centerIdx + 1 && (c === centerIdx - 1 || c === centerIdx || c === centerIdx + 1))
              );
          if (!isBoss) {
            candidateCells.push({ r, c, char });
          }
        }
      }
    }
    
    if (candidateCells.length === 0) return;
    
    // Shuffle and search for a character that has at least 3 usable idioms in dict
    const shuffled = [...candidateCells].sort(() => Math.random() - 0.5);
    let selected = null;
    
    for (const cell of shuffled) {
      const usableCount = idiomsWordsArr.filter((word) => word.includes(cell.char)).length;
      if (usableCount >= 3) {
        selected = cell;
        break;
      }
    }
    
    // Fallback if none satisfies count >= 3
    if (!selected && shuffled.length > 0) {
      selected = shuffled[0];
    }
    
    if (selected) {
      setActiveBomb({
        r: selected.r,
        c: selected.c,
        timeLeft: 20,
        char: selected.char
      });
      addLog(`⏰ 【沙漏文曲星】發動時空封印！鎖定了 ${COL_LABELS[selected.c]}${selected.r + 1} 的字「${selected.char}」，20 秒內必須將其交叉解除！`, "error");
    }
  };

  const handleBombExplosion = (bombR: number, bombC: number) => {
    setGrid((prevGrid) => {
      const newGrid = prevGrid.map((row) => [...row]);
      for (let r = Math.max(0, bombR - 1); r <= Math.min(prevGrid.length - 1, bombR + 1); r++) {
        for (let c = Math.max(0, bombC - 1); c <= Math.min(prevGrid[0].length - 1, bombC + 1); c++) {
          const size = prevGrid.length;
          const centerIdx = Math.floor(size / 2);
          const isBoss = chapter === 1 
            ? (r >= centerIdx - 1 && r <= centerIdx + 1 && c >= centerIdx - 1 && c <= centerIdx + 1)
            : (
                (r === centerIdx - 1 && c === centerIdx) ||
                (r === centerIdx && (c === centerIdx || c === centerIdx + 1)) ||
                (r === centerIdx + 1 && (c === centerIdx - 1 || c === centerIdx || c === centerIdx + 1))
              );
          if (!isBoss) {
            newGrid[r][c] = "";
          }
        }
      }
      return newGrid;
    });

    setCellOwners((prevOwners) => {
      const newOwners = { ...prevOwners };
      for (let r = Math.max(0, bombR - 1); r <= Math.min(grid.length - 1, bombR + 1); r++) {
        for (let c = Math.max(0, bombC - 1); c <= Math.min(grid[0].length - 1, bombC + 1); c++) {
          delete newOwners[`${r},${c}`];
        }
      }
      return newOwners;
    });

    setHp((prevHp) => {
      const nextHp = Math.max(0, prevHp - 1);
      if (nextHp <= 0) {
        setGameState("gameover");
        addLog("💀 時空炸彈爆炸！您失去了最後的生命值，地牢冒險失敗！", "error");
      } else {
        addLog(`💥 【沙漏文曲星】時空炸彈於 ${COL_LABELS[bombC]}${bombR + 1} 爆炸！周圍 3x3 區域物理蒸發，HP -1！`, "error");
      }
      return nextHp;
    });

    setScreenShake(true);
    setTimeout(() => setScreenShake(false), 800);
    playExplosionSound();
  };

  const handleSelectRelic = (relicId: string) => {
    if (relicId === "membrane") {
      setMaxHp((prev) => {
        const next = prev + 1;
        setHp(next);
        return next;
      });
      addLog("獲得遺物【再生細胞膜】：最大生命值 +1，且生命值已補滿！", "success");
    } else if (relicId === "radar") {
      setHintsCount((prev) => prev + 2);
      addLog("獲得遺物【突觸雷達】：獲得 2 次提示次數。此後每過一關額外補充 1 次提示！", "success");
    } else if (relicId === "prepared") {
      setMaxHints((prev) => prev + 2);
      setHintsCount((prev) => prev + 2);
      addLog("獲得遺物【有備無患】：提示上限 +2，且獲得 2 次提示。提示後下一個成語得分與對 BOSS 傷害提升 50%！", "success");
    } else if (relicId === "color") {
      addLog("獲得遺物【色彩斑斕】：成語中若包含顏色字，得分翻倍且回復 1 點生命值！", "success");
    } else if (relicId === "autophagy") {
      addLog("獲得遺物【細胞自噬】：達成 Combo 2x 或以上時，隨機淨化清除盤面上一個贅字格！", "success");
    }
    setRelics((prev) => [...prev, relicId]);
    setRelicChoices(null);
  };

  // --- Action: Place Idiom ---
  const handlePlaceIdiom = (wordToPlace?: string, customStart?: { row: number; col: number }) => {
    if (gameState !== "playing") return;

    const activeWordRaw = (wordToPlace || inputWord).trim();
    const activeWord = convertToTraditional(activeWordRaw);
    const activeCell = customStart || selectedCell;

    if (!activeCell) {
      addLog("請先選取網格上的格子作為起點座標！", "error");
      return;
    }

    if (/[^\u4e00-\u9fa5]/.test(activeWord)) {
      handleDungeonFailure("放置失敗：成語只能包含中文漢字！");
      return;
    }

    if (activeWord.length !== 4 && activeWord.length !== 5) {
      handleDungeonFailure("成語長度必須為 4 或 5 個字！");
      return;
    }

    if (!loadingDict && !idiomsWords.has(activeWord)) {
      handleDungeonFailure(`放置失敗：「${activeWord}」非成語庫中之有效成語！`);
      return;
    }

    // Duplicate placement check (Dungeon Mode only)
    const currentChapter = gameMode === "dungeon" ? chapter : undefined;
    const sameWordPlacements = history.filter(
      (h) => h.word === activeWord && (gameMode !== "dungeon" || h.chapter === currentChapter)
    ).length;

    if (gameMode === "dungeon" && sameWordPlacements >= 1) {
      setHp((prev) => {
        const next = Math.max(0, prev - 1);
        if (next <= 0) {
          setGameState("gameover");
          addLog(`💀 輸入重複成語「${activeWord}」扣除生命值，生命值已耗盡，地牢冒險失敗！`, "error");
        } else {
          setDuplicateWarning({ word: activeWord, hpLost: 1 });
          addLog(`⚠️ 【重複成語】放置了重複的成語「${activeWord}」，扣除 1 點生命值！`, "error");
        }
        return next;
      });
      setScreenShake(true);
      playExplosionSound();
      setTimeout(() => setScreenShake(false), 800);
    }

    const { row, col } = activeCell;
    const coords = getCoordinatesForWord(row, col, activeWord.length, direction);

    // 1. Bounds Check
    const outOfBounds = coords.some((coord) => coord.r < 0 || coord.r >= grid.length || coord.c < 0 || coord.c >= (grid[0]?.length || 15));
    if (outOfBounds) {
      handleDungeonFailure(`放置失敗：位置超出 ${grid.length}x${grid[0]?.length || 15} 畫布邊界！`);
      return;
    }

    // 2. Clash & Overlap Check
    const emptyBoard = isGridEmpty();
    let overlapsCount = 0;
    let clashCell: { r: number; c: number; existing: string; current: string } | null = null;
    let stolenCount = 0;

    for (let i = 0; i < coords.length; i++) {
      const { r, c } = coords[i];
      const existing = grid[r][c];
      const current = activeWord[i];
      const isRock = rockCells.has(`${r},${c}`);
      const isInk = gameMode === "dungeon" && inkCells[`${r},${c}`] > 0;

      if (isRock) {
        clashCell = { r, c, existing: "🧱", current };
        break;
      }

      if (isInk) {
        clashCell = { r, c, existing: "墨", current };
        break;
      }

      if (existing !== "") {
        if (existing !== current) {
          clashCell = { r, c, existing, current };
          break;
        } else {
          overlapsCount++;
          // Steal mechanic check in Battle Mode
          if (gameMode === "battle") {
            const owner = cellOwners[`${r},${c}`];
            if (owner && owner !== currentPlayer) stolenCount++;
          }
        }
      }
    }

    if (clashCell) {
      handleDungeonFailure(
        `放置失敗：格子 (${COL_LABELS[clashCell.c]}${clashCell.r + 1}) 字元衝突。既存 '${clashCell.existing}'，您欲填入 '${clashCell.current}'！`
      );
      return;
    }

    // 3. Amoeba connection check
    if (!emptyBoard && overlapsCount === 0) {
      handleDungeonFailure("放置失敗：阿米巴規則！新成語必須與畫布上既有的字「共用重疊」以向外延伸！");
      return;
    }

    // --- Scoring & Combo Logic ---
    let comboMultiplier = 1;
    let roundScore = 100;

    if (gameMode === "dungeon") {
      const basePlacementScore = 40;
      comboMultiplier = Math.max(1, overlapsCount);
      roundScore = basePlacementScore * comboMultiplier;

      // Relic: 有備無患 (prepared)
      if (preparedBonusActive) {
        roundScore = Math.floor(roundScore * 1.5);
      }

      // Relic: 色彩斑斕 (color)
      const COLOR_CHARS = new Set(["紅", "白", "藍", "黃", "黑", "青", "綠", "紫"]);
      const hasColor = activeWord.split("").some((char) => COLOR_CHARS.has(char));
      if (hasColor && relics.includes("color")) {
        roundScore *= 2;
        setHp((prev) => Math.min(maxHp, prev + 1));
      }
    } else {
      let basePlacementScore = 100;
      if (overlapsCount === 2) {
        basePlacementScore = 250;
        comboMultiplier = 2;
      } else if (overlapsCount >= 3) {
        basePlacementScore = 500;
        comboMultiplier = 3;
      }
      roundScore = basePlacementScore;
      // Battle mode: steal bonus
      if (gameMode === "battle") {
        roundScore += stolenCount * 150;
      }
    }

    // Check Nutrient consumption
    let timeBonus = 0;
    let pointNutrientCount = 0;
    const remainingNutrients: Nutrient[] = [];
    
    nutrients.forEach((n) => {
      const isConsumed = coords.some((c) => c.r === n.r && c.c === n.c);
      if (isConsumed) {
        if (n.type === "points") {
          roundScore += 200;
          pointNutrientCount++;
        } else {
          timeBonus += 10;
        }
      } else {
        remainingNutrients.push(n);
      }
    });

    // Commit changes
    const newGrid = grid.map((r) => [...r]);
    const newCellOwners = { ...cellOwners };

    coords.forEach((coord, idx) => {
      newGrid[coord.r][coord.c] = activeWord[idx];
      newCellOwners[`${coord.r},${coord.c}`] = currentPlayer;
    });

    // Boss damage calculation
    let dealDamageToBoss = false;
    let bossDamage = 0;
    let defusedBombThisTurn = false;
    let bossCells: { r: number, c: number }[] = [];

    if (gameMode === "dungeon" && bossActive) {
      const size = newGrid.length;
      const centerIdx = Math.floor(size / 2);
      if (chapter === 1) {
        for (let r = centerIdx - 1; r <= centerIdx + 1; r++) {
          for (let c = centerIdx - 1; c <= centerIdx + 1; c++) {
            bossCells.push({ r, c });
          }
        }
      } else {
        bossCells.push({ r: centerIdx - 1, c: centerIdx });
        bossCells.push({ r: centerIdx, c: centerIdx });
        bossCells.push({ r: centerIdx, c: centerIdx + 1 });
        bossCells.push({ r: centerIdx + 1, c: centerIdx - 1 });
        bossCells.push({ r: centerIdx + 1, c: centerIdx });
        bossCells.push({ r: centerIdx + 1, c: centerIdx + 1 });
      }

      // Check if time bomb defused
      if (activeBomb) {
        const isDefused = coords.some((coord) => coord.r === activeBomb.r && coord.c === activeBomb.c);
        if (isDefused) {
          defusedBombThisTurn = true;
          bossDamage = roundScore * 2;
          setActiveBomb(null);
          dealDamageToBoss = true;
        }
      }

      if (!defusedBombThisTurn) {
        if (chapter === 1) {
          const contactCount = coords.filter((coord) => 
            bossCells.some((bc) => Math.abs(coord.r - bc.r) <= 1 && Math.abs(coord.c - bc.c) <= 1)
          ).length;
          if (contactCount > 0) {
            dealDamageToBoss = true;
            bossDamage = roundScore * contactCount;
          }
        } else if (chapter === 2) {
          const isAdjacent = coords.some((coord) => 
            bossCells.some((bc) => Math.abs(coord.r - bc.r) <= 1 && Math.abs(coord.c - bc.c) <= 1)
          );
          if (isAdjacent) {
            dealDamageToBoss = true;
            bossDamage = roundScore;
          }
        } else if (chapter === 3) {
          // Chapter 3: Bamboo Python Boss Action & Movement
          let pythonHitThisTurn = false;
          if (pythonNextMove) {
            const isIntercepted = coords.some((coord) => coord.r === pythonNextMove.r && coord.c === pythonNextMove.c);
            if (isIntercepted) {
              pythonHitThisTurn = true;
              dealDamageToBoss = true;
              bossDamage = 150;
              setPythonStunned(true);
              addLog("💥 【擊中 BOSS】您的成語成功攔截了【竹簡巨蟒】的去路！造成了 150 點傷害，並使其停頓一回合！", "success");
            }
          }

          if (pythonHitThisTurn) {
            const nextM = getPythonNextMove(pythonBody, newGrid, rockCells);
            setPythonNextMove(nextM);
          } else if (pythonStunned) {
            setPythonStunned(false);
            const nextM = getPythonNextMove(pythonBody, newGrid, rockCells);
            setPythonNextMove(nextM);
            addLog("🐍 【竹簡巨蟒】從暈眩中恢復，本回合停頓原地！", "info");
          } else if (pythonNextMove) {
            const oldBody = [...pythonBody];
            const newHead = pythonNextMove;
            const isCollision = newGrid[newHead.r][newHead.c] !== "";
            
            // Growing: if collision, keep tail (grows by 1). Otherwise, slice to keep same length.
            const newBody = isCollision 
              ? [newHead, ...oldBody] 
              : [newHead, ...oldBody.slice(0, oldBody.length - 1)];
            setPythonBody(newBody);

            if (!isCollision) {
              const oldTail = oldBody[oldBody.length - 1];
              newGrid[oldTail.r][oldTail.c] = "";
              setInkCells((prev) => ({
                ...prev,
                [`${oldTail.r},${oldTail.c}`]: 3
              }));
            }

            const getPythonChar = (idx: number) => {
              if (idx === 0) return "竹";
              if (idx === 1) return "簡";
              if (idx === 2) return "巨";
              if (idx === 3) return "蟒";
              return "贅";
            };

            newBody.forEach((b, idx) => {
              newGrid[b.r][b.c] = getPythonChar(idx);
              delete newCellOwners[`${b.r},${b.c}`];
            });

            if (isCollision) {
              dealDamageToBoss = true;
              bossDamage = 150;
              setPythonStunned(true);
              addLog(`💥 【巨蟒吞噬】 【竹簡巨蟒】吞噬了您的成語字元，身體變長了 1 格！並受到 150 點傷害陷入暈眩！`, "error");
            } else {
              const oldTail = oldBody[oldBody.length - 1];
              addLog(`🐍 【竹簡巨蟒】向前爬行了一格，並在尾部 ${COL_LABELS[oldTail.c]}${oldTail.r + 1} 留下了黑色墨跡！`, "info");
            }

            const nextM = getPythonNextMove(newBody, newGrid, rockCells);
            setPythonNextMove(nextM);
          }
        }
      }
    }

    const nextBossHp = bossActive && dealDamageToBoss ? Math.max(0, bossHp - bossDamage) : bossHp;

    if (bossActive && dealDamageToBoss) {
      setBossHp(nextBossHp);
      // Trigger short screen shake for Boss hit
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 300);

      const bossTitle = chapter === 1 ? "贅字史萊姆" : "沙漏文曲星";
      if (defusedBombThisTurn) {
        addLog(`💥 【時空解除】成功穿過炸彈格！對【${bossTitle}】造成了雙倍傷害 (${bossDamage} 點)！(剩餘 HP: ${nextBossHp})`, "success");
      } else {
        const contactStr = chapter === 1 ? ` (接觸字數: ${coords.filter((coord) => bossCells.some((bc) => Math.abs(coord.r - bc.r) <= 1 && Math.abs(coord.c - bc.c) <= 1)).length})` : "";
        addLog(`💥 【擊中 BOSS】對【${bossTitle}】造成了 ${bossDamage} 點傷害！${contactStr}(剩餘 HP: ${nextBossHp})`, "success");
      }
    }

    // Boss Actions
    if (gameMode === "dungeon" && bossActive && nextBossHp > 0) {
      const size = newGrid.length;
      const centerIdx = Math.floor(size / 2);

      if (chapter === 1) {
        // Boss 1 Action (贅字史萊姆 counter-attack)
        const emptyCells: {r: number, c: number}[] = [];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            const isBoss = (r >= centerIdx - 1 && r <= centerIdx + 1) && (c >= centerIdx - 1 && c <= centerIdx + 1);
            if (!isBoss && newGrid[r][c] === "") {
              emptyCells.push({ r, c });
            }
          }
        }
        if (emptyCells.length > 0) {
          const target = emptyCells[Math.floor(Math.random() * emptyCells.length)];
          const particle = ["的", "了", "麼", "啊"][Math.floor(Math.random() * 4)];
          newGrid[target.r][target.c] = particle;
          setRockCells((prev) => {
            const next = new Set(prev);
            next.add(`${target.r},${target.c}`);
            return next;
          });
          addLog(`【贅字史萊姆】向外噴灑了贅字「${particle}」於 ${COL_LABELS[target.c]}${target.r + 1}，該格被封鎖！`, "error");
        }
      } else if (chapter === 2) {
        // Boss 2 Action (沙漏文曲星 time bomb counter)
        if (!activeBomb) {
          setBombStepCounter((prev) => {
            const next = prev + 1;
            if (next >= 3) {
              spawnTimeBomb(newGrid);
              return 0;
            }
            return next;
          });
        }
      }
    }

    // Decrement inkCells countdown
    if (gameMode === "dungeon") {
      setInkCells((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const key in next) {
          next[key]--;
          changed = true;
          if (next[key] <= 0) {
            delete next[key];
          }
        }
        return changed ? next : prev;
      });
    }

    // Relic: 細胞自噬 (autophagy)
    if (gameMode === "dungeon" && overlapsCount >= 2 && relics.includes("autophagy") && rockCells.size > 0) {
      const arr = Array.from(rockCells);
      const randomCell = arr[Math.floor(Math.random() * arr.length)];
      const [r, c] = randomCell.split(",").map(Number);
      newGrid[r][c] = ""; // clear from grid
      setRockCells((prev) => {
        const next = new Set(prev);
        next.delete(randomCell);
        return next;
      });
      addLog(`【細胞自噬】隨機消滅並淨化了位於 ${COL_LABELS[c]}${r + 1} 的阻擋格！`, "success");
    }

    // Reset 有備無患 (prepared) bonus status
    if (preparedBonusActive) {
      setPreparedBonusActive(false);
    }

    // Apply scores
    if (gameMode === "battle") {
      setScores((prev) => ({
        ...prev,
        p1: currentPlayer === 1 ? prev.p1 + roundScore : prev.p1,
        p2: currentPlayer === 2 ? prev.p2 + roundScore : prev.p2,
      }));
    } else {
      setScores((prev) => ({
        ...prev,
        p1: prev.p1 + roundScore,
      }));
    }

    // Update dungeon chapter progress score
    const oldChapterScore = chapterScore;
    const newChapterScore = oldChapterScore + roundScore;
    if (gameMode === "dungeon") {
      setChapterScore(newChapterScore);
    }

    // Save history
    setHistory((prev) => [
      {
        id: Math.random().toString(),
        word: activeWord,
        row,
        col,
        direction,
        player: currentPlayer,
        score: roundScore,
        combo: overlapsCount,
        chapter: gameMode === "dungeon" ? chapter : undefined,
      },
      ...prev,
    ]);

    // Apply challenge time bonus
    if (gameMode === "challenge") {
      const totalTimeBonus = 20 + timeBonus;
      setTimeLeft((prev) => prev + totalTimeBonus);
      setLastTimeBonus(totalTimeBonus);
      setTimerBonusTrigger((prev) => prev + 1);
    }

    // Log the event
    const coordsStr = `${COL_LABELS[col]}${row + 1}`;
    const comboStr = overlapsCount > 1 ? ` (Combo x${comboMultiplier}!)` : "";
    const nutrientStr = pointNutrientCount > 0 ? ` 吸收養分點(+${pointNutrientCount * 200})` : "";
    const totalTimeBonus = gameMode === "challenge" ? 20 + timeBonus : timeBonus;
    const timeStr = totalTimeBonus > 0 ? ` 延長時間(+${totalTimeBonus}s)` : "";
    const stealStr = (gameMode === "battle" && stolenCount > 0) ? ` 掠奪對手領地(+${stolenCount * 150})` : "";
    const playerLabel = gameMode === "battle" ? (currentPlayer === 1 ? "藍色阿米巴" : "粉色阿米巴") : "玩家";
    const logText = `【${playerLabel}】成功放置「${activeWord}」於 ${coordsStr}${comboStr}${nutrientStr}${timeStr}${stealStr}，獲得 ${roundScore} 分！`;
    addLog(logText, currentPlayer === 1 ? "p1" : "p2");

    // Update board state
    setGrid(newGrid);
    setCellOwners(newCellOwners);
    setConsecutivePasses(0);

    // Trigger placement flash animation on newly placed cells
    const placedKeys = new Set(coords.map((coord) => `${coord.r},${coord.c}`));
    setLastPlacedCells(placedKeys);
    setTimeout(() => setLastPlacedCells(new Set()), 500);

    // Spawn replacement nutrients
    const nextNutrients = spawnNutrients(8, newGrid, remainingNutrients, gameMode === "challenge");
    setNutrients(nextNutrients);

    // Switch turns in Battle Mode
    if (gameMode === "battle") {
      setCurrentPlayer(currentPlayer === 1 ? 2 : 1);
      setTimeLeft(60);
    }

    // Check Boss victory or progress checkpoints
    if (gameMode === "dungeon" && bossActive && nextBossHp <= 0) {
      handleBossDefeated();
    } else if (gameMode === "dungeon" && !bossActive) {
      const targetScore = getTargetScoreForChapter(chapter);
      if (oldChapterScore < targetScore && newChapterScore >= targetScore) {
        // Trigger BOSS
        setBossActive(true);
        const maxBossHp = chapter === 1 ? 300 : chapter === 2 ? 400 : 500;
        setBossHp(maxBossHp);
        setBossMaxHp(maxBossHp);

        const size = newGrid.length;
        const centerIdx = Math.floor(size / 2);

        // --- Battlefield Clearing: Keep only 3 random idioms from the current chapter ---
        const currentChapterHistory = history.filter((h) => h.chapter === chapter);
        const shuffledHistory = [...currentChapterHistory].sort(() => Math.random() - 0.5);
        const keptHistory = shuffledHistory.slice(0, 3);
        
        const cleanGrid = Array(size).fill(null).map(() => Array(size).fill(""));
        const cleanCellOwners: Record<string, 1 | 2> = {};
        
        keptHistory.forEach((item) => {
          const coords = getCoordinatesForWord(item.row, item.col, item.word.length, item.direction);
          coords.forEach((coord, idx) => {
            if (coord.r >= 0 && coord.r < size && coord.c >= 0 && coord.c < size) {
              cleanGrid[coord.r][coord.c] = item.word[idx];
              cleanCellOwners[`${coord.r},${coord.c}`] = item.player;
            }
          });
        });
        
        const otherChaptersHistory = history.filter((h) => h.chapter !== chapter);
        setHistory([...keptHistory, ...otherChaptersHistory]);
        
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            newGrid[r][c] = cleanGrid[r][c];
          }
        }
        for (const key in newCellOwners) {
          delete newCellOwners[key];
        }
        for (const key in cleanCellOwners) {
          newCellOwners[key] = cleanCellOwners[key];
        }

        addLog(`🧹 【戰場清理】遭遇 BOSS！為了留出足夠戰鬥空間，已清理盤面，隨機保留 3 組成語！`, "info");

        // Trigger Boss Tutorial (Unconditionally on every encounter)
        setShowBossTutorial(true);
        
        if (chapter === 1) {
          newGrid[centerIdx - 1][centerIdx - 1] = "贅";
          newGrid[centerIdx - 1][centerIdx] = "字";
          newGrid[centerIdx - 1][centerIdx + 1] = "史";
          newGrid[centerIdx][centerIdx - 1] = "萊";
          newGrid[centerIdx][centerIdx] = "姆";
          newGrid[centerIdx][centerIdx + 1] = "👾";
          newGrid[centerIdx + 1][centerIdx - 1] = "阿";
          newGrid[centerIdx + 1][centerIdx] = "米";
          newGrid[centerIdx + 1][centerIdx + 1] = "巴";
          addLog("⚠️ 【警告】第一章 BOSS【贅字史萊姆】降臨！牠吞噬了網格中央 3x3 空間，成為新的阿米巴核心！", "error");
        } else if (chapter === 2) {
          // Clear the area first
          newGrid[centerIdx - 1][centerIdx] = "沙";
          newGrid[centerIdx][centerIdx] = "漏";
          newGrid[centerIdx][centerIdx + 1] = "文";
          newGrid[centerIdx + 1][centerIdx - 1] = "曲";
          newGrid[centerIdx + 1][centerIdx] = "星";
          newGrid[centerIdx + 1][centerIdx + 1] = "⏳";
          addLog("⚠️ 【警告】第二章 BOSS【沙漏文曲星】降臨！牠佔領了網格中央金字塔型空間，時空之砂開始逆流！", "error");
        } else if (chapter === 3) {
          // Spawn Chapter 3 Boss: 竹簡巨蟒 (length 6 snake)
          newGrid[centerIdx][centerIdx] = "竹";
          newGrid[centerIdx][centerIdx - 1] = "簡";
          newGrid[centerIdx][centerIdx - 2] = "巨";
          newGrid[centerIdx][centerIdx - 3] = "蟒";
          newGrid[centerIdx][centerIdx - 4] = "贅";
          newGrid[centerIdx][centerIdx - 5] = "贅";
          
          const initialBody = [
            { r: centerIdx, c: centerIdx },
            { r: centerIdx, c: centerIdx - 1 },
            { r: centerIdx, c: centerIdx - 2 },
            { r: centerIdx, c: centerIdx - 3 },
            { r: centerIdx, c: centerIdx - 4 },
            { r: centerIdx, c: centerIdx - 5 }
          ];
          setPythonBody(initialBody);
          setPythonStunned(false);
          setInkCells({});
          
          const nextM = getPythonNextMove(initialBody, newGrid, rockCells);
          setPythonNextMove(nextM);
          
          addLog("⚠️ 【警告】第三章 BOSS【竹簡巨蟒】降臨！牠長度為 6 格（竹簡巨蟒贅贅），正在網格中爬行，游動過處將留下墨跡！", "error");
        }

        if (chapter === 1) {
          for (let r = centerIdx - 1; r <= centerIdx + 1; r++) {
            for (let c = centerIdx - 1; c <= centerIdx + 1; c++) {
              delete newCellOwners[`${r},${c}`];
            }
          }
        } else if (chapter === 2) {
          delete newCellOwners[`${centerIdx - 1},${centerIdx}`];
          delete newCellOwners[`${centerIdx},${centerIdx}`];
          delete newCellOwners[`${centerIdx},${centerIdx + 1}`];
          delete newCellOwners[`${centerIdx + 1},${centerIdx - 1}`];
          delete newCellOwners[`${centerIdx + 1},${centerIdx}`];
          delete newCellOwners[`${centerIdx + 1},${centerIdx + 1}`];
        } else if (chapter === 3) {
          delete newCellOwners[`${centerIdx},${centerIdx}`];
          delete newCellOwners[`${centerIdx},${centerIdx - 1}`];
          delete newCellOwners[`${centerIdx},${centerIdx - 2}`];
          delete newCellOwners[`${centerIdx},${centerIdx - 3}`];
          delete newCellOwners[`${centerIdx},${centerIdx - 4}`];
          delete newCellOwners[`${centerIdx},${centerIdx - 5}`];
        }
        setGrid(newGrid);
        setCellOwners(newCellOwners);
      } else {
        // Check Relic selection checkpoints
        const relicCheckpoints = getRelicCheckpointsForChapter(chapter);
        let triggeredCheckpoint = -1;
        const cp1 = relicCheckpoints[0];
        const cp2 = relicCheckpoints[1];
        if (oldChapterScore < cp1 && newChapterScore >= cp1 && !relicCheckpointsTriggered.has(cp1)) {
          triggeredCheckpoint = cp1;
        } else if (oldChapterScore < cp2 && newChapterScore >= cp2 && !relicCheckpointsTriggered.has(cp2)) {
          triggeredCheckpoint = cp2;
        }
        
        if (triggeredCheckpoint !== -1) {
          const availableRelics = ["membrane", "radar", "prepared", "color", "autophagy"];
          const shuffled = [...availableRelics].sort(() => Math.random() - 0.5);
          setRelicChoices(shuffled.slice(0, 3));
          setRelicCheckpointsTriggered((prev) => {
            const next = new Set(prev);
            next.add(triggeredCheckpoint);
            return next;
          });
          addLog("🎁 得分里程碑達成！抽取一個突變遺物增強您的屬性。", "system");
        }
      }
    }

    if (!wordToPlace) {
      setInputWord("");
    }
    setSelectedCell(null);
  };

  // --- Action: Pass Turn (Battle Mode only) ---
  const handlePassTurn = () => {
    if (gameMode !== "battle" || gameState !== "playing") return;
    if (!window.confirm("確定要棄權嗎？棄權將扣除 1 點生命值！")) return;
    const nextP = currentPlayer === 1 ? 2 : 1;
    addLog(`【${currentPlayer === 1 ? "藍色阿米巴" : "粉色阿米巴"}】選擇棄權，扣除 1 點生命值並換人。`, "error");
    setLives((prev) => ({
      p1: currentPlayer === 1 ? prev.p1 - 1 : prev.p1,
      p2: currentPlayer === 2 ? prev.p2 - 1 : prev.p2,
    }));
    triggerDamageEffect(currentPlayer);
    setCurrentPlayer(nextP);
    setTimeLeft(60);
  };

  // --- Action: Place Random Starter Word (Free/Solo modes) ---
  const handlePlaceRandomStarter = () => {
    if (!isGridEmpty()) return;

    const randomWord = STARTING_IDIOMS[Math.floor(Math.random() * STARTING_IDIOMS.length)];
    const size = grid.length;
    const centerRow = Math.floor(size / 2);
    const centerCol = Math.floor(size / 2) - 2;

    const newGrid = grid.map((r) => [...r]);
    const newCellOwners = { ...cellOwners };

    for (let i = 0; i < randomWord.length; i++) {
      newGrid[centerRow][centerCol + i] = randomWord[i];
      newCellOwners[`${centerRow},${centerCol + i}`] = 1;
    }

    setGrid(newGrid);
    setCellOwners(newCellOwners);
    setScores((prev) => ({ ...prev, p1: 100 }));
    setHistory([
      {
        id: Math.random().toString(),
        word: randomWord,
        row: centerRow,
        col: centerCol,
        direction: "H",
        player: 1,
        score: 100,
        combo: 0,
      },
    ]);
    setSelectedCell({ row: centerRow, col: centerCol });
    setDirection("V");

    // Spawn new nutrients around the grid
    const nextNutrients = spawnNutrients(8, newGrid, nutrients.filter(n => !getCoordinatesForWord(centerRow, centerCol, randomWord.length, "H").some(c => c.r === n.r && c.c === n.c)), false);
    setNutrients(nextNutrients);

    addLog(`成功放置首詞「${randomWord}」於網格中心 ${COL_LABELS[centerCol]}${centerRow + 1}，獲得 100 分！`, "success");
  };

  // --- Action: Clear Board Dialog ---
  const handleClearBoard = () => {
    const isEmpty = isGridEmpty();
    if (gameState === "playing" && !isEmpty) {
      if (window.confirm("確定要放棄當前遊戲並重設嗎？")) {
        resetGame(gameMode);
      }
    } else {
      resetGame(gameMode);
    }
  };

  // Determine winner for Battle mode game over
  const getWinnerInfo = () => {
    if (lives.p1 <= 0) {
      return { text: "粉色阿米巴 (Player 2) 因對手生命值歸零獲勝！", style: "text-pink-600 dark:text-pink-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]" };
    }
    if (lives.p2 <= 0) {
      return { text: "藍色阿米巴 (Player 1) 因對手生命值歸零獲勝！", style: "text-cyan-600 dark:text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" };
    }
    if (winnerOverride) {
      if (winnerOverride === 1) {
        return { text: "藍色阿米巴 (Player 1) 因對手認輸獲勝！", style: "text-cyan-600 dark:text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" };
      } else {
        return { text: "粉色阿米巴 (Player 2) 因對手認輸獲勝！", style: "text-pink-600 dark:text-pink-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]" };
      }
    }
    if (scores.p1 > scores.p2) {
      return { text: "藍色阿米巴 (Player 1) 獲勝！", style: "text-cyan-600 dark:text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" };
    } else if (scores.p2 > scores.p1) {
      return { text: "粉色阿米巴 (Player 2) 獲勝！", style: "text-pink-600 dark:text-pink-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]" };
    }
    return { text: "平手！雙方勢均力敵。", style: "text-purple-600 dark:text-purple-400" };
  };

  return (
    <div className={`flex-1 w-full min-h-screen bg-background bg-gradient-radial from-brand-bg-from via-brand-bg-via to-brand-bg-to text-text-primary flex flex-col items-center justify-start p-4 sm:p-6 lg:p-8 font-sans selection:bg-pink-500 selection:text-white relative overflow-hidden transition-colors duration-300 ${screenShake ? "shake-screen" : ""}`}>
      {/* Fullscreen red flash overlay when damaged */}
      {screenShake && <div className="damage-flash-overlay" />}

      {/* Scanline CRT Overlay */}
      <div style={{ opacity: 'var(--crt-opacity)' }} className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%),linear-gradient(90deg,rgba(255,0,0,0.01),rgba(0,255,0,0.005),rgba(0,0,255,0.01))] bg-[size:100%_4px,6px_100%] pointer-events-none z-10 transition-opacity duration-300"></div>

      <div className="w-full max-w-7xl flex flex-col gap-6 z-20">
        {gameState === "idle" ? (
          <div className="flex flex-col gap-8 w-full max-w-6xl mx-auto py-6 sm:py-10 animate-fade-in">
            {/* Header / Title */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-header-border pb-6">
              <div className="flex flex-col text-center md:text-left">
                <h1 className="text-4xl md:text-5xl font-black tracking-wider bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 dark:from-cyan-400 dark:via-purple-400 dark:to-pink-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(236,72,153,0.2)] dark:drop-shadow-[0_0_15px_rgba(236,72,153,0.4)] flex items-center justify-center md:justify-start">
                  <span>成語阿米巴</span>
                  <span className="text-xs font-mono font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 px-2 py-0.5 rounded ml-3 align-middle select-none">
                    v1.28
                  </span>
                </h1>
                <p className="text-sm text-text-secondary mt-2 uppercase tracking-widest font-mono font-bold">
                  // Cyberpunk Chinese Idiom Grid Game //
                </p>
              </div>

              {/* Theme Toggle switch */}
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-input-bg border border-panel-border text-text-primary hover:scale-[1.03] active:scale-[0.97] transition-all shadow-[0_4px_15px_rgba(0,0,0,0.08)] cursor-pointer font-extrabold text-sm"
                title={theme === "dark" ? "切換至白天模式" : "切換至黑夜模式"}
              >
                {theme === "dark" ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-400 animate-[spin_10s_linear_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                    </svg>
                    <span>白天模式 (Light)</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    <span>黑夜模式 (Dark)</span>
                  </>
                )}
              </button>
            </div>

            {/* Mode Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Card 1: Dungeon Mode */}
              <div 
                onClick={() => handleStartGame("dungeon")}
                className="bg-panel-bg backdrop-blur-md border border-purple-500/30 rounded-2xl p-6 flex flex-col justify-between hover:scale-[1.02] hover:shadow-[0_0_35px_rgba(139,92,246,0.15)] hover:border-purple-500/50 transition-all duration-300 relative group overflow-hidden cursor-pointer"
              >
                {/* Neon glow effect on hover */}
                <div className="absolute -inset-px bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl opacity-0 group-hover:opacity-10 transition duration-500 blur-xl"></div>
                
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-4xl">👾</span>
                    <span className="text-[10px] font-bold font-mono tracking-widest text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                      ROGUE-DUNGEON
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-text-primary mb-1">地牢冒險模式</h3>
                  <p className="text-[11px] text-text-secondary font-mono mb-4">// 融合 Roguelike 生存闖關 //</p>
                  
                  <ul className="text-xs text-text-secondary leading-relaxed space-y-2 mb-6 border-t border-panel-border/20 pt-4 list-disc pl-4">
                    <li><strong className="text-text-primary">生命機制</strong>：擁有 3 點 HP，打錯、非成語或違反接龍/重複規則扣 1 HP。</li>
                    <li><strong className="text-text-primary">突變遺物</strong>：達里程碑得分時，可選取突變遺物增強能力。</li>
                    <li><strong className="text-text-primary">首領激戰</strong>：達到章節目標分時 BOSS 降臨（第一章 300 分，第二章 500 分）。</li>
                    <li><strong className="text-text-primary">重整晉級</strong>：擊敗 BOSS 保留生命/提示並晉級下一個章節。</li>
                  </ul>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartGame("dungeon");
                  }}
                  className="w-full py-3 rounded-xl font-black text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white cursor-pointer active:scale-95 transition-all shadow-[0_4px_15px_rgba(139,92,246,0.25)] flex items-center justify-center gap-1.5"
                >
                  <span>開啟地牢冒險</span>
                  <span>➜</span>
                </button>
              </div>

              {/* Card 2: Free Mode */}
              <div 
                onClick={() => handleStartGame("free")}
                className="bg-panel-bg backdrop-blur-md border border-panel-border/30 rounded-2xl p-6 flex flex-col justify-between hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(16,185,129,0.12)] dark:hover:shadow-[0_0_30px_rgba(16,185,129,0.25)] hover:border-emerald-500/40 transition-all duration-300 relative group overflow-hidden cursor-pointer"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-4xl">🍀</span>
                    <span className="text-[10px] font-bold font-mono tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      FREE PLAY
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-text-primary mb-1">自由練習模式</h3>
                  <p className="text-[11px] text-text-secondary font-mono mb-4">// 無壓力成語接龍練習 //</p>
                  
                  <ul className="text-xs text-text-secondary leading-relaxed space-y-2 mb-6 border-t border-panel-border/20 pt-4 list-disc pl-4">
                    <li><strong className="text-text-primary">無壓力</strong>：無時間與生命限制，可從容不迫地思考與排列。</li>
                    <li><strong className="text-text-primary">免費提示</strong>：卡關時點擊提示不消耗任何次數或分數。</li>
                    <li><strong className="text-text-primary">積分養分點</strong>：地圖隨機生成積分點（♦），覆蓋獲得額外加分。</li>
                    <li><strong className="text-text-primary">熟悉字庫</strong>：適合用來熟悉座標和接龍排列，練習成語。</li>
                  </ul>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartGame("free");
                  }}
                  className="w-full py-3 rounded-xl font-black text-xs bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white cursor-pointer active:scale-95 transition-all shadow-[0_4px_15px_rgba(16,185,129,0.25)] flex items-center justify-center gap-1.5"
                >
                  <span>開始自由練習</span>
                  <span>➜</span>
                </button>
              </div>

              {/* Card 3: Challenge Mode */}
              <div 
                onClick={() => handleStartGame("challenge")}
                className="bg-panel-bg backdrop-blur-md border border-panel-border/30 rounded-2xl p-6 flex flex-col justify-between hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(245,158,11,0.12)] dark:hover:shadow-[0_0_30px_rgba(245,158,11,0.25)] hover:border-amber-500/40 transition-all duration-300 relative group overflow-hidden cursor-pointer"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-4xl">⚡</span>
                    <span className="text-[10px] font-bold font-mono tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      CHALLENGE
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-text-primary mb-1">積分挑戰模式</h3>
                  <p className="text-[11px] text-text-secondary font-mono mb-4">// 限時 120s 高分大作戰 //</p>
                  
                  <ul className="text-xs text-text-secondary leading-relaxed space-y-2 mb-6 border-t border-panel-border/20 pt-4 list-disc pl-4">
                    <li><strong className="text-text-primary">限時 120 秒</strong>：爭分奪秒！倒數結束將自動結算最終成績。</li>
                    <li><strong className="text-text-primary">成功加時</strong>：每成功放置一個正確成語可增加 20 秒！</li>
                    <li><strong className="text-text-primary">時間養分</strong>：吃掉地圖上的時鐘（⏰）可額外增加 10 秒！</li>
                    <li><strong className="text-text-primary">提示扣分</strong>：使用求助提示每次將扣除 50 積分。</li>
                  </ul>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartGame("challenge");
                  }}
                  className="w-full py-3 rounded-xl font-black text-xs bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-white cursor-pointer active:scale-95 transition-all shadow-[0_4px_15px_rgba(245,158,11,0.2)] flex items-center justify-center gap-1.5"
                >
                  <span>挑戰高分極限</span>
                  <span>➜</span>
                </button>
              </div>

              {/* Card 4: Battle Mode */}
              <div 
                onClick={() => handleStartGame("battle")}
                className="bg-panel-bg backdrop-blur-md border border-panel-border/30 rounded-2xl p-6 flex flex-col justify-between hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(236,72,153,0.12)] dark:hover:shadow-[0_0_30px_rgba(236,72,153,0.25)] hover:border-pink-500/40 transition-all duration-300 relative group overflow-hidden cursor-pointer"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-4xl">⚔️</span>
                    <span className="text-[10px] font-bold font-mono tracking-widest text-pink-600 dark:text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/20">
                      LOCAL PVP
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-text-primary mb-1">雙人對決模式</h3>
                  <p className="text-[11px] text-text-secondary font-mono mb-4">// 同屏 1v1 生存領地對抗 //</p>
                  
                  <ul className="text-xs text-text-secondary leading-relaxed space-y-2 mb-6 border-t border-panel-border/20 pt-4 list-disc pl-4">
                    <li><strong className="text-text-primary">回合制生存</strong>：藍/粉阿米巴同屏 1v1 回合制生存對抗。</li>
                    <li><strong className="text-text-primary">60秒與生命</strong>：每人 5 生命，超時或棄權扣 1 命並換人。</li>
                    <li><strong className="text-text-primary">提示扣命</strong>：使用求助提示每次將扣除 1 點生命值。</li>
                    <li><strong className="text-text-primary">領地搶奪</strong>：重疊對手文字可獲得 +150 額外掠奪分/格。</li>
                  </ul>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartGame("battle");
                  }}
                  className="w-full py-3 rounded-xl font-black text-xs bg-gradient-to-r from-cyan-500 to-pink-500 hover:opacity-90 text-white cursor-pointer active:scale-95 transition-all shadow-[0_4px_15px_rgba(236,72,153,0.2)] flex items-center justify-center gap-1.5"
                >
                  <span>開啟對決大戰</span>
                  <span>➜</span>
                </button>
              </div>
            </div>

            {/* Core Rules Section */}
            <div className="bg-panel-bg backdrop-blur-md border border-panel-border/40 rounded-2xl p-6 sm:p-8 shadow-[2px_4px_30px_rgba(0,0,0,0.04)] dark:shadow-[2px_4px_30px_rgba(0,0,0,0.3)] transition-all duration-300">
              <h2 className="text-xl sm:text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 flex items-center gap-2 border-b border-panel-border/30 pb-4 mb-4">
                <span>🎯 阿米巴成語接龍 - 核心玩法規則</span>
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-text-secondary leading-relaxed font-medium">
                <div>
                  <h4 className="font-bold text-text-primary text-base mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                    <span>1. 網格定位與方向</span>
                  </h4>
                  <p className="mb-4">
                    點擊 15×15 棋盤網格中的任意格子，將其設置為您要放置的成語的<strong className="text-text-primary">第一個漢字</strong>（即起點）。
                    在控制面板中，您可以切換排列方向為<strong className="text-text-primary">橫向 (Horizontal)</strong> 或<strong className="text-text-primary">縱向 (Vertical)</strong>。
                  </p>
                  
                  <h4 className="font-bold text-text-primary text-base mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                    <span>2. 阿米巴相交接龍</span>
                  </h4>
                  <p>
                    除首個單詞外，之後放置的每一個成語都必須與網格上已存在的漢字<strong className="text-text-primary">重疊（即共用至少一個字）</strong>。
                    重疊的字必須完全相同，如果不匹配或未重疊，系統將提示不合規則。
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-text-primary text-base mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                    <span>3. 成語校驗與提示</span>
                  </h4>
                  <p className="mb-4">
                    本遊戲包含<strong>嚴格的中文漢字成語庫驗證</strong>。每次輸入必須為有效成語且字數為 4 或 5 個字。
                    如果真的卡關，可以點擊 <span className="font-bold text-cyan-600 dark:text-cyan-400">💡 求助提示</span>，系統會檢索字典自動在您的起點格放置一條可行成語。
                  </p>

                  <h4 className="font-bold text-text-primary text-base mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>4. Combo 連鎖加分</span>
                  </h4>
                  <p className="mb-4">
                    如果擺放一個成語的同時，重疊了地圖上<strong className="text-text-primary">多個</strong>現有漢字，將觸發 Combo 連鎖！
                    Combo 會成倍增加該成語獲得的基礎分，是爭奪積分榜的關鍵技巧。
                  </p>

                  <h4 className="font-bold text-text-primary text-base mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                    <span>5. 重複放置規則</span>
                  </h4>
                  <p>
                    同一個成語最多只允許重複放置 2 次。若嘗試放置第 3 次，系統會阻擋並給予違規處罰（如地牢模式中會扣除生命值）。
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* --- Header & Tabs Section --- */}
            <header className="flex flex-col gap-4 border-b border-header-border pb-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex flex-col text-center md:text-left">
                  <h1 className="text-3xl md:text-4xl font-extrabold tracking-wider bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 dark:from-cyan-400 dark:via-purple-400 dark:to-pink-500 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(236,72,153,0.15)] dark:drop-shadow-[0_0_10px_rgba(236,72,153,0.3)] flex items-center justify-center md:justify-start">
                    <span>成語阿米巴</span>
                    <span className="text-[10px] font-mono font-bold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 px-1.5 py-0.5 rounded ml-2 align-middle select-none">
                      v1.28
                    </span>
                  </h1>
                  <p className="text-xs text-text-secondary mt-1 uppercase tracking-widest font-mono">
                    // Cyberpunk Grid Connection Game //
                  </p>
                </div>

                {/* Mode & Theme Selectors */}
                <div className="flex items-center gap-3 flex-wrap justify-center">
                  {/* Mode Selectors */}
                  <div className="flex bg-input-bg border border-panel-border/30 p-1 rounded-xl shadow-inner gap-1 transition-all duration-300">
                    <button
                      onClick={() => handleSwitchMode("free")}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        gameMode === "free"
                          ? "bg-btn-primary-bg/20 text-btn-primary-bg dark:text-purple-200 border border-btn-primary-bg/35 shadow-[0_0_10px_rgba(168,85,247,0.15)]"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      自由模式
                    </button>
                    <button
                      onClick={() => handleSwitchMode("dungeon")}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        gameMode === "dungeon"
                          ? "bg-btn-primary-bg/20 text-btn-primary-bg dark:text-purple-200 border border-btn-primary-bg/35 shadow-[0_0_10px_rgba(168,85,247,0.15)]"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      地牢冒險
                    </button>
                    <button
                      onClick={() => handleSwitchMode("challenge")}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        gameMode === "challenge"
                          ? "bg-btn-primary-bg/20 text-btn-primary-bg dark:text-purple-200 border border-btn-primary-bg/35 shadow-[0_0_10px_rgba(168,85,247,0.15)]"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      積分挑戰
                    </button>
                    <button
                      onClick={() => handleSwitchMode("battle")}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        gameMode === "battle"
                          ? "bg-btn-primary-bg/20 text-btn-primary-bg dark:text-purple-200 border border-btn-primary-bg/35 shadow-[0_0_10px_rgba(168,85,247,0.15)]"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      雙人對決
                    </button>
                  </div>

                  {/* Theme Toggle Switch */}
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-input-bg border border-panel-border/35 text-text-primary hover:scale-[1.03] active:scale-[0.97] transition-all shadow-[0_2px_10px_rgba(0,0,0,0.05)] cursor-pointer font-bold text-xs"
                    title={theme === "dark" ? "切換至白天模式" : "切換至黑夜模式"}
                  >
                    {theme === "dark" ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-amber-400 animate-[spin_10s_linear_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                        </svg>
                        <span>白天</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                        <span>黑夜</span>
                      </>
                    )}
                  </button>

                  {/* Rules Dialog Trigger */}
                  <button
                    onClick={() => setShowRulesModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-input-bg border border-panel-border/35 text-text-primary hover:scale-[1.03] active:scale-[0.97] transition-all shadow-[0_2px_10px_rgba(0,0,0,0.05)] cursor-pointer font-bold text-xs"
                    title="查看核心玩法規則"
                  >
                    <span>❓ 玩法說明</span>
                  </button>

                  {/* Quick Reset Game */}
                  <button
                    onClick={handleClearBoard}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-input-bg border border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/5 hover:border-red-500/30 hover:scale-[1.03] active:scale-[0.97] transition-all shadow-[0_2px_10px_rgba(0,0,0,0.05)] cursor-pointer font-bold text-xs"
                    title="清除當前畫布並重設進度"
                  >
                    <span>🔄 重設遊戲</span>
                  </button>
                </div>

                {/* Scoreboards depending on mode */}
                {gameMode === "dungeon" ? (
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Chapter & Progress */}
                    <div className="bg-input-bg border border-purple-500/30 rounded-lg px-3 py-1.5 flex flex-col items-center min-w-[110px] shadow-[0_0_12px_rgba(168,85,247,0.05)]">
                      <span className="text-[9px] text-purple-500 font-bold uppercase tracking-widest font-mono">Chapter {chapter}</span>
                      <span className="text-sm font-black text-purple-600 dark:text-purple-300 font-mono">
                        {chapterScore} / {getTargetScoreForChapter(chapter)} pt
                      </span>
                      {/* Mini progress bar */}
                      <div className="w-full bg-input-border/30 h-1 rounded-full mt-1 overflow-hidden">
                        <div className="bg-purple-500 h-full rounded-full transition-all duration-350" style={{ width: `${Math.min(100, (chapterScore / getTargetScoreForChapter(chapter)) * 100)}%` }} />
                      </div>
                    </div>

                    {/* Dungeon HP Hearts */}
                    <div className="bg-input-bg border border-red-500/30 rounded-lg px-3 py-1.5 flex flex-col items-center min-w-[95px] shadow-[0_0_12px_rgba(239,68,68,0.05)]">
                      <span className="text-[9px] text-red-500 font-bold uppercase tracking-widest font-mono">HP</span>
                      <div className="flex gap-0.5 mt-0.5 text-xs select-none">
                        {Array.from({ length: maxHp }).map((_, i) => (
                          <span
                            key={i}
                            className={`transition-all duration-350 ${
                              i < hp
                                ? "text-red-500 scale-100 filter drop-shadow-[0_0_2px_rgba(239,68,68,0.7)]"
                                : "text-gray-400 opacity-20 scale-90"
                            }`}
                          >
                            ❤️
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Dungeon Hints Count */}
                    <div className="bg-input-bg border border-cyan-500/30 rounded-lg px-3 py-1.5 flex flex-col items-center min-w-[95px] shadow-[0_0_12px_rgba(6,182,212,0.05)]">
                      <span className="text-[9px] text-cyan-500 font-bold uppercase tracking-widest font-mono">HINTS</span>
                      <div className="flex gap-0.5 mt-0.5 text-xs select-none">
                        {Array.from({ length: maxHints }).map((_, i) => (
                          <span
                            key={i}
                            className={`transition-all duration-350 ${
                              i < hintsCount
                                ? "text-amber-500 scale-100 filter drop-shadow-[0_0_2px_rgba(245,158,11,0.7)]"
                                : "text-gray-400 opacity-20 scale-90"
                            }`}
                          >
                            💡
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="bg-input-bg border border-cyan-500/30 rounded-lg px-3 py-1.5 flex flex-col items-center min-w-[95px] shadow-[0_0_12px_rgba(6,182,212,0.05)]">
                      <span className="text-[9px] text-cyan-500 font-bold uppercase tracking-widest font-mono">TOTAL SCORE</span>
                      <span className="text-xl font-mono font-black text-cyan-600 dark:text-cyan-300">
                        {String(scores.p1).padStart(5, "0")}
                      </span>
                    </div>
                  </div>
                ) : gameMode === "battle" ? (
                  /* Battle Mode Scoreboard */
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* P1 */}
                    <div className={`bg-input-bg border rounded-lg px-3 py-1.5 flex flex-col items-center min-w-[95px] transition-all duration-300 ${currentPlayer === 1 ? "border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.3)]" : "border-cyan-500/20"}`}>
                      <span className="text-[9px] text-cyan-500 font-bold uppercase tracking-widest font-mono">🔵 P1 藍色</span>
                      <div className="flex gap-px mt-0.5 select-none">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={`text-[10px] transition-all ${i < lives.p1 ? "text-red-500" : "text-gray-400/30"}`}>❤️</span>
                        ))}
                      </div>
                      <span className="text-base font-mono font-black text-cyan-600 dark:text-cyan-300">{String(scores.p1).padStart(4, "0")}</span>
                    </div>
                    {/* Timer */}
                    <div className="bg-input-bg border border-panel-border/30 rounded-lg px-3 py-1.5 flex flex-col items-center min-w-[60px]">
                      <span className="text-[9px] text-text-secondary font-bold uppercase tracking-widest font-mono">TIME</span>
                      <span className={`text-lg font-mono font-black ${timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-text-primary"}`}>{timeLeft}s</span>
                    </div>
                    {/* P2 */}
                    <div className={`bg-input-bg border rounded-lg px-3 py-1.5 flex flex-col items-center min-w-[95px] transition-all duration-300 ${currentPlayer === 2 ? "border-pink-400 shadow-[0_0_12px_rgba(236,72,153,0.3)]" : "border-pink-500/20"}`}>
                      <span className="text-[9px] text-pink-500 font-bold uppercase tracking-widest font-mono">🩷 P2 粉色</span>
                      <div className="flex gap-px mt-0.5 select-none">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={`text-[10px] transition-all ${i < lives.p2 ? "text-red-500" : "text-gray-400/30"}`}>❤️</span>
                        ))}
                      </div>
                      <span className="text-base font-mono font-black text-pink-600 dark:text-pink-300">{String(scores.p2).padStart(4, "0")}</span>
                    </div>
                  </div>
                ) : gameMode === "challenge" ? (
                  /* Challenge Mode Scoreboard */
                  <div className="flex items-center gap-4">
                    <div className="bg-input-bg border border-amber-500/30 rounded-lg px-3 py-1.5 flex flex-col items-center min-w-[80px]">
                      <span className="text-[9px] text-amber-500 font-bold uppercase tracking-widest font-mono">TIME</span>
                      <span className={`text-xl font-mono font-black ${timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-amber-500 dark:text-amber-300"}`}>{timeLeft}s</span>
                    </div>
                    <div className="bg-input-bg border border-cyan-500/30 rounded-lg px-4 py-1.5 flex flex-col items-center min-w-[90px]">
                      <span className="text-[9px] text-cyan-500 font-bold uppercase tracking-widest font-mono">SCORE</span>
                      <span className="text-2xl font-mono font-black text-cyan-600 dark:text-cyan-300">{String(scores.p1).padStart(5, "0")}</span>
                    </div>
                  </div>
                ) : (
                  /* Free Play Scoreboard */
                  <div className="flex items-center gap-4">
                    <div className="bg-input-bg border border-cyan-500/30 rounded-lg px-4 py-2 flex flex-col items-center min-w-[90px] shadow-[0_0_12px_rgba(6,182,212,0.05)] transition-all duration-300">
                      <span className="text-[10px] text-cyan-500 dark:text-cyan-400 font-bold uppercase tracking-widest font-mono">Score</span>
                      <span className="text-2xl font-mono font-black text-cyan-600 dark:text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.2)] dark:drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]">
                        {String(scores.p1).padStart(5, "0")}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Mode Banner Description */}
              <div className="text-[11px] text-text-secondary font-mono flex items-center gap-1.5 px-2 bg-panel-bg/40 py-1.5 rounded border border-panel-border/30">
                <span>// CURRENT_MODE:</span>
                <span className="text-purple-600 dark:text-purple-400 font-bold uppercase">
                  {gameMode === "free" ? "Free Play" : gameMode === "challenge" ? "Score Challenge" : gameMode === "battle" ? "Two-Player Battle" : "Dungeon Mode"}
                </span>
                <span>•</span>
                <span>
                  {gameMode === "free"
                    ? "自由練習，可隨時放置且無時間限制。"
                    : gameMode === "challenge"
                    ? "積分挑戰：限時 120 秒！每次正確放置成語可延長時間，吃掉 ⏰ 也可加時！"
                    : gameMode === "battle"
                    ? "雙人對決：藍/粉阿米巴輪流回合，超時或棄權扣生命，搶奪對手格子！生命歸零判輸！"
                    : `地牢冒險：第 ${chapter} 章。目標分 ${getTargetScoreForChapter(chapter)} 點召喚 BOSS，擊敗以通關！生命值歸零則失敗！`}
                </span>
              </div>
            </header>

            {/* --- Main Dashboard --- */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* LEFT: Game Board Grid Container (8 Cols) */}
              <section className="lg:col-span-8 bg-panel-bg backdrop-blur-md border border-panel-border rounded-2xl p-4 sm:p-6 shadow-[2px_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[2px_4px_30px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center relative transition-all duration-300">
                {/* Game Over Screen Overlay */}
                {gameState === "gameover" && (
                  <div className="absolute inset-0 bg-background/95 backdrop-blur-md rounded-2xl z-30 flex flex-col items-center justify-center p-6 border border-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.15)] dark:shadow-[0_0_40px_rgba(239,68,68,0.3)] transition-all duration-300">
                    <h2 className="text-3xl font-black text-red-500 tracking-wider mb-2 animate-pulse drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                      {gameMode === "dungeon" && hp <= 0 ? "冒險失敗 DIED" : gameMode === "dungeon" ? "冒險結束 END" : gameMode === "challenge" ? "時間到 TIME'S UP" : gameMode === "battle" ? (winnerOverride === 1 ? "🔵 P1 獲勝！" : "🩷 P2 獲勝！") : "遊戲結束 GAME OVER"}
                    </h2>
                    <p className="text-xs text-text-secondary uppercase tracking-widest font-mono mb-6">
                      {gameMode === "free"
                        ? "// 您已選擇放棄此局 //"
                        : gameMode === "dungeon" && hp <= 0
                        ? `// 地牢冒險失敗！已止步於第 ${chapter} 章 //`
                        : gameMode === "dungeon"
                        ? `// 地牢冒險結束！已止步於第 ${chapter} 章 //`
                        : gameMode === "challenge"
                        ? "// 挑戰時間截止 //"
                        : "// 生命值歸零、回合棄權或玩家認輸 //"}
                    </p>

                    <div className="bg-input-bg border border-panel-border/40 rounded-xl p-6 flex flex-col items-center gap-4 min-w-[280px] mb-8 shadow-2xl transition-all duration-300">
                      {gameMode === "battle" ? (
                        <div className="flex gap-6">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs text-cyan-400">🔵 P1 藍色</span>
                            <span className="text-2xl font-mono font-black text-cyan-600 dark:text-cyan-300">{scores.p1} 分</span>
                            <span className="text-[10px] text-text-secondary">剩餘生命: {lives.p1}</span>
                          </div>
                          <div className="text-2xl font-black text-text-secondary">VS</div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs text-pink-400">🩷 P2 粉色</span>
                            <span className="text-2xl font-mono font-black text-pink-600 dark:text-pink-300">{scores.p2} 分</span>
                            <span className="text-[10px] text-text-secondary">剩餘生命: {lives.p2}</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs text-text-secondary">最終獲得積分</span>
                          <span className="text-4xl font-mono font-black text-cyan-600 dark:text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]">
                            {scores.p1} 分
                          </span>
                          {gameMode === "dungeon" && (
                            <div className="text-[10px] text-text-secondary font-mono border-t border-input-border/30 pt-2 mt-1 w-full text-center">
                              到達章節: 第 {chapter} 章
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => handleStartGame(gameMode)}
                        className="px-6 py-2.5 rounded-lg font-bold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white cursor-pointer active:scale-95 hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] transition-all"
                      >
                        再次挑戰
                      </button>
                      <button
                        onClick={() => resetGame(gameMode)}
                        className="px-6 py-2.5 rounded-lg font-bold text-sm bg-input-bg hover:bg-panel-bg border border-input-border text-text-primary cursor-pointer active:scale-95 transition-all"
                      >
                        返回主選單
                      </button>
                    </div>
                  </div>
                )}
                {/* Grid legends */}
                <div className="w-full flex items-center justify-between text-xs text-text-secondary mb-4 px-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 bg-cyan-500/20 border-2 border-cyan-400 rounded-sm shadow-[0_0_6px_#06b6d4] relative">
                        <span className="absolute top-0 left-0 text-[5px] font-extrabold text-cyan-400 leading-none">起</span>
                      </span>
                      <span>選中起點 (①②③④ = 字序)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 bg-green-500/10 border border-green-400 border-dashed rounded-sm"></span>
                      <span>預覽合格 ▶ 可放置</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 bg-red-500/10 border-2 border-red-500/60 rounded-sm"></span>
                      <span>字元衝突</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 bg-emerald-500/20 border border-emerald-400 rounded-sm"></span>
                      <span>♦ 積分養分</span>
                    </div>
                    {gameMode === "dungeon" && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 bg-zinc-900/90 border border-red-900/40 rounded-sm shadow-inner text-center">
                            <span className="text-[8px] text-red-500/70 block leading-none font-bold mt-0.5">的</span>
                          </span>
                          <span>贅字封鎖格</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 bg-purple-950 border-2 border-purple-400 rounded-sm shadow-[0_0_6px_rgba(168,85,247,0.4)] text-center">
                            <span className="text-[8px] text-purple-300 block leading-none font-bold mt-0.5">👾</span>
                          </span>
                          <span>BOSS 核心</span>
                        </div>
                      </>
                    )}
                  </div>

                  {isGridEmpty() && gameState === "playing" && (
                    <button
                      onClick={handlePlaceRandomStarter}
                      className="px-3 py-1.5 rounded bg-btn-primary-bg/10 hover:bg-btn-primary-bg/20 border border-btn-primary-bg/30 text-btn-primary-bg dark:text-purple-200 transition-all font-semibold active:scale-95 text-xs flex items-center gap-1.5 hover:shadow-[0_0_10px_rgba(168,85,247,0.2)] cursor-pointer"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-btn-primary-bg animate-ping"></span>
                      隨機擺放首詞
                    </button>
                  )}
                </div>

                {/* Boss Health Bar Widget */}
                {gameMode === "dungeon" && bossActive && (
                  <div className="w-full max-w-xl mx-auto mb-4 bg-zinc-950/80 border border-red-500/30 rounded-2xl p-4 shadow-[0_0_20px_rgba(239,68,68,0.2)] animate-pulse text-text-primary">
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xl animate-bounce">{chapter === 1 ? "👾" : chapter === 2 ? "⏳" : "🐍"}</span>
                        <span className="text-sm font-black text-red-500 tracking-wider">
                          第 {chapter} 章 BOSS：{chapter === 1 ? "贅字史萊姆" : chapter === 2 ? "沙漏文曲星" : "竹簡巨蟒"}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-red-400">{bossHp} / {bossMaxHp} HP</span>
                    </div>
                    <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-red-500/20 shadow-inner">
                      <div 
                        className="h-full bg-gradient-to-r from-red-600 via-purple-600 to-pink-500 shadow-[0_0_10px_rgba(239,68,68,0.5)] transition-all duration-300"
                        style={{ width: `${Math.max(0, Math.min(100, (bossHp / bossMaxHp) * 100))}%` }}
                      ></div>
                    </div>
                    <p className="text-[10px] text-red-400/80 text-center mt-1.5 font-medium select-none">
                      ⚠️ 提示：{chapter === 3 ? "在預期路徑（紅框🎯）佈置成語進行攔截，或讓巨蟒撞擊您的成語字元，均可造成傷害並使其暈眩！" : `在 BOSS 核心（中央區域）相鄰的格子放置成語即可造成傷害${chapter === 2 ? "；交叉穿過時空炸彈格解鎖可造成雙倍傷害且不受距離限制" : ""}！`}
                    </p>
                  </div>
                )}

                {/* Scrollable grid wrapper */}
                <div className="w-full overflow-x-auto pb-2 flex justify-start md:justify-center relative">
                  <div className="min-w-[500px] select-none p-1.5">
                    <div
                      className="grid gap-1 bg-input-bg/70 p-2.5 rounded-xl border border-input-border shadow-[0_0_20px_rgba(139,92,246,0.02)] dark:shadow-[0_0_20px_rgba(139,92,246,0.05)] relative transition-all duration-300"
                      style={{ gridTemplateColumns: `repeat(${grid[0]?.length ? grid[0].length + 1 : 16}, minmax(0, 1fr))` }}
                    >
                      {/* Grid Column Headers */}
                      <div className="w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center"></div>
                      {COL_LABELS.slice(0, grid[0]?.length || 15).map((colName) => (
                        <div
                          key={colName}
                          className="w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center text-[10px] sm:text-xs font-bold text-text-secondary font-mono tracking-wider"
                        >
                          {colName}
                        </div>
                      ))}

                      {/* Grid Rows */}
                      {Array.from({ length: grid.length }).map((_, rIdx) => (
                        <React.Fragment key={rIdx}>
                          {/* Row Label */}
                          <div className="w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center text-[10px] sm:text-xs font-bold text-text-secondary font-mono">
                            {rIdx + 1}
                          </div>

                          {/* Cells */}
                          {Array.from({ length: grid[rIdx]?.length || 15 }).map((_, cIdx) => {
                            const cellValue = grid[rIdx][cIdx];
                            const isSelected = selectedCell?.row === rIdx && selectedCell?.col === cIdx;
                            const cellOwner = cellOwners[`${rIdx},${cIdx}`];
                            const isLastPlaced = lastPlacedCells.has(`${rIdx},${cIdx}`);

                            // Nutrient details
                            const cellNutrient = nutrients.find((n) => n.r === rIdx && n.c === cIdx);

                            // Preview state variables
                            let previewChar = "";
                            let isPreviewCell = false;
                            let previewClash = false;
                            let previewValid = false;
                            let previewSlotIndex = -1;
                            let isPreviewOverlap = false;

                            if (preview) {
                              const pCell = preview.cells.find((c) => c.r === rIdx && c.c === cIdx);
                              if (pCell) {
                                isPreviewCell = true;
                                previewChar = pCell.char;
                                previewClash = pCell.clash;
                                previewValid = preview.isValid;
                                previewSlotIndex = pCell.slotIndex;
                                isPreviewOverlap = pCell.overlap;
                              }
                            }

                            const isPreviewStart = isPreviewCell && previewSlotIndex === 0;
                            const isSelectedStart = isSelected && !isPreviewCell;

                            // Determine styles
                            let cellBgClass = "bg-cell-bg-default";
                            let borderClass = "border-cell-border-default";
                            let textClass = "text-cell-text-default";
                            let extraClass = "";

                            if (isLastPlaced && cellValue) {
                              extraClass += " place-success";
                            }

                            const isRock = rockCells.has(`${rIdx},${cIdx}`);
                            const isInk = gameMode === "dungeon" && inkCells[`${rIdx},${cIdx}`] > 0;
                            const isPythonNextMoveCell = bossActive && chapter === 3 && pythonNextMove && pythonNextMove.r === rIdx && pythonNextMove.c === cIdx;
                            const size = grid.length;
                            const centerIdx = Math.floor(size / 2);
                            const isBossCell = bossActive && (
                              chapter === 1
                                ? (rIdx >= centerIdx - 1 && rIdx <= centerIdx + 1 && cIdx >= centerIdx - 1 && cIdx <= centerIdx + 1)
                                : chapter === 2
                                ? (
                                    (rIdx === centerIdx - 1 && cIdx === centerIdx) ||
                                    (rIdx === centerIdx && (cIdx === centerIdx || cIdx === centerIdx + 1)) ||
                                    (rIdx === centerIdx + 1 && (cIdx === centerIdx - 1 || cIdx === centerIdx || cIdx === centerIdx + 1))
                                  )
                                : (
                                    pythonBody.some((b) => b.r === rIdx && b.c === cIdx)
                                  )
                            );
                            const isBombCell = activeBomb && activeBomb.r === rIdx && activeBomb.c === cIdx;

                            if (isBossCell) {
                              cellBgClass = "bg-purple-950/90 border-purple-500/80 shadow-[0_0_10px_rgba(168,85,247,0.4)]";
                              borderClass = "border-purple-400 border-2";
                              textClass = "text-purple-300 font-black animate-pulse drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]";
                            } else if (isBombCell) {
                              cellBgClass = "bg-red-950/80 border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.5)]";
                              borderClass = "border-red-500 border-2 animate-pulse";
                              textClass = "text-red-400 font-black drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]";
                            } else if (isRock) {
                              cellBgClass = "bg-zinc-900/90 border-red-950/60 shadow-inner";
                              borderClass = "border-red-900/40";
                              textClass = "text-red-500/70 font-black font-mono";
                            } else if (isInk) {
                              cellBgClass = "bg-zinc-900 border-zinc-950 shadow-[inset_0_0_8px_rgba(0,0,0,0.9)]";
                              borderClass = "border-black";
                              textClass = "text-zinc-600 font-extrabold";
                            } else if (cellValue) {
                              cellBgClass = "bg-cell-bg-filled";
                              borderClass = "border-cell-border-filled";
                              textClass = "text-cell-text-filled font-extrabold drop-shadow-[0_0_5px_var(--glow-color)]";
                            } else if (isPreviewCell) {
                              if (previewClash) {
                                cellBgClass = "bg-red-500/10";
                                borderClass = "border-red-500/60 border-2";
                                textClass = "text-red-500 font-bold";
                                extraClass += " preview-cell-enter";
                              } else if (isPreviewStart) {
                                cellBgClass = "bg-cyan-500/25";
                                borderClass = "border-cyan-400 border-2";
                                textClass = "text-cyan-600 dark:text-cyan-300 font-extrabold";
                                extraClass += " preview-cell-enter selected-ring-pulse";
                              } else {
                                cellBgClass = previewValid ? "bg-green-500/15" : "bg-yellow-500/10";
                                borderClass = previewValid
                                  ? "border-green-400 border-dashed"
                                  : "border-yellow-400 border-dashed";
                                textClass = previewValid
                                  ? "text-green-600 dark:text-green-400 font-bold"
                                  : "text-yellow-600 dark:text-yellow-400 font-bold";
                                extraClass += " preview-cell-enter";
                              }
                            } else if (isSelected) {
                              cellBgClass = "bg-cyan-500/20";
                              borderClass = "border-cyan-400 border-2";
                              textClass = "text-cyan-600 dark:text-cyan-300 font-bold";
                              extraClass += " selected-ring-pulse";
                            }

                            const animationDelay = isPreviewCell && previewSlotIndex > 0
                              ? `${previewSlotIndex * 45}ms`
                              : "0ms";

                            const slotLabels = ["①", "②", "③", "④", "⑤"];

                            return (
                              <button
                                key={cIdx}
                                type="button"
                                disabled={gameState !== "playing"}
                                onClick={() => {
                                  if (isRock) return;
                                  if (isInk) return;
                                  if (selectedCell?.row === rIdx && selectedCell?.col === cIdx) {
                                    setDirection((prev) => prev === "H" ? "V" : prev === "V" ? "HR" : prev === "HR" ? "VR" : "H");
                                  } else {
                                    setSelectedCell({ row: rIdx, col: cIdx });
                                  }
                                }}
                                style={{ animationDelay }}
                                className={`w-7 h-7 sm:w-10 sm:h-10 rounded flex items-center justify-center text-xs sm:text-base border transition-all duration-150 active:scale-95 ${cellBgClass} ${borderClass} ${textClass}${extraClass} relative select-none ${
                                  (isRock || isInk) ? "cursor-not-allowed" : "cursor-pointer"
                                } ${
                                  !cellValue && !isRock && !isInk && gameState === "playing" ? "hover:border-cyan-500/40 hover:bg-cyan-500/5" : ""
                                }`}
                              >
                                {cellValue || previewChar}

                                {/* Slot-number badge on preview cells */}
                                {isPreviewCell && !cellValue && !previewClash && (
                                  <span
                                    className={`absolute bottom-0 right-0 text-[7px] sm:text-[9px] font-extrabold leading-none px-[1px] rounded-tl-sm ${
                                      isPreviewStart
                                        ? "text-cyan-500 dark:text-cyan-300"
                                        : previewValid
                                        ? "text-green-500 dark:text-green-400"
                                        : "text-yellow-500 dark:text-yellow-400"
                                    }`}
                                    style={{ animationDelay }}
                                  >
                                    {slotLabels[previewSlotIndex] ?? ""}
                                  </span>
                                )}

                                {/* "起" badge on empty selected start cell */}
                                {isSelectedStart && !cellValue && (
                                  <span className="absolute top-0 left-0 text-[7px] sm:text-[9px] font-extrabold leading-none text-cyan-400 px-[1px]">
                                    起
                                  </span>
                                )}

                                {/* "起" badge on filled selected start cell */}
                                {isSelected && cellValue && !isPreviewCell && (
                                  <span className="absolute top-0 left-0 text-[7px] sm:text-[9px] font-extrabold leading-none text-cyan-400 px-[1px] bg-cyan-950/60 rounded-br-sm">
                                    起
                                  </span>
                                )}

                                {/* Direction arrow on 2nd preview slot */}
                                {isPreviewCell && !cellValue && !previewClash && previewSlotIndex === 1 && (
                                  <span
                                    className={`absolute -top-0.5 -left-0.5 text-[6px] sm:text-[8px] font-bold leading-none direction-arrow-flow ${
                                      previewValid ? "text-green-400" : "text-yellow-400"
                                    }`}
                                  >
                                    {direction === "H" ? "▶" : direction === "V" ? "▼" : direction === "HR" ? "◀" : "▲"}
                                  </span>
                                )}

                                {/* Time bomb countdown badge */}
                                {isBombCell && activeBomb && (
                                  <span className="absolute -bottom-1 -right-1 text-[8px] sm:text-[9px] font-black leading-none text-red-500 bg-black/80 px-1 py-0.5 rounded border border-red-500 animate-pulse z-10">
                                    ⏳{activeBomb.timeLeft}s
                                  </span>
                                )}

                                {/* Ink cell countdown badge */}
                                {isInk && (
                                  <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs text-zinc-500 font-black font-mono select-none">
                                    墨({inkCells[`${rIdx},${cIdx}`]})
                                  </span>
                                )}

                                {/* Python Next Move target badge */}
                                {isPythonNextMoveCell && (
                                  <div className="absolute inset-0 border-2 border-red-500 animate-ping rounded pointer-events-none" />
                                )}
                                {isPythonNextMoveCell && (
                                  <span className="absolute -top-1 -right-1 text-[10px] sm:text-xs text-red-500 z-10 animate-bounce">
                                    🎯
                                  </span>
                                )}

                                {/* Nutrient Indicator Overlay */}
                                {!cellValue && !previewChar && cellNutrient && (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    {cellNutrient.type === "time" ? (
                                      <span className="text-[10px] sm:text-xs animate-bounce" title="⏰ 時間養分 (+10s)">⏰</span>
                                    ) : (
                                      <span className="text-[10px] sm:text-xs text-emerald-500 font-bold animate-pulse" title="♦ 積分養分 (+200分)">♦</span>
                                    )}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Selected Cell Label */}
                <div className="w-full text-center mt-3 text-xs text-text-secondary font-mono">
                  {selectedCell ? (
                    <span className="flex items-center justify-center gap-2 flex-wrap">
                      <span className="text-cyan-500">起點：</span>
                      <strong className="text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 dark:bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20 dark:border-cyan-800/30">
                        {COL_LABELS[selectedCell.col]}{selectedCell.row + 1}
                      </strong>
                      <span className="text-text-secondary/60">•</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          direction === "H"  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                        : direction === "V"  ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                        : direction === "HR" ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      }`}>
                        {direction === "H" ? "▶ 橫向" : direction === "V" ? "▼ 縱向" : direction === "HR" ? "◀ 逆橫" : "▲ 逆縱"}
                      </span>
                      {!inputWord && (
                        <span className="text-text-secondary/40 text-[10px]">← 輸入成語可預覽字序①②③④</span>
                      )}
                    </span>
                  ) : (
                    <span className="animate-pulse">👆 點擊網格選擇格子，設定成語放置起點</span>
                  )}
                </div>


              </section>

              {/* RIGHT: Game Controls & Helpers (4 Cols) */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                
                {/* 🎮 遊戲主控制台 (Gameplay Controller Panel) */}
                <section className="bg-panel-bg backdrop-blur-md border-2 border-cyan-500/10 dark:border-panel-border rounded-2xl p-5 shadow-[4px_6px_30px_rgba(0,0,0,0.06)] dark:shadow-[4px_6px_30px_rgba(0,0,0,0.6)] flex flex-col gap-4 transition-all duration-300 relative overflow-hidden">
                  
                  {/* Glowing header stripe */}
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500"></div>

                  <h2 className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-purple-600 dark:from-cyan-400 dark:to-purple-400 flex items-center justify-between border-b border-input-border/30 pb-2 select-none">
                    <span className="flex items-center gap-2">
                      <span>🕹️ 遊戲操作控制台</span>
                    </span>
                  </h2>

                  <div className="flex flex-col gap-4">
                    {/* STEP 1: SELECT GRID CELL */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-mono text-[10px] border border-cyan-500/20">1</span>
                        <span>設定成語放置起點</span>
                      </span>
                      
                      {selectedCell ? (
                        <div className="flex items-center justify-between bg-cyan-500/5 dark:bg-cyan-950/20 border border-cyan-500/20 dark:border-cyan-800/30 rounded-lg p-2.5">
                          <span className="text-xs text-text-secondary">當前選中座標：</span>
                          <span className="font-mono font-black text-sm text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded">
                            {COL_LABELS[selectedCell.col]} {selectedCell.row + 1}
                          </span>
                        </div>
                      ) : (
                        <div className="bg-amber-500/5 border border-amber-500/30 dark:border-amber-500/20 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-500 animate-pulse font-medium leading-relaxed">
                          👉 <strong>指示說明</strong>：請先點擊左側棋盤中的任何格子，以設定您要放置的成語第一個字（起點格）！
                        </div>
                      )}
                    </div>

                    {/* STEP 2: INPUT WORD */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-mono text-[10px] border border-purple-500/20">2</span>
                        <span>輸入 4-5 字成語</span>
                      </span>
                      <p className="text-[10px] text-text-secondary leading-normal">
                        輸入的字會與棋盤既有文字自動比對，至少需共用一個字以重疊接龍。
                      </p>
                      <input
                        type="text"
                        maxLength={5}
                        value={inputWord}
                        disabled={!selectedCell || gameState !== "playing"}
                        onChange={(e) => setInputWord(e.target.value.trim())}
                        onKeyDown={handleInputKeyDown}
                        placeholder={selectedCell ? "在此輸入中文成語..." : "⚠️ 請先選取起點格後方可輸入"}
                        className="w-full bg-input-bg border border-input-border hover:border-panel-border focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:shadow-[0_0_8px_rgba(34,211,238,0.15)] rounded-lg px-3 py-2 text-sm text-text-primary transition-all font-medium placeholder-text-secondary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* STEP 3: SELECT DIRECTION */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-mono text-[10px] border border-indigo-500/20">3</span>
                        <span>選擇排列方向</span>
                      </span>
                      <p className="text-[10px] text-text-secondary leading-normal">
                        設定成語是由起點向右（橫向）或向下（縱向）延伸。
                      </p>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setDirection("H")}
                          disabled={!selectedCell || gameState !== "playing"}
                          className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            direction === "H"
                              ? "bg-purple-600 text-white border-transparent shadow-[0_0_8px_rgba(168,85,247,0.25)] dark:bg-purple-500"
                              : "bg-input-bg/50 border-input-border text-text-secondary hover:text-text-primary hover:bg-input-bg disabled:opacity-50 disabled:cursor-not-allowed"
                          }`}
                        >
                          <span>▶ 橫向 (→)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDirection("V")}
                          disabled={!selectedCell || gameState !== "playing"}
                          className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            direction === "V"
                              ? "bg-indigo-600 text-white border-transparent shadow-[0_0_8px_rgba(99,102,241,0.25)] dark:bg-indigo-500"
                              : "bg-input-bg/50 border-input-border text-text-secondary hover:text-text-primary hover:bg-input-bg disabled:opacity-50 disabled:cursor-not-allowed"
                          }`}
                        >
                          <span>▼ 縱向 (↓)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDirection("HR")}
                          disabled={!selectedCell || gameState !== "playing"}
                          className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            direction === "HR"
                              ? "bg-rose-600 text-white border-transparent shadow-[0_0_8px_rgba(244,63,94,0.25)] dark:bg-rose-500"
                              : "bg-input-bg/50 border-input-border text-text-secondary hover:text-text-primary hover:bg-input-bg disabled:opacity-50 disabled:cursor-not-allowed"
                          }`}
                        >
                          <span>◀ 逆橫 (←)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDirection("VR")}
                          disabled={!selectedCell || gameState !== "playing"}
                          className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            direction === "VR"
                              ? "bg-amber-600 text-white border-transparent shadow-[0_0_8px_rgba(217,119,6,0.25)] dark:bg-amber-500"
                              : "bg-input-bg/50 border-input-border text-text-secondary hover:text-text-primary hover:bg-input-bg disabled:opacity-50 disabled:cursor-not-allowed"
                          }`}
                        >
                          <span>▲ 逆縱 (↑)</span>
                        </button>
                      </div>
                    </div>

                    {/* STEP 4: PLACE BUTTON & PREVIEW VERIFICATION */}
                    <div className="flex flex-col gap-2 border-t border-input-border/30 pt-3 mt-1">
                      {/* Dynamic Rule Check Alerts */}
                      {preview && (
                        <div
                          className={`p-2.5 rounded-lg border text-[11px] leading-relaxed flex flex-col gap-1 transition-all ${
                            preview.isValid
                              ? "bg-green-500/10 dark:bg-green-950/20 border-green-500/20 dark:border-green-800/40 text-green-700 dark:text-green-400"
                              : "bg-red-500/10 dark:bg-red-950/20 border-red-500/20 dark:border-red-800/40 text-red-600 dark:text-red-400"
                          }`}
                        >
                          <span className="font-bold font-mono">
                            {preview.isValid ? "✓ 擺放檢測合格" : "✗ 擺放不符規則"}
                          </span>
                          <span className="leading-normal font-normal">
                            {!preview.isValid && (
                              <>
                                {inputWord.trim().length !== 4 && inputWord.trim().length !== 5 && `• 字數須為 4-5 字 (當前為 ${inputWord.trim().length} 字)\n`}
                                {preview.hasNonChinese && "• 必須全部為中文漢字\n"}
                                {!preview.inBounds && "• 部分字元會超出網格邊界\n"}
                                {preview.hasClash && "• 與既存字元發生衝突\n"}
                                {!preview.isGridEmpty && !preview.hasOverlap && "• 必須與既存字元重疊(阿米巴接龍)\n"}
                                {!loadingDict && !preview.isDictValid && `• 「${inputWord.trim()}」非有效成語\n`}
                                {loadingDict && "• 成語庫載入中...\n"}
                              </>
                            )}
                            {preview.isValid && "比對合格！按 Enter 鍵或下方按鈕寫入網格"}
                          </span>
                        </div>
                      )}

                      <div className="flex gap-2 items-stretch mt-1">
                        {/* Primary Place Button */}
                        <button
                          type="button"
                          onClick={() => handlePlaceIdiom()}
                          disabled={!selectedCell || !inputWord || preview?.isValid === false || gameState !== "playing"}
                          className={`flex-1 py-2.5 rounded-lg font-black text-xs transition-all duration-200 cursor-pointer active:scale-97 select-none border text-center ${
                            !selectedCell || !inputWord || gameState !== "playing"
                              ? "bg-input-bg border-input-border text-text-secondary/40 cursor-not-allowed"
                              : preview?.isValid === false
                              ? "bg-red-500/10 border-red-500/30 text-red-500 cursor-not-allowed"
                              : gameMode === "battle" && currentPlayer === 2
                              ? "bg-gradient-to-r from-pink-600 to-rose-600 hover:opacity-90 text-white border-transparent shadow-[0_0_15px_rgba(236,72,153,0.3)]"
                              : "bg-btn-primary-bg hover:opacity-90 text-btn-primary-text border-transparent shadow-[0_0_15px_var(--glow-color)]"
                          }`}
                        >
                          {preview?.isValid === false ? "無法放置" : gameMode === "battle" ? (currentPlayer === 1 ? "🔵 P1 放置" : "🩷 P2 放置") : "放置成語"}
                        </button>

                        {/* Hint Button */}
                        <button
                          type="button"
                          onClick={handleGetHint}
                          disabled={
                            loadingDict ||
                            (gameMode === "dungeon" ? hintsCount <= 0 :
                             gameMode === "challenge" ? scores.p1 < 50 :
                             gameMode === "battle" ? (currentPlayer === 1 ? lives.p1 <= 0 : lives.p2 <= 0) : false)
                          }
                          className="px-3 rounded-lg font-bold text-xs bg-input-bg border border-input-border text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 active:scale-97 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex flex-col justify-center items-center gap-0.5 shrink-0"
                          title={gameMode === "dungeon" ? "獲取接龍提示，每次使用消耗 1 次提示次數" : gameMode === "battle" ? "獲取接龍提示，每次使用扣除 1 點生命值" : gameMode === "challenge" ? "獲取接龍提示，每次使用扣除 50 分" : "獲取接龍提示（免費）"}
                        >
                          <span className="text-[11px]">💡 提示</span>
                          <span className="scale-75 font-mono text-[9px] opacity-75 leading-none">
                            {gameMode === "dungeon" ? `-1 Hint` : gameMode === "battle" ? "-1 Life" : gameMode === "challenge" ? "-50pt" : "Free"}
                          </span>
                        </button>
                      </div>

                      {/* Give Up / Pass button row */}
                      <div className="flex gap-2 mt-1">
                        {gameMode === "battle" && gameState === "playing" && (
                          <button
                            type="button"
                            onClick={handlePassTurn}
                            className="flex-1 py-1.5 rounded-lg font-bold text-[10px] bg-input-bg border border-amber-500/20 text-amber-500 hover:bg-amber-500/10 active:scale-97 transition-all cursor-pointer text-center"
                          >
                            ⏭️ 棄權換人 (-1 Life)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleGiveUp}
                          className="flex-1 py-1.5 rounded-lg font-bold text-[10px] bg-input-bg border border-red-500/20 text-red-500 hover:bg-red-500/10 active:scale-97 transition-all cursor-pointer text-center"
                        >
                          🏳️ {gameMode === "battle" ? "認輸" : "放棄此局"}
                        </button>
                      </div>

                      {/* ShortCut Info */}
                      <div className="text-[9px] text-text-secondary/50 font-mono text-center mt-2 leading-relaxed select-none border-t border-input-border/20 pt-2">
                        快捷提示：點選格子或按 <kbd className="px-1 border rounded bg-input-bg text-[8px]">Space</kbd> 切換橫縱，輸入框按 <kbd className="px-1 border rounded bg-input-bg text-[8px]">Enter</kbd> 放置。
                      </div>
                    </div>
                  </div>
                </section>

                {/* 🎒 遺物背包 (Relic Inventory) */}
                {gameMode === "dungeon" && (
                  <section className="bg-panel-bg backdrop-blur-md border border-purple-500/20 rounded-2xl p-5 shadow-[0_0_20px_rgba(168,85,247,0.05)] dark:shadow-[0_0_20px_rgba(168,85,247,0.15)] flex flex-col gap-3 transition-all duration-300 text-text-primary">
                    <h3 className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 flex items-center gap-1.5 uppercase tracking-widest select-none">
                      <span>🎒 突變遺物背包 ({relics.length})</span>
                    </h3>
                    {relics.length === 0 ? (
                      <p className="text-[11px] text-text-secondary/50 italic select-none">// 尚未獲得任何遺物 //</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {relics.map((rId, idx) => {
                          const info = RELIC_DETAILS[rId] || { title: "未知遺物", desc: "", icon: "❓" };
                          return (
                            <button 
                              key={`${rId}-${idx}`}
                              type="button"
                              onClick={() => setSelectedRelicInfo(info)}
                              title={`${info.title}：\n${info.desc}`}
                              className="group relative flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900/60 border border-purple-500/20 hover:border-purple-400 hover:bg-purple-950/30 transition-all cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95"
                            >
                              <span className="text-xl filter drop-shadow-[0_0_4px_rgba(168,85,247,0.3)]">{info.icon}</span>
                              {/* Custom Tooltip */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col w-48 p-2.5 rounded-lg bg-zinc-950/95 border border-purple-500/40 text-text-primary text-[10px] leading-relaxed shadow-2xl z-20 pointer-events-none select-none animate-fade-in font-medium">
                                <span className="font-bold text-purple-300 text-xs mb-1 border-b border-purple-500/25 pb-0.5">{info.icon} {info.title}</span>
                                <span>{info.desc}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                {/* Idiom Details Card (dynamic) */}
                {selectedCellIdioms.length > 0 ? (
                  <section className="bg-panel-bg backdrop-blur-md border border-cyan-500/30 rounded-2xl p-5 shadow-[0_0_25px_rgba(6,182,212,0.06)] dark:shadow-[0_0_25px_rgba(6,182,212,0.15)] flex flex-col gap-4 transition-all duration-300">
                    <h2 className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-emerald-600 dark:from-cyan-400 dark:to-emerald-400 flex items-center justify-between border-b border-input-border pb-2">
                      <span className="flex items-center gap-2">
                        <span>🔍 成語詳細解析</span>
                      </span>
                      <span className="text-[10px] text-text-secondary font-mono">IDIOM DETAILS</span>
                    </h2>

                    <div className="flex flex-col gap-4 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                      {selectedCellIdioms.map((item) => {
                        const details = idiomsDetails[item.word];
                        const isPlayer1 = item.player === 1;
                        
                        return (
                          <div key={item.id} className="border-b border-input-border pb-4 last:border-0 last:pb-0 flex flex-col gap-2">
                            {/* Word and player badge */}
                            <div className="flex justify-between items-center">
                              <h3 className="text-xl font-extrabold text-pink-600 dark:text-pink-400 tracking-wider drop-shadow-[0_0_6px_rgba(244,63,94,0.15)] dark:drop-shadow-[0_0_6px_rgba(244,63,94,0.3)]">
                                {item.word}
                              </h3>
                              <div className="flex items-center gap-1.5">
                                {details && details.source && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                    details.source === "教育部《成語典》"
                                      ? "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-500/20"
                                      : "bg-blue-500/10 text-blue-700 border border-blue-500/20 dark:bg-blue-950/80 dark:text-blue-400 dark:border-blue-500/20"
                                  }`}>
                                    {details.source}
                                  </span>
                                )}
                                <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-pink-500/10 text-pink-700 border border-pink-500/20 dark:bg-pink-950/80 dark:text-pink-400 dark:border-pink-500/20">
                                  玩家放置
                                </span>
                              </div>
                            </div>

                            {/* Pinyin */}
                            {details ? (
                              <div className="text-xs font-mono text-text-secondary font-semibold bg-input-bg px-2 py-1 rounded w-fit border border-input-border">
                                {details.pinyin || "拼音未收錄"}
                              </div>
                            ) : (
                              <div className="text-xs font-mono text-text-secondary/60 italic">
                                拼音載入中...
                              </div>
                            )}

                            {/* Explanation */}
                            <div className="flex flex-col gap-1 mt-1">
                              <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider font-mono">釋義 Explanation</span>
                              <p className="text-xs text-text-primary leading-relaxed font-medium bg-input-bg/40 p-2 rounded border border-input-border/60">
                                {details ? details.explanation || "釋義未收錄" : "詳細釋義載入中..."}
                              </p>
                            </div>

                            {/* Derivation / Origin */}
                            {details && details.derivation && details.derivation !== "無" && (
                              <div className="flex flex-col gap-1 mt-1">
                                <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider font-mono">典故 Origin</span>
                                <p className="text-[11px] text-text-secondary leading-relaxed bg-input-bg/20 p-2 rounded border border-input-border/30 whitespace-pre-wrap">
                                  {details.derivation}
                                </p>
                              </div>
                            )}

                            {/* Synonyms & Antonyms */}
                            {details && (details.synonyms || details.antonyms) && (
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                {details.synonyms && (
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider font-mono">近義成語 Synonyms</span>
                                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/5 p-1.5 rounded border border-emerald-500/10">
                                      {details.synonyms}
                                    </p>
                                  </div>
                                )}
                                {details.antonyms && (
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider font-mono">反義成語 Antonyms</span>
                                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium bg-rose-500/5 p-1.5 rounded border border-rose-500/10">
                                      {details.antonyms}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Examples */}
                            {details && details.examples && details.examples.length > 0 && (
                              <div className="flex flex-col gap-1 mt-1">
                                <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider font-mono">用法例句 Examples</span>
                                <ul className="text-xs text-text-primary leading-relaxed bg-input-bg/30 p-2 rounded border border-input-border/40 list-disc list-inside flex flex-col gap-1">
                                  {details.examples.map((ex: string, i: number) => (
                                    <li key={i} className="pl-1">{ex}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Score and Placement Details */}
                            <div className="flex justify-between items-center text-[10px] text-text-secondary font-mono mt-1 bg-input-bg/30 px-2 py-1 rounded">
                              <span>獲得分數: <strong className="text-cyan-600 dark:text-cyan-400">+{item.score}分</strong></span>
                              <span>擺放方向: {item.direction === "H" ? "▶橫向" : item.direction === "V" ? "▼縱向" : item.direction === "HR" ? "◀逆橫" : "▲逆縱"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : (
                  /* Elegant Inspector Placeholder Card */
                  <section className="bg-panel-bg backdrop-blur-md border border-panel-border/30 rounded-2xl p-5 shadow-[2px_4px_30px_rgba(0,0,0,0.04)] dark:shadow-[2px_4px_30px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center text-center p-6 min-h-[140px] transition-all duration-300 select-none">
                    <span className="text-3xl mb-2.5">🔍</span>
                    <h3 className="text-sm font-bold text-text-primary mb-1">成語字典解析</h3>
                    <p className="text-xs text-text-secondary leading-relaxed max-w-[220px]">
                      點擊網格中已擺放的成語字元，即可在此處查看拼音、釋義與典故。
                    </p>
                  </section>
                )}

                {/* Presets and Helpers (Collapsible) */}
                <details className="group bg-panel-bg backdrop-blur-md border border-panel-border rounded-2xl p-4 shadow-[2px_4px_30px_rgba(0,0,0,0.05)] transition-all duration-300 cursor-pointer overflow-hidden">
                  <summary className="flex items-center justify-between font-bold text-xs text-text-primary uppercase tracking-widest font-mono select-none outline-none">
                    <span>💡 測試輔助成語庫</span>
                    <span className="text-[10px] text-text-secondary transition-transform group-open:rotate-180 font-sans">▼</span>
                  </summary>
                  <div className="mt-3 border-t border-input-border/30 pt-3 flex flex-col gap-2 cursor-default" onClick={(e) => e.stopPropagation()}>
                    <p className="text-[11px] text-text-secondary leading-normal">
                      點擊下方成語，可將其快速填入上方輸入欄：
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {PRESET_IDIOMS.map((idiom) => (
                        <button
                          key={idiom}
                          disabled={gameState !== "playing"}
                          onClick={() => setInputWord(idiom)}
                          className="px-2.5 py-1 rounded bg-input-bg hover:bg-btn-primary-bg/10 border border-input-border hover:border-btn-primary-bg/35 text-xs text-text-primary transition-all font-mono disabled:opacity-50 cursor-pointer active:scale-95"
                        >
                          {idiom}
                        </button>
                      ))}
                    </div>
                  </div>
                </details>
              </div>
          </div>

          {/* --- BOTTOM SECTION: Tabbed Game Logs & History --- */}
          <footer className="w-full mt-4">
            <section className="bg-panel-bg backdrop-blur-md border border-panel-border rounded-2xl p-5 shadow-[2px_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[2px_4px_30px_rgba(0,0,0,0.5)] flex flex-col gap-4 min-h-[260px] transition-all duration-300">
              {/* Card Header with tabs */}
              <div className="flex items-center justify-between border-b border-input-border pb-2.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveLogTab("history")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeLogTab === "history"
                        ? "bg-purple-500/10 border border-purple-500/30 text-purple-700 dark:text-purple-300"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    📜 接龍歷史 ({history.length})
                  </button>
                  <button
                    onClick={() => setActiveLogTab("system")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeLogTab === "system"
                        ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-700 dark:text-cyan-400"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    🖥️ 系統與對戰日誌 ({logs.length})
                  </button>
                </div>
                <span className="text-[10px] text-text-secondary font-mono tracking-widest uppercase select-none">
                  {activeLogTab === "history" ? "Gameplay History" : "System Debug Logs"}
                </span>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto max-h-[190px] pr-1 custom-scrollbar">
                {activeLogTab === "history" ? (
                  /* History Log List */
                  <div className="flex flex-col gap-2">
                    {history.length === 0 ? (
                      <div className="text-xs text-text-secondary text-center py-10 font-mono select-none">// NO HISTORY RECORDED //</div>
                    ) : (
                      history.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-center text-xs bg-input-bg/50 border border-input-border hover:border-panel-border rounded px-3 py-2 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-text-secondary font-mono w-5">#{history.length - index}</span>
                            <strong className="tracking-wide text-sm font-bold text-pink-600 dark:text-pink-400 drop-shadow-[0_0_4px_rgba(244,63,94,0.15)]">{item.word}</strong>
                            {item.combo > 1 && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[9px] font-bold font-mono border border-purple-200 dark:border-purple-500/20 animate-pulse">
                                COMBO x{item.combo}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-[10px] text-text-secondary font-mono">
                            <span>+{item.score}分</span>
                            <span>起點: {COL_LABELS[item.col]}{item.row + 1} ({item.direction === "H" ? "▶橫" : item.direction === "V" ? "▼縱" : item.direction === "HR" ? "◀逆橫" : "▲逆縱"})</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  /* System Logs List */
                  <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                    {logs.length === 0 ? (
                      <div className="text-xs text-text-secondary text-center py-10 select-none">// NO LOGS RECORDED //</div>
                    ) : (
                      logs.map((log) => {
                        let textColClass = "text-log-info-text";
                        let bgColClass = "hover:bg-input-bg/40";

                        if (log.type === "success" || log.type === "system") {
                          textColClass = "text-log-success-text";
                          bgColClass = "hover:bg-green-500/5 dark:hover:bg-green-950/10";
                        } else if (log.type === "error") {
                          textColClass = "text-log-error-text";
                          bgColClass = "hover:bg-red-500/5 dark:hover:bg-red-950/10";
                        } else if (log.type === "p1") {
                          textColClass = "text-log-p1-text font-semibold";
                          bgColClass = "hover:bg-cyan-500/5 dark:hover:bg-cyan-950/10";
                        } else if (log.type === "p2") {
                          textColClass = "text-log-p2-text font-semibold";
                          bgColClass = "hover:bg-pink-500/5 dark:hover:bg-pink-950/10";
                        }

                        return (
                          <div
                            key={log.id}
                            className={`flex items-start gap-2.5 leading-relaxed p-1 rounded transition-colors ${textColClass} ${bgColClass}`}
                          >
                            <span className="text-text-secondary/50 select-none">[{log.time}]</span>
                            <span className="flex-1">{log.text}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </section>
          </footer>
        </>
      )}
      </div>

      {/* Rules Modal Overlay */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300 text-text-primary">
          <div className="bg-panel-bg border border-panel-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl relative custom-scrollbar animate-fade-in">
            <button
              onClick={() => setShowRulesModal(false)}
              className="absolute top-4 right-4 text-text-secondary hover:text-text-primary text-xl font-bold font-mono cursor-pointer"
            >
              ✕
            </button>
            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 border-b border-input-border pb-3 mb-4 flex items-center gap-2">
              <span>🎯 阿米巴成語接龍 - 核心玩法規則</span>
            </h2>
            <div className="space-y-4 text-sm text-text-secondary leading-relaxed font-medium">
              <div>
                <h4 className="font-bold text-text-primary text-base mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                  <span>1. 網格定位與方向</span>
                </h4>
                <p>
                  點擊 15×15 棋盤網格中的任意格子，將其設置為您要放置的成語的<strong className="text-text-primary">第一個漢字</strong>（即起點）。
                  當前排列方向會以圖示標明（橫向為 <span className="text-purple-600 dark:text-purple-400 font-bold">▶ 橫向</span>，縱向為 <span className="text-indigo-600 dark:text-indigo-400 font-bold">▼ 縱向</span>）。
                </p>
                <div className="mt-2 text-xs text-cyan-600 dark:text-cyan-400 bg-cyan-500/5 px-2.5 py-1.5 rounded border border-cyan-500/10">
                  💡 <strong>直覺小技巧</strong>：直接點擊已選中的同一格子，或者在輸入欄中按一下 <kbd className="px-1 border rounded bg-input-bg text-[10px]">Space</kbd> 鍵，即可快速切換排列方向！
                </div>
              </div>

              <div>
                <h4 className="font-bold text-text-primary text-base mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                  <span>2. 阿米巴相交接龍</span>
                </h4>
                <p>
                  除首個單詞外，之後放置的每一個成語都必須與網格上已存在的漢字<strong className="text-text-primary">重疊（即共用至少一個字）</strong>。
                  重疊的字必須完全相同，如果不匹配或未重疊，系統將提示不合規則。
                </p>
              </div>

              <div>
                <h4 className="font-bold text-text-primary text-base mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                  <span>3. 成語校驗與提示</span>
                </h4>
                <p>
                  本遊戲包含<strong>嚴格的中文漢字成語庫驗證</strong>。每次輸入必須為有效成語且字數為 4 或 5 個字。
                  如果卡關，可以點擊主控制台的 <span className="font-bold text-cyan-600 dark:text-cyan-400">💡 提示</span>，系統會檢索字典自動在您的起點格放置一條可行成語（自由模式免費，積分挑戰模式扣除 50 分，雙人對決模式扣除 1 點生命值）。
                </p>
              </div>

              <div>
                <h4 className="font-bold text-text-primary text-base mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>4. Combo 連鎖加分</span>
                </h4>
                <p>
                  如果擺放一個成語的同時，重疊了地圖上<strong className="text-text-primary">多個</strong>現有漢字，將觸發 Combo 連鎖！
                  Combo 會成倍增加該成語獲得的基礎分（雙重重疊 2.5倍/2倍Combo，三重重疊 5倍/3倍Combo），是爭奪高分的關鍵。
                </p>
              </div>

              {gameMode === "battle" && (
                <div className="border-t border-panel-border/30 pt-3 mt-2 text-xs text-text-secondary leading-relaxed flex flex-col gap-2">
                  <h4 className="font-bold text-pink-500 dark:text-pink-400 text-base mb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                    <span>5. 雙人對決生存規則</span>
                  </h4>
                  <p>
                    藍阿米巴 (P1) 與粉阿米巴 (P2) 回合制生存對抗，雙方起始分數為 0 分，每人各有 5 條生命，單回合限時 60 秒。
                    回合超時、主動棄權 (Pass) 將扣除 1 點生命值並換人，點擊提示也將扣除 1 點生命值。生命值最先歸零的人直接判輸！
                    重疊對手的文字會將該領地奪過來，並外加 <strong className="text-text-primary">+150 掠奪分/格</strong>。
                  </p>
                </div>
              )}
              {gameMode === "challenge" && (
                <div className="border-t border-panel-border/30 pt-3 mt-2 text-xs text-text-secondary leading-relaxed flex flex-col gap-2">
                  <h4 className="font-bold text-amber-500 dark:text-amber-400 text-base mb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>5. 積分挑戰模式規則</span>
                  </h4>
                  <p>
                    ⏱️ <strong className="text-text-primary">限時挑戰</strong>：初始 120 秒倒數！時間歸零則遊戲結束。每次成功放置成語可自動延長 20 秒，吃到 ⏰ 時間養分額外延長 10 秒。
                  </p>
                  <p>
                    💡 <strong className="text-text-primary">提示費用</strong>：使用提示將扣除 50 積分。積分不足 50 時無法使用提示。
                  </p>
                </div>
              )}
              {gameMode === "dungeon" && (
                <div className="border-t border-panel-border/30 pt-3 mt-2 text-xs text-text-secondary leading-relaxed flex flex-col gap-2">
                  <h4 className="font-bold text-purple-500 dark:text-purple-400 text-base mb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                    <span>5. 地牢闖關模式規則</span>
                  </h4>
                  <p>
                    ❤️ <strong className="text-text-primary">生命機制</strong>：初始擁有 3 點生命。打錯字、非成語或違反接龍/重複規則扣除 1 點。歸零則冒險失敗。
                  </p>
                  <p>
                    🔄 <strong className="text-text-primary">重複放置限制</strong>：地牢模式中允許重複使用已用過的成語，但每次使用重複成語都會扣除 1 點生命值 (HP)！
                  </p>
                  <p>
                    💡 <strong className="text-text-primary">提示限制</strong>：初始 3 次提示。使用提示消耗提示次數，次數為 0時無法再使用。
                  </p>
                  <p>
                    👹 <strong className="text-text-primary">首領降臨與機制</strong>：每章得分達到目標分時 BOSS 降臨（第一章 300 分，第二章 500 分）。BOSS 會佔據中央區域。
                  </p>
                  <p>
                    🦠 <strong className="text-text-primary">第一章【贅字史萊姆】</strong>：每回合會噴灑「贅字阻擋格」封鎖網格。在 BOSS 核心相鄰格放置成語可對其造成傷害。
                  </p>
                  <p>
                    ⏳ <strong className="text-text-primary">第二章【沙漏文曲星】</strong>：每 3 回合鎖定盤面一個安全字發動 20 秒「時空炸彈」。若 20 秒內未透過放置成語交叉穿過解除，炸彈將爆炸並清除周圍 3x3 已填字格且扣除 1 生命。穿過炸彈格解鎖則可對 BOSS 造成雙倍傷害（且無視相鄰限制）。
                  </p>
                  <p>
                    🐍 <strong className="text-text-primary">第三章【竹簡巨蟒】</strong>：巨蟒長度為 4 格（由「竹簡巨蟒」字元組成）在網格中追獵游動。移動過後會殘留 3 回合「黑色墨跡」（不可填字）。在巨蟒前進的「預期路徑（紅框🎯）」上佈置成語攔截，或前進時撞擊成語字元，均可對其造成 150 點傷害並使其暈眩停頓一回合。
                  </p>
                  <p>
                    🏆 <strong className="text-text-primary">遺物系統</strong>：每一章達到里程碑得分時（200 / 400 分）觸發遺物三選一，獲得強大的被動增益！
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-5 py-2 rounded-xl bg-btn-primary-bg hover:opacity-90 text-white cursor-pointer active:scale-95 transition-all font-bold text-sm shadow-[0_4px_12px_var(--glow-color)]"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Relic Selection Modal */}
      {relicChoices && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-panel-bg border-2 border-purple-500/50 rounded-3xl max-w-2xl w-full p-8 shadow-[0_0_50px_rgba(168,85,247,0.3)] relative text-text-primary overflow-hidden animate-fade-in">
            {/* Ambient glowing backgrounds */}
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="text-center mb-6">
              <span className="text-[40px] animate-bounce inline-block">🎁</span>
              <h2 className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 mt-2">
                突變遺物三選一 (MUTATION SELECT)
              </h2>
              <p className="text-xs text-text-secondary mt-1 font-mono uppercase tracking-widest text-purple-400/80">
                Choose one relic to alter your amoeba's genome
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
              {relicChoices.map((choice) => {
                const info = RELIC_DETAILS[choice] || { title: "未知遺物", desc: "", icon: "❓" };
                return (
                  <button
                    key={choice}
                    onClick={() => handleSelectRelic(choice)}
                    className="flex flex-col items-center text-center p-5 rounded-2xl bg-zinc-900/60 border border-purple-500/20 hover:border-purple-400 hover:bg-purple-950/20 hover:scale-105 active:scale-98 transition-all duration-300 group cursor-pointer relative shadow-[0_4px_15px_rgba(0,0,0,0.4)]"
                  >
                    {/* Glowing card border on hover */}
                    <div className="absolute inset-0 rounded-2xl border border-cyan-500/0 group-hover:border-cyan-500/30 transition-all duration-300"></div>
                    
                    <span className="text-4xl mb-3 filter drop-shadow-[0_0_8px_rgba(168,85,247,0.4)] group-hover:scale-110 transition-all duration-300">{info.icon}</span>
                    <h3 className="font-extrabold text-sm text-purple-300 group-hover:text-purple-200 tracking-wider mb-2">{info.title}</h3>
                    <p className="text-xs text-text-secondary leading-relaxed font-medium mt-1">{info.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Victory Overlay */}
      {showVictoryOverlay && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-fade-in pointer-events-none select-none text-text-primary">
          <div className="text-center max-w-lg px-6 flex flex-col items-center gap-4">
            {/* Animated crown icon or boss defeated text */}
            <span className="text-7xl animate-bounce filter drop-shadow-[0_0_15px_rgba(234,179,8,0.6)]">🏆</span>
            <h1 className="text-4xl md:text-5xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 drop-shadow-[0_0_20px_rgba(234,179,8,0.3)] mt-2">
              擊敗 BOSS！
            </h1>
            <p className="text-sm font-bold text-yellow-300 font-mono tracking-widest uppercase">
              BOSS DEFEATED - CHAPTER CLEAR
            </p>
            <div className="h-0.5 w-40 bg-gradient-to-r from-transparent via-yellow-500 to-transparent my-2"></div>
            <p className="text-xs text-text-secondary leading-relaxed font-semibold">
              你成功淨化了阿米巴細胞盤面上的贅字史萊姆！正在重整結構，晉級至第 {chapter + 1} 章...
            </p>
            <div className="mt-4 flex items-center gap-2 bg-yellow-950/40 border border-yellow-500/20 px-4 py-2 rounded-xl text-yellow-500 font-mono text-xs">
              <span className="animate-spin inline-block mr-1">🌀</span> CHAPTER {chapter} COMPLETED
            </div>
          </div>
        </div>
      )}

      {/* Relic Detail Modal */}
      {selectedRelicInfo && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedRelicInfo(null)}
        >
          <div 
            className="bg-panel-bg border border-purple-500/30 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_35px_rgba(168,85,247,0.25)] text-text-primary text-center select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl mb-4 filter drop-shadow-[0_0_8px_rgba(168,85,247,0.4)] animate-bounce">
              {selectedRelicInfo.icon}
            </div>
            <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
              {selectedRelicInfo.title}
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed mb-6 font-medium">
              {selectedRelicInfo.desc}
            </p>
            <button
              type="button"
              onClick={() => setSelectedRelicInfo(null)}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-all active:scale-95 shadow-[0_4px_12px_rgba(168,85,247,0.2)] cursor-pointer"
            >
              確定
            </button>
          </div>
        </div>
      )}

      {/* Duplicate Idiom HP Warning Modal */}
      {duplicateWarning && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setDuplicateWarning(null)}
        >
          <div 
            className="bg-panel-bg border border-red-500/30 rounded-2xl p-6 max-w-sm w-full shadow-[0_0_35px_rgba(239,68,68,0.35)] text-text-primary text-center select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl mb-4 filter drop-shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse">
              ⚠️
            </div>
            <h3 className="text-xl font-black text-red-500 mb-2">
              重複成語扣除生命！
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed mb-6 font-medium">
              您輸入了重複使用的成語「<strong className="text-red-400 font-extrabold">{duplicateWarning.word}</strong>」。依據地牢規則，重複使用已放置過的成語會被扣除 <strong className="text-red-400 font-extrabold">1 點生命值 (HP)</strong>！
            </p>
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all active:scale-95 shadow-[0_4px_12px_rgba(239,68,68,0.2)] cursor-pointer"
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {/* Boss Encounter Tutorial Modal (Chapter-specific and concise) */}
      {showBossTutorial && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setShowBossTutorial(false)}
        >
          <div 
            className="bg-panel-bg border border-red-500/40 rounded-3xl p-6 max-w-sm w-full shadow-[0_0_40px_rgba(239,68,68,0.3)] text-text-primary select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="text-4xl mb-2 filter drop-shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-bounce">
                {chapter === 1 ? "👾" : chapter === 2 ? "⏳" : "🐍"}
              </div>
              <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-pink-500">
                {chapter === 1 ? "第一章：贅字史萊姆" : chapter === 2 ? "第二章：沙漏文曲星" : "第三章：竹簡巨蟒"}
              </h3>
              <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mt-1">
                // Boss Fight Tutorial //
              </p>
            </div>
            
            <div className="space-y-3 text-xs leading-relaxed mb-6 font-medium text-text-secondary">
              {chapter === 1 && (
                <>
                  <div className="bg-red-500/5 border border-red-500/10 p-2.5 rounded-xl">
                    <span className="font-bold text-red-400">⚔️ 進攻方式</span>
                    <p className="text-[11px] mt-0.5">在 BOSS 核心（中央區域）<strong>相鄰的格子</strong>放置成語，即可造成傷害！</p>
                  </div>
                  <div className="bg-purple-500/5 border border-purple-500/10 p-2.5 rounded-xl">
                    <span className="font-bold text-purple-400">⚠️ BOSS 技能</span>
                    <p className="text-[11px] mt-0.5">史萊姆每回合會隨機噴灑「贅字封鎖格」（無法填字）。</p>
                  </div>
                </>
              )}

              {chapter === 2 && (
                <>
                  <div className="bg-red-500/5 border border-red-500/10 p-2.5 rounded-xl">
                    <span className="font-bold text-red-400">⚔️ 進攻與炸彈</span>
                    <p className="text-[11px] mt-0.5">相鄰放置可造成傷害。每 3 回合會丟出「時空炸彈」，請用成語<strong>交叉穿過</strong>解鎖，可造成<strong>雙倍無視距離傷害</strong>！</p>
                  </div>
                  <div className="bg-purple-500/5 border border-purple-500/10 p-2.5 rounded-xl">
                    <span className="font-bold text-purple-400">💥 未解鎖懲罰</span>
                    <p className="text-[11px] mt-0.5">炸彈 20 秒倒數完會爆炸，扣除 1 生命並清除周圍 3x3 已填字格。</p>
                  </div>
                </>
              )}

              {chapter === 3 && (
                <>
                  <div className="bg-red-500/5 border border-red-500/10 p-2.5 rounded-xl">
                    <span className="font-bold text-red-400">⚔️ 攔截與撞擊</span>
                    <p className="text-[11px] mt-0.5">在巨蟒前進的<strong>預期路徑（紅框🎯）</strong>佈置成語進行<strong>攔截</strong>，或等牠<strong>撞擊</strong>您的字元，可造成 150 點傷害並使其<strong>暈眩停頓一回合</strong>！</p>
                  </div>
                  <div className="bg-purple-500/5 border border-purple-500/10 p-2.5 rounded-xl">
                    <span className="font-bold text-purple-400">🐍 貪食蛇與墨跡</span>
                    <p className="text-[11px] mt-0.5">巨蟒移動時會吞噬您的字元且<strong>越吃越長</strong>（增加「贅」字）。爬行過後會留下 3 回合「黑色墨跡」（無法填字）。</p>
                  </div>
                </>
              )}

              <div className="bg-cyan-500/5 border border-cyan-500/10 p-2.5 rounded-xl">
                <span className="font-bold text-cyan-400">🧹 戰場已清理</span>
                <p className="text-[11px] mt-0.5">為了留出戰鬥空間，盤面已自動清理，<strong>僅隨機保留了 3 組成語</strong>！</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowBossTutorial(false)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-bold text-sm transition-all active:scale-95 shadow-[0_4px_12px_rgba(239,68,68,0.2)] cursor-pointer text-center"
            >
              開始戰鬥
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
