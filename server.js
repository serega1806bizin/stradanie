import express from 'express';
import fs from 'fs';
import cors from 'cors';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 8080;

const filePathTests = path.resolve('tests.json'); // Абсолютный путь
const filePathAnswers = path.resolve('answers.json'); // Абсолютный путь

app.use(cors());
app.use(express.json());

const calculateScore = (test, studentAnswers) => {
  let totalScore = 0;

  console.log(`📌 Рассчитываем баллы для студента: ${studentAnswers.student}`);
  console.log("🔍 Ответы студента:", studentAnswers.answers);

  test.questions.forEach(question => {
    const studentAnswer = studentAnswers.answers.find(ans => Number(ans["question-id"]) === Number(question.id));

    if (!studentAnswer) {
      console.log(`🚫 Вопрос ${question.id} (${question.text}) - ❌ ответа нет!`);
      return;
    }

    let earnedPoints = 0;
    const maxPoints = question.points;

    console.log(`\n🔎 Проверяем вопрос: ${question.text} (Тип: ${question.type})`);
    console.log(`✅ Правильный ответ:`, question.answer);
    console.log(`📝 Ответ студента:`, studentAnswer.answer);

    switch (question.type) {
      case "text":
        if (studentAnswer.answer.trim().toLowerCase() === question.answer.trim().toLowerCase()) {
          earnedPoints = maxPoints;
        }
        break;

      case "number":
        if (Number(studentAnswer.answer) === Number(question.answer)) {
          earnedPoints = maxPoints;
        }
        break;

      case "list-num":
        if (question.answer.consistencyImportant) {
          let correctCount = 0;
          question.answer.massiv.forEach((num, i) => {
            if (studentAnswer.answer[i] === num) correctCount++;
          });
          earnedPoints = (correctCount / question.answer.massiv.length) * maxPoints;
        } else {
          const correctSet = new Set(question.answer.massiv);
          const studentSet = new Set(studentAnswer.answer);
          const correctCount = [...studentSet].filter(num => correctSet.has(num)).length;
          earnedPoints = (correctCount / question.answer.massiv.length) * maxPoints;
        }
        break;

      case "matrix":
        const correctMatrix = JSON.stringify(question.answer);
        const studentMatrix = JSON.stringify(studentAnswer.answer.answer);
        if (correctMatrix === studentMatrix) {
          earnedPoints = maxPoints;
        } else {
          let correctCount = 0;
          const totalElements = question.answer.flat().length;
          question.answer.forEach((row, i) => {
            row.forEach((num, j) => {
              if (studentAnswer.answer.answer[i] && studentAnswer.answer.answer[i][j] === num) {
                correctCount++;
              }
            });
          });
          earnedPoints = (correctCount / totalElements) * maxPoints;
        }
        break;

      case "variants":
        if (JSON.stringify(studentAnswer.answer) === JSON.stringify(question.answer.correct)) {
          earnedPoints = maxPoints;
        }
        break;

      default:
        console.warn(`⚠️ Неизвестный тип вопроса: ${question.type}`);
    }

    totalScore += Math.round(earnedPoints);
  });

  console.log(`✅ Итоговый балл студента ${studentAnswers.student}: ${totalScore}`);
  return totalScore;
};


// Функция безопасного чтения JSON
const readData = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content) || [];
    } catch (error) {
        console.error('Ошибка чтения файла:', error);
        return [];
    }
};

// ✅ Отправка ответа
app.post('/submit', (req, res) => {
  const answerData = req.body;
  
  const tests = readData(filePathTests);
  const test = tests.find(t => t.id === answerData["id-test"]);

  if (!test) {
    return res.status(404).json({ error: "Тест не найден" });
  }

  // ✅ Расчет баллов на бэке
  answerData.mark = calculateScore(test, answerData);

  const answers = readData(filePathAnswers);
  answers.push(answerData);
  writeData(answers, filePathAnswers);

  // Обновляем прогресс в тесте
  const testIndex = tests.findIndex(t => t.id === answerData["id-test"]);
  tests[testIndex].progress = (tests[testIndex].progress || 0) + 1;
  writeData(tests, filePathTests);

  res.status(200).json({
    message: "Прогресс обновлён, данные сохранены, оценка рассчитана!",
    updatedTest: tests[testIndex],
    mark: answerData.mark,
  });
});





// ✅ Получение всех ответов
app.get('/api/answers', (req, res) => {
  const answers = readData(filePathAnswers);
  res.json(answers);
});

// ✅ Получение ответов по ID теста
app.get('/api/answers/:idTest', (req, res) => {
    const idTest = Number(req.params.idTest); // Приведение к числу
    const answers = readData(filePathAnswers);

    // Фильтруем только те ответы, у которых совпадает id-test
    const filteredAnswers = answers.filter(answer => answer["id-test"] === idTest);

    if (filteredAnswers.length === 0) {
        return res.status(404).json({ error: 'Ответы для данного теста не найдены' });
    }

    res.json(filteredAnswers);
});



// ✅ Получение одного теста по ID (улучшено)
app.get('/api/tests/:id', (req, res) => {
  const testId = Number(req.params.id); // Числовое приведение

  const tests = readData(filePathTests);
  const test = tests.find((t) => t.id === testId);

  if (!test) {
      return res.status(404).json({ error: 'Тест не найден' });
  }

  res.json(test);
});

// Функция безопасной записи JSON
const writeData = (data, filePath) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Ошибка записи файла:', error);
    }
};

// ✅ Получение всех тестов
app.get('/api/tests', (req, res) => {
    const data = readData(filePathTests);
    res.json(data);
});


// ✅ Добавление нового теста
app.post('/api/tests', (req, res) => {
    const data = readData(filePathTests);
    const newTest = { id: Date.now(), ...req.body };

    data.push(newTest);
    writeData(data, filePathTests);

    res.status(201).json(newTest);
});

// ✅ Удаление теста по id
app.delete('/api/tests/:id', (req, res) => {
    const { id } = req.params;
    let data = readData(filePathTests);

    const newData = data.filter(test => test.id !== Number(id));

    if (data.length === newData.length) {
        return res.status(404).json({ error: 'Тест не найден' });
    }

    writeData(newData, filePathTests);
    res.json({ message: 'Тест удален' });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
