// ============================================================
//  TRIVIA NIGHT — game.js
//  Complete client-side game logic (2–6 players, CPU support)
// ============================================================

// ------------------------------------
// Helpers
// ------------------------------------
function decodeHTML(str) {
  if (!str) return str;
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

// ------------------------------------
// Game State
// ------------------------------------
let game = {
  players: [],           // array of name strings
  cpuPlayers: [],        // array of booleans, true = CPU
  scores: [],            // array of numbers
  activePlayer: 0,
  answerMode: "mc",
  difficulty: "medium",
  currentRound: 1,
  soundEnabled: true,
  board: null,
  answeredCount: 0,
  totalQuestions: 30,
  cpuAccuracy: 0.55,
  stats: {},             // keyed by player index
  biggestAnswer: { player: 0, points: 0 },
};

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
function animateScore(el, from, to) {
  const duration = 500;
  const start = performance.now();
  const diff = to - from;
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - (1 - progress) * (1 - progress);
    const current = Math.round(from + diff * eased);
    el.textContent = "$" + current;
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = "$" + to;
  }
  requestAnimationFrame(tick);
}

function updateScoreDisplays() {
  const displays = document.querySelectorAll("#player-displays .player-display");
  displays.forEach((d, i) => {
    if (i >= game.players.length) return;
    const scoreEl = d.querySelector(".player-score");
    const oldVal = parseInt((scoreEl.textContent || "$0").replace("$", "")) || 0;
    const newVal = game.scores[i];
    if (oldVal !== newVal) {
      scoreEl.classList.remove("score-bounce");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("score-bounce");
      animateScore(scoreEl, oldVal, newVal);
      setTimeout(() => scoreEl.classList.remove("score-bounce"), 500);
    } else {
      scoreEl.textContent = "$" + newVal;
    }
  });
}

function updateActivePlayerDisplay() {
  const displays = document.querySelectorAll("#player-displays .player-display");
  displays.forEach((d, i) => d.classList.toggle("active-player", i === game.activePlayer));
}

function initPlayerDisplays() {
  const container = document.getElementById("player-displays");
  container.innerHTML = "";
  game.players.forEach((name, i) => {
    const div = document.createElement("div");
    div.className = "player-display";
    div.innerHTML =
      '<span class="player-name">' + name + (game.cpuPlayers[i] ? " (CPU)" : "") + '</span>' +
      '<span class="player-score">$0</span>';
    container.appendChild(div);
  });
  updateActivePlayerDisplay();
}

// ------------------------------------
// Board Rendering
// ------------------------------------
function renderBoard(boardData) {
  const grid = document.getElementById("board-grid");
  grid.innerHTML = "";
  const categories = Array.isArray(boardData) ? boardData : (boardData.board || boardData.categories || []);

  categories.forEach(cat => {
    const header = document.createElement("div");
    header.className = "category-header";
    header.textContent = decodeHTML(cat.name);
    grid.appendChild(header);
  });

  for (let row = 0; row < 5; row++) {
    categories.forEach((cat, col) => {
      const q = cat.questions[row];
      const tile = document.createElement("div");
      tile.className = "tile" + (q.answered ? " used" : "");
      tile.dataset.col = col;
      tile.dataset.questionId = q.id;
      tile.textContent = "$" + q.value;
      if (!q.answered) {
        tile.addEventListener("click", () => openQuestion(q.id, q.value, decodeHTML(cat.name), col, tile));
      }
      grid.appendChild(tile);
    });
  }
}

// ------------------------------------
// Question Flow
// ------------------------------------
async function openQuestion(questionId, value, category, col, tile) {
  let data;
  try {
    const res = await fetch("/api/question/" + questionId);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showUserError("Failed to load question: " + (err.error || res.status));
      return;
    }
    data = await res.json();
  } catch (err) {
    showUserError("Network error loading question. Please try again.");
    return;
  }

  if (data.question) data.question = decodeHTML(data.question);
  if (data.choices) data.choices = data.choices.map(decodeHTML);

  if (data.isDailyDouble) {
    showDailyDouble(questionId, data, value, category, tile);
    if (isCPUTurn()) cpuAnswerDailyDouble();
    return;
  }

  showScreen("screen-question");
  document.getElementById("q-category").textContent = category;
  document.getElementById("q-value").textContent = "$" + value;
  document.getElementById("q-whose-turn").textContent = game.players[game.activePlayer] + "'s turn";
  document.getElementById("q-text").textContent = data.question;

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
    document.getElementById("text-answer-form").onsubmit = (e) => {
      e.preventDefault();
      const answer = document.getElementById("text-answer-input").value.trim();
      if (!answer) return;
      submitAnswer(questionId, answer, value, category, tile);
    };
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

  if (isCPUTurn()) cpuAnswerQuestion();
}

