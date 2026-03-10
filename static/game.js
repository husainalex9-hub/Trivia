// ============================================================
//  TRIVIA NIGHT — game.js
//  Complete client-side game logic
// ============================================================

// ------------------------------------
// Game State
// ------------------------------------
let game = {
  players: ["Player 1", "Player 2"],
  scores: [0, 0],
  activePlayer: 0,        // 0-indexed
  answerMode: "mc",       // "mc" | "free"
  difficulty: "medium",
  currentRound: 1,
  soundEnabled: true,
  board: null,
  answeredCount: 0,
  totalQuestions: 30,
  stats: {
    0: { correct: 0, wrong: 0, byCategory: {} },
    1: { correct: 0, wrong: 0, byCategory: {} },
  },
  biggestAnswer: { player: 0, points: 0 },
};

// Track the current text-submit handler so we can replace it cleanly
let currentTextSubmitHandler = null;

// ------------------------------------
// Screen Management
// ------------------------------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ------------------------------------
// Score / Player Displays
// ------------------------------------
function updateScoreDisplays() {
  const displays = document.querySelectorAll(".player-display");
  displays[0].querySelector(".player-score").textContent = "$" + game.scores[0];
  displays[1].querySelector(".player-score").textContent = "$" + game.scores[1];

  // Brief bounce animation
  displays.forEach(d => {
    const scoreEl = d.querySelector(".player-score");
    scoreEl.classList.add("score-bounce");
    setTimeout(() => scoreEl.classList.remove("score-bounce"), 400);
  });
}

function updateActivePlayerDisplay() {
  const displays = document.querySelectorAll(".player-display");
  displays.forEach((d, i) => d.classList.toggle("active-player", i === game.activePlayer));
}

function initPlayerDisplays() {
  const displays = document.querySelectorAll(".player-display");
  displays[0].querySelector(".player-name").textContent = game.players[0];
  displays[1].querySelector(".player-name").textContent = game.players[1];
  updateScoreDisplays();
  updateActivePlayerDisplay();
}

// ------------------------------------
// Board Rendering
// ------------------------------------
function renderBoard(boardData) {
  const grid = document.getElementById("board-grid");
  grid.innerHTML = "";

  // Category headers
  boardData.categories.forEach(cat => {
    const header = document.createElement("div");
    header.className = "category-header";
    header.textContent = cat.name;
    grid.appendChild(header);
  });

  // Tiles row by row (5 rows × 6 columns)
  for (let row = 0; row < 5; row++) {
    boardData.categories.forEach((cat, col) => {
      const q = cat.questions[row];
      const tile = document.createElement("div");
      tile.className = "tile" + (q.answered ? " used" : "");
      tile.dataset.col = col;
      tile.dataset.questionId = q.id;
      tile.textContent = "$" + q.value;
      if (!q.answered) {
        tile.addEventListener("click", () => openQuestion(q.id, q.value, cat.name, col, tile));
      }
      grid.appendChild(tile);
    });
  }
}

// ------------------------------------
// Question Flow
// ------------------------------------
async function openQuestion(questionId, value, category, col, tile) {
  const res = await fetch("/api/question/" + questionId);
  const data = await res.json();

  if (data.isDailyDouble) {
    showDailyDouble(questionId, data, value, category, tile);
    return;
  }

  showScreen("screen-question");
  document.getElementById("q-category").textContent = category;
  document.getElementById("q-value").textContent = "$" + value;
  document.getElementById("q-text").textContent = data.question;

  // Hide result and back button initially
  const resultEl = document.getElementById("q-result");
  resultEl.className = "hidden";
  resultEl.textContent = "";
  document.getElementById("back-to-board").classList.add("hidden");

  if (game.answerMode === "free") {
    document.getElementById("text-answer-form").classList.remove("hidden");
    document.getElementById("mc-choices").classList.add("hidden");
    const input = document.getElementById("text-answer-input");
    input.value = "";
    setTimeout(() => input.focus(), 100);

    currentTextSubmitHandler = (e) => {
      e.preventDefault();
      const answer = document.getElementById("text-answer-input").value.trim();
      if (!answer) return;
      submitAnswer(questionId, answer, value, category, tile);
    };
    document.getElementById("text-answer-form").onsubmit = currentTextSubmitHandler;
  } else {
    document.getElementById("text-answer-form").classList.add("hidden");
    document.getElementById("mc-choices").classList.remove("hidden");
    const btns = document.querySelectorAll("#mc-choices .mc-btn");
    (data.choices || []).forEach((choice, i) => {
      btns[i].textContent = choice;
      btns[i].className = "mc-btn";
      btns[i].disabled = false;
      btns[i].onclick = () => submitAnswer(questionId, choice, value, category, tile);
    });
  }
}

