let scores = { 1: 0, 2: 0 };
let activePlayer = 1;
let currentQuestion = null;

const boardEl = document.getElementById("board");
const modal = document.getElementById("modal");
const modalCategory = document.getElementById("modal-category");
const modalValue = document.getElementById("modal-value");
const modalQuestion = document.getElementById("modal-question");
const answerForm = document.getElementById("answer-form");
const answerInput = document.getElementById("answer-input");
const resultEl = document.getElementById("result");
const closeBtn = document.getElementById("close-modal");
const score1El = document.getElementById("score1");
const score2El = document.getElementById("score2");
const p1El = document.getElementById("p1");
const p2El = document.getElementById("p2");

function switchPlayer(num) {
  activePlayer = num;
  p1El.classList.toggle("active", num === 1);
  p2El.classList.toggle("active", num === 2);
}

function updateScores() {
  score1El.textContent = scores[1];
  score2El.textContent = scores[2];
}

// Load the board
async function loadBoard() {
  const res = await fetch("/api/board");
  const categories = await res.json();

  // Render category headers
  categories.forEach((cat) => {
    const header = document.createElement("div");
    header.className = "category-header";
    header.textContent = cat.name;
    boardEl.appendChild(header);
  });

  // Render question tiles row by row (5 rows)
  for (let row = 0; row < 5; row++) {
    categories.forEach((cat) => {
      const q = cat.questions[row];
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.textContent = `$${q.value}`;
      tile.dataset.category = cat.name;
      tile.dataset.value = q.value;
      tile.addEventListener("click", () => openQuestion(tile, cat.name, q.value));
      boardEl.appendChild(tile);
    });
  }
}

// Open a question
async function openQuestion(tile, category, value) {
  if (tile.classList.contains("used")) return;

  const res = await fetch(`/api/question/${encodeURIComponent(category)}/${value}`);
  const data = await res.json();

  currentQuestion = { category, value, tile };
  modalCategory.textContent = category;
  modalValue.textContent = `$${value}`;
  modalQuestion.textContent = data.question;

  // Reset modal state
  answerForm.classList.remove("hidden");
  resultEl.classList.add("hidden");
  resultEl.className = "result hidden";
  closeBtn.classList.add("hidden");
  answerInput.value = "";

  modal.classList.remove("hidden");
  setTimeout(() => answerInput.focus(), 100);
}

// Submit answer
answerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentQuestion) return;

  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: currentQuestion.category,
      value: currentQuestion.value,
      answer: answerInput.value,
    }),
  });

  const data = await res.json();

  // Show result
  answerForm.classList.add("hidden");
  resultEl.classList.remove("hidden");

  if (data.correct) {
    scores[activePlayer] += currentQuestion.value;
    resultEl.className = "result correct";
    resultEl.textContent = `Correct! P${activePlayer} +$${currentQuestion.value}`;
  } else {
    scores[activePlayer] -= currentQuestion.value;
    resultEl.className = "result wrong";
    resultEl.textContent = `Wrong! P${activePlayer} -$${currentQuestion.value}. Answer: ${data.correctAnswer}`;
  }
  updateScores();

  closeBtn.classList.remove("hidden");
  currentQuestion.tile.classList.add("used");
});

// Close modal
closeBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
  currentQuestion = null;
});

// Close modal on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) {
    // Only allow closing if result is shown (question was answered)
    if (!resultEl.classList.contains("hidden")) {
      modal.classList.add("hidden");
      currentQuestion = null;
    }
  }
});

loadBoard();
