import express from 'express';
import fs from 'fs';
import cors from 'cors';
import path from 'path';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 8080;

const filePathTests = path.resolve('tests.json'); // Абсолютный путь
const filePathAnswers = path.resolve('answers.json'); // Абсолютный путь

app.use(cors());
app.use(express.json());

// Определяем __dirname для ES-модулей
const __dirname = path.dirname(new URL(import.meta.url).pathname);
// Настраиваем директорию для загрузок
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Отдаём статические файлы из директории uploads
app.use('/uploads', express.static(uploadDir));

// Настраиваем multer с переопределением имени файла
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
 filename: (req, file, cb) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  cb(null, uniqueSuffix + '-' + file.originalname);
},

});

const upload = multer({ storage });

// Новый эндпоинт для загрузки изображений
// Ожидается, что в multipart/form-data переданы: 
// - поле questionId (идентификатор вопроса)
// - файлы в поле "images" (до 8 файлов)
app.post('/upload', upload.array('images', 8), (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).send('Файлы не были загружены.');
  }
  // Формируем URL для каждого загруженного файла
  const fileUrls = files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);
  res.status(200).json({ urls: fileUrls });
});
// Вспомогательная функция сравнения двух пар (x1, x2) с игнорированием порядка
function pairsEqual(pair1, pair2) {
  // Предположим, что pair1 и pair2 — это [x1, x2] или {x1, x2}.
  // Если у вас точно массивы, уберите проверку.
  const [a1, a2] = Array.isArray(pair1) ? pair1 : [pair1.x1, pair1.x2];
  const [b1, b2] = Array.isArray(pair2) ? pair2 : [pair2.x1, pair2.x2];

  // Сравниваем как числа, игнорируя порядок
  return (
    (Number(a1) === Number(b1) && Number(a2) === Number(b2)) ||
    (Number(a1) === Number(b2) && Number(a2) === Number(b1))
  );
}