// ------------------------------------
// Answer Submission
// ------------------------------------
async function submitAnswer(questionId, answer, value, category, tile) {
  // Disable UI to prevent double-submits
  document.querySelectorAll("#mc-choices .mc-btn").forEach(b => { b.disabled = true; });
  if (document.getElementById("text-answer-form")) {
    const submitBtn = document.querySelector("#text-answer-form button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
  }

  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, answer, player: game.activePlayer }),
  });
  const data = await res.json();

  game.scores = [data.scores[0], data.scores[1]];
  updateScoreDisplays();

  if (game.soundEnabled) {
    if (data.correct) SoundManager.correct(); else SoundManager.wrong();
  }

  const resultEl = document.getElementById("q-result");
  resultEl.classList.remove("hidden");

  if (data.correct) {
    resultEl.className = "result-correct";
    resultEl.textContent = "Correct! +$" + Math.abs(data.pointChange);
    game.stats[game.activePlayer].correct++;
    if (Math.abs(data.pointChange) > game.biggestAnswer.points) {
      game.biggestAnswer = { player: game.activePlayer, points: Math.abs(data.pointChange) };
    }
  } else {
    resultEl.className = "result-wrong";
    resultEl.textContent = "Wrong! The answer was: " + data.correctAnswer;
    game.stats[game.activePlayer].wrong++;
    game.activePlayer = game.activePlayer === 0 ? 1 : 0;
  }

  // Track by category
  const catStats = game.stats[game.activePlayer].byCategory;
  if (!catStats[category]) catStats[category] = { correct: 0, wrong: 0 };
  catStats[category][data.correct ? "correct" : "wrong"]++;

  updateActivePlayerDisplay();

  // Mark tile as used
  tile.classList.add("used");
  tile.onclick = null;

  document.getElementById("back-to-board").classList.remove("hidden");
  game.answeredCount++;
}

// ------------------------------------
// Back to Board Button
// ------------------------------------
document.getElementById("back-to-board").addEventListener("click", () => {
  if (game.answeredCount >= game.totalQuestions) {
    if (game.currentRound === 1) {
      startRound2();
    } else {
      startFinalJeopardy();
    }
  } else {
    showScreen("screen-board");
  }
});

// ------------------------------------
// Round 2 Transition
// ------------------------------------
async function startRound2() {
  game.currentRound = 2;
  game.answeredCount = 0;

  showScreen("screen-transition");
  document.getElementById("transition-text").textContent = "DOUBLE JEOPARDY!";
  if (game.soundEnabled) SoundManager.dailyDouble();

  await new Promise(r => setTimeout(r, 3000));

  const res = await fetch("/api/board/2");
  game.board = await res.json();
  document.getElementById("round-label").textContent = "Double Jeopardy";
  renderBoard(game.board);
  showScreen("screen-board");
}

// ------------------------------------
// Daily Double Flow
// ------------------------------------
function showDailyDouble(questionId, data, value, category, tile) {
  if (game.soundEnabled) SoundManager.dailyDouble();
  showScreen("screen-daily-double");

  const playerScore = game.scores[game.activePlayer];
  const maxWager = Math.max(playerScore, game.currentRound === 1 ? 1000 : 2000);

  document.getElementById("dd-score").textContent = "Your Score: $" + playerScore;
  document.getElementById("dd-min").textContent = "$0";
  document.getElementById("dd-max").textContent = "$" + maxWager;

  const wagerInput = document.getElementById("dd-wager");
  wagerInput.value = "";
  wagerInput.max = maxWager;
  wagerInput.min = 0;

  const questionArea = document.getElementById("dd-question-area");
  questionArea.classList.add("hidden");

  document.getElementById("dd-lock-btn").onclick = () => {
    let wager = parseInt(wagerInput.value) || 0;
    wager = Math.max(0, Math.min(wager, maxWager));

    questionArea.classList.remove("hidden");
    document.getElementById("dd-q-text").textContent = data.question;

    const ddResult = document.getElementById("dd-result");
    ddResult.className = "hidden";
    ddResult.textContent = "";
    document.getElementById("dd-continue-btn").classList.add("hidden");

    if (game.answerMode === "free") {
      const ddInput = document.getElementById("dd-text-answer-input");
      document.getElementById("dd-text-answer-form").classList.remove("hidden");
      document.getElementById("dd-mc-choices").classList.add("hidden");
      ddInput.value = "";
      setTimeout(() => ddInput.focus(), 100);

      document.getElementById("dd-text-answer-form").onsubmit = async (e) => {
        e.preventDefault();
        const answer = ddInput.value.trim();
        if (!answer) return;
        await submitDailyDouble(questionId, answer, wager, category, tile, ddResult);
      };
    } else {
      document.getElementById("dd-text-answer-form").classList.add("hidden");
      document.getElementById("dd-mc-choices").classList.remove("hidden");
      const btns = document.querySelectorAll("#dd-mc-choices .mc-btn");
      (data.choices || []).forEach((choice, i) => {
        btns[i].textContent = choice;
        btns[i].className = "mc-btn";
        btns[i].disabled = false;
        btns[i].onclick = () => submitDailyDouble(questionId, choice, wager, category, tile, ddResult);
      });
    }
  };
}