// ------------------------------------
// Answer Submission
// ------------------------------------
async function submitAnswer(questionId, answer, value, category, tile) {
  document.querySelectorAll("#mc-choices .mc-btn").forEach(b => { b.disabled = true; });
  const submitBtn = document.querySelector("#text-answer-form button[type='submit']");
  if (submitBtn) submitBtn.disabled = true;

  let data;
  try {
    const res = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId,
        answer,
        player: game.players[game.activePlayer],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showUserError("Error submitting answer: " + (err.error || res.status));
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    data = await res.json();
  } catch (err) {
    showUserError("Network error. Please try again.");
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  syncScores(data.scores);
  updateScoreDisplays();

  if (game.soundEnabled) {
    if (data.correct) SoundManager.correct(); else SoundManager.wrong();
  }

  const resultEl = document.getElementById("q-result");
  resultEl.classList.remove("hidden");

  if (data.correct) {
    resultEl.className = "result-correct";
    resultEl.textContent = game.players[game.activePlayer] + " — Correct! +$" + Math.abs(data.pointChange);
    game.stats[game.activePlayer].correct++;
    if (Math.abs(data.pointChange) > game.biggestAnswer.points) {
      game.biggestAnswer = { player: game.activePlayer, points: Math.abs(data.pointChange) };
    }
  } else {
    resultEl.className = "result-wrong";
    resultEl.textContent = game.players[game.activePlayer] + " — Wrong! The answer was: " + decodeHTML(data.correctAnswer);
    game.stats[game.activePlayer].wrong++;
    advancePlayer();
  }

  const catStats = game.stats[game.activePlayer].byCategory;
  if (!catStats[category]) catStats[category] = { correct: 0, wrong: 0 };
  catStats[category][data.correct ? "correct" : "wrong"]++;

  updateActivePlayerDisplay();
  tile.classList.add("used");
  tile.onclick = null;
  document.getElementById("back-to-board").classList.remove("hidden");
  if (submitBtn) submitBtn.disabled = false;
  game.answeredCount++;

  if (hasCPU()) cpuContinueAfterAnswer();
}

// ------------------------------------
// Player Rotation
// ------------------------------------
function advancePlayer() {
  game.activePlayer = (game.activePlayer + 1) % game.players.length;
}

// ------------------------------------
// Back to Board
// ------------------------------------
document.getElementById("back-to-board").addEventListener("click", () => {
  if (game.answeredCount >= game.totalQuestions) {
    if (game.currentRound === 1) startRound2();
    else startFinalJeopardy();
  } else {
    showScreen("screen-board");
    checkCPUTurn();
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

  try {
    const res = await fetch("/api/board/2");
    if (!res.ok) throw new Error("Server error " + res.status);
    const data = await res.json();
    game.board = data.board || data;
    document.getElementById("round-label").textContent = "Double Jeopardy";
    renderBoard(game.board);
    showScreen("screen-board");
    checkCPUTurn();
  } catch (err) {
    showUserError("Failed to load round 2: " + err.message);
    showScreen("screen-board");
  }
}

// ------------------------------------
// Daily Double Flow
// ------------------------------------
function showDailyDouble(questionId, data, value, category, tile) {
  if (game.soundEnabled) SoundManager.dailyDouble();
  showScreen("screen-daily-double");

  const playerScore = game.scores[game.activePlayer];
  const maxWager = Math.max(playerScore, game.currentRound === 1 ? 1000 : 2000);

  document.getElementById("dd-player-name").textContent = game.players[game.activePlayer] + "'s Daily Double";
  document.getElementById("dd-score").textContent = "Score: $" + playerScore;
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
  document.querySelectorAll("#dd-mc-choices .mc-btn").forEach(b => { b.disabled = true; });

  let data;
  try {
    const res = await fetch("/api/daily-double", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId, wager, answer,
        player: game.players[game.activePlayer],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showUserError("Error submitting daily double: " + (err.error || res.status));
      return;
    }
    data = await res.json();
  } catch (err) {
    showUserError("Network error. Please try again.");
    return;
  }

  syncScores(data.scores);
  updateScoreDisplays();

  if (game.soundEnabled) {
    if (data.correct) SoundManager.correct(); else SoundManager.wrong();
  }

  ddResult.classList.remove("hidden");
  if (data.correct) {
    ddResult.className = "result-correct";
    ddResult.textContent = game.players[game.activePlayer] + " — Correct! +$" + Math.abs(data.pointChange);
    game.stats[game.activePlayer].correct++;
    if (Math.abs(data.pointChange) > game.biggestAnswer.points) {
      game.biggestAnswer = { player: game.activePlayer, points: Math.abs(data.pointChange) };
    }
  } else {
    ddResult.className = "result-wrong";
    ddResult.textContent = game.players[game.activePlayer] + " — Wrong! " + decodeHTML(data.correctAnswer) + " (-$" + Math.abs(data.pointChange) + ")";
    game.stats[game.activePlayer].wrong++;
    advancePlayer();
    updateActivePlayerDisplay();
  }

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
      checkCPUTurn();
    }
  };

  if (hasCPU()) cpuContinueAfterDD();
}

// ------------------------------------
// Final Jeopardy
// ------------------------------------
async function startFinalJeopardy() {
  showScreen("screen-final-category");
  document.getElementById("final-category-name").textContent = "Final Jeopardy";

  // Build wager inputs dynamically
  const wagersContainer = document.getElementById("final-wagers-container");
  wagersContainer.innerHTML = "";
  game.players.forEach((name, i) => {
    const section = document.createElement("div");
    section.className = "final-wager-section";
    const label = document.createElement("label");
    label.textContent = name + " Wager:";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.id = "final-wager-" + i;

    if (game.scores[i] <= 0) {
      input.value = 0;
      input.disabled = true;
    } else {
      input.max = game.scores[i];
      input.value = "";
      input.disabled = false;
    }

    // CPU auto-fill wager
    if (game.cpuPlayers[i]) {
      const cpuMax = Math.max(0, game.scores[i]);
      input.value = Math.round(cpuMax * (0.3 + Math.random() * 0.4));
      input.disabled = true;
    }

    section.appendChild(label);
    section.appendChild(input);
    wagersContainer.appendChild(section);
  });

  document.getElementById("final-lock-wagers").onclick = async () => {
    // Submit all wagers
    for (let i = 0; i < game.players.length; i++) {
      const input = document.getElementById("final-wager-" + i);
      const maxW = Math.max(0, game.scores[i]);
      const w = Math.max(0, Math.min(parseInt(input.value) || 0, maxW));
      try {
        const r = await fetch("/api/final-wager", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player: game.players[i], wager: w }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          showUserError("Wager error for " + game.players[i] + ": " + (err.error || r.status));
          return;
        }
      } catch (err) {
        showUserError("Network error submitting wagers.");
        return;
      }
    }

    // Fetch final question
    let finalQuestion = "What is the final answer?";
    try {
      const qRes = await fetch("/api/question/final-0");
      if (qRes.ok) {
        const qData = await qRes.json();
        finalQuestion = decodeHTML(qData.question) || finalQuestion;
      }
    } catch (_) {}

    showScreen("screen-final-question");
    document.getElementById("final-q-text").textContent = finalQuestion;

    // Build answer inputs dynamically
    const answersContainer = document.getElementById("final-answers-container");
    answersContainer.innerHTML = "";
    game.players.forEach((name, i) => {
      const section = document.createElement("div");
      section.className = "final-answer-section";
      const label = document.createElement("label");
      label.textContent = name + ":";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Answer...";
      input.autocomplete = "off";
      input.id = "final-answer-" + i;

      if (game.cpuPlayers[i]) {
        input.value = "CPU guess";
        input.disabled = true;
      }

      section.appendChild(label);
      section.appendChild(input);
      answersContainer.appendChild(section);
    });

    // 30-second countdown
    let timeLeft = 30;
    let stopMusic = null;
    if (game.soundEnabled) stopMusic = SoundManager.finalTheme();

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
  document.getElementById("final-submit").disabled = true;

  try {
    let lastRes;
    for (let i = 0; i < game.players.length; i++) {
      const answer = document.getElementById("final-answer-" + i).value;
      lastRes = await fetch("/api/final-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: game.players[i], answer }),
      });
    }

    document.getElementById("final-submit").disabled = false;

    if (lastRes && lastRes.ok) {
      const data = await lastRes.json();
      if (data.results) await revealFinalResults(data.results);
    } else {
      const err = lastRes ? await lastRes.json().catch(() => ({})) : {};
      showUserError("Error submitting final answers: " + (err.error || "unknown"));
    }
  } catch (err) {
    document.getElementById("final-submit").disabled = false;
    showUserError("Network error submitting answers.");
  }
}

