// Məqsəd: İstifadəçinin doğrulanması və tokenin yaradılması.
const jwt = require('jsonwebtoken');
const db = require('../db');
const { SECRET } = require('../middlewares/auth');

exports.login = (req, res) => {
    const { userCode, pass } = req.body;

    // Explicit error handling & Input validation
    if (!userCode || !pass) {
        return res.status(400).json({ error: "userCode və pass vacibdir" });
    }

    // Dövr Mürəkkəbliyi: O(N) - N login cədvəlindəki qeydlərin sayıdır.
    const user = db.login.find(u => u["user-code"] === userCode && u.pass === pass);

    if (!user) {
        return res.status(401).json({ error: "İstifadəçi tapılmadı və ya şifrə yanlışdır" });
    }

    // Niyə: Stateless (Dövlətsiz) autentifikasiya üçün JWT istifadə edirik.
    const token = jwt.sign({ userCode: user["user-code"], role: user.role }, SECRET, { expiresIn: '2h' });

    return res.status(200).json({ message: "Uğurlu giriş", token, role: user.role });
};