async function submitDailyDouble(questionId, answer, wager, category, tile, ddResult) {
  // Disable buttons to prevent double-submit
  document.querySelectorAll("#dd-mc-choices .mc-btn").forEach(b => { b.disabled = true; });

  const res = await fetch("/api/daily-double", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, wager, answer, player: game.activePlayer }),
  });
  const data = await res.json();

  game.scores = [data.scores[0], data.scores[1]];
  updateScoreDisplays();

  if (game.soundEnabled) {
    if (data.correct) SoundManager.correct(); else SoundManager.wrong();
  }

  ddResult.classList.remove("hidden");
  if (data.correct) {
    ddResult.className = "result-correct";
    ddResult.textContent = "Correct! +$" + Math.abs(data.pointChange);
    game.stats[game.activePlayer].correct++;
    if (Math.abs(data.pointChange) > game.biggestAnswer.points) {
      game.biggestAnswer = { player: game.activePlayer, points: Math.abs(data.pointChange) };
    }
  } else {
    ddResult.className = "result-wrong";
    ddResult.textContent = "Wrong! The answer was: " + data.correctAnswer + " (-$" + Math.abs(data.pointChange) + ")";
    game.stats[game.activePlayer].wrong++;
    game.activePlayer = game.activePlayer === 0 ? 1 : 0;
    updateActivePlayerDisplay();
  }

  // Track by category
  const catStats = game.stats[game.activePlayer].byCategory;
  if (!catStats[category]) catStats[category] = { correct: 0, wrong: 0 };
  catStats[category][data.correct ? "correct" : "wrong"]++;

  tile.classList.add("used");
  tile.onclick = null;
  game.answeredCount++;

  const continueBtn = document.getElementById("dd-continue-btn");
  continueBtn.classList.remove("hidden");
  continueBtn.onclick = () => {
    if (game.answeredCount >= game.totalQuestions) {
      if (game.currentRound === 1) startRound2();
      else startFinalJeopardy();
    } else {
      showScreen("screen-board");
    }
  };
}

