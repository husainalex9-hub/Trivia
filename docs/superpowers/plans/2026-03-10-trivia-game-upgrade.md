# Trivia Night Massive Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the 2-player Jeopardy trivia game to a full Classic Jeopardy experience with API questions, vibrant visuals, Daily Doubles, Final Jeopardy, sound effects, confetti, and persistent leaderboards.

**Architecture:** Server-rendered approach — Express manages all game state and answers. Frontend is a single-page vanilla HTML/CSS/JS app with show/hide screens. Questions sourced from Open Trivia Database API.

**Tech Stack:** Node.js, Express 5, Open Trivia DB API, vanilla HTML/CSS/JS, Web Audio API for sounds, Canvas for confetti.

**Spec:** `docs/superpowers/specs/2026-03-10-trivia-game-upgrade-design.md`

---

## File Map

| File | Responsibility | Action |
|---|---|---|
| `server.js` | Express server, game state, all API endpoints, answer matching, trivia API proxy | Rewrite |
| `questions.js` | Old hardcoded questions | Delete |
| `static/index.html` | Single page with all screens (lobby, board, wager, final, game-over, leaderboard) | Rewrite |
| `static/style.css` | Vibrant gradient theme, animations, all screen styles | Rewrite |
| `static/game.js` | All client game logic: lobby, board rendering, rounds, Daily Double, Final Jeopardy, game-over, leaderboard | Rewrite |
| `static/confetti.js` | Canvas confetti animation | Create |
| `static/sounds.js` | Web Audio API sound generation (no MP3 files needed) | Create |

---

## Chunk 1: Server Backend

### Task 1: Rewrite server.js — Game state and API integration

**Files:**
- Rewrite: `server.js`
- Delete: `questions.js`

- [ ] **Step 1: Delete questions.js**

This file is replaced by the API. Remove it.

```bash
rm questions.js
```

- [ ] **Step 2: Write the new server.js with game state management**

