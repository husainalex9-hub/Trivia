# Trivia Night — Massive Upgrade Design

## Overview

Upgrade the existing 2-player Jeopardy-style trivia game from a single-round hardcoded experience to a full Classic Jeopardy format with API-sourced questions, vibrant visuals, sound effects, and persistent leaderboards.

## Game Flow

1. **Lobby** — player names, answer mode (Free Text / Multiple Choice), difficulty (Easy/Medium/Hard), category selection, sound toggle
2. **Loading** — server fetches 61 questions from Open Trivia DB (30 + 30 + 1)
3. **Round 1** — 6 categories, $200-$1000, 1 hidden Daily Double
4. **Transition** — "Double Jeopardy" wipe animation
5. **Round 2 (Double Jeopardy)** — 6 new categories, $400-$2000, 2 hidden Daily Doubles
6. **Final Jeopardy** — category reveal → wagers → question → answers → dramatic reveal
7. **Game Over** — stats, confetti, leaderboard update

## Architecture

Server-rendered approach: Express manages all game state, answers stay server-side (no cheating via DevTools).

### Game State (Server)

```
GameState {
  players: [{ name, score }]
  currentRound: 1 | 2 | "final"
  answerMode: "free-text" | "multiple-choice"
  difficulty: "easy" | "medium" | "hard"
  boards: {
    round1: { categories[], dailyDoublePosition },
    round2: { categories[], dailyDoublePositions[] }
  }
  finalJeopardy: { category, question, wagers{}, answers{} }
  answeredQuestions: Set
  activePlayer: 1 | 2
}
```

### API Endpoints

```
POST /api/new-game        — create game, fetch questions, return game ID
GET  /api/board/:round    — category names + values (no answers)
GET  /api/question/:id    — specific question (no answer)
POST /api/answer          — submit answer, return correct/wrong + points
POST /api/daily-double    — submit wager + answer for daily double
POST /api/final-wager     — submit final jeopardy wager
POST /api/final-answer    — submit final jeopardy answer
GET  /api/final-results   — both players' final results
GET  /api/categories      — proxy available categories from Open Trivia DB
```

## API Integration

- Source: Open Trivia Database (`https://opentdb.com/api.php`)
- All questions fetched at game start (61 total) to avoid mid-game delays
- Questions include 1 correct + 3 incorrect answers

### Answer Matching

**Free Text mode:**
- Lowercase, trim whitespace, strip articles ("the", "a", "an")
- Levenshtein distance with ~20% character tolerance
- Substring check for multi-word answers (e.g. "Berlin" matches "Berlin Wall")

**Multiple Choice mode:**
- Show 4 shuffled options, exact match against correct answer

### Daily Doubles

- Wager screen appears before question
- Wager range: $0 to current score (minimum $1000 if score is below that)
- Correct = gain wager, wrong = lose wager

### Final Jeopardy

- Category revealed first
- Both players wager simultaneously
- 30-second timer for answering
- Results revealed one at a time for drama

## Visual Design

**Vibrant Gradient theme:**
- Base: deep purple (`#1b0a3c` → `#2d1b69`)
- Column gradients:
  1. Purple-blue (`#667eea` → `#764ba2`)
  2. Pink-red (`#f093fb` → `#f5576c`)
  3. Blue-cyan (`#4facfe` → `#00f2fe`)
  4. Green-teal (`#43e97b` → `#38f9d7`)
  5. Orange-yellow (`#f6d365` → `#fda085`)
  6. Indigo-purple (`#a18cd1` → `#fbc2eb`)
- Rainbow gradient title text
- Used tiles fade to dark with glass-morph effect

**Animations:**
- Tile flip on question select
- Slide-in question modal
- Score counting animation on point change
- Board wipe transition between rounds
- Golden sparkle burst for Daily Double
- Pulse glow on active player

**Sound effects (toggleable):**
- Correct answer chime
- Wrong answer buzzer
- Daily Double dramatic sting
- Final Jeopardy countdown music
- Game over fanfare

## End Game

- Confetti canvas animation for winner
- Trophy graphic with winner's name
- Stats: accuracy %, points per round, best/worst category, biggest single answer
- Leaderboard stored in localStorage (last 20 games: date, names, scores, winner)
- Leaderboard accessible from lobby

## File Structure

```
trivia-game/
├── server.js          — Express server, game state, API proxy, all endpoints
├── package.json
├── static/
│   ├── index.html     — Single page, all screens as show/hide divs
│   ├── style.css      — Vibrant gradient theme, animations, all screens
│   ├── game.js        — Game logic: lobby, board, rounds, final, end screen
│   ├── confetti.js    — Canvas confetti animation (~50 lines)
│   └── sounds/        — MP3 audio files
```

Single HTML page, no build system, no external libraries.