// ------------------------------------
// Final Jeopardy
// ------------------------------------
async function startFinalJeopardy() {
  showScreen("screen-final-category");

  const stateRes = await fetch("/api/game-state");
  const state = await stateRes.json();

  document.getElementById("final-category-name").textContent =
    state.finalJeopardy ? state.finalJeopardy.category : "Final Jeopardy";

  // Set player name labels
  const label1 = document.getElementById("final-wager-label-1");
  const label2 = document.getElementById("final-wager-label-2");
  if (label1) label1.textContent = game.players[0] + " Wager:";
  if (label2) label2.textContent = game.players[1] + " Wager:";

  // Also set final question screen labels
  const ansLabel1 = document.getElementById("final-answer-label-1");
  const ansLabel2 = document.getElementById("final-answer-label-2");
  if (ansLabel1) ansLabel1.textContent = game.players[0] + ":";
  if (ansLabel2) ansLabel2.textContent = game.players[1] + ":";

  const w1Input = document.getElementById("final-wager-1");
  const w2Input = document.getElementById("final-wager-2");

  w1Input.max = Math.max(0, game.scores[0]);
  w2Input.max = Math.max(0, game.scores[1]);
  w1Input.value = "";
  w2Input.value = "";
  w1Input.disabled = false;
  w2Input.disabled = false;

  if (game.scores[0] <= 0) {
    w1Input.value = 0;
    w1Input.disabled = true;
  }
  if (game.scores[1] <= 0) {
    w2Input.value = 0;
    w2Input.disabled = true;
  }

  document.getElementById("final-lock-wagers").onclick = async () => {
    const w1 = Math.max(0, Math.min(parseInt(w1Input.value) || 0, Math.max(0, game.scores[0])));
    const w2 = Math.max(0, Math.min(parseInt(w2Input.value) || 0, Math.max(0, game.scores[1])));

    await fetch("/api/final-wager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player: 0, wager: w1 }),
    });
    await fetch("/api/final-wager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player: 1, wager: w2 }),
    });

    showScreen("screen-final-question");
    document.getElementById("final-q-text").textContent =
      state.finalJeopardy ? state.finalJeopardy.question : "";
    document.getElementById("final-answer-1").value = "";
    document.getElementById("final-answer-2").value = "";

    // 30-second countdown timer
    let timeLeft = 30;
    let stopMusic = null;
    if (game.soundEnabled) {
      stopMusic = SoundManager.finalTheme();
    }

    const timerEl = document.getElementById("final-timer");
    timerEl.textContent = timeLeft;
    timerEl.className = "";

    const timerInterval = setInterval(() => {
      timeLeft--;
      timerEl.textContent = timeLeft;
      if (timeLeft <= 10) timerEl.className = "warning";
      if (timeLeft <= 5) timerEl.className = "danger";
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        if (stopMusic) stopMusic();
        submitFinalAnswers();
      }
    }, 1000);

    document.getElementById("final-submit").onclick = () => {
      clearInterval(timerInterval);
      if (stopMusic) stopMusic();
      submitFinalAnswers();
    };
  };
}

async function submitFinalAnswers() {
  // Disable submit button to prevent double-submit
  document.getElementById("final-submit").disabled = true;

  const a1 = document.getElementById("final-answer-1").value;
  const a2 = document.getElementById("final-answer-2").value;

  await fetch("/api/final-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: 0, answer: a1 }),
  });
  const res = await fetch("/api/final-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player: 1, answer: a2 }),
  });
  const data = await res.json();

  document.getElementById("final-submit").disabled = false;

  if (data.results) {
    await revealFinalResults(data.results);
  }
}