async function revealFinalResults(results) {
  showScreen("screen-question");
  document.getElementById("q-category").textContent = "FINAL JEOPARDY";
  document.getElementById("q-value").textContent = "";
  document.getElementById("q-whose-turn").textContent = "";
  document.getElementById("text-answer-form").classList.add("hidden");
  document.getElementById("mc-choices").classList.add("hidden");
  document.getElementById("back-to-board").classList.add("hidden");

  const qText = document.getElementById("q-text");
  const resultEl = document.getElementById("q-result");

  // Reveal each player one at a time
  for (let i = 0; i < game.players.length; i++) {
    const r = results.find(r => r.player === game.players[i]);
    if (!r) continue;

    qText.textContent = game.players[i] + " wagered $" + r.wager;
    resultEl.classList.remove("hidden");
    resultEl.className = r.correct ? "result-correct" : "result-wrong";
    resultEl.textContent = r.correct
      ? "Correct! +$" + r.wager + " → Final: $" + r.finalScore
      : "Wrong! -$" + r.wager + " → Final: $" + r.finalScore;
    if (game.soundEnabled) {
      if (r.correct) SoundManager.correct(); else SoundManager.wrong();
    }
    game.scores[i] = r.finalScore;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  showGameOver();
}

// ------------------------------------
// Game Over
// ------------------------------------
function showGameOver() {
  showScreen("screen-game-over");

  // Find winner (highest score)
  let maxScore = -Infinity;
  let winnerIdx = -1;
  let tied = false;
  game.scores.forEach((s, i) => {
    if (s > maxScore) { maxScore = s; winnerIdx = i; tied = false; }
    else if (s === maxScore) { tied = true; }
  });

  const winnerText = document.getElementById("winner-text");
  const trophy = document.getElementById("trophy");

  if (tied) {
    winnerText.textContent = "It's a Tie!";
    trophy.textContent = "\uD83E\uDD1D";
  } else {
    winnerText.textContent = game.players[winnerIdx] + " Wins!";
    trophy.textContent = "\uD83C\uDFC6";
  }

  // Build stats
  const statsEl = document.getElementById("stats-container");
  statsEl.innerHTML = "";

  for (let p = 0; p < game.players.length; p++) {
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
      "<h3>" + game.players[p] + (game.cpuPlayers[p] ? " (CPU)" : "") + "</h3>" +
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
      "<p>" + game.players[game.biggestAnswer.player] + " — $" + game.biggestAnswer.points + "</p>";
    statsEl.appendChild(bigCard);
  }

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
  const entry = {
    date: new Date().toLocaleDateString(),
    players: game.players.map((name, i) => ({ name, score: game.scores[i], cpu: game.cpuPlayers[i] })),
    winner: (() => {
      let max = -Infinity, winner = "Tie";
      let tied = false;
      game.scores.forEach((s, i) => {
        if (s > max) { max = s; winner = game.players[i]; tied = false; }
        else if (s === max) { tied = true; }
      });
      return tied ? "Tie" : winner;
    })(),
  };
  history.unshift(entry);
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
    "<th>Date</th><th>Players</th><th>Winner</th>" +
    "</tr></thead><tbody>";
  history.forEach(g => {
    // Handle both old format (player1/player2) and new format (players array)
    let playersStr;
    if (g.players) {
      playersStr = g.players.map(p => p.name + " ($" + p.score + ")").join(", ");
    } else {
      playersStr = g.player1.name + " ($" + g.player1.score + "), " + g.player2.name + " ($" + g.player2.score + ")";
    }
    html += "<tr><td>" + g.date + "</td><td>" + playersStr + "</td><td>" + g.winner + "</td></tr>";
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ------------------------------------
// Play Again
// ------------------------------------
document.getElementById("play-again-btn").addEventListener("click", () => {
  game.scores = game.players.map(() => 0);
  game.activePlayer = 0;
  game.currentRound = 1;
  game.answeredCount = 0;
  game.stats = {};
  game.players.forEach((_, i) => { game.stats[i] = { correct: 0, wrong: 0, byCategory: {} }; });
  game.biggestAnswer = { player: 0, points: 0 };
  game.board = null;
  Confetti.stop();
  showScreen("screen-lobby");
});

// ------------------------------------
// CPU Player Logic
// ------------------------------------
function hasCPU() {
  return game.cpuPlayers.some(c => c);
}

function isCPUTurn() {
  return game.cpuPlayers[game.activePlayer];
}

function checkCPUTurn() {
  if (!isCPUTurn()) return;
  setTimeout(() => cpuPickTile(), 1000);
}

function cpuPickTile() {
  const tiles = document.querySelectorAll("#board-grid .tile:not(.used)");
  if (tiles.length === 0) return;
  const pick = tiles[Math.floor(Math.random() * tiles.length)];
  pick.click();
}

function cpuAnswerQuestion() {
  const delay = 1500 + Math.random() * 2000;
  setTimeout(() => {
    if (game.answerMode === "mc") {
      const btns = [...document.querySelectorAll("#mc-choices .mc-btn:not([disabled])")];
      if (btns.length > 0) btns[Math.floor(Math.random() * btns.length)].click();
    } else {
      const input = document.getElementById("text-answer-input");
      input.value = "CPU guess";
      document.getElementById("text-answer-form").dispatchEvent(new Event("submit"));
    }
  }, delay);
}

function cpuAnswerDailyDouble() {
  setTimeout(() => {
    const wagerInput = document.getElementById("dd-wager");
    const maxWager = parseInt(wagerInput.max) || 1000;
    wagerInput.value = Math.round(maxWager * (0.3 + Math.random() * 0.4));
    document.getElementById("dd-lock-btn").click();

    setTimeout(() => {
      if (game.answerMode === "mc") {
        const btns = [...document.querySelectorAll("#dd-mc-choices .mc-btn:not([disabled])")];
        if (btns.length > 0) btns[Math.floor(Math.random() * btns.length)].click();
      } else {
        document.getElementById("dd-text-answer-input").value = "CPU guess";
        document.getElementById("dd-text-answer-form").dispatchEvent(new Event("submit"));
      }
    }, 1500);
  }, 1500);
}

function cpuContinueAfterAnswer() {
  if (!isCPUTurn() && !hasCPU()) return;
  setTimeout(() => {
    const backBtn = document.getElementById("back-to-board");
    if (backBtn && !backBtn.classList.contains("hidden")) backBtn.click();
  }, 2000);
}

function cpuContinueAfterDD() {
  if (!hasCPU()) return;
  setTimeout(() => {
    const continueBtn = document.getElementById("dd-continue-btn");
    if (continueBtn && !continueBtn.classList.contains("hidden")) continueBtn.click();
  }, 2000);
}

// ------------------------------------
// Sync scores from server response
// ------------------------------------
function syncScores(serverScores) {
  game.players.forEach((name, i) => {
    if (serverScores[name] !== undefined) game.scores[i] = serverScores[name];
  });
}

// ------------------------------------
// User-friendly error display
// ------------------------------------
function showUserError(message) {
  const existing = document.getElementById("user-error-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "user-error-toast";
  toast.className = "error-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

// ------------------------------------
// Global Event Listeners
// ------------------------------------
document.getElementById("end-game-btn").addEventListener("click", () => {
  if (confirm("End the game early?")) showGameOver();
});
document.getElementById("view-leaderboard-btn").addEventListener("click", showLeaderboard);
document.getElementById("view-leaderboard-btn-2").addEventListener("click", showLeaderboard);
document.getElementById("back-to-lobby-btn").addEventListener("click", () => showScreen("screen-lobby"));

// ------------------------------------
// Lobby: Dynamic Player List
// ------------------------------------
let playerRowCount = 0;

function addPlayerRow(defaultName, isCpu) {
  playerRowCount++;
  const num = playerRowCount;
  const list = document.getElementById("player-list");

  const row = document.createElement("div");
  row.className = "player-row";
  row.dataset.num = num;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Player " + num + " Name";
  input.autocomplete = "off";
  input.className = "player-name-input";
  if (defaultName) input.value = defaultName;

  const cpuLabel = document.createElement("label");
  cpuLabel.className = "cpu-label";
  const cpuCheck = document.createElement("input");
  cpuCheck.type = "checkbox";
  cpuCheck.className = "cpu-check";
  if (isCpu) {
    cpuCheck.checked = true;
    input.value = "CPU " + num;
    input.disabled = true;
  }
  cpuCheck.addEventListener("change", () => {
    if (cpuCheck.checked) {
      input.value = "CPU " + row.dataset.num;
      input.disabled = true;
    } else {
      input.value = "";
      input.disabled = false;
    }
  });
  cpuLabel.appendChild(cpuCheck);
  cpuLabel.appendChild(document.createTextNode(" CPU"));

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-player-btn";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    row.remove();
    updateAddButtonState();
  });

  row.appendChild(input);
  row.appendChild(cpuLabel);
  row.appendChild(removeBtn);
  list.appendChild(row);

  updateAddButtonState();
}

function updateAddButtonState() {
  const rows = document.querySelectorAll("#player-list .player-row");
  const addBtn = document.getElementById("add-player-btn");
  addBtn.style.display = rows.length >= 6 ? "none" : "block";
  // Don't allow removing below 2 players
  document.querySelectorAll(".remove-player-btn").forEach(btn => {
    btn.style.display = rows.length <= 2 ? "none" : "flex";
  });
}

// ------------------------------------
// Lobby Initialization
// ------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // Create initial 2 player rows
  addPlayerRow("", false);
  addPlayerRow("", false);

  // Add player button
  document.getElementById("add-player-btn").addEventListener("click", () => {
    const rows = document.querySelectorAll("#player-list .player-row");
    if (rows.length < 6) addPlayerRow("", false);
  });

  // Mode buttons
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      game.answerMode = btn.dataset.mode === "free" ? "free" : "mc";
    });
  });
  const defaultModeBtn = document.querySelector(".mode-btn[data-mode='mc']");
  if (defaultModeBtn) defaultModeBtn.classList.add("active");

  // Difficulty buttons
  document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      game.difficulty = btn.dataset.diff;
    });
  });
  const defaultDiffBtn = document.querySelector(".diff-btn[data-diff='medium']");
  if (defaultDiffBtn) defaultDiffBtn.classList.add("active");

  // Sound toggle
  const soundToggle = document.getElementById("sound-toggle");
  soundToggle.checked = game.soundEnabled;
  soundToggle.addEventListener("change", () => {
    game.soundEnabled = soundToggle.checked;
    SoundManager.enabled = soundToggle.checked;
  });

  // Fetch categories
  await loadCategories();

  // Start button
  document.getElementById("start-btn").addEventListener("click", startGame);
});

