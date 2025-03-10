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

// Функция для расчёта оценки по всем вопросам
const calculateScore = (studentAnswer, testData) => {
  let totalScore = 0;
  const detailedResults = [];

  studentAnswer.answers.forEach(answerItem => {
    // Находим соответствующий вопрос по id
    const question = testData.questions.find(q => q.id === answerItem["question-id"]);
    if (!question) return; // Если вопрос не найден, пропускаем

    let pointsAwarded = 0;
    const maxPoints = question.points;

    switch (question.type) {
      case 'text-answer': {
        // Сравнение строк без учёта регистра и лишних пробелов
        const studentText = String(answerItem.answer).trim().toLowerCase();
        const correctText = String(question.answer).trim().toLowerCase();
        if (studentText === correctText) {
          pointsAwarded = maxPoints;
        }
        break;
      }
      case 'number-answer': {
        if (Number(answerItem.answer) === Number(question.answer)) {
          pointsAwarded = maxPoints;
        }
        break;
      }
      case 'number-list': {
        // Здесь вопрос.answer – объект с ключами: massiv и consistencyImportant
        const correctList = question.answer.massiv;
        const studentList = answerItem.answer;
        const consistencyImportant = question.answer.consistencyImportant;
        if (!Array.isArray(studentList)) break;
        if (consistencyImportant) {
          // Если порядок важен – сравниваем по индексам
          let correctCount = 0;
          for (let i = 0; i < Math.min(correctList.length, studentList.length); i++) {
            if (Number(studentList[i]) === Number(correctList[i])) {
              correctCount++;
            }
          }
          pointsAwarded = (maxPoints * correctCount) / correctList.length;
        } else {
          // Если порядок не важен – считаем каждый найденный правильный элемент
          let studentCopy = [...studentList];
          let correctCount = 0;
          correctList.forEach(el => {
            const index = studentCopy.findIndex(s => Number(s) === Number(el));
            if (index !== -1) {
              correctCount++;
              studentCopy.splice(index, 1); // Убираем найденный элемент, чтобы не считать его дважды
            }
          });
          pointsAwarded = (maxPoints * correctCount) / correctList.length;
        }
        break;
      }
      case 'matrix': {
        // Сравниваем двумерные массивы поэлементно
        const correctMatrix = question.answer;
        const studentMatrix = answerItem.answer;
        if (!Array.isArray(studentMatrix) || !Array.isArray(correctMatrix)) break;
        let totalElements = 0;
        let correctCount = 0;
        for (let i = 0; i < Math.min(correctMatrix.length, studentMatrix.length); i++) {
          const correctRow = correctMatrix[i];
          const studentRow = studentMatrix[i];
          for (let j = 0; j < Math.min(correctRow.length, studentRow.length); j++) {
            totalElements++;
            if (Number(studentRow[j]) === Number(correctRow[j])) {
              correctCount++;
            }
          }
        }
        if (totalElements > 0) {
          pointsAwarded = (maxPoints * correctCount) / totalElements;
        }
        break;
      }
      case 'variant-list': {
        // Здесь предполагается, что ответ студента – массив (например, [0, 1, 0, 0]),
        // а эталонный ответ – объект с ключами: variants и correct (массив с 0 и 1)
        const correctObj = question.answer;
        const studentVariant = answerItem.answer;
        if (!Array.isArray(studentVariant)) break;
        const variantCount = correctObj.variants.length;
        let correctCount = 0;
        for (let i = 0; i < variantCount; i++) {
          if (Number(studentVariant[i]) === Number(correctObj.correct[i])) {
            correctCount++;
          }
        }
        pointsAwarded = (maxPoints * correctCount) / variantCount;
        break;
      }
      case 'mumber-paries': {
        // Здесь ответ – объект с парами и флагом consistencyImportant
        const correctPairs = question.answer.pairs;
        const studentPairs = answerItem.answer;
        const consistencyImportantPairs = question.answer.consistencyImportant;
        if (!Array.isArray(studentPairs)) break;
        if (consistencyImportantPairs) {
          let correctCount = 0;
          for (let i = 0; i < Math.min(correctPairs.length, studentPairs.length); i++) {
            const correctPair = correctPairs[i];
            const studentPair = studentPairs[i];
            if (Array.isArray(studentPair) && studentPair.length === correctPair.length &&
                studentPair.every((val, index) => Number(val) === Number(correctPair[index]))) {
              correctCount++;
            }
          }
          pointsAwarded = (maxPoints * correctCount) / correctPairs.length;
        } else {
          // Порядок не важен – для каждой корректной пары ищем совпадение в ответе студента
          let studentCopy = studentPairs.map(pair => pair.slice());
          let correctCount = 0;
          correctPairs.forEach(correctPair => {
            const index = studentCopy.findIndex(studentPair =>
              Array.isArray(studentPair) &&
              studentPair.length === correctPair.length &&
              studentPair.every((val, idx) => Number(val) === Number(correctPair[idx]))
            );
            if (index !== -1) {
              correctCount++;
              studentCopy.splice(index, 1);
            }
          });
          pointsAwarded = (maxPoints * correctCount) / correctPairs.length;
        }
        break;
      }
      case 'edge-list': {
        // Аналогично mumber-paries, но с ребрами графа (каждый элемент – пара чисел)
        const correctEdges = question.answer; // здесь эталонный ответ – массив пар
        const studentEdges = answerItem.answer;
        if (!Array.isArray(studentEdges)) break;
        let studentCopy = studentEdges.map(edge => edge.slice());
        let correctCount = 0;
        correctEdges.forEach(correctEdge => {
          const index = studentCopy.findIndex(studentEdge =>
            Array.isArray(studentEdge) &&
            studentEdge.length === correctEdge.length &&
            studentEdge.every((val, idx) => Number(val) === Number(correctEdge[idx]))
          );
          if (index !== -1) {
            correctCount++;
            studentCopy.splice(index, 1);
          }
        });
        pointsAwarded = (maxPoints * correctCount) / correctEdges.length;
        break;
      }
      default:
        console.warn(`Тип вопроса ${question.type} не поддерживается для автоматической проверки.`);
    }

    totalScore += pointsAwarded;
    detailedResults.push({
      questionId: question.id,
      pointsAwarded,
      maxPoints,
      studentAnswer: answerItem.answer,
      correctAnswer: question.answer
    });
  });

  return { totalScore, detailedResults };
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

  // Обновляем прогресс в tests.json
  const tests = readData(filePathTests);
  const testIndex = tests.findIndex(t => t.id === answerData["id-test"]);

  if (testIndex === -1) {
    return res.status(404).json({ error: "Тест не найден" });
  }

  // Вычисляем оценку на основании ответов студента
  const gradingResult = calculateScore(answerData, tests[testIndex]);

  // Добавляем новое поле в объект ответа
  answerData.lastGrading = gradingResult;

  // Сохраняем ответ с новым полем
  const answers = readData(filePathAnswers);
  answers.push(answerData);
  writeData(answers, filePathAnswers);

  // Обновляем тест (например, прогресс)
  tests[testIndex].progress = (tests[testIndex].progress || 0) + 1;
  writeData(tests, filePathTests);

  res.status(200).json({
    message: "Прогресс обновлён, данные успешно сохранены, и оценка рассчитана!",
    updatedTest: tests[testIndex],
    gradingResult
  });
});




// ✅ Получение всех ответов
app.get('/api/answers', (req, res) => {
  const answers = readData(filePathAnswers);
  res.json(answers);
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