async function revealFinalResults(results) {
  // Reuse question screen for a dramatic reveal
  showScreen("screen-question");
  document.getElementById("q-category").textContent = "FINAL JEOPARDY";
  document.getElementById("q-value").textContent = "";
  document.getElementById("text-answer-form").classList.add("hidden");
  document.getElementById("mc-choices").classList.add("hidden");
  document.getElementById("back-to-board").classList.add("hidden");

  const qText = document.getElementById("q-text");
  const resultEl = document.getElementById("q-result");
  resultEl.className = "hidden";
  resultEl.textContent = "";

  // Player 1 reveal
  const r1 = results.find(r => r.player === 0);
  if (r1) {
    qText.textContent = game.players[0] + " wagered $" + r1.wager;
    resultEl.classList.remove("hidden");
    resultEl.className = r1.correct ? "result-correct" : "result-wrong";
    resultEl.textContent = r1.correct
      ? "Correct! +$" + r1.wager + " \u2192 Final: $" + r1.finalScore
      : "Wrong! -$" + r1.wager + " \u2192 Final: $" + r1.finalScore;
    if (game.soundEnabled) {
      if (r1.correct) SoundManager.correct(); else SoundManager.wrong();
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Player 2 reveal
  const r2 = results.find(r => r.player === 1);
  if (r2) {
    qText.textContent = game.players[1] + " wagered $" + r2.wager;
    resultEl.className = r2.correct ? "result-correct" : "result-wrong";
    resultEl.textContent = r2.correct
      ? "Correct! +$" + r2.wager + " \u2192 Final: $" + r2.finalScore
      : "Wrong! -$" + r2.wager + " \u2192 Final: $" + r2.finalScore;
    if (game.soundEnabled) {
      if (r2.correct) SoundManager.correct(); else SoundManager.wrong();
    }
    if (r1) game.scores = [r1.finalScore, r2.finalScore];
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  showGameOver();
}

// ------------------------------------
// Game Over
// ------------------------------------
function showGameOver() {
  showScreen("screen-game-over");

  const winner = game.scores[0] > game.scores[1] ? 0 : game.scores[1] > game.scores[0] ? 1 : -1;
  const winnerText = document.getElementById("winner-text");
  const trophy = document.getElementById("trophy");

  if (winner === -1) {
    winnerText.textContent = "It's a Tie!";
    trophy.textContent = "\uD83E\uDD1D";
  } else {
    winnerText.textContent = game.players[winner] + " Wins!";
    trophy.textContent = "\uD83C\uDFC6";
  }

  // Build stats
  const statsEl = document.getElementById("stats-container");
  statsEl.innerHTML = "";

  for (let p = 0; p < 2; p++) {
    const s = game.stats[p];
    const total = s.correct + s.wrong;
    const accuracy = total > 0 ? Math.round((s.correct / total) * 100) : 0;

    let bestCat = "N/A", worstCat = "N/A", bestPct = -1, worstPct = 101;
    for (const [cat, catData] of Object.entries(s.byCategory)) {
      const catTotal = catData.correct + catData.wrong;
      if (catTotal === 0) continue;
      const pct = catData.correct / catTotal;
      if (pct > bestPct) { bestPct = pct; bestCat = cat; }
      if (pct < worstPct) { worstPct = pct; worstCat = cat; }
    }

    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML =
      "<h3>" + game.players[p] + "</h3>" +
      "<p>Final Score: $" + game.scores[p] + "</p>" +
      "<p>Accuracy: " + accuracy + "% (" + s.correct + "/" + total + ")</p>" +
      "<p>Best Category: " + bestCat + "</p>" +
      "<p>Worst Category: " + worstCat + "</p>";
    statsEl.appendChild(card);
  }

  if (game.biggestAnswer.points > 0) {
    const bigCard = document.createElement("div");
    bigCard.className = "stat-card";
    bigCard.innerHTML =
      "<h3>Biggest Single Answer</h3>" +
      "<p>" + game.players[game.biggestAnswer.player] + " \u2014 $" + game.biggestAnswer.points + "</p>";
    statsEl.appendChild(bigCard);
  }

  // Confetti + fanfare
  const canvas = document.getElementById("confetti-canvas");
  Confetti.init(canvas);
  Confetti.start();
  if (game.soundEnabled) SoundManager.fanfare();

  saveToLeaderboard();
}

// ------------------------------------
// Leaderboard
// ------------------------------------
function saveToLeaderboard() {
  const history = JSON.parse(localStorage.getItem("triviaLeaderboard") || "[]");
  history.unshift({
    date: new Date().toLocaleDateString(),
    player1: { name: game.players[0], score: game.scores[0] },
    player2: { name: game.players[1], score: game.scores[1] },
    winner: game.scores[0] > game.scores[1]
      ? game.players[0]
      : game.scores[1] > game.scores[0]
        ? game.players[1]
        : "Tie",
  });
  if (history.length > 20) history.length = 20;
  localStorage.setItem("triviaLeaderboard", JSON.stringify(history));
}

function showLeaderboard() {
  showScreen("screen-leaderboard");
  const history = JSON.parse(localStorage.getItem("triviaLeaderboard") || "[]");
  const container = document.getElementById("leaderboard-table");

  if (history.length === 0) {
    container.innerHTML = "<p style='text-align:center;color:#aaa;'>No games played yet.</p>";
    return;
  }

  let html = "<table class='leaderboard-table'><thead><tr>" +
    "<th>Date</th><th>Player 1</th><th>Player 2</th><th>Winner</th>" +
    "</tr></thead><tbody>";
  history.forEach(g => {
    html += "<tr>" +
      "<td>" + g.date + "</td>" +
      "<td>" + g.player1.name + " ($" + g.player1.score + ")</td>" +
      "<td>" + g.player2.name + " ($" + g.player2.score + ")</td>" +
      "<td>" + g.winner + "</td>" +
      "</tr>";
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ------------------------------------
// Play Again
// ------------------------------------
document.getElementById("play-again-btn").addEventListener("click", () => {
  game.scores = [0, 0];
  game.activePlayer = 0;
  game.currentRound = 1;
  game.answeredCount = 0;
  game.stats = {
    0: { correct: 0, wrong: 0, byCategory: {} },
    1: { correct: 0, wrong: 0, byCategory: {} },
  };
  game.biggestAnswer = { player: 0, points: 0 };
  game.board = null;
  Confetti.stop();
  showScreen("screen-lobby");
});

// ------------------------------------
// Global Event Listeners
// ------------------------------------
document.getElementById("view-leaderboard-btn").addEventListener("click", showLeaderboard);
document.getElementById("view-leaderboard-btn-2").addEventListener("click", showLeaderboard);
document.getElementById("back-to-lobby-btn").addEventListener("click", () => showScreen("screen-lobby"));

// ------------------------------------
// Lobby Initialization
// ------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // --- Mode buttons ---
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      game.answerMode = btn.dataset.mode === "free" ? "free" : "mc";
    });
  });

  // Set default active mode button (mc)
  const defaultModeBtn = document.querySelector(".mode-btn[data-mode='mc']");
  if (defaultModeBtn) defaultModeBtn.classList.add("active");

  // --- Difficulty buttons ---
  document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      game.difficulty = btn.dataset.diff;
    });
  });

  // Set default active difficulty button (medium)
  const defaultDiffBtn = document.querySelector(".diff-btn[data-diff='medium']");
  if (defaultDiffBtn) defaultDiffBtn.classList.add("active");

  // --- Sound toggle ---
  const soundToggle = document.getElementById("sound-toggle");
  soundToggle.checked = game.soundEnabled;
  soundToggle.addEventListener("change", () => {
    game.soundEnabled = soundToggle.checked;
    SoundManager.enabled = soundToggle.checked;
  });

  // --- Fetch and render categories ---
  try {
    const res = await fetch("/api/categories");
    const catData = await res.json();
    renderCategoryGrid(catData.trivia_categories || []);
  } catch (err) {
    console.error("Failed to load categories:", err);
    document.getElementById("category-grid").textContent = "Failed to load categories.";
  }

  // --- Start button ---
  document.getElementById("start-btn").addEventListener("click", startGame);
});