Rewrite `server.js` with:
- In-memory game state object (players, rounds, boards, scores, answeredQuestions, dailyDoubles, finalJeopardy)
- `GET /api/categories` — fetch and proxy category list from `https://opentdb.com/api_category.php`
- `POST /api/new-game` — accepts `{ players: [name1, name2], answerMode, difficulty, categoryIds: [6 ids] }`. Fetches 61 questions from Open Trivia DB (5 per category × 6 categories × 2 rounds + 1 final). Assigns point values ($200-$1000 for round 1, $400-$2000 for round 2). Randomly places Daily Doubles (1 in round 1, 2 in round 2). Stores game state. Returns `{ gameId, board: round1 board (category names + values only) }`.
- `GET /api/board/:round` — returns category names and question values for the given round (no answers)
- `GET /api/question/:questionId` — returns question text. If `answerMode` is `multiple-choice`, also returns shuffled choices. Never returns the correct answer.
- `POST /api/answer` — accepts `{ questionId, answer, player }`. Checks answer (fuzzy match for free-text, exact for multiple-choice). Updates score (+value or -value). Returns `{ correct, correctAnswer, pointChange, scores }`. Marks question as answered.
- `POST /api/daily-double` — accepts `{ questionId, wager, answer, player }`. Validates wager (0 to max(score, 1000)). Returns same shape as `/api/answer` but with wager-based points.
- `POST /api/final-wager` — accepts `{ player, wager }`. Validates wager (0 to player's score). Stores wager. Returns `{ success }`.
- `POST /api/final-answer` — accepts `{ player, answer }`. Stores answer. If both players have answered, evaluates both and returns `{ results: [{ player, answer, correct, wager, pointChange, finalScore }] }`. If only one has answered, returns `{ waiting: true }`.
- `GET /api/game-state` — returns current round, scores, active player, which questions are answered (for reconnect/refresh resilience)

**Fuzzy answer matching logic** (helper function `checkAnswer(given, correct)`):
1. Lowercase and trim both strings
2. Strip leading articles: "the ", "a ", "an "
3. Decode HTML entities (API returns `&quot;` etc.)
4. Exact match → correct
5. Given string contained in correct string or vice versa → correct (handles "Berlin" matching "Berlin Wall")
6. Levenshtein distance ≤ 20% of correct answer length → correct

- [ ] **Step 3: Verify the server starts and categories endpoint works**

```bash
node server.js &
curl http://localhost:3000/api/categories
```

Expected: JSON array of trivia categories from Open Trivia DB.

- [ ] **Step 4: Verify new-game endpoint fetches questions**

```bash
curl -X POST http://localhost:3000/api/new-game \
  -H "Content-Type: application/json" \
  -d '{"players":["Alice","Bob"],"answerMode":"multiple-choice","difficulty":"medium","categoryIds":[9,17,18,22,23,27]}'
```

Expected: JSON with `gameId` and `board` containing 6 categories with 5 questions each (values only).

- [ ] **Step 5: Verify question and answer flow**

```bash
# Get a question
curl http://localhost:3000/api/question/0

# Submit an answer
curl -X POST http://localhost:3000/api/answer \
  -H "Content-Type: application/json" \
  -d '{"questionId":0,"answer":"test","player":1}'
```

Expected: Question returns question text + choices (in MC mode). Answer returns correct/wrong + score update.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: rewrite server with game state, API integration, and all endpoints"
```

---

## Chunk 2: HTML Structure & Lobby Screen

### Task 2: Rewrite index.html with all screen containers

**Files:**
- Rewrite: `static/index.html`

- [ ] **Step 1: Write new index.html**

Single page with these screen divs (all hidden except lobby on load):

1. **`#screen-lobby`** — Game setup:
   - Title: "TRIVIA NIGHT" with subtitle
   - Player 1 name input, Player 2 name input
   - Answer mode toggle: "Free Text" / "Multiple Choice" (two buttons, one active)
   - Difficulty selector: Easy / Medium / Hard (three buttons, one active)
   - Sound toggle checkbox
   - Category grid: checkboxes loaded from API, must select exactly 6
   - "Start Game" button
   - "View Leaderboard" button

2. **`#screen-loading`** — "Fetching questions..." with a spinner animation

3. **`#screen-board`** — Game board:
   - Header with round label ("Round 1" / "Double Jeopardy"), player names + scores, active player indicator
   - 6×5 grid board (same as current but will be restyled)

4. **`#screen-question`** — Question modal (overlays board):
   - Category label, point value
   - Question text
   - Free text input OR 4 multiple-choice buttons (based on mode)
   - Result display (correct/wrong)
   - "Back to Board" button

5. **`#screen-daily-double`** — Daily Double screen:
   - "DAILY DOUBLE!" title with animation hook
   - Current score display
   - Wager input (number) with min/max labels
   - "Lock In Wager" button
   - Then transitions to question display

6. **`#screen-transition`** — Round transition:
   - "DOUBLE JEOPARDY!" text, large and centered

7. **`#screen-final-category`** — Final Jeopardy category reveal:
   - "FINAL JEOPARDY" title
   - Category name revealed
   - Wager inputs for both players
   - "Lock In Wagers" button

8. **`#screen-final-question`** — Final Jeopardy question:
   - Question text
   - Answer input(s) — both players answer
   - 30-second countdown timer display
   - "Submit" button

9. **`#screen-game-over`** — Game over:
   - Winner announcement with trophy area
   - Stats table (accuracy, best category, etc.)
   - Canvas element for confetti (id="confetti-canvas")
   - "Play Again" and "View Leaderboard" buttons

10. **`#screen-leaderboard`** — Leaderboard:
    - Table of past games
    - "Back to Lobby" button

Script tags: `sounds.js`, `confetti.js`, `game.js` (in that order).

- [ ] **Step 2: Verify the page loads and shows the lobby**

Start server, open browser to `http://localhost:3000`. Lobby screen should be visible with all inputs. Other screens should be hidden.

- [ ] **Step 3: Commit**

```bash
git add static/index.html
git commit -m "feat: rewrite HTML with all game screens"
```

---

## Chunk 3: Vibrant Gradient Theme & Animations

### Task 3: Rewrite style.css with vibrant gradient theme

**Files:**
- Rewrite: `static/style.css`

- [ ] **Step 1: Write the complete new style.css**

Key styling sections:

**Base:**
- Body background: `linear-gradient(135deg, #1b0a3c, #2d1b69)`
- Font: system sans-serif stack
- All text white

**Lobby screen:**
- Centered card layout, max-width 700px
- Rainbow gradient title text (background-clip trick)
- Inputs: dark background (`rgba(255,255,255,0.1)`), white text, rounded
- Toggle buttons: outlined by default, filled gradient when active
- Category grid: 3-column grid of checkbox cards
- Start button: large, gradient background, hover glow

**Board screen:**
- Header bar with round label, player scores
- Active player: pulsing glow animation (`@keyframes pulse-glow`)
- 6-column grid
- Category headers: semi-transparent dark, white text
- Tiles get column-based gradient backgrounds using CSS custom properties:
  - `.tile[data-col="0"]`: `linear-gradient(135deg, #667eea, #764ba2)`
  - `.tile[data-col="1"]`: `linear-gradient(135deg, #f093fb, #f5576c)`
  - `.tile[data-col="2"]`: `linear-gradient(135deg, #4facfe, #00f2fe)`
  - `.tile[data-col="3"]`: `linear-gradient(135deg, #43e97b, #38f9d7)`
  - `.tile[data-col="4"]`: `linear-gradient(135deg, #f6d365, #fda085)`
  - `.tile[data-col="5"]`: `linear-gradient(135deg, #a18cd1, #fbc2eb)`
- Used tiles: `background: rgba(0,0,0,0.3)`, `backdrop-filter: blur(4px)`, muted text
- Tile hover: `transform: scale(1.05)`, box-shadow glow matching column color

**Question screen / modal overlay:**
- Same overlay approach as current but with slide-in animation (`@keyframes slide-up`)
- Multiple choice buttons: 2×2 grid, gradient borders, hover effects
- Timer bar: animated width transition

**Daily Double screen:**
- Full-screen overlay, golden sparkle background
- Large "DAILY DOUBLE!" text with text-shadow glow
- Wager input: large, centered

**Transition screen:**
- Full screen, centered text
- Wipe animation (`@keyframes wipe-in`)

**Final Jeopardy screens:**
- Dramatic dark background
- Timer: circular countdown or horizontal bar

**Game Over screen:**
- Winner name in large gradient text
- Stats in a card grid
- Confetti canvas: position fixed, full viewport, pointer-events none

**Leaderboard:**
- Table with alternating row colors
- Gradient header row

**Animations defined:**
- `@keyframes pulse-glow` — active player indicator
- `@keyframes slide-up` — modal entrance
- `@keyframes wipe-in` — round transition
- `@keyframes sparkle` — daily double
- `@keyframes count-up` — score change (scale bounce)
- `@keyframes fade-in` — general screen transitions
- `.screen` class: `display: none` by default
- `.screen.active` class: `display: block` with fade-in

- [ ] **Step 2: Verify visual theme**

Refresh browser. Lobby should show vibrant purple gradient background, rainbow title, styled inputs.

- [ ] **Step 3: Commit**

```bash
git add static/style.css
git commit -m "feat: vibrant gradient theme with animations"
```

---

## Chunk 4: Sound Effects

### Task 4: Create sounds.js with Web Audio API

**Files:**
- Create: `static/sounds.js`

- [ ] **Step 1: Write sounds.js**

Uses Web Audio API to generate sounds programmatically (no MP3 files needed):

```javascript
// Sound manager using Web Audio API
const SoundManager = {
  enabled: true,
  ctx: null,

  init() { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },

  // Helper to play a tone
  playTone(freq, duration, type = "sine", volume = 0.3) { ... },

  // Correct answer: ascending two-note chime (C5 → E5)
  correct() { ... },

  // Wrong answer: low buzz (150Hz sawtooth, 0.4s)
  wrong() { ... },

  // Daily Double: dramatic rising sting (C4 → E4 → G4 → C5, fast)
  dailyDouble() { ... },

  // Final Jeopardy: "think music" — repeating pattern for 30 seconds
  // Returns a stop function so it can be cancelled
  finalTheme() { ... returns stopFn },

  // Game over fanfare: triumphant ascending arpeggio
  fanfare() { ... },
};
```

Each sound is a simple synthesized tone sequence — no external audio files. The `enabled` flag is controlled by the lobby's sound toggle.

- [ ] **Step 2: Verify sounds play**

Open browser console, run:
```javascript
SoundManager.init();
SoundManager.correct();
```

Expected: hear a short ascending chime.

- [ ] **Step 3: Commit**

```bash
git add static/sounds.js
git commit -m "feat: Web Audio API sound effects"
```

---

## Chunk 5: Confetti Animation

### Task 5: Create confetti.js

**Files:**
- Create: `static/confetti.js`

- [ ] **Step 1: Write confetti.js**

Canvas-based confetti animation (~50 lines):

```javascript
const Confetti = {
  canvas: null,
  ctx: null,
  particles: [],
  running: false,

  // Initialize with canvas element
  init(canvasEl) { ... },

  // Launch confetti burst
  start() {
    // Create ~150 particles with random:
    // - x position (spread across top)
    // - y position (start above viewport)
    // - color (from vibrant palette: #667eea, #f093fb, #4facfe, #43e97b, #f6d365, #a18cd1, #ffd700)
    // - size (5-12px rectangles)
    // - velocity (downward + slight horizontal drift)
    // - rotation and spin speed
    // Animate with requestAnimationFrame, remove particles that fall off screen
    // Stop after all particles gone or 5 seconds
  },

  stop() { ... },
};
```

- [ ] **Step 2: Verify confetti renders**

Add a temporary button to trigger confetti, confirm colorful particles fall from top of screen.

- [ ] **Step 3: Commit**

```bash
git add static/confetti.js
git commit -m "feat: canvas confetti animation"
```

---

## Chunk 6: Game Logic — Lobby & Board

### Task 6: Rewrite game.js — Lobby, loading, and board rendering

**Files:**
- Rewrite: `static/game.js`

- [ ] **Step 1: Write screen management and lobby logic**

```javascript
// Screen management
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// Game state (client-side mirror)
let game = {
  players: [],
  scores: [0, 0],
  activePlayer: 0,
  answerMode: "multiple-choice",
  difficulty: "medium",
  currentRound: 1,
  soundEnabled: true,
  stats: { /* per-player: correct, wrong, byCategory */ },
};
```

Lobby logic:
- On page load: fetch `/api/categories`, render as checkbox grid
- Enforce exactly 6 categories selected (disable others when 6 are checked)
- Answer mode and difficulty toggle buttons
- "Start Game" validates inputs → POST `/api/new-game` → show loading screen → on response, render board → show board screen
- "View Leaderboard" shows leaderboard screen, loads from localStorage

- [ ] **Step 2: Write board rendering logic**

```javascript
function renderBoard(boardData, round) {
  // Clear board container
  // Set round label ("Round 1" or "Double Jeopardy")
  // Render category headers
  // Render tiles row by row (5 rows × 6 columns)
  // Each tile gets data-col attribute for CSS gradient
  // Each tile gets data-question-id for API calls
  // Click handler: calls openQuestion(questionId, value, col)
}
```

- [ ] **Step 3: Write player score display and active player switching**

Header shows both player names and scores. Active player has pulse-glow class. After each answer, auto-switch active player (or let the correct player keep control, like real Jeopardy — if correct, same player picks next; if wrong, other player becomes active).

- [ ] **Step 4: Verify lobby → board flow**

Open browser, enter names, select options, pick 6 categories, click Start. Should see loading screen briefly, then board with colorful gradient tiles.

- [ ] **Step 5: Commit**

```bash
git add static/game.js
git commit -m "feat: lobby, loading, and board rendering"
```

---

## Chunk 7: Game Logic — Questions, Daily Doubles, Round Transitions

### Task 7: Question flow, Daily Double, and round transitions

**Files:**
- Modify: `static/game.js`

- [ ] **Step 1: Write question opening logic**

```javascript
async function openQuestion(questionId, value, col) {
  const res = await fetch(`/api/question/${questionId}`);
  const data = await res.json();

  if (data.isDailyDouble) {
    // Show Daily Double screen
    showDailyDouble(questionId, data, value);
    return;
  }

  // Show question screen
  // If free-text mode: show text input
  // If multiple-choice mode: show 4 buttons with shuffled choices
  // Start any per-question timer if desired
}
```

- [ ] **Step 2: Write answer submission logic**

```javascript
async function submitAnswer(questionId, answer) {
  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, answer, player: game.activePlayer }),
  });
  const data = await res.json();

  // Update scores with counting animation
  // Play correct/wrong sound
  // Show result
  // Update stats tracking
  // Mark tile as used
  // Switch active player (if wrong) or keep (if correct)
  // Check if all questions answered → trigger round transition or final
}
```

- [ ] **Step 3: Write Daily Double flow**

```javascript
function showDailyDouble(questionId, data, value) {
  SoundManager.dailyDouble();
  showScreen("screen-daily-double");
  // Show current player's score
  // Set wager input min=0, max=Math.max(score, 1000)
  // On "Lock In Wager": show the question within the daily double screen
  // On answer submit: POST /api/daily-double with wager + answer
  // Show result, return to board
}
```

- [ ] **Step 4: Write round transition logic**

```javascript
function checkRoundComplete() {
  // Count answered questions for current round
  // If all 30 answered:
  //   If round 1: show transition screen "DOUBLE JEOPARDY!", wait 3s,
  //               fetch round 2 board, render, show board
  //   If round 2: start Final Jeopardy flow
}
```

- [ ] **Step 5: Verify full Round 1 playthrough**

Play through several questions. Verify:
- Questions display correctly (free text or MC based on mode)
- Correct/wrong scoring works
- Used tiles gray out
- Active player switches on wrong answer
- Daily Double triggers wager screen (test by noting which tile is the DD from server logs)

- [ ] **Step 6: Commit**

```bash
git add static/game.js
git commit -m "feat: question flow, daily doubles, round transitions"
```

---

## Chunk 8: Final Jeopardy & Game Over

### Task 8: Final Jeopardy flow, game-over stats, confetti, leaderboard

**Files:**
- Modify: `static/game.js`

- [ ] **Step 1: Write Final Jeopardy flow**

```javascript
async function startFinalJeopardy() {
  showScreen("screen-final-category");
  // Display "FINAL JEOPARDY" + category name
  // Show wager inputs for both players (0 to their current score)
  // On "Lock In Wagers": POST /api/final-wager for each player
  // Show question screen with 30-second timer
  // Start SoundManager.finalTheme() — returns stop function
  // Both players type answers (can use two input fields, or sequential)
  // On submit: POST /api/final-answer for each player
  // Stop the theme music
  // Show results one at a time (player 1 reveal, pause, player 2 reveal)
  // Then transition to game over
}
```

- [ ] **Step 2: Write game-over screen logic**

```javascript
function showGameOver(results) {
  showScreen("screen-game-over");

  // Determine winner (or tie)
  // Display winner name + trophy
  // Calculate stats:
  //   - Each player's accuracy (correct / total answered)
  //   - Points earned per round
  //   - Best category (highest % correct)
  //   - Worst category (lowest % correct)
  //   - Biggest single answer (highest point gain in one question)
  // Render stats table

  // Trigger confetti for winner
  Confetti.init(document.getElementById("confetti-canvas"));
  Confetti.start();

  // Play fanfare
  SoundManager.fanfare();

  // Save to leaderboard
  saveToLeaderboard(results);
}
```

- [ ] **Step 3: Write leaderboard logic**

```javascript
function saveToLeaderboard(results) {
  const history = JSON.parse(localStorage.getItem("triviaLeaderboard") || "[]");
  history.unshift({
    date: new Date().toLocaleDateString(),
    player1: { name: game.players[0], score: game.scores[0] },
    player2: { name: game.players[1], score: game.scores[1] },
    winner: game.scores[0] > game.scores[1] ? game.players[0]
           : game.scores[1] > game.scores[0] ? game.players[1] : "Tie",
  });
  // Keep only last 20
  if (history.length > 20) history.length = 20;
  localStorage.setItem("triviaLeaderboard", JSON.stringify(history));
}

function showLeaderboard() {
  showScreen("screen-leaderboard");
  const history = JSON.parse(localStorage.getItem("triviaLeaderboard") || "[]");
  // Render table rows: date, player 1 name+score, player 2 name+score, winner
  // "Back to Lobby" button → showScreen("screen-lobby")
}
```

- [ ] **Step 4: Write "Play Again" handler**

Reset client game state, show lobby screen. Server state is already per-game so a new POST to `/api/new-game` creates fresh state.

- [ ] **Step 5: Verify full game flow end-to-end**

Play a complete game: Lobby → Round 1 (answer all 30) → Double Jeopardy (answer all 30) → Final Jeopardy → Game Over. Verify:
- Round transition animation shows between rounds
- Final Jeopardy: wagers, timer, both players answer, dramatic reveal
- Game over: confetti, fanfare, correct stats, winner shown
- Leaderboard: game saved, viewable from lobby
- "Play Again" returns to lobby cleanly

- [ ] **Step 6: Commit**

```bash
git add static/game.js
git commit -m "feat: final jeopardy, game over, stats, confetti, leaderboard"
```

---

## Chunk 9: Polish & Bug Fixes

### Task 9: Score animations, edge cases, final polish

**Files:**
- Modify: `static/game.js`
- Modify: `static/style.css`

- [ ] **Step 1: Add score counting animation**

When score changes, animate the number counting up/down over 500ms using `requestAnimationFrame`. Add a scale-bounce CSS class that triggers on change.

- [ ] **Step 2: Handle API edge cases**

- If Open Trivia DB rate-limits or fails: show error on loading screen with "Retry" button
- If a category doesn't have enough questions for the requested difficulty: fall back to "any" difficulty for remaining questions
- HTML entity decoding: the API returns HTML entities (`&quot;`, `&#039;`, `&amp;` etc.) — decode these before displaying questions and answers

- [ ] **Step 3: Handle game edge cases**

- Negative scores in Final Jeopardy: players with $0 or negative can't wager (auto-wager $0)
- Tie game: show "It's a tie!" instead of a winner
- Browser refresh mid-game: `GET /api/game-state` to restore board state

- [ ] **Step 4: Final visual polish pass**

- Ensure all screens have smooth fade transitions
- Verify mobile responsiveness (board tiles should shrink gracefully)
- Check that all gradient colors render correctly
- Daily Double sparkle animation plays before wager screen

- [ ] **Step 5: Full end-to-end playtest**

Play 2 complete games with different settings (one free-text, one multiple-choice, different difficulties). Verify everything works smoothly.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: score animations, edge case handling, final polish"
```
