import express from "express";
import fs from "fs";
import cors from "cors";
import path from "path";

const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.resolve(); // Абсолютный путь к корню проекта

const filePathTests = path.join(__dirname, "tests.json");
const filePathAnswers = path.join(__dirname, "answers.json");

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "dist"))); // Раздача React/Vite

// ✅ Функция безопасного чтения JSON
const readData = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content) || [];
  } catch (error) {
    console.error("Ошибка чтения файла:", error);
    return [];
  }
};

// ✅ Функция безопасной записи JSON
const writeData = (data, filePath) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Ошибка записи файла:", error);
  }
};

// ✅ API для тестов
app.get("/api/tests", (req, res) => res.json(readData(filePathTests)));
app.post("/api/tests", (req, res) => {
  const data = readData(filePathTests);
  const newTest = { id: Date.now(), ...req.body };
  data.push(newTest);
  writeData(data, filePathTests);
  res.status(201).json(newTest);
});
app.get("/api/tests/:id", (req, res) => {
  const test = readData(filePathTests).find((t) => t.id === Number(req.params.id));
  test ? res.json(test) : res.status(404).json({ error: "Тест не найден" });
});
app.delete("/api/tests/:id", (req, res) => {
  let data = readData(filePathTests);
  const newData = data.filter((test) => test.id !== Number(req.params.id));
  writeData(newData, filePathTests);
  res.json({ message: "Тест удален" });
});

// ✅ Отправка ответов
app.post("/submit", (req, res) => {
  const answerData = req.body;
  const answers = readData(filePathAnswers);
  answers.push(answerData);
  writeData(answers, filePathAnswers);

  const tests = readData(filePathTests);
  const testIndex = tests.findIndex((t) => t.id === answerData["id-test"]);
  if (testIndex === -1) return res.status(404).json({ error: "Тест не найден" });

  tests[testIndex].progress = (tests[testIndex].progress || 0) + 1;
  writeData(tests, filePathTests);
  res.status(200).json({ message: "Прогресс обновлён!", updatedTest: tests[testIndex] });
});

// ✅ Раздача React/Vite и поддержка динамических маршрутов
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// Запуск сервера
app.listen(PORT, () => console.log(`✅ Сервер работает на порту ${PORT}`));