const calculateScore = (test, studentAnswers) => {
  let totalScore = 0;
  const variant = Number(studentAnswers.variant);

  console.log(`📌 Розрахунок балів для: ${studentAnswers.student} (Варіант ${variant})`);

  test.questions.forEach(question => {
    const studentAnswer = studentAnswers.answers.find(ans => Number(ans["question-id"]) === Number(question.id));
    if (!studentAnswer) {
      console.log(`🚫 Питання ${question.id} (${question.text}) — ❌ відповіді немає`);
      return;
    }

    const correctAnswer = question.answersByVariant?.[variant];
    if (correctAnswer === undefined) {
      console.log(`❌ Немає правильної відповіді для варіанту ${variant} у питанні ${question.id}`);
      return;
    }

    let earnedPoints = 0;
    const maxPoints = question.points;

    console.log(`\n🔍 Перевірка: ${question.text} (Тип: ${question.type})`);
    console.log(`✅ Очікувана відповідь:`, correctAnswer);
    console.log(`📝 Відповідь студента:`, studentAnswer.answer);

    switch (question.type) {
      case "text":
        if (
          typeof studentAnswer.answer === "string" &&
          typeof correctAnswer === "string" &&
          studentAnswer.answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
        ) {
          earnedPoints = maxPoints;
        }
        break;

      case "number":
        if (Number(studentAnswer.answer) === Number(correctAnswer)) {
          earnedPoints = maxPoints;
        }
        break;

      case "list-num":
        if (correctAnswer.consistencyImportant) {
          let correctCount = 0;
          correctAnswer.massiv.forEach((num, i) => {
            if (studentAnswer.answer[i] === num) correctCount++;
          });
          earnedPoints = (correctCount / correctAnswer.massiv.length) * maxPoints;
        } else {
          const correctSet = new Set(correctAnswer.massiv);
          const studentSet = new Set(studentAnswer.answer);
          const correctCount = [...studentSet].filter(num => correctSet.has(num)).length;
          earnedPoints = (correctCount / correctAnswer.massiv.length) * maxPoints;
        }
        break;

      case "matrix":
        const correctMatrix = JSON.stringify(correctAnswer);
        const studentMatrix = JSON.stringify(studentAnswer.answer.answer);
        if (correctMatrix === studentMatrix) {
          earnedPoints = maxPoints;
        } else {
          let correctCount = 0;
          const totalElements = correctAnswer.flat().length;
          correctAnswer.forEach((row, i) => {
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
        if (JSON.stringify(studentAnswer.answer) === JSON.stringify(correctAnswer.correct)) {
          earnedPoints = maxPoints;
        }
        break;

      case "list-reber":
        const correctEdges = correctAnswer;
        const studentEdges = studentAnswer.answer.answer || [];

        let correctCount = 0;
        correctEdges.forEach(correctEdge => {
          const found = studentEdges.some(studentEdge => pairsEqual(correctEdge, studentEdge));
          if (found) correctCount++;
        });

        earnedPoints = (correctCount / correctEdges.length) * maxPoints;
        break;

      case "list-pars":
        const correctPairs = correctAnswer.pairs;
        const studentPairs = studentAnswer.answer.answer || [];

        let matchCount = 0;
        correctPairs.forEach(pair => {
          if (studentPairs.some(p => p[0] === pair[0] && p[1] === pair[1])) {
            matchCount++;
          }
        });

        earnedPoints = (matchCount / correctPairs.length) * maxPoints;
        break;

      default:
        console.warn(`⚠️ Невідомий тип питання: ${question.type}`);
    }

    console.log(`🏅 Нараховано балів: ${Math.round(earnedPoints)} з ${maxPoints}`);
    totalScore += Math.round(earnedPoints);
  });

  console.log(`✅ Підсумковий бал: ${totalScore}`);
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

// ✅ Обновление теста по id
app.put('/api/tests/:id', (req, res) => {
  const testId = Number(req.params.id);
  const tests = readData(filePathTests);
  const index = tests.findIndex(test => test.id === testId);
  if (index === -1) {
    return res.status(404).json({ error: 'Тест не найден' });
  }

  const oldTest = tests[index];

  // Создаем новую версию теста, объединяя старые данные с новыми из req.body
  const newTest = {
    ...oldTest,
    ...req.body,
    id: testId,
    lastUpdated: Date.now(), // позначаємо, коли тест востаннє редагувався
  };
  
  // Функция для сбора всех URL картинок из вопросов теста
  const gatherAllImages = (testObj) => {
    let urls = [];
    if (testObj.questions && Array.isArray(testObj.questions)) {
      testObj.questions.forEach(q => {
        if (q.Images && Array.isArray(q.Images)) {
          urls = urls.concat(q.Images);
        }
      });
    }
    return urls;
  };

  const oldImages = gatherAllImages(oldTest);
  const newImages = gatherAllImages(newTest);

  // Определяем удаленные URL (те, которые были, но отсутствуют в новой версии)
  const removedImages = oldImages.filter(url => !newImages.includes(url));
  console.log('Removed images:', removedImages);

  // Удаляем файлы с диска
  removedImages.forEach(url => {
    try {
      const fileName = path.basename(url);
      const fullPath = path.join(uploadDir, fileName);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`Файл ${fileName} удалён`);
      } else {
        console.log(`Файл ${fileName} не найден`);
      }
    } catch (error) {
      console.error('Ошибка при удалении файла:', error);
    }
  });

  // Обновляем тесты и сохраняем
  tests[index] = newTest;
  writeData(tests, filePathTests);
  res.json(newTest);
});


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
  answerData.timestamp = Date.now(); // Додаємо час створення відповіді

  const answers = readData(filePathAnswers);
  answers.unshift(answerData);
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


// ✅ Получение ответа по id-answer
app.get('/api/answers/answer/:idAnswer', (req, res) => {
    const idAnswer = Number(req.params.idAnswer); // Приведение id к числу
    const answers = readData(filePathAnswers);

    const answer = answers.find(ans => ans["id-answer"] === idAnswer);

    if (!answer) {
        return res.status(404).json({ error: 'Ответ не найден' });
    }

    res.json(answer);
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

// ✅ Удаление теста по id и связанных ответов
app.delete('/api/tests/:id', (req, res) => {
  const { id } = req.params;
  const testId = Number(id);

  // Читаємо поточні тести
  let tests = readData(filePathTests);
  const testToDelete = tests.find(test => test.id === testId);

  if (!testToDelete) {
    return res.status(404).json({ error: 'Тест не знайдено' });
  }

  // 🖼️ Збираємо всі зображення, прикріплені до цього тесту
  const gatherAllImages = (testObj) => {
    let urls = [];
    if (testObj.questions && Array.isArray(testObj.questions)) {
      testObj.questions.forEach(q => {
        if (q.Images && Array.isArray(q.Images)) {
          urls = urls.concat(q.Images);
        }
      });
    }
    return urls;
  };

  const allImages = gatherAllImages(testToDelete);

  // 🧹 Видаляємо ці зображення з диску
  allImages.forEach(url => {
    try {
      const fileName = path.basename(url);
      const fullPath = path.join(uploadDir, fileName);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`🗑️ Видалено файл: ${fileName}`);
      } else {
        console.log(`⚠️ Файл ${fileName} не знайдено`);
      }
    } catch (error) {
      console.error('❌ Помилка при видаленні зображення:', error);
    }
  });

  // Оновлюємо список тестів
  const newTests = tests.filter(test => test.id !== testId);
  writeData(newTests, filePathTests);

  // Видаляємо пов’язані відповіді
  let answers = readData(filePathAnswers);
  const newAnswers = answers.filter(answer => answer["id-test"] !== testId);
  if (answers.length !== newAnswers.length) {
    writeData(newAnswers, filePathAnswers);
  }

  res.json({ message: 'Тест, відповіді та зображення успішно видалено' });
});


// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
