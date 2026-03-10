const express = require("express");
const categories = require("./questions");

const app = express();
const PORT = 3000;

app.use(express.static("static"));
app.use(express.json());

// Serve the game board data
app.get("/api/board", (req, res) => {
  const board = categories.map((cat) => ({
    name: cat.name,
    questions: cat.questions.map((q) => ({ value: q.value })),
  }));
  res.json(board);
});

// Get a specific question
app.get("/api/question/:category/:value", (req, res) => {
  const cat = categories.find((c) => c.name === req.params.category);
  if (!cat) return res.status(404).json({ error: "Category not found" });

  const q = cat.questions.find((q) => q.value === parseInt(req.params.value));
  if (!q) return res.status(404).json({ error: "Question not found" });

  res.json({ question: q.question, value: q.value, category: cat.name });
});

// Check an answer
app.post("/api/answer", (req, res) => {
  const { category, value, answer } = req.body;
  const cat = categories.find((c) => c.name === category);
  if (!cat) return res.status(404).json({ error: "Category not found" });

  const q = cat.questions.find((q) => q.value === value);
  if (!q) return res.status(404).json({ error: "Question not found" });

  const correct =
    q.answer.toLowerCase().trim() === (answer || "").toLowerCase().trim();
  res.json({ correct, correctAnswer: q.answer, points: correct ? q.value : 0 });
});

app.listen(PORT, () => {
  console.log(`Trivia game running at http://localhost:${PORT}`);
});
