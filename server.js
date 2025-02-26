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

app.post('/submit', (req, res) => {
  const answerData = req.body;

  // Сохранение ответа в answers.json
  fs.readFile('answers.json', 'utf8', (err, data) => {
    const answers = err && err.code === 'ENOENT' ? [] : JSON.parse(data || '[]');
    answers.push(answerData);

    fs.writeFile('answers.json', JSON.stringify(answers, null, 2), (writeErr) => {
      if (writeErr) {
        console.error('Ошибка записи в файл ответов:', writeErr);
        return res.status(500).send('Ошибка записи в файл ответов');
      }
    });
  });

  // Обновление прогресса в TESTS.json
  fs.readFile(filePathTests, 'utf8', (err, data) => {
    if (err) {
      console.error('Ошибка чтения файла тестов:', err);
      return res.status(500).send('Ошибка чтения файла тестов');
    }

    const tests = JSON.parse(data || '[]');
    const testIndex = tests.findIndex((t) => t.id === answerData['id-test']); // Найти тест по ID

    if (testIndex === -1) {
      return res.status(404).send('Тест не найден');
    }

    // Увеличение значения progress
    tests[testIndex].progress = (tests[testIndex].progress || 0) + 1;

    // Запись изменений обратно в файл
    fs.writeFile(filePathTests, JSON.stringify(tests, null, 2), (writeErr) => {
      if (writeErr) {
        console.error('Ошибка записи в файл тестов:', writeErr);
        return res.status(500).send('Ошибка записи в файл тестов');
      }

      res.status(200).json({
        message: 'Прогресс обновлён и данные успешно сохранены!',
        updatedTest: tests[testIndex],
      });
    });
  });
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
    const data = readData();
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
