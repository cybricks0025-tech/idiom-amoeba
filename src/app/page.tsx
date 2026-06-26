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
  const [theme, setTheme] = useState<"light" | "dark">("dark");

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
  
  // Battle Mode specific
  const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(1);
  const [consecutivePasses, setConsecutivePasses] = useState<number>(0);

  // Time systems
  const [timeLeft, setTimeLeft] = useState<number>(90); // 90s for challenge, 30s per turn for battle

  // React 19 Ref for timers
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
    setTimeLeft(mode === "battle" ? 30 : 90);
  };

  // Switch modes handler
  const handleSwitchMode = (targetMode: typeof gameMode) => {
    if (targetMode === gameMode) return;
    
    const isEmpty = grid.every((row) => row.every((cell) => cell === ""));
    if (!isEmpty) {
      if (!window.confirm("切換模式將清除當前畫布進度。確定要切換嗎？")) {
        return;
      }
    }
    setGameMode(targetMode);
    resetGame(targetMode);
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

    if (activeMode === "free") {
      setTimeLeft(90);
      setScores({ p1: 100, p2: 0 });
      addLog(`【自由練習模式】已開始！首詞為「${randomWord}」，無時間限制。`, "system");
    } else if (activeMode === "challenge") {
      setTimeLeft(90);
      setScores({ p1: 100, p2: 0 });
      addLog(`【積分挑戰模式】已開始！首詞為「${randomWord}」，限時 90 秒，吃掉 ⏰ 可延長時間。`, "system");
    } else if (activeMode === "battle") {
      setTimeLeft(30);
      setScores({ p1: 100, p2: 0 });
      addLog(`【雙人對抗模式】已開始！首詞為「${randomWord}」歸藍色阿米巴，目前輪到藍色阿米巴。`, "system");
    }

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

    const currentScore = currentPlayer === 1 ? scores.p1 : scores.p2;
    if (gameMode !== "free" && currentScore < 50) {
      addLog("積分不足 50 分，無法獲取提示！", "error");
      return;
    }

    if (idiomsWordsArr.length === 0) {
      addLog("成語資料庫尚未載入完成，請稍候！", "error");
      return;
    }

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

        // Check if the word contains the character
        const charIndices: number[] = [];
        for (let i = 0; i < word.length; i++) {
          if (word[i] === char) {
            charIndices.push(i);
          }
        }

        if (charIndices.length === 0) continue;

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

            // Deduct score
            if (gameMode === "battle") {
              setScores((prev) => ({
                ...prev,
                p1: currentPlayer === 1 ? Math.max(0, prev.p1 - 50) : prev.p1,
                p2: currentPlayer === 2 ? Math.max(0, prev.p2 - 50) : prev.p2,
              }));
            } else {
              setScores((prev) => ({
                ...prev,
                p1: Math.max(0, prev.p1 - 50),
              }));
            }

            addLog(
              `【系統提示】已扣除 50 積分！建議在 ${COL_LABELS[startC]}${startR + 1} (${dir === "H" ? "橫向" : "縱向"}) 放置成語「${word}」。已自動為您填寫！`,
              "system"
            );
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
            // Battle mode: turn timeout auto-pass
            const nextP = currentPlayer === 1 ? 2 : 1;
            addLog(`玩家 ${currentPlayer === 1 ? "一" : "二"} 回合逾時！自動輪空。`, "system");
            setCurrentPlayer(nextP);
            // Count as a pass
            const newPasses = consecutivePasses + 1;
            setConsecutivePasses(newPasses);
            if (newPasses >= 2) {
              setGameState("gameover");
              addLog("兩位玩家連續逾時/棄權！遊戲結束。", "system");
              if (timerRef.current) clearInterval(timerRef.current);
              return 0;
            }
            return 30; // reset turn timer to 30s
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameMode, gameState, currentPlayer, consecutivePasses]);

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
    const trimmed = inputWord.trim();
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
        return { ...coord, char: trimmed[index] || "", inBounds: false, clash: false, overlap: false };
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
      };
    });

    const empty = isGridEmpty();
    const isDictValid = loadingDict || idiomsWords.has(trimmed);
    const isValid = inBounds && !hasClash && !hasNonChinese && (trimmed.length === 4 || trimmed.length === 5) && (empty || hasOverlap) && isDictValid;

    return {
      cells: previewGridCells,
      isValid,
      inBounds,
      hasClash,
      hasOverlap,
      hasNonChinese,
      isGridEmpty: empty,
      isDictValid,
    };
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

    const activeWord = (wordToPlace || inputWord).trim();
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

    coords.forEach((coord) => {
      newGrid[coord.r][coord.c] = activeWord[coord.r === row ? coord.c - col : coord.r - row];
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
    if (gameMode === "challenge" && timeBonus > 0) {
      setTimeLeft((prev) => prev + timeBonus);
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
    const timeStr = timeBonus > 0 ? ` 延長時間(+${timeBonus}s)` : "";
    const stealStr = stealPoints > 0 ? ` 掠奪對手領地(+${stealPoints})` : "";

    const logText = `【${currentPlayer === 1 ? "藍色阿米巴" : "粉色阿米巴"}】成功放置「${activeWord}」於 ${coordsStr}${comboStr}${nutrientStr}${timeStr}${stealStr}，獲得 ${roundScore} 分！`;
    addLog(logText, currentPlayer === 1 ? "p1" : "p2");

    // Update board state
    setGrid(newGrid);
    setCellOwners(newCellOwners);
    setConsecutivePasses(0);

    // Switch turns / resets
    if (gameMode === "battle") {
      setCurrentPlayer(currentPlayer === 1 ? 2 : 1);
      setTimeLeft(30); // reset turn time
    }

    if (!wordToPlace) {
      setInputWord("");
    }
  };

  // --- Action: Pass Turn (Battle Mode only) ---
  const handlePassTurn = () => {
    if (gameMode !== "battle" || gameState !== "playing") return;

    const nextP = currentPlayer === 1 ? 2 : 1;
    addLog(`【${currentPlayer === 1 ? "藍色阿米巴" : "粉色阿米巴"}】選擇棄權換人。`, "info");
    
    setCurrentPlayer(nextP);
    setTimeLeft(30);
    
    const newPasses = consecutivePasses + 1;
    setConsecutivePasses(newPasses);
    if (newPasses >= 2) {
      setGameState("gameover");
      addLog("兩位玩家皆棄權！遊戲結束。", "system");
    }
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
    if (window.confirm("確定要清除整張畫布並重設分數嗎？")) {
      resetGame(gameMode);
    }
  };

  // Determine winner for Battle mode game over
  const getWinnerInfo = () => {
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
    <div className="flex-1 w-full min-h-screen bg-background bg-gradient-radial from-brand-bg-from via-brand-bg-via to-brand-bg-to text-text-primary flex flex-col items-center justify-start p-4 sm:p-6 lg:p-8 font-sans selection:bg-pink-500 selection:text-white relative overflow-hidden transition-colors duration-300">
      {/* Scanline CRT Overlay */}
      <div style={{ opacity: 'var(--crt-opacity)' }} className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%),linear-gradient(90deg,rgba(255,0,0,0.01),rgba(0,255,0,0.005),rgba(0,0,255,0.01))] bg-[size:100%_4px,6px_100%] pointer-events-none z-10 transition-opacity duration-300"></div>

      <div className="w-full max-w-7xl flex flex-col gap-6 z-20">
        
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
                  <div className="bg-input-bg border border-emerald-500/30 rounded-lg px-4 py-2 flex flex-col items-center min-w-[90px] shadow-[0_0_12px_rgba(16,185,129,0.05)] animate-pulse transition-all duration-300">
                    <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-bold uppercase tracking-widest font-mono">Time Left</span>
                    <span className={`text-2xl font-mono font-black ${timeLeft <= 15 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-300"} drop-shadow-[0_0_6px_rgba(52,211,153,0.2)]`}>
                      {timeLeft}s
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Two Player Battle Scoreboard */
              <div className="flex items-center gap-4">
                {/* P1 Scoreboard */}
                <div className={`bg-input-bg border rounded-lg px-4 py-2 flex flex-col items-center min-w-[100px] transition-all duration-300 ${
                  currentPlayer === 1 && gameState === "playing"
                    ? "border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.3)] scale-105"
                    : "border-cyan-500/20 opacity-60"
                }`}>
                  <span className="text-[9px] text-cyan-600 dark:text-cyan-400 font-bold uppercase tracking-widest font-mono">P1 藍阿米巴</span>
                  <span className="text-xl font-mono font-black text-cyan-600 dark:text-cyan-300 drop-shadow-[0_0_4px_rgba(34,211,238,0.3)]">
                    {String(scores.p1).padStart(5, "0")}
                  </span>
                </div>

                {/* Turn countdown bar */}
                <div className="flex flex-col items-center min-w-[60px]">
                  <span className="text-[9px] text-text-secondary font-bold uppercase tracking-widest font-mono">Turn Time</span>
                  <span className={`text-lg font-mono font-bold ${timeLeft <= 5 ? "text-red-500 animate-ping" : "text-text-primary"}`}>
                    {timeLeft}s
                  </span>
                </div>

                {/* P2 Scoreboard */}
                <div className={`bg-input-bg border rounded-lg px-4 py-2 flex flex-col items-center min-w-[100px] transition-all duration-300 ${
                  currentPlayer === 2 && gameState === "playing"
                    ? "border-pink-400 shadow-[0_0_12px_rgba(244,63,94,0.3)] scale-105"
                    : "border-pink-500/20 opacity-60"
                }`}>
                  <span className="text-[9px] text-pink-600 dark:text-pink-400 font-bold uppercase tracking-widest font-mono">P2 粉阿米巴</span>
                  <span className="text-xl font-mono font-black text-pink-600 dark:text-pink-300 drop-shadow-[0_0_4px_rgba(244,63,94,0.3)]">
                    {String(scores.p2).padStart(5, "0")}
                  </span>
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
                ? "限時 90 秒爭取最高分，吃掉【⏰ 綠色時鐘】可延長 10 秒時間！"
                : "雙人回合輪流出牌，佔領對手重疊的格子可獲得額外掠奪分（+150/格）！"}
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
                  {gameMode === "free" ? "// 您已選擇放棄此局 //" : gameMode === "challenge" ? "// 挑戰時間截止 //" : "// 雙方回合棄權或玩家認輸 //"}
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
                    onClick={() => resetGame(gameMode)}
                    className="px-6 py-2.5 rounded-lg font-bold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white cursor-pointer active:scale-95 hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] transition-all"
                  >
                    再次挑戰
                  </button>
                  <button
                    onClick={() => handleSwitchMode("free")}
                    className="px-6 py-2.5 rounded-lg font-bold text-sm bg-input-bg hover:bg-panel-bg border border-input-border text-text-primary cursor-pointer active:scale-95 transition-all"
                  >
                    返回自由模式
                  </button>
                </div>
              </div>
            )}

            {/* Start Game Screen Overlay */}
            {gameState === "idle" && (
              <div className="absolute inset-0 bg-background/95 backdrop-blur-md rounded-2xl z-30 flex flex-col items-center justify-center p-6 border border-panel-border shadow-[0_0_40px_rgba(139,92,246,0.1)] dark:shadow-[0_0_40px_rgba(139,92,246,0.25)] transition-all duration-300">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 dark:from-cyan-400 dark:via-purple-400 dark:to-pink-500 tracking-wider mb-2 drop-shadow-[0_0_8px_rgba(168,85,247,0.15)] dark:drop-shadow-[0_0_8px_rgba(168,85,247,0.3)]">
                  {gameMode === "free" ? "自由練習模式" : gameMode === "challenge" ? "積分挑戰模式" : "雙人對決模式"}
                </h2>
                <p className="text-xs text-text-secondary uppercase tracking-widest font-mono mb-6">
                  {gameMode === "free" ? "// Free Play Practice Mode //" : gameMode === "challenge" ? "// 90s Score Challenge //" : "// Local 1v1 turn battle //"}
                </p>

                <div className="bg-input-bg border border-panel-border/30 rounded-xl p-5 max-w-md text-xs text-text-secondary leading-relaxed flex flex-col gap-3 mb-8 shadow-inner transition-all duration-300">
                  <span className="font-bold text-text-primary text-sm flex items-center gap-1.5 border-b border-input-border pb-1.5">
                    <span>🎯 模式規則說明</span>
                  </span>
                  {gameMode === "free" && (
                    <ul className="list-disc list-inside flex flex-col gap-1.5">
                      <li>沒有時間限制與積分扣除壓力。</li>
                      <li>可以用來熟悉網格座標和接龍排列。</li>
                      <li>地圖上會生成【♦ 積分養分點】，覆蓋可獲得額外 <strong>+200 分</strong>。</li>
                      <li>卡關時可隨時點擊【💡 求助提示】，將自動為您填寫可行解！</li>
                      <li>點擊下方【重設】或【放棄此局】即可隨時結算分數重新開始。</li>
                    </ul>
                  )}
                  {gameMode === "challenge" && (
                    <ul className="list-disc list-inside flex flex-col gap-1.5">
                      <li>限制時間 <strong>90 秒</strong>，倒數結束則結算積分。</li>
                      <li>地圖會生成【⏰ 時間能量點】，覆蓋可增加 <strong>+10 秒</strong>！</li>
                      <li>地圖會生成【♦ 積分養分點】，覆蓋可獲得額外 <strong>+200 分</strong>。</li>
                      <li>重疊多個字可以獲得 Combo 倍增積分（Double/Fusion Link）！</li>
                      <li>卡關可使用【💡 求助提示】，每次將從得分中扣除 <strong>50 分</strong>。</li>
                    </ul>
                  )}
                  {gameMode === "battle" && (
                    <ul className="list-disc list-inside flex flex-col gap-1.5">
                      <li><strong>回合制對抗</strong>：藍色阿米巴 (P1) vs 粉色阿米巴 (P2)。</li>
                      <li><strong>回合時間 30 秒</strong>，逾時將自動棄權更換下位玩家。</li>
                      <li>若擺放重疊了對手的字元，可奪取領地並額外加 <strong>+150 分</strong>！</li>
                      <li>己方回合若卡關可使用【💡 求助提示】，每次使用扣除 <strong>50 分</strong>。</li>
                      <li>兩位玩家連續棄權，或者有一方點擊【🏳️ 認輸】，遊戲即告結束。</li>
                    </ul>
                  )}
                </div>

                <button
                  onClick={() => handleStartGame()}
                  className="px-8 py-3 rounded-xl font-extrabold text-sm bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:opacity-90 text-white cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                >
                  開始遊戲 (START GAME)
                </button>
              </div>
            )}

            {/* Grid legends */}
            <div className="w-full flex items-center justify-between text-xs text-text-secondary mb-4 px-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 bg-cyan-500/20 border border-cyan-400 rounded-sm shadow-[0_0_4px_#06b6d4]"></span>
                  <span>選中起點</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 bg-green-500/10 border border-green-400 border-dashed rounded-sm"></span>
                  <span>預覽合格</span>
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

                        // Nutrient details
                        const cellNutrient = nutrients.find((n) => n.r === rIdx && n.c === cIdx);

                        // Preview state variables
                        let previewChar = "";
                        let isPreviewCell = false;
                        let previewClash = false;
                        let previewValid = false;

                        if (preview) {
                          const pCell = preview.cells.find((c) => c.r === rIdx && c.c === cIdx);
                          if (pCell) {
                            isPreviewCell = true;
                            previewChar = pCell.char;
                            previewClash = pCell.clash;
                            previewValid = preview.isValid;
                          }
                        }

                        // Determine styles
                        let cellBgClass = "bg-cell-bg-default";
                        let borderClass = "border-cell-border-default";
                        let textClass = "text-cell-text-default";
                        let shadowClass = "";

                        if (cellValue) {
                          if (gameMode === "battle") {
                            // Split styles for Player 1 & 2
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
                            // Default styling for solo modes (purple/pink)
                            cellBgClass = "bg-cell-bg-filled";
                            borderClass = "border-cell-border-filled";
                            textClass = "text-cell-text-filled font-extrabold drop-shadow-[0_0_5px_var(--glow-color)]";
                          }
                        }

                        // Overlay Preview State
                        if (isPreviewCell) {
                          if (previewClash) {
                            cellBgClass = "bg-red-500/20";
                            borderClass = "border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]";
                            textClass = "text-red-400 font-bold";
                          } else {
                            cellBgClass = previewValid ? "bg-green-500/10" : "bg-zinc-500/10";
                            borderClass = previewValid
                              ? "border-green-400 border-dashed animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.3)]"
                              : "border-yellow-500 border-dashed";
                            textClass = previewValid ? "text-green-500 dark:text-green-400 font-bold" : "text-yellow-600 dark:text-yellow-400";
                          }
                        }

                        // Overlay Selection State
                        if (isSelected) {
                          borderClass = "border-cyan-400 ring-2 ring-cyan-500/20 scale-102";
                          shadowClass = "shadow-[0_0_12px_#06b6d4]";
                          if (!cellValue && !isPreviewCell) {
                            cellBgClass = "bg-cyan-500/10";
                          }
                        }

                        return (
                          <button
                            key={cIdx}
                            disabled={gameState !== "playing"}
                            onClick={() => setSelectedCell({ row: rIdx, col: cIdx })}
                            className={`w-7 h-7 sm:w-10 sm:h-10 text-sm sm:text-base border flex items-center justify-center rounded transition-all duration-200 relative cursor-pointer outline-none hover:scale-[1.08] hover:z-10 hover:border-cyan-500 dark:hover:border-cyan-400 hover:shadow-[0_0_8px_var(--glow-color)] active:scale-[0.93] ${cellBgClass} ${borderClass} ${textClass} ${shadowClass}`}
                            title={`座標: ${COL_LABELS[cIdx]}${rIdx + 1}`}
                          >
                            {cellValue || previewChar ? (
                              cellValue || previewChar
                            ) : cellNutrient ? (
                              // Render Nutrient Cell Inside Grid
                              cellNutrient.type === "points" ? (
                                <span className="text-[9px] font-black text-emerald-500 dark:text-emerald-400 animate-pulse tracking-tighter drop-shadow-[0_0_4px_#34d399] flex flex-col items-center">
                                  <span>♦</span>
                                  <span className="scale-75 mt-[-3px] font-mono font-bold">+200</span>
                                </span>
                              ) : (
                                <span className="text-[9px] font-black text-amber-500 dark:text-amber-400 animate-pulse tracking-tighter drop-shadow-[0_0_4px_#fbbf24] flex flex-col items-center">
                                  <span>⏰</span>
                                  <span className="scale-75 mt-[-3px] font-mono font-bold">+10s</span>
                                </span>
                              )
                            ) : (
                              ""
                            )}
                            
                            {/* Tiny coordinate label indicator */}
                            <span className="absolute bottom-0 right-0 text-[6px] text-zinc-500/30 dark:text-zinc-800 pointer-events-none scale-75 select-none font-mono">
                              {COL_LABELS[cIdx]}{rIdx + 1}
                            </span>
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
                <span>
                  目前選中座標：
                  <strong className="text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 dark:bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20 dark:border-cyan-800/30">
                    {COL_LABELS[selectedCell.col]}
                    {selectedCell.row + 1}
                  </strong>
                </span>
              ) : (
                <span>請點擊地圖選擇格子以設定文字起點</span>
              )}
            </div>
          </section>

          {/* RIGHT: Game Controls Panel (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Control Panel Card */}
            <section className="bg-panel-bg backdrop-blur-md border border-panel-border rounded-2xl p-5 shadow-[2px_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[2px_4px_30px_rgba(0,0,0,0.5)] flex flex-col gap-4 transition-all duration-300">
              <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-purple-600 dark:from-cyan-400 dark:to-purple-400 flex items-center justify-between border-b border-input-border pb-2">
                <span className="flex items-center gap-2">
                  <span>控制面板</span>
                  {gameMode === "battle" && (
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                      currentPlayer === 1 ? "bg-cyan-500/20 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400" : "bg-pink-500/20 text-pink-700 dark:bg-pink-950 dark:text-pink-400"
                    }`}>
                      P{currentPlayer} 回合
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-text-secondary font-mono">CONTROL PANEL</span>
              </h2>

              <div className="flex flex-col gap-3">
                
                {/* 4-Letter Word Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-secondary font-semibold flex justify-between">
                    <span>輸入 4-5 字成語</span>
                    {selectedCell && (
                      <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold">
                        起點: {COL_LABELS[selectedCell.col]}{selectedCell.row + 1}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    value={inputWord}
                    disabled={gameState !== "playing"}
                    onChange={(e) => setInputWord(e.target.value.trim())}
                    placeholder="請輸入四字成語..."
                    className="bg-input-bg border border-input-border hover:border-panel-border focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:shadow-[0_0_8px_rgba(34,211,238,0.15)] rounded-lg px-3.5 py-2 text-sm text-text-primary transition-all font-medium placeholder-text-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Direction Switch */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-text-secondary font-semibold">排版排列方向</span>
                  <div className="grid grid-cols-2 gap-2 bg-input-bg/50 p-1 rounded-lg border border-input-border">
                    <button
                      type="button"
                      disabled={gameState !== "playing"}
                      onClick={() => setDirection("H")}
                      className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer ${
                        direction === "H"
                          ? "bg-cyan-500/15 dark:bg-cyan-950/60 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.1)]"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      <span>── 橫向排列</span>
                      <span className="text-[9px] font-normal px-1 rounded bg-input-bg border border-input-border text-text-secondary">H</span>
                    </button>
                    <button
                      type="button"
                      disabled={gameState !== "playing"}
                      onClick={() => setDirection("V")}
                      className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer ${
                        direction === "V"
                          ? "bg-cyan-500/15 dark:bg-cyan-950/60 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.1)]"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      <span>│ 縱向排列</span>
                      <span className="text-[9px] font-normal px-1 rounded bg-input-bg border border-input-border text-text-secondary">V</span>
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handlePlaceIdiom()}
                    disabled={!selectedCell || !inputWord || preview?.isValid === false || gameState !== "playing"}
                    className={`py-2.5 rounded-lg font-bold text-sm transition-all duration-200 cursor-pointer active:scale-97 select-none border ${
                      !selectedCell || !inputWord || gameState !== "playing"
                        ? "bg-input-bg border-input-border text-text-secondary/40 cursor-not-allowed"
                        : preview?.isValid === false
                        ? "bg-red-500/10 border-red-500/30 text-red-500 cursor-not-allowed"
                        : gameMode === "battle"
                        ? currentPlayer === 1
                          ? "bg-cyan-500 hover:bg-cyan-400 text-black border-transparent shadow-[0_0_15px_rgba(6,182,212,0.3)] font-extrabold"
                          : "bg-pink-500 hover:bg-pink-400 text-black border-transparent shadow-[0_0_15px_rgba(244,63,94,0.3)] font-extrabold"
                        : "bg-btn-primary-bg hover:opacity-90 text-btn-primary-text border-transparent shadow-[0_0_15px_var(--glow-color)] font-extrabold"
                    }`}
                  >
                    {preview?.isValid === false ? "規則限制無法放置" : "放置成語"}
                  </button>

                  {/* Pass Turn Button (Battle Mode Only) */}
                  {gameMode === "battle" && gameState === "playing" && (
                    <button
                      type="button"
                      onClick={handlePassTurn}
                      className="py-1.5 rounded-lg font-semibold text-xs bg-input-bg border border-input-border text-text-secondary hover:text-text-primary active:scale-97 transition-all cursor-pointer"
                    >
                      棄權 / 換下一位 (Pass)
                    </button>
                  )}

                  {/* Hint & Give Up Buttons */}
                  {gameState === "playing" && (
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={handleGetHint}
                        disabled={loadingDict || (gameMode !== "free" && (currentPlayer === 1 ? scores.p1 : scores.p2) < 50)}
                        className="py-1.5 rounded-lg font-semibold text-[11px] bg-input-bg border border-input-border text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 active:scale-97 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        title="獲取一個接龍字詞提示，每次使用扣除 50 分"
                      >
                        <span>💡 求助提示</span>
                        <span className="scale-90 font-mono text-[9px] opacity-75">-50pt</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleGiveUp}
                        className="py-1.5 rounded-lg font-semibold text-[11px] bg-input-bg border border-red-500/20 text-red-500 hover:bg-red-500/10 active:scale-97 transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <span>🏳️ {gameMode === "battle" ? "認輸" : "放棄此局"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Real-time Rule Check Alert Box */}
              {preview && (
                <div
                  className={`p-3 rounded-lg border text-xs leading-relaxed flex flex-col gap-1 transition-all ${
                    preview.isValid
                      ? "bg-green-500/10 dark:bg-green-950/20 border-green-500/20 dark:border-green-800/40 text-green-700 dark:text-green-400"
                      : "bg-red-500/10 dark:bg-red-950/20 border-red-500/20 dark:border-red-800/40 text-red-600 dark:text-red-400"
                  }`}
                >
                  <span className="font-bold font-mono">
                    {preview.isValid ? "✓ 擺放檢測合格" : "✗ 擺放檢測不符"}
                  </span>
                  {inputWord.trim().length !== 4 && inputWord.trim().length !== 5 && (
                    <span>・字數必須為 4 或 5 個字（目前為 {inputWord.trim().length} 字）。</span>
                  )}
                  {preview.hasNonChinese && <span>・成語必須全部為中文漢字。</span>}
                  {!preview.inBounds && <span>・部分字元會超出網格邊界。</span>}
                  {preview.hasClash && <span>・與網格現存的字元發生衝突。</span>}
                  {!preview.isGridEmpty && !preview.hasOverlap && (
                    <span>・必須與現存字元重疊（阿米巴規則）。</span>
                  )}
                  {!loadingDict && !preview.isDictValid && (
                    <span>・「{inputWord.trim()}」非成語庫中之有效成語。</span>
                  )}
                  {loadingDict && (
                    <span className="text-yellow-600 dark:text-yellow-500 animate-pulse">・成語庫載入中，載入完成後將啟用嚴格驗證。</span>
                  )}
                  {preview.isValid && (
                    <span>・按一下放置按鈕將單詞寫入網格。</span>
                  )}
                </div>
              )}
            </section>

            {/* Idiom Details Card (dynamic) */}
            {selectedCellIdioms.length > 0 && (
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
            )}

            {/* Gameplay instructions card */}
            <section className="bg-panel-bg backdrop-blur-md border border-panel-border rounded-2xl p-4 shadow-[2px_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[2px_4px_30px_rgba(0,0,0,0.5)] flex flex-col gap-2 transition-all duration-300">
              <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest font-mono border-b border-input-border pb-1.5 flex justify-between items-center">
                <span>遊戲玩法說明</span>
                <span className="text-[9px] text-text-secondary">HOW TO PLAY</span>
              </h3>
              <ul className="text-[11px] text-text-secondary leading-relaxed list-disc list-inside flex flex-col gap-1.5">
                <li><strong>起點格</strong>：為成語<strong>第一個字</strong>的位置。</li>
                <li>
                  <strong>阿米巴擴充</strong>：新成語必須與已有成語相交重疊。
                  <span className="text-purple-600 dark:text-purple-400 font-semibold block mt-0.5 pl-4">
                    串聯多重重疊，會觸發 Combo 翻倍計分！
                  </span>
                </li>
                <li><strong>養分細胞點 (♦)</strong>：擺放成語若覆蓋地圖上的養分點，可額外獲得 <strong>+200分</strong>，挑戰模式更有 <strong>+10秒⏰</strong> 時鐘！</li>
                {gameMode === "battle" && (
                  <li>
                    <strong>雙人掠奪規則</strong>：玩家輪流在 30 秒內出牌。若與對手所屬的文字重疊，可掠奪該領地並獲得額外 <strong>+150 掠奪點</strong>！
                  </li>
                )}
              </ul>
            </section>

            {/* Presets and Helpers */}
            <section className="bg-panel-bg backdrop-blur-md border border-panel-border rounded-2xl p-4 shadow-[2px_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[2px_4px_30px_rgba(0,0,0,0.5)] flex flex-col gap-3 transition-all duration-300">
              <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest font-mono border-b border-input-border pb-1.5 flex justify-between items-center">
                <span>測試預設字庫</span>
                <span className="text-[9px] text-text-secondary">PRESETS</span>
              </h3>
              <p className="text-[11px] text-text-secondary leading-normal">
                點擊下方成語，可快速填入上方文字欄：
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {PRESET_IDIOMS.map((idiom) => (
                  <button
                    key={idiom}
                    disabled={gameState !== "playing"}
                    onClick={() => setInputWord(idiom)}
                    className="px-2 py-1 rounded bg-input-bg hover:bg-btn-primary-bg/10 border border-input-border hover:border-btn-primary-bg/35 text-xs text-text-primary transition-all font-mono disabled:opacity-50 cursor-pointer"
                  >
                    {idiom}
                  </button>
                ))}
              </div>
            </section>

            {/* Utility Reset Button */}
            <section className="bg-panel-bg backdrop-blur-md border border-panel-border rounded-2xl p-4 shadow-[2px_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[2px_4px_30px_rgba(0,0,0,0.5)] flex flex-col gap-2 transition-all duration-300">
              <button
                onClick={handleClearBoard}
                className="w-full py-1.5 rounded bg-input-bg hover:bg-red-500/10 border border-input-border hover:border-red-500/30 text-xs text-text-secondary hover:text-red-500 dark:hover:text-red-400 transition-all font-semibold active:scale-98 cursor-pointer"
              >
                重設當前遊戲進度 (Reset)
              </button>
            </section>
          </div>
        </div>

        {/* --- BOTTOM SECTION: System logs & History logs --- */}
        <footer className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          
          {/* History Panel */}
          <section className="bg-panel-bg backdrop-blur-md border border-panel-border rounded-2xl p-5 shadow-[2px_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[2px_4px_30px_rgba(0,0,0,0.5)] flex flex-col gap-3 min-h-[220px] transition-all duration-300">
            <h2 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-600 dark:from-pink-400 dark:to-purple-400 flex justify-between items-center border-b border-input-border pb-2">
              <span>成語接龍履歷</span>
              <span className="text-[10px] text-text-secondary font-mono">HISTORY LOG ({history.length})</span>
            </h2>
            <div className="flex-1 overflow-y-auto max-h-[200px] flex flex-col gap-2 pr-1 custom-scrollbar">
              {history.length === 0 ? (
                <div className="text-xs text-text-secondary text-center py-10 font-mono">// NO HISTORY FOUND //</div>
              ) : (
                history.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex justify-between items-center text-xs bg-input-bg/50 border rounded px-3 py-1.5 transition-all ${
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
                            ? "text-cyan-600 dark:text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.15)] dark:drop-shadow-[0_0_4px_rgba(34,211,238,0.3)]"
                            : "text-pink-600 dark:text-pink-400 drop-shadow-[0_0_4px_rgba(244,63,94,0.15)] dark:drop-shadow-[0_0_4px_rgba(244,63,94,0.3)]"
                          : "text-pink-600 dark:text-pink-400 drop-shadow-[0_0_4px_rgba(244,63,94,0.15)] dark:drop-shadow-[0_0_4px_rgba(244,63,94,0.3)]"
                      }`}>{item.word}</strong>
                      {item.combo > 1 && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[9px] font-bold font-mono border border-purple-200 dark:border-purple-500/20">
                          COMBO x{item.combo === 2 ? "2" : "3+"}
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
          </section>

          {/* System logs */}
          <section className="bg-panel-bg backdrop-blur-md border border-panel-border rounded-2xl p-5 shadow-[2px_4px_30px_rgba(0,0,0,0.06)] dark:shadow-[2px_4px_30px_rgba(0,0,0,0.5)] flex flex-col gap-3 min-h-[220px] transition-all duration-300">
            <h2 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400 flex justify-between items-center border-b border-input-border pb-2">
              <span>系統與對戰日誌</span>
              <span className="text-[10px] text-text-secondary font-mono">SYSTEM LOGS</span>
            </h2>
            <div className="flex-1 overflow-y-auto max-h-[200px] flex flex-col gap-1.5 pr-1 custom-scrollbar font-mono text-[11px]">
              {logs.length === 0 ? (
                <div className="text-xs text-text-secondary text-center py-10">// NO LOGS RECORDED //</div>
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
          </section>
        </footer>
      </div>
    </div>
  );
}
