const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    console.log("Кто-то открыл главную страницу!");
    res.send("Сервер работает!");
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