async function loadCategories() {
  const grid = document.getElementById("category-grid");
  grid.innerHTML = "<p class='loading-msg'>Loading categories...</p>";
  try {
    const res = await fetch("/api/categories");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const catData = await res.json();
    if (catData.error) throw new Error(catData.error);
    renderCategoryGrid(catData.trivia_categories || []);
  } catch (err) {
    console.error("Failed to load categories:", err);
    grid.innerHTML =
      "<p class='error-msg'>Failed to load categories: " + err.message + "</p>" +
      "<button id='retry-categories-btn' class='retry-btn'>Retry</button>";
    document.getElementById("retry-categories-btn").addEventListener("click", loadCategories);
  }
}

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
    card.textContent = decodeHTML(cat.name);
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
    if (selectedCategories.length >= 6) return;
    card.classList.add("selected");
    selectedCategories.push(id);
  }
  const atMax = selectedCategories.length >= 6;
  document.querySelectorAll(".category-card").forEach(c => {
    if (!c.classList.contains("selected")) c.classList.toggle("disabled", atMax);
  });
}

// ------------------------------------
// Start Game
// ------------------------------------
async function startGame() {
  // Gather players from dynamic rows
  const rows = document.querySelectorAll("#player-list .player-row");
  const players = [];
  const cpuPlayers = [];

  rows.forEach(row => {
    const input = row.querySelector(".player-name-input");
    const cpuCheck = row.querySelector(".cpu-check");
    const name = input.value.trim();
    const isCpu = cpuCheck.checked;
    if (isCpu && !name) {
      players.push("CPU " + (players.length + 1));
    } else {
      players.push(name);
    }
    cpuPlayers.push(isCpu);
  });

  // Validate
  if (players.length < 2) {
    alert("Need at least 2 players.");
    return;
  }
  if (players.some(p => !p)) {
    alert("Please enter all player names.");
    return;
  }
  if (selectedCategories.length !== 6) {
    alert("Please select exactly 6 categories.");
    return;
  }

  game.players = players;
  game.cpuPlayers = cpuPlayers;
  game.scores = players.map(() => 0);
  game.activePlayer = 0;
  game.currentRound = 1;
  game.answeredCount = 0;
  game.stats = {};
  players.forEach((_, i) => { game.stats[i] = { correct: 0, wrong: 0, byCategory: {} }; });
  game.biggestAnswer = { player: 0, points: 0 };

  showScreen("screen-loading");

  let elapsed = 0;
  const loadingTimer = setInterval(() => {
    elapsed++;
    const hint = document.querySelector("#screen-loading .loading-hint");
    if (hint) hint.textContent = "This may take up to 60 seconds (API rate limits). Elapsed: " + elapsed + "s...";
  }, 1000);

  const serverAnswerMode = game.answerMode === "free" ? "free-text" : "multiple-choice";

  try {
    const res = await fetch("/api/new-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        players,
        answerMode: serverAnswerMode,
        difficulty: game.difficulty,
        categoryIds: selectedCategories,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Server error " + res.status);
    }

    clearInterval(loadingTimer);
    const data = await res.json();
    game.board = data.board;

    document.getElementById("round-label").textContent = "Jeopardy Round";
    initPlayerDisplays();
    renderBoard(game.board);
    showScreen("screen-board");
    checkCPUTurn();
  } catch (err) {
    clearInterval(loadingTimer);
    console.error("Failed to start game:", err);
    alert("Game start error: " + err.message);
    const loadingScreen = document.getElementById("screen-loading");
    loadingScreen.innerHTML =
      "<p class='error-msg'>Failed to start game: " + err.message + "</p>" +
      "<p class='loading-hint'>The API may be rate-limited. Please wait a moment and try again.</p>" +
      "<button id='retry-start-btn' class='retry-btn'>Retry</button>" +
      "<button id='cancel-start-btn' class='retry-btn secondary'>Back to Lobby</button>";
    document.getElementById("retry-start-btn").addEventListener("click", () => {
      loadingScreen.innerHTML =
        "<p>Fetching questions...</p>" +
        "<p class='loading-hint'>This may take up to 60 seconds (API rate limits apply).</p>" +
        "<div class='spinner'></div>";
      startGame();
    });
    document.getElementById("cancel-start-btn").addEventListener("click", () => {
      loadingScreen.innerHTML =
        "<p>Fetching questions...</p>" +
        "<p class='loading-hint'>This may take up to 60 seconds (API rate limits apply).</p>" +
        "<div class='spinner'></div>";
      showScreen("screen-lobby");
    });
  }
}
