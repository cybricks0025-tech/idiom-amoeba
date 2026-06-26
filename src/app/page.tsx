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
  direction: "H" | "V";
  player: 1 | 2;
  score: number;
  combo: number;
}

interface Nutrient {
  r: number;
  c: number;
  type: "points" | "time";
}

const COL_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];

// Presets
const PRESET_IDIOMS = [
  "一心一意", "意氣風發", "發揚光大", "大言不慚", "蠶食鯨吞",
  "生生不息", "息事寧人", "人山人海", "海闊天空", "空前絕後",
];

const STARTING_IDIOMS = [
  "開天闢地", "一馬當先", "眾志成城", "名列前茅", "風調雨順", "國泰民安", "萬事如意", "蒸蒸日上", "前程似錦", "馬到成功",
];

export default function Home() {
  // --- Theme State ---
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const isLight = !document.documentElement.classList.contains("dark");
    setTheme(isLight ? "light" : "dark");
  }, []);

  // --- Game Modes States ---
  const [gameMode, setGameMode] = useState<"free" | "challenge" | "battle">("free");
  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">("idle");

  // --- Grid & Placements ---
  const [grid, setGrid] = useState<string[][]>(() =>
    Array(15).fill(null).map(() => Array(15).fill(""))
  );
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [inputWord, setInputWord] = useState<string>("");
  const [direction, setDirection] = useState<"H" | "V">("H");
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

  const convertToTraditional = (str: string) => {
    return str.split("").map((char) => charMap[char] || char).join("");
  };
  
  // Battle Mode specific
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

  // --- Helper: Spawn Nutrient Cells ---
  const spawnNutrients = (
    targetCount: number,
    currentGrid: string[][],
    existingNutrients: Nutrient[],
    isChallengeMode: boolean
  ) => {
    const list = [...existingNutrients];
    const emptyCells: { r: number; c: number }[] = [];

    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
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
  const resetGame = (mode: "free" | "challenge" | "battle") => {
    setGrid(Array(15).fill(null).map(() => Array(15).fill("")));
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
    setTimeLeft(mode === "battle" ? 60 : mode === "challenge" ? 120 : 90);
    setLastTimeBonus(0);
    setTimerBonusTrigger(0);
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
    setGrid(Array(15).fill(null).map(() => Array(15).fill("")));
    setScores({ p1: 0, p2: 0 });
    setLives({ p1: 5, p2: 5 });
    setHistory([]);
    setSelectedCell(null);
    setInputWord("");
    setCellOwners({});
    setConsecutivePasses(0);
    setCurrentPlayer(1);
    
    // Auto-place random starter word in center
    const randomWord = STARTING_IDIOMS[Math.floor(Math.random() * STARTING_IDIOMS.length)];
    const centerRow = 7;
    const centerCol = 5;
    const newGrid = Array(15).fill(null).map(() => Array(15).fill(""));
    const newCellOwners: Record<string, 1 | 2> = {};

    for (let i = 0; i < randomWord.length; i++) {
      newGrid[centerRow][centerCol + i] = randomWord[i];
      newCellOwners[`${centerRow},${centerCol + i}`] = 1;
    }

    setGrid(newGrid);
    setCellOwners(newCellOwners);
    
    // Setup initial nutrients
    const initialNutrients = spawnNutrients(5, newGrid, [], activeMode === "challenge");
    setNutrients(initialNutrients);

    setLastTimeBonus(0);
    setTimerBonusTrigger(0);

    if (activeMode === "free") {
      setTimeLeft(90);
      setScores({ p1: 100, p2: 0 });
      addLog(`【自由練習模式】已開始！首詞為「${randomWord}」，無時間限制。`, "system");
    } else if (activeMode === "challenge") {
      setTimeLeft(120);
      setScores({ p1: 100, p2: 0 });
      addLog(`【積分挑戰模式】已開始！首詞為「${randomWord}」，限時 120 秒，吃掉 ⏰ 或正確輸入成語可延長時間。`, "system");
    } else if (activeMode === "battle") {
      setTimeLeft(60);
      setScores({ p1: 0, p2: 0 });
      addLog(`【雙人對抗生存模式】已開始！首詞為「${randomWord}」歸藍色阿米巴，目前輪到藍色阿米巴。雙方各有 5 條生命，每回合思考時間為 60 秒！`, "system");
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
      },
    ]);
    setSelectedCell({ row: centerRow, col: centerCol });
    setDirection("V");
  };

  const handleGiveUp = () => {
    if (window.confirm(gameMode === "battle" ? "確定向對手認輸嗎？" : "確定要放棄此局並結算分數嗎？")) {
      if (gameMode === "battle") {
        setWinnerOverride(currentPlayer === 1 ? 2 : 1);
        setGameState("gameover");
        addLog(`【系統】玩家 ${currentPlayer === 1 ? "一" : "二"} 選擇認輸！對手直接獲勝。`, "system");
      } else {
        setGameState("gameover");
        addLog("【系統】您已選擇放棄此局，進入分數結算。", "system");
      }
    }
  };

  const handleGetHint = () => {
    if (gameState !== "playing") return;

    if (gameMode === "battle") {
      const currentLives = currentPlayer === 1 ? lives.p1 : lives.p2;
      if (currentLives <= 0) {
        addLog("生命值已耗盡，無法獲取提示！", "error");
        return;
      }
      if (!window.confirm("使用提示將扣除 1 點生命值！確定要使用嗎？")) {
        return;
      }
    } else {
      const currentScore = currentPlayer === 1 ? scores.p1 : scores.p2;
      if (gameMode !== "free" && currentScore < 50) {
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
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
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

        // Try both directions for all matching letter indices
        const shuffledDirs = ["H", "V"].sort(() => Math.random() - 0.5);
        for (const dir of shuffledDirs) {
          for (const matchIdx of charIndices) {
            const startR = dir === "H" ? r : r - matchIdx;
            const startC = dir === "H" ? c - matchIdx : c;

            const coords = getCoordinatesForWord(startR, startC, word.length, dir as "H" | "V");

            const inBounds = coords.every((co) => co.r >= 0 && co.r < 15 && co.c >= 0 && co.c < 15);
            if (!inBounds) continue;

            let hasClash = false;
            for (let j = 0; j < coords.length; j++) {
              const existing = grid[coords[j].r][coords[j].c];
              if (existing !== "" && existing !== word[j]) {
                hasClash = true;
                break;
              }
            }
            if (hasClash) continue;

            // Found a valid placement!
            setInputWord(word);
            setSelectedCell({ row: startR, col: startC });
            setDirection(dir as "H" | "V");

            // Deduct life / score
            if (gameMode === "battle") {
              setLives((prev) => ({
                p1: currentPlayer === 1 ? prev.p1 - 1 : prev.p1,
                p2: currentPlayer === 2 ? prev.p2 - 1 : prev.p2,
              }));
              triggerDamageEffect(currentPlayer);
              addLog(
                `【系統提示】玩家 ${currentPlayer === 1 ? "一" : "二"} 使用了提示，扣除 1 點生命值！建議在 ${COL_LABELS[startC]}${startR + 1} (${dir === "H" ? "橫向" : "縱向"}) 放置成語「${word}」。已自動為您填寫！`,
                "system"
              );
            } else {
              if (gameMode === "challenge") {
                setScores((prev) => ({
                  ...prev,
                  p1: Math.max(0, prev.p1 - 50),
                }));
                addLog(
                  `【系統提示】已扣除 50 積分！建議在 ${COL_LABELS[startC]}${startR + 1} (${dir === "H" ? "橫向" : "縱向"}) 放置成語「${word}」。已自動為您填寫！`,
                  "system"
                );
              } else {
                // Free mode: free hint!
                addLog(
                  `【系統提示】建議在 ${COL_LABELS[startC]}${startR + 1} (${dir === "H" ? "橫向" : "縱向"}) 放置成語「${word}」。已自動為您填寫！`,
                  "system"
                );
              }
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
    const initNutrients = spawnNutrients(5, grid, [], false);
    setNutrients(initNutrients);
    addLog("歡迎來到成語阿米巴！點擊網格任一位置為起點，輸入 4 字成語開始接龍。", "system");

    // Load idioms wordlist for quick validation
    addLog("正在載入成語檢索庫...", "system");
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    fetch(`${basePath}/idioms_words.json`)
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
    fetch(`${basePath}/idioms.json`)
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
    fetch(`${basePath}/simplified_to_traditional.json`)
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
    if (gameState !== "playing") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (gameMode === "free") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (gameMode === "challenge") {
            // End challenge mode
            setGameState("gameover");
            addLog("時間到！【積分挑戰】已結束，請在面板查看您的最終成績！", "system");
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          } else if (gameMode === "battle") {
            // Battle mode: turn timeout - lose a life!
            const nextP = currentPlayer === 1 ? 2 : 1;
            addLog(`玩家 ${currentPlayer === 1 ? "一" : "二"} 回合逾時！扣除 1 點生命值並更換回合。`, "error");
            setLives((prev) => ({
              p1: currentPlayer === 1 ? prev.p1 - 1 : prev.p1,
              p2: currentPlayer === 2 ? prev.p2 - 1 : prev.p2,
            }));
            triggerDamageEffect(currentPlayer);
            setCurrentPlayer(nextP);
            return 60; // reset turn timer to 60s
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
        setWinnerOverride(2); // P2 wins
        setGameState("gameover");
        addLog("【系統】藍色阿米巴 P1 生命值歸零，粉色阿米巴 P2 獲得勝利！", "system");
      } else if (lives.p2 <= 0) {
        setWinnerOverride(1); // P1 wins
        setGameState("gameover");
        addLog("【系統】粉色阿米巴 P2 生命值歸零，藍色阿米巴 P1 獲得勝利！", "system");
      }
    }
  }, [lives, gameMode, gameState]);

  // --- Check empty board ---
  const isGridEmpty = () => {
    return grid.every((row) => row.every((cell) => cell === ""));
  };

  // --- Calculate coordinates helper ---
  const getCoordinatesForWord = (
    row: number,
    col: number,
    wordLength: number,
    dir: "H" | "V"
  ) => {
    const coords = [];
    for (let i = 0; i < wordLength; i++) {
      const r = dir === "H" ? row : row + i;
      const c = dir === "H" ? col + i : col;
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
      const isWordInBounds = coord.r >= 0 && coord.r < 15 && coord.c >= 0 && coord.c < 15;
      if (!isWordInBounds) {
        inBounds = false;
        return { ...coord, char: trimmed[index] || "", inBounds: false, clash: false, overlap: false, slotIndex: index };
      }

      const existingChar = grid[coord.r][coord.c];
      const newChar = trimmed[index] || "";
      const isClash = existingChar !== "" && existingChar !== newChar;
      const isOverlap = existingChar !== "" && existingChar === newChar;

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
        setDirection((prev) => (prev === "H" ? "V" : "H"));
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      setDirection((prev) => (prev === "H" ? "V" : "H"));
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
        return item.row === row && col >= item.col && col < item.col + len;
      } else {
        return item.col === col && row >= item.row && row < item.row + len;
      }
    });
  };

  const selectedCellIdioms = getSelectedCellIdioms();

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
      addLog("放置失敗：成語只能包含中文漢字！", "error");
      return;
    }

    if (activeWord.length !== 4 && activeWord.length !== 5) {
      addLog("成語長度必須為 4 或 5 個字！", "error");
      return;
    }

    if (!loadingDict && !idiomsWords.has(activeWord)) {
      addLog(`放置失敗：「${activeWord}」非成語庫中之有效成語！`, "error");
      return;
    }

    const { row, col } = activeCell;
    const coords = getCoordinatesForWord(row, col, activeWord.length, direction);

    // 1. Bounds Check
    const outOfBounds = coords.some((coord) => coord.r < 0 || coord.r >= 15 || coord.c < 0 || coord.c >= 15);
    if (outOfBounds) {
      addLog(`放置失敗：位置超出 15x15 畫布邊界！`, "error");
      return;
    }

    // 2. Clash & Overlap Check
    const emptyBoard = isGridEmpty();
    let overlapsCount = 0;
    let clashCell = null;
    let stolenCount = 0;

    for (let i = 0; i < coords.length; i++) {
      const { r, c } = coords[i];
      const existing = grid[r][c];
      const current = activeWord[i];

      if (existing !== "") {
        if (existing !== current) {
          clashCell = { r, c, existing, current };
          break;
        } else {
          overlapsCount++;
          // Steal mechanic check in Battle Mode
          if (gameMode === "battle") {
            const owner = cellOwners[`${r},${c}`];
            if (owner && owner !== currentPlayer) {
              stolenCount++;
            }
          }
        }
      }
    }

    if (clashCell) {
      addLog(
        `放置失敗：格子 (${COL_LABELS[clashCell.c]}${clashCell.r + 1}) 字元衝突。既存 '${clashCell.existing}'，您欲填入 '${clashCell.current}'！`,
        "error"
      );
      return;
    }

    // 3. Amoeba connection check
    if (!emptyBoard && overlapsCount === 0) {
      addLog("放置失敗：阿米巴規則！新成語必須與畫布上既有的字「共用重疊」以向外延伸！", "error");
      return;
    }

    // --- Scoring & Combo Logic ---
    let comboMultiplier = 1;
    let basePlacementScore = 100;
    if (overlapsCount === 2) {
      basePlacementScore = 250;
      comboMultiplier = 2;
    } else if (overlapsCount >= 3) {
      basePlacementScore = 500;
      comboMultiplier = 3;
    }

    let roundScore = basePlacementScore;
    let stealPoints = stolenCount * 150;
    roundScore += stealPoints;

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

    // Apply time bonus (Challenge mode)
    if (gameMode === "challenge") {
      const totalTimeBonus = 20 + timeBonus;
      setTimeLeft((prev) => prev + totalTimeBonus);
      setLastTimeBonus(totalTimeBonus);
      setTimerBonusTrigger((prev) => prev + 1);
    }

    // Spawn replacement nutrients
    const nextNutrients = spawnNutrients(5, newGrid, remainingNutrients, gameMode === "challenge");
    setNutrients(nextNutrients);

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
      },
      ...prev,
    ]);

    // Log the event
    const coordsStr = `${COL_LABELS[col]}${row + 1}`;
    const comboStr = overlapsCount > 1 ? ` (Combo x${comboMultiplier}!)` : "";
    const nutrientStr = pointNutrientCount > 0 ? ` 吸收養分點(+${pointNutrientCount * 200})` : "";
    const totalTimeBonus = gameMode === "challenge" ? 20 + timeBonus : timeBonus;
    const timeStr = totalTimeBonus > 0 ? ` 延長時間(+${totalTimeBonus}s)` : "";
    const stealStr = stealPoints > 0 ? ` 掠奪對手領地(+${stealPoints})` : "";

    const logText = `【${currentPlayer === 1 ? "藍色阿米巴" : "粉色阿米巴"}】成功放置「${activeWord}」於 ${coordsStr}${comboStr}${nutrientStr}${timeStr}${stealStr}，獲得 ${roundScore} 分！`;
    addLog(logText, currentPlayer === 1 ? "p1" : "p2");

    // Update board state
    setGrid(newGrid);
    setCellOwners(newCellOwners);
    setConsecutivePasses(0);

    // Trigger placement flash animation on newly placed cells
    const placedKeys = new Set(coords.map((coord) => `${coord.r},${coord.c}`));
    setLastPlacedCells(placedKeys);
    setTimeout(() => setLastPlacedCells(new Set()), 500);

    // Switch turns / resets
    if (gameMode === "battle") {
      setCurrentPlayer(currentPlayer === 1 ? 2 : 1);
      setTimeLeft(60); // reset turn time
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
    const centerRow = 7;
    const centerCol = 5;

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
    const nextNutrients = spawnNutrients(5, newGrid, nutrients.filter(n => !getCoordinatesForWord(centerRow, centerCol, randomWord.length, "H").some(c => c.r === n.r && c.c === n.c)), gameMode === "challenge");
    setNutrients(nextNutrients);

    addLog(`成功放置首詞「${randomWord}」於網格中心 G8，獲得 100 分！`, "success");
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
                <h1 className="text-4xl md:text-5xl font-black tracking-wider bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 dark:from-cyan-400 dark:via-purple-400 dark:to-pink-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(236,72,153,0.2)] dark:drop-shadow-[0_0_15px_rgba(236,72,153,0.4)]">
                  成語阿米巴
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Free Mode */}
              <div 
                onClick={() => handleStartGame("free")}
                className="bg-panel-bg backdrop-blur-md border border-panel-border/30 rounded-2xl p-6 flex flex-col justify-between hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] dark:hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:border-emerald-500/40 transition-all duration-300 relative group overflow-hidden cursor-pointer"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-4xl">🍀</span>
                    <span className="text-[10px] font-bold font-mono tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      FREE PLAY
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-text-primary mb-1">自由練習模式</h3>
                  <p className="text-xs text-text-secondary font-mono mb-4">// 無壓力成語接龍練習 //</p>
                  
                  <ul className="text-sm text-text-secondary leading-relaxed space-y-2 mb-6 border-t border-panel-border/20 pt-4 list-disc pl-4">
                    <li><strong className="text-text-primary">無時間限制</strong>：可以從容不迫地思考，無須緊繃，適合放鬆遊玩。</li>
                    <li><strong className="text-text-primary">免費提示</strong>：卡關時點擊提示不扣除任何分數，自動為您填字。</li>
                    <li><strong className="text-text-primary">積分養分點</strong>：地圖隨機生成積分點（♦），覆蓋可獲 <strong>+200分</strong>。</li>
                    <li>可以用來熟悉網格座標和接龍排列，練習成語庫。</li>
                  </ul>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartGame("free");
                  }}
                  className="w-full py-3.5 rounded-xl font-black text-sm bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white cursor-pointer active:scale-95 transition-all shadow-[0_4px_15px_rgba(16,185,129,0.25)] flex items-center justify-center gap-1"
                >
                  <span>開始自由練習</span>
                  <span>➜</span>
                </button>
              </div>

              {/* Card 2: Challenge Mode */}
              <div 
                onClick={() => handleStartGame("challenge")}
                className="bg-panel-bg backdrop-blur-md border border-panel-border/30 rounded-2xl p-6 flex flex-col justify-between hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(245,158,11,0.15)] dark:hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:border-amber-500/40 transition-all duration-300 relative group overflow-hidden cursor-pointer"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-4xl">⚡</span>
                    <span className="text-[10px] font-bold font-mono tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      CHALLENGE
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-text-primary mb-1">積分挑戰模式</h3>
                  <p className="text-xs text-text-secondary font-mono mb-4">// 限時 120s 的高分大作戰 //</p>
                  
                  <ul className="text-sm text-text-secondary leading-relaxed space-y-2 mb-6 border-t border-panel-border/20 pt-4 list-disc pl-4">
                    <li><strong className="text-text-primary">限時 120 秒</strong>：爭分奪秒！倒數結束將自動結算最終成績。</li>
                    <li><strong className="text-text-primary">成語加時</strong>：每成功放置一個正確成語可增加 <strong>+20秒</strong>！</li>
                    <li><strong className="text-text-primary">時間能量點</strong>：吃掉地圖上的時鐘養分（⏰）可額外增加 <strong>+10秒</strong>！</li>
                    <li><strong className="text-text-primary">提示扣除分數</strong>：使用求助提示每次將扣除 <strong>50分</strong>。</li>
                    <li><strong className="text-text-primary">Combo 翻倍</strong>：重疊多個漢字將獲得 Combo 連鎖加分！</li>
                  </ul>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartGame("challenge");
                  }}
                  className="w-full py-3.5 rounded-xl font-black text-sm bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-white cursor-pointer active:scale-95 transition-all shadow-[0_4px_15px_rgba(245,158,11,0.25)] flex items-center justify-center gap-1"
                >
                  <span>挑戰高分極限</span>
                  <span>➜</span>
                </button>
              </div>

              {/* Card 3: Battle Mode */}
              <div 
                onClick={() => handleStartGame("battle")}
                className="bg-panel-bg backdrop-blur-md border border-panel-border/30 rounded-2xl p-6 flex flex-col justify-between hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(236,72,153,0.15)] dark:hover:shadow-[0_0_30px_rgba(236,72,153,0.3)] hover:border-pink-500/40 transition-all duration-300 relative group overflow-hidden cursor-pointer"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-4xl">⚔️</span>
                    <span className="text-[10px] font-bold font-mono tracking-widest text-pink-600 dark:text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/20">
                      LOCAL PVP
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-text-primary mb-1">雙人對決模式</h3>
                  <p className="text-xs text-text-secondary font-mono mb-4">// 同屏 1v1 生存與領地爭奪對抗 //</p>
                  
                  <ul className="text-sm text-text-secondary leading-relaxed space-y-2 mb-6 border-t border-panel-border/20 pt-4 list-disc pl-4">
                    <li><strong className="text-text-primary">回合制生存戰</strong>：藍阿米巴 (P1) vs 粉阿米巴 (P2) 回合制生存對抗。</li>
                    <li><strong className="text-text-primary">60 秒限時與生命</strong>：每人 5 條生命，回合超時或棄權扣 1 條命並換人。</li>
                    <li><strong className="text-text-primary">提示扣除生命</strong>：使用求助提示每次將扣除 <strong>1 點生命值</strong>。</li>
                    <li><strong className="text-text-primary">領地掠奪與 0 分起始</strong>：雙方起始分數為 0，重疊對手文字可獲得 <strong>+150 掠奪分/格</strong>。</li>
                  </ul>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartGame("battle");
                  }}
                  className="w-full py-3.5 rounded-xl font-black text-sm bg-gradient-to-r from-cyan-500 to-pink-500 hover:opacity-90 text-white cursor-pointer active:scale-95 transition-all shadow-[0_4px_15px_rgba(236,72,153,0.25)] flex items-center justify-center gap-1"
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
                  <p>
                    如果擺放一個成語的同時，重疊了地圖上<strong className="text-text-primary">多個</strong>現有漢字，將觸發 Combo 連鎖！
                    Combo 會成倍增加該成語獲得的基礎分，是爭奪積分榜的關鍵技巧。
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
                  <h1 className="text-3xl md:text-4xl font-extrabold tracking-wider bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 dark:from-cyan-400 dark:via-purple-400 dark:to-pink-500 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(236,72,153,0.15)] dark:drop-shadow-[0_0_10px_rgba(236,72,153,0.3)]">
                    成語阿米巴
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
                {gameMode !== "battle" ? (
                  /* Solo Scoreboard */
                  <div className="flex items-center gap-4">
                    <div className="bg-input-bg border border-cyan-500/30 rounded-lg px-4 py-2 flex flex-col items-center min-w-[90px] shadow-[0_0_12px_rgba(6,182,212,0.05)] transition-all duration-300">
                      <span className="text-[10px] text-cyan-500 dark:text-cyan-400 font-bold uppercase tracking-widest font-mono">Score</span>
                      <span className="text-2xl font-mono font-black text-cyan-600 dark:text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.2)] dark:drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]">
                        {String(scores.p1).padStart(5, "0")}
                      </span>
                    </div>
                    {gameMode === "challenge" && (
                      <div 
                        key={`timer-box-${timerBonusTrigger}`}
                        className={`bg-input-bg border border-emerald-500/30 rounded-lg px-4 py-2 flex flex-col items-center min-w-[90px] shadow-[0_0_12px_rgba(16,185,129,0.05)] transition-all duration-300 relative ${
                          timerBonusTrigger > 0 ? "animate-timer-bonus" : "animate-pulse"
                        }`}
                      >
                        {timerBonusTrigger > 0 && (
                          <span 
                            key={`float-${timerBonusTrigger}`}
                            className="absolute -top-7 text-xl font-mono font-black text-emerald-500 dark:text-emerald-400 animate-float-up pointer-events-none drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                          >
                            +{lastTimeBonus}s
                          </span>
                        )}
                        <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-bold uppercase tracking-widest font-mono">Time Left</span>
                        <span className={`text-2xl font-mono font-black ${
                          timeLeft <= 15
                            ? "text-red-500 dark:text-red-400 animate-pulse"
                            : "text-emerald-600 dark:text-emerald-300"
                        } drop-shadow-[0_0_6px_rgba(52,211,153,0.2)]`}>
                          {timeLeft}s
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Two Player Battle Scoreboard */
                  <div className="flex items-center gap-4">
                    {/* P1 Scoreboard */}
                    <div className={`bg-input-bg border rounded-lg px-4 py-2 flex flex-col items-center min-w-[110px] transition-all duration-300 ${
                      damageFlash.p1
                        ? "animate-damage-card border-red-500"
                        : currentPlayer === 1 && gameState === "playing"
                        ? "border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.3)] scale-105"
                        : "border-cyan-500/20 opacity-60"
                    }`}>
                      <span className="text-[9px] text-cyan-600 dark:text-cyan-400 font-bold uppercase tracking-widest font-mono">P1 藍阿米巴</span>
                      <span className="text-xl font-mono font-black text-cyan-600 dark:text-cyan-300 drop-shadow-[0_0_4px_rgba(34,211,238,0.3)]">
                        {String(scores.p1).padStart(5, "0")}
                      </span>
                      {/* P1 Lives */}
                      <div className="flex gap-0.5 mt-1 select-none">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={`text-[10px] transition-all duration-300 ${
                              i < lives.p1
                                ? "text-red-500 scale-100 filter drop-shadow-[0_0_2px_rgba(239,68,68,0.7)]"
                                : "text-gray-400 opacity-20 scale-90"
                            }`}
                          >
                            ❤️
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Turn countdown bar */}
                    <div className="flex flex-col items-center min-w-[60px]">
                      <span className="text-[9px] text-text-secondary font-bold uppercase tracking-widest font-mono">Turn Time</span>
                      <span className={`text-lg font-mono font-bold ${timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-text-primary"}`}>
                        {timeLeft}s
                      </span>
                    </div>

                    {/* P2 Scoreboard */}
                    <div className={`bg-input-bg border rounded-lg px-4 py-2 flex flex-col items-center min-w-[110px] transition-all duration-300 ${
                      damageFlash.p2
                        ? "animate-damage-card border-red-500"
                        : currentPlayer === 2 && gameState === "playing"
                        ? "border-pink-400 shadow-[0_0_12px_rgba(244,63,94,0.3)] scale-105"
                        : "border-pink-500/20 opacity-60"
                    }`}>
                      <span className="text-[9px] text-pink-600 dark:text-pink-400 font-bold uppercase tracking-widest font-mono">P2 粉阿米巴</span>
                      <span className="text-xl font-mono font-black text-pink-600 dark:text-pink-300 drop-shadow-[0_0_4px_rgba(244,63,94,0.3)]">
                        {String(scores.p2).padStart(5, "0")}
                      </span>
                      {/* P2 Lives */}
                      <div className="flex gap-0.5 mt-1 select-none">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={`text-[10px] transition-all duration-300 ${
                              i < lives.p2
                                ? "text-red-500 scale-100 filter drop-shadow-[0_0_2px_rgba(239,68,68,0.7)]"
                                : "text-gray-400 opacity-20 scale-90"
                            }`}
                          >
                            ❤️
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mode Banner Description */}
              <div className="text-[11px] text-text-secondary font-mono flex items-center gap-1.5 px-2 bg-panel-bg/40 py-1.5 rounded border border-panel-border/30">
                <span>// CURRENT_MODE:</span>
                <span className="text-purple-600 dark:text-purple-400 font-bold uppercase">
                  {gameMode === "free" ? "Free Play" : gameMode === "challenge" ? "Score Challenge" : "Two-Player Local Battle"}
                </span>
                <span>•</span>
                <span>
                  {gameMode === "free"
                    ? "自由練習，可隨時放置且無時間限制。"
                    : gameMode === "challenge"
                    ? "限時 120 秒爭取最高分，輸入正確成語可增加 20 秒，吃掉【⏰ 綠色時鐘】可額外延長 10 秒！"
                    : "雙人生存對抗，雙方各有 5 條生命，限時 60 秒。超時、棄權或使用提示扣 1 條命，扣完者輸！"}
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
                      GAME OVER
                    </h2>
                    <p className="text-xs text-text-secondary uppercase tracking-widest font-mono mb-6">
                      {gameMode === "free" ? "// 您已選擇放棄此局 //" : gameMode === "challenge" ? "// 挑戰時間截止 //" : "// 生命值歸零、回合棄權或玩家認輸 //"}
                    </p>

                    <div className="bg-input-bg border border-panel-border/40 rounded-xl p-6 flex flex-col items-center gap-4 min-w-[280px] mb-8 shadow-2xl transition-all duration-300">
                      {gameMode !== "battle" ? (
                        <>
                          <span className="text-xs text-text-secondary">最終獲得積分</span>
                          <span className="text-4xl font-mono font-black text-cyan-600 dark:text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]">
                            {scores.p1} 分
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-text-secondary">對決獲勝方</span>
                          <span className={`text-2xl font-black text-center ${getWinnerInfo().style}`}>
                            {getWinnerInfo().text}
                          </span>
                          <div className="grid grid-cols-2 gap-4 w-full border-t border-input-border pt-4 mt-2 text-center text-xs font-mono">
                            <div>
                              <div className="text-cyan-600 dark:text-cyan-400">藍阿米巴 P1</div>
                              <div className="text-lg font-bold text-text-primary mt-1">{scores.p1}</div>
                            </div>
                            <div>
                              <div className="text-pink-600 dark:text-pink-400">粉阿米巴 P2</div>
                              <div className="text-lg font-bold text-text-primary mt-1">{scores.p2}</div>
                            </div>
                          </div>
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
                    {gameMode === "challenge" && (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 bg-amber-500/20 border border-amber-400 rounded-sm"></span>
                        <span>⏰ 時間養分 (+10s)</span>
                      </div>
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

                {/* Scrollable grid wrapper */}
                <div className="w-full overflow-x-auto pb-2 flex justify-start md:justify-center relative">
                  <div className="min-w-[500px] select-none p-1.5">
                    <div
                      className="grid gap-1 bg-input-bg/70 p-2.5 rounded-xl border border-input-border shadow-[0_0_20px_rgba(139,92,246,0.02)] dark:shadow-[0_0_20px_rgba(139,92,246,0.05)] relative transition-all duration-300"
                      style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}
                    >
                      {/* Grid Column Headers */}
                      <div className="w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center"></div>
                      {COL_LABELS.map((colName) => (
                        <div
                          key={colName}
                          className="w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center text-[10px] sm:text-xs font-bold text-text-secondary font-mono tracking-wider"
                        >
                          {colName}
                        </div>
                      ))}

                      {/* Grid Rows */}
                      {Array.from({ length: 15 }).map((_, rIdx) => (
                        <React.Fragment key={rIdx}>
                          {/* Row Label */}
                          <div className="w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center text-[10px] sm:text-xs font-bold text-text-secondary font-mono">
                            {rIdx + 1}
                          </div>

                          {/* 15 Cells */}
                          {Array.from({ length: 15 }).map((_, cIdx) => {
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

                            if (cellValue) {
                              if (gameMode === "battle") {
                                if (cellOwner === 1) {
                                  cellBgClass = "bg-cell-bg-p1";
                                  borderClass = "border-cell-border-p1";
                                  textClass = "text-cell-text-p1 font-extrabold drop-shadow-[0_0_5px_var(--glow-color)]";
                                } else {
                                  cellBgClass = "bg-cell-bg-p2";
                                  borderClass = "border-cell-border-p2";
                                  textClass = "text-cell-text-p2 font-extrabold drop-shadow-[0_0_5px_var(--glow-color)]";
                                }
                              } else {
                                cellBgClass = "bg-cell-bg-filled";
                                borderClass = "border-cell-border-filled";
                                textClass = "text-cell-text-filled font-extrabold drop-shadow-[0_0_5px_var(--glow-color)]";
                              }
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
                                  if (selectedCell?.row === rIdx && selectedCell?.col === cIdx) {
                                    setDirection((prev) => (prev === "H" ? "V" : "H"));
                                  } else {
                                    setSelectedCell({ row: rIdx, col: cIdx });
                                  }
                                }}
                                style={{ animationDelay }}
                                className={`w-7 h-7 sm:w-10 sm:h-10 rounded flex items-center justify-center text-xs sm:text-base border transition-all duration-150 active:scale-95 ${cellBgClass} ${borderClass} ${textClass}${extraClass} relative select-none cursor-pointer ${
                                  !cellValue && gameState === "playing" ? "hover:border-cyan-500/40 hover:bg-cyan-500/5" : ""
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
                                    {direction === "H" ? "▶" : "▼"}
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
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${direction === "H" ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"}`}>
                        {direction === "H" ? "▶ 橫向" : "▼ 縱向"}
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
                      {gameMode === "battle" && (
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          currentPlayer === 1 ? "bg-cyan-500/20 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400" : "bg-pink-500/20 text-pink-700 dark:bg-pink-950 dark:text-pink-400"
                        }`}>
                          P{currentPlayer} 回合
                        </span>
                      )}
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
                          <span>◀▶ 橫向排列 (H)</span>
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
                          <span>▲▼ 縱向排列 (V)</span>
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
                              : gameMode === "battle"
                              ? currentPlayer === 1
                                ? "bg-cyan-500 hover:bg-cyan-400 text-black border-transparent shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                                : "bg-pink-500 hover:bg-pink-400 text-black border-transparent shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                              : "bg-btn-primary-bg hover:opacity-90 text-btn-primary-text border-transparent shadow-[0_0_15px_var(--glow-color)]"
                          }`}
                        >
                          {preview?.isValid === false ? "無法放置" : "放置成語"}
                        </button>

                        {/* Hint Button */}
                        <button
                          type="button"
                          onClick={handleGetHint}
                          disabled={
                            loadingDict ||
                            (gameMode === "battle"
                              ? (currentPlayer === 1 ? lives.p1 : lives.p2) <= 0
                              : gameMode !== "free" && (currentPlayer === 1 ? scores.p1 : scores.p2) < 50)
                          }
                          className="px-3 rounded-lg font-bold text-xs bg-input-bg border border-input-border text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 active:scale-97 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex flex-col justify-center items-center gap-0.5 shrink-0"
                          title={gameMode === "battle" ? "獲取接龍提示，每次使用扣除 1 點生命值" : "獲取接龍提示，每次使用扣除 50 分"}
                        >
                          <span className="text-[11px]">💡 提示</span>
                          <span className="scale-75 font-mono text-[9px] opacity-75 leading-none">
                            {gameMode === "battle" ? "-1 Life" : gameMode === "free" ? "Free" : "-50pt"}
                          </span>
                        </button>
                      </div>

                      {/* Battle Pass & Give Up buttons row */}
                      <div className="flex gap-2 mt-1">
                        {gameMode === "battle" && gameState === "playing" && (
                          <button
                            type="button"
                            onClick={handlePassTurn}
                            className="flex-1 py-1.5 rounded-lg font-bold text-[10px] bg-input-bg border border-input-border text-text-secondary hover:text-text-primary active:scale-97 transition-all cursor-pointer"
                          >
                            Pass
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
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                item.player === 1 
                                  ? "bg-cyan-500/10 text-cyan-700 border border-cyan-500/20 dark:bg-cyan-950/80 dark:text-cyan-400 dark:border-cyan-500/20" 
                                  : "bg-pink-500/10 text-pink-700 border border-pink-500/20 dark:bg-pink-950/80 dark:text-pink-400 dark:border-pink-500/20"
                              }`}>
                                {gameMode === "battle"
                                  ? isPlayer1 ? "藍色阿米巴 Placed" : "粉色阿米巴 Placed"
                                  : "玩家放置"}
                              </span>
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
                            {details && details.derivation && (
                              <div className="flex flex-col gap-1 mt-1">
                                <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider font-mono">典故 Origin</span>
                                <p className="text-[11px] text-text-secondary leading-relaxed bg-input-bg/20 p-2 rounded border border-input-border/30">
                                  {details.derivation}
                                </p>
                              </div>
                            )}

                            {/* Score and Placement Details */}
                            <div className="flex justify-between items-center text-[10px] text-text-secondary font-mono mt-1 bg-input-bg/30 px-2 py-1 rounded">
                              <span>獲得分數: <strong className="text-cyan-600 dark:text-cyan-400">+{item.score}分</strong></span>
                              <span>擺放方向: {item.direction === "H" ? "橫向" : "縱向"}</span>
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
                          className={`flex justify-between items-center text-xs bg-input-bg/50 border rounded px-3 py-2 transition-all ${
                            gameMode === "battle"
                              ? item.player === 1
                                ? "border-cyan-500/20 hover:border-cyan-500/40"
                                : "border-pink-500/20 hover:border-pink-500/40"
                              : "border-input-border hover:border-panel-border"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-text-secondary font-mono w-5">#{history.length - index}</span>
                            <strong className={`tracking-wide text-sm font-bold ${
                              gameMode === "battle"
                                ? item.player === 1
                                  ? "text-cyan-600 dark:text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.15)]"
                                  : "text-pink-600 dark:text-pink-400 drop-shadow-[0_0_4px_rgba(244,63,94,0.15)]"
                                : "text-pink-600 dark:text-pink-400 drop-shadow-[0_0_4px_rgba(244,63,94,0.15)]"
                            }`}>{item.word}</strong>
                            {item.combo > 1 && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[9px] font-bold font-mono border border-purple-200 dark:border-purple-500/20 animate-pulse">
                                COMBO x{item.combo}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-[10px] text-text-secondary font-mono">
                            <span>+{item.score}分</span>
                            <span>起點: {COL_LABELS[item.col]}{item.row + 1} ({item.direction === "H" ? "橫向" : "縱向"})</span>
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300">
          <div className="bg-panel-bg border border-panel-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl relative custom-scrollbar animate-fade-in text-text-primary">
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
                <div className="border-t border-panel-border/30 pt-3 mt-2">
                  <h4 className="font-bold text-pink-500 text-base mb-1.5 flex items-center gap-1.5">
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
    </div>
  );
}
