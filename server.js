const express = require("express");

const app = express();
const PORT = 3000;

app.use(express.static("static"));
app.use(express.json());

// ---------------------------------------------------------------------------
// In-memory game state
// ---------------------------------------------------------------------------
let gameState = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeHtmlEntities(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ldquo;/g, "\u201c")
    .replace(/&rdquo;/g, "\u201d")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function stripArticles(s) {
  return s.replace(/^(the |a |an )/i, "");
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function checkAnswer(given, correct) {
  // Step 1: lowercase + trim
  let g = (given || "").toLowerCase().trim();
  let c = (correct || "").toLowerCase().trim();
  // Step 2: strip articles
  g = stripArticles(g);
  c = stripArticles(c);
  // Step 3: decode HTML entities
  g = decodeHtmlEntities(g);
  c = decodeHtmlEntities(c);
  // Step 4: exact match
  if (g === c) return true;
  // Step 5: substring match
  if (g.length > 0 && (c.includes(g) || g.includes(c))) return true;
  // Step 6: levenshtein ≤ 20% of correct length
  if (c.length > 0 && levenshtein(g, c) <= Math.floor(c.length * 0.2)) return true;
  return false;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url);
    // 429 = rate limited — wait and retry with increasing backoff
    if (res.status === 429) {
      if (attempt < retries - 1) {
        const wait = 6000 * (attempt + 1);
        console.log(`Rate limited (HTTP 429), waiting ${wait}ms before retry ${attempt + 1}/${retries - 1}`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP 429 (rate limited) from ${url}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const data = await res.json();
    // response_code 5 = rate limited
    if (data.response_code === 5) {
      if (attempt < retries - 1) {
        const wait = 6000 * (attempt + 1);
        console.log(`Rate limited (code 5), waiting ${wait}ms before retry`);
        await sleep(wait);
        continue;
      }
      throw new Error("OpenTDB rate limited");
    }
    return data;
  }
  throw new Error("fetchWithRetry exhausted all retries");
}

// Get a fresh session token from OpenTDB (helps avoid repeated questions and rate limiting)
async function getSessionToken() {
  try {
    const res = await fetch("https://opentdb.com/api_token.php?command=request");
    if (!res.ok) return null;
    const data = await res.json();
    return data.response_code === 0 ? data.token : null;
  } catch (_) {
    return null;
  }
}

// Fetch N questions for a category/difficulty, returns decoded question objects.
// Falls back to any difficulty if the specified difficulty has too few questions.
async function fetchQuestions(categoryId, difficulty, amount, token) {
  const fallbackDifficulties = [difficulty, "medium", "hard", "easy"].filter(
    (v, i, a) => a.indexOf(v) === i // unique, requested difficulty first
  );

  for (const diff of fallbackDifficulties) {
    let url = `https://opentdb.com/api.php?amount=${amount}&category=${categoryId}&difficulty=${diff}&type=multiple`;
    if (token) url += `&token=${token}`;
    const data = await fetchWithRetry(url);
    // response_code 4 = not enough questions for this filter
    if (data.response_code === 4 || !data.results || data.results.length < amount) {
      console.log(`Category ${categoryId} has insufficient ${diff} questions, trying next difficulty...`);
      await sleep(1000);
      continue;
    }
    return data.results.map((r) => ({
      question: decodeHtmlEntities(r.question),
      correctAnswer: decodeHtmlEntities(r.correct_answer),
      incorrectAnswers: r.incorrect_answers.map(decodeHtmlEntities),
    }));
  }

  // Last resort: fetch without difficulty filter
  let url = `https://opentdb.com/api.php?amount=${amount}&category=${categoryId}&type=multiple`;
  if (token) url += `&token=${token}`;
  const data = await fetchWithRetry(url);
  if (!data.results || data.results.length < amount) {
    throw new Error(
      `Not enough questions from OpenTDB (got ${data.results ? data.results.length : 0}, wanted ${amount}) for category ${categoryId}`
    );
  }
  return data.results.map((r) => ({
    question: decodeHtmlEntities(r.question),
    correctAnswer: decodeHtmlEntities(r.correct_answer),
    incorrectAnswers: r.incorrect_answers.map(decodeHtmlEntities),
  }));
}

function generateGameId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

// Build a board structure: array of categories, each with 5 question slots
// questions: flat array of raw question objects (30 total, 5 per category)
// categoryNames: array of 6 names
// values: array of 5 point values (e.g. [200,400,600,800,1000])
// round: 1 or 2 (for daily double placement)
// questionIdCounter: { val } mutable counter
function buildBoard(categoryNames, questionSets, values, round, dailyDoublePositions, questionIdCounter) {
  // dailyDoublePositions: Set of "catIdx-qIdx" strings
  const board = [];
  for (let catIdx = 0; catIdx < 6; catIdx++) {
    const questions = questionSets[catIdx]; // 5 questions
    const slots = [];
    for (let qIdx = 0; qIdx < 5; qIdx++) {
      const id = `r${round}-c${catIdx}-q${qIdx}`;
      const q = questions[qIdx];
      slots.push({
        id,
        value: values[qIdx],
        question: q.question,
        correctAnswer: q.correctAnswer,
        incorrectAnswers: q.incorrectAnswers,
        isDailyDouble: dailyDoublePositions.has(`${catIdx}-${qIdx}`),
        answered: false,
      });
    }
    board.push({
      name: categoryNames[catIdx],
      questions: slots,
    });
  }
  return board;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/categories — proxy OpenTDB category list
app.get("/api/categories", async (req, res) => {
  try {
    const response = await fetch("https://opentdb.com/api_category.php");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch categories", detail: err.message });
  }
});

// POST /api/new-game
app.post("/api/new-game", async (req, res) => {
  const { players, answerMode, difficulty, categoryIds } = req.body;

  // --- Validation ---
  if (!Array.isArray(players) || players.length < 1) {
    return res.status(400).json({ error: "players must be a non-empty array" });
  }
  if (!Array.isArray(categoryIds) || categoryIds.length !== 6) {
    return res.status(400).json({ error: "categoryIds must be an array of 6 IDs" });
  }
  const diff = difficulty || "medium";
  const mode = answerMode || "multiple-choice";

  try {
    // Get a session token to reduce rate-limit pressure and avoid duplicate questions
    const token = await getSessionToken();
    await sleep(1000);

    // Fetch 10 questions per category (5 for round 1, 5 for round 2)
    // Plus 1 final Jeopardy question (taken from first category's 11th slot or a separate fetch)
    const allCategoryQuestions = [];
    for (let i = 0; i < 6; i++) {
      if (i > 0) await sleep(5500); // generous delay between requests to avoid rate limiting
      console.log(`Fetching questions for category ${categoryIds[i]} (${i + 1}/6)...`);
      const qs = await fetchQuestions(categoryIds[i], diff, 10, token);
      allCategoryQuestions.push(qs);
    }

    // Fetch 1 final Jeopardy question from the first category
    await sleep(5500);
    console.log("Fetching final Jeopardy question...");
    let finalQ;
    try {
      const finalData = await fetchWithRetry(
        `https://opentdb.com/api.php?amount=1&category=${categoryIds[0]}&type=multiple${token ? `&token=${token}` : ""}`
      );
      if (finalData.results && finalData.results.length > 0) {
        const r = finalData.results[0];
        finalQ = {
          question: decodeHtmlEntities(r.question),
          correctAnswer: decodeHtmlEntities(r.correct_answer),
          incorrectAnswers: r.incorrect_answers.map(decodeHtmlEntities),
        };
      }
    } catch (_) { /* fallback below */ }

    if (!finalQ) {
      // Fallback: reuse the last question from category 0's set if fetch failed
      finalQ = {
        question: "This is the final question. Name any country in Europe.",
        correctAnswer: "France",
        incorrectAnswers: [],
      };
    }

    // Split into round 1 (first 5) and round 2 (last 5) per category
    const round1Sets = allCategoryQuestions.map((qs) => qs.slice(0, 5));
    const round2Sets = allCategoryQuestions.map((qs) => qs.slice(5, 10));

    // Fetch category names for display
    let categoryNames;
    try {
      const catRes = await fetch("https://opentdb.com/api_category.php");
      const catData = await catRes.json();
      categoryNames = categoryIds.map((id) => {
        const found = catData.trivia_categories.find((c) => c.id === id || c.id === Number(id));
        return found ? found.name : `Category ${id}`;
      });
    } catch (_) {
      categoryNames = categoryIds.map((id) => `Category ${id}`);
    }

    // Daily Doubles: 1 in round 1, 2 in round 2 — placed randomly, not on lowest value
    function randomDailyDoubles(count) {
      const positions = new Set();
      while (positions.size < count) {
        const catIdx = Math.floor(Math.random() * 6);
        const qIdx = Math.floor(Math.random() * 5);
        // Avoid placing on row 0 (lowest value) to be slightly more interesting
        if (qIdx === 0 && Math.random() < 0.7) continue;
        positions.add(`${catIdx}-${qIdx}`);
      }
      return positions;
    }

    const dd1 = randomDailyDoubles(1);
    const dd2 = randomDailyDoubles(2);

    const round1Values = [200, 400, 600, 800, 1000];
    const round2Values = [400, 800, 1200, 1600, 2000];

    const board1 = buildBoard(categoryNames, round1Sets, round1Values, 1, dd1, {});
    const board2 = buildBoard(categoryNames, round2Sets, round2Values, 2, dd2, {});

    // Build question index for O(1) lookup
    const questionIndex = {};
    for (const cat of board1) {
      for (const q of cat.questions) {
        questionIndex[q.id] = { ...q, round: 1 };
      }
    }
    for (const cat of board2) {
      for (const q of cat.questions) {
        questionIndex[q.id] = { ...q, round: 2 };
      }
    }

    const finalId = "final-0";
    questionIndex[finalId] = {
      id: finalId,
      question: finalQ.question,
      correctAnswer: finalQ.correctAnswer,
      incorrectAnswers: finalQ.incorrectAnswers,
      round: "final",
    };

    const scores = {};
    const finalWagers = {};
    const finalAnswers = {};
    for (const p of players) {
      scores[p] = 0;
      finalWagers[p] = null;
      finalAnswers[p] = null;
    }

    const gameId = generateGameId();
    gameState = {
      gameId,
      players,
      answerMode: mode,
      difficulty: diff,
      categoryIds,
      currentRound: 1,
      activePlayer: players[0],
      scores,
      board1,
      board2,
      questionIndex,
      answeredQuestions: new Set(),
      finalJeopardyQuestion: { id: finalId, ...finalQ },
      finalWagers,
      finalAnswers,
    };

    // Build public board (no answers)
    const publicBoard = board1.map((cat) => ({
      name: cat.name,
      questions: cat.questions.map((q) => ({
        id: q.id,
        value: q.value,
        answered: q.answered,
        isDailyDouble: false, // don't reveal DD on board
      })),
    }));

    res.json({ gameId, board: publicBoard });
  } catch (err) {
    console.error("new-game error:", err);
    res.status(500).json({ error: "Failed to create game", detail: err.message });
  }
});

// GET /api/board/:round
app.get("/api/board/:round", (req, res) => {
  if (!gameState) return res.status(404).json({ error: "No active game" });
  const round = parseInt(req.params.round);
  if (round !== 1 && round !== 2) return res.status(400).json({ error: "Round must be 1 or 2" });

  const board = round === 1 ? gameState.board1 : gameState.board2;
  const publicBoard = board.map((cat) => ({
    name: cat.name,
    questions: cat.questions.map((q) => ({
      id: q.id,
      value: q.value,
      answered: gameState.answeredQuestions.has(q.id),
      isDailyDouble: false, // don't reveal until selected
    })),
  }));
  res.json({ round, board: publicBoard });
});

// GET /api/question/:questionId
app.get("/api/question/:questionId", (req, res) => {
  if (!gameState) return res.status(404).json({ error: "No active game" });
  const q = gameState.questionIndex[req.params.questionId];
  if (!q) return res.status(404).json({ error: "Question not found" });
  if (gameState.answeredQuestions.has(q.id)) {
    return res.status(410).json({ error: "Question already answered" });
  }

  const response = {
    id: q.id,
    question: q.question,
    value: q.value,
    isDailyDouble: q.isDailyDouble || false,
    round: q.round,
  };

  if (gameState.answerMode === "multiple-choice") {
    const choices = shuffle([q.correctAnswer, ...q.incorrectAnswers]);
    response.choices = choices;
  }

  res.json(response);
});

// POST /api/answer
app.post("/api/answer", (req, res) => {
  if (!gameState) return res.status(404).json({ error: "No active game" });
  const { questionId, answer, player } = req.body;
  if (!questionId || !player) {
    return res.status(400).json({ error: "questionId and player required" });
  }

  const q = gameState.questionIndex[questionId];
  if (!q) return res.status(404).json({ error: "Question not found" });
  if (gameState.answeredQuestions.has(questionId)) {
    return res.status(410).json({ error: "Question already answered" });
  }
  if (q.isDailyDouble) {
    return res.status(400).json({ error: "Use /api/daily-double for Daily Double questions" });
  }

  const correct = checkAnswer(answer, q.correctAnswer);
  const pointChange = correct ? q.value : -q.value;
  if (gameState.scores[player] !== undefined) {
    gameState.scores[player] += pointChange;
  }
  gameState.answeredQuestions.add(questionId);

  res.json({
    correct,
    correctAnswer: q.correctAnswer,
    pointChange,
    scores: { ...gameState.scores },
  });
});

// POST /api/daily-double
app.post("/api/daily-double", (req, res) => {
  if (!gameState) return res.status(404).json({ error: "No active game" });
  const { questionId, wager, answer, player } = req.body;
  if (!questionId || !player || wager === undefined) {
    return res.status(400).json({ error: "questionId, wager, and player required" });
  }

  const q = gameState.questionIndex[questionId];
  if (!q) return res.status(404).json({ error: "Question not found" });
  if (gameState.answeredQuestions.has(questionId)) {
    return res.status(410).json({ error: "Question already answered" });
  }

  const playerScore = gameState.scores[player] || 0;
  const maxWager = Math.max(playerScore, 1000);
  const w = Number(wager);
  if (isNaN(w) || w < 0 || w > maxWager) {
    return res.status(400).json({ error: `Wager must be between 0 and ${maxWager}` });
  }

  const correct = checkAnswer(answer, q.correctAnswer);
  const pointChange = correct ? w : -w;
  if (gameState.scores[player] !== undefined) {
    gameState.scores[player] += pointChange;
  }
  gameState.answeredQuestions.add(questionId);

  res.json({
    correct,
    correctAnswer: q.correctAnswer,
    pointChange,
    scores: { ...gameState.scores },
  });
});

// POST /api/final-wager
app.post("/api/final-wager", (req, res) => {
  if (!gameState) return res.status(404).json({ error: "No active game" });
  const { player, wager } = req.body;
  if (!player || wager === undefined) {
    return res.status(400).json({ error: "player and wager required" });
  }
  if (!gameState.players.includes(player)) {
    return res.status(400).json({ error: "Unknown player" });
  }

  const playerScore = gameState.scores[player] || 0;
  // If player has negative score, they can still wager 0; max wager is their score (or 0 if negative)
  const maxWager = Math.max(playerScore, 0);
  const w = Number(wager);
  if (isNaN(w) || w < 0 || w > maxWager) {
    return res.status(400).json({ error: `Wager must be between 0 and ${maxWager}` });
  }

  gameState.finalWagers[player] = w;
  res.json({ success: true });
});

// POST /api/final-answer
app.post("/api/final-answer", (req, res) => {
  if (!gameState) return res.status(404).json({ error: "No active game" });
  const { player, answer } = req.body;
  if (!player || answer === undefined) {
    return res.status(400).json({ error: "player and answer required" });
  }
  if (!gameState.players.includes(player)) {
    return res.status(400).json({ error: "Unknown player" });
  }
  if (gameState.finalWagers[player] === null) {
    return res.status(400).json({ error: "Player must submit a wager first" });
  }

  gameState.finalAnswers[player] = answer;

  // Check if all players have answered
  const allAnswered = gameState.players.every((p) => gameState.finalAnswers[p] !== null);
  if (!allAnswered) {
    return res.json({ waiting: true });
  }

  // Evaluate all players
  const fq = gameState.finalJeopardyQuestion;
  const results = gameState.players.map((p) => {
    const correct = checkAnswer(gameState.finalAnswers[p], fq.correctAnswer);
    const wager = gameState.finalWagers[p];
    const pointChange = correct ? wager : -wager;
    gameState.scores[p] += pointChange;
    return {
      player: p,
      answer: gameState.finalAnswers[p],
      correct,
      wager,
      pointChange,
      finalScore: gameState.scores[p],
    };
  });

  res.json({ results });
});

// GET /api/game-state
app.get("/api/game-state", (req, res) => {
  if (!gameState) return res.status(404).json({ error: "No active game" });
  res.json({
    gameId: gameState.gameId,
    currentRound: gameState.currentRound,
    scores: { ...gameState.scores },
    activePlayer: gameState.activePlayer,
    players: gameState.players,
    answeredQuestions: [...gameState.answeredQuestions],
    answerMode: gameState.answerMode,
    difficulty: gameState.difficulty,
  });
});

// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Trivia game running at http://localhost:${PORT}`);
});