// ------------------------------------
// Category Grid (lobby)
// ------------------------------------
let selectedCategories = [];

function renderCategoryGrid(categories) {
  const grid = document.getElementById("category-grid");
  grid.innerHTML = "";
  selectedCategories = [];

  categories.forEach(cat => {
    const card = document.createElement("div");
    card.className = "category-card";
    card.textContent = cat.name;
    card.dataset.id = cat.id;

    card.addEventListener("click", () => toggleCategoryCard(card, cat.id));
    grid.appendChild(card);
  });
}

function toggleCategoryCard(card, id) {
  const isSelected = card.classList.contains("selected");

  if (isSelected) {
    card.classList.remove("selected");
    selectedCategories = selectedCategories.filter(c => c !== id);
  } else {
    if (selectedCategories.length >= 6) return; // Max 6 already selected
    card.classList.add("selected");
    selectedCategories.push(id);
  }

  // Enforce visual disabled state on unselected cards when 6 are chosen
  const atMax = selectedCategories.length >= 6;
  document.querySelectorAll(".category-card").forEach(c => {
    if (!c.classList.contains("selected")) {
      c.classList.toggle("disabled", atMax);
    }
  });
}

// ------------------------------------
// Start Game
// ------------------------------------
async function startGame() {
  const p1 = document.getElementById("p1-name").value.trim();
  const p2 = document.getElementById("p2-name").value.trim();

  if (!p1 || !p2) {
    alert("Please enter both player names.");
    return;
  }
  if (selectedCategories.length !== 6) {
    alert("Please select exactly 6 categories.");
    return;
  }

  game.players = [p1, p2];
  game.scores = [0, 0];
  game.activePlayer = 0;
  game.currentRound = 1;
  game.answeredCount = 0;
  game.stats = {
    0: { correct: 0, wrong: 0, byCategory: {} },
    1: { correct: 0, wrong: 0, byCategory: {} },
  };
  game.biggestAnswer = { player: 0, points: 0 };

  showScreen("screen-loading");

  try {
    const res = await fetch("/api/new-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        players: [p1, p2],
        answerMode: game.answerMode,
        difficulty: game.difficulty,
        categoryIds: selectedCategories,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Server error " + res.status);
    }

    const data = await res.json();
    game.board = data.board;

    document.getElementById("round-label").textContent = "Jeopardy Round";
    initPlayerDisplays();
    renderBoard(game.board);
    showScreen("screen-board");
  } catch (err) {
    console.error("Failed to start game:", err);
    alert("Failed to start game: " + err.message);
    showScreen("screen-lobby");
  }
}
