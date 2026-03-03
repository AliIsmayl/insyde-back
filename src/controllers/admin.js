const db = require('../db');

exports.createUser = (req, res) => {
    const { name, pass } = req.body;
    if (!name || !pass) return res.status(400).json({ error: "Məlumatları doldurun" });

    const userCode = 'SYD' + Math.floor(1000 + Math.random() * 9000);
    const slug = name.toLowerCase().split(' ').join('-') + '-' + Math.random().toString(36).substr(2, 5);

    db.run(`INSERT INTO login (userCode, pass, role) VALUES (?, ?, 'user')`, [userCode, pass], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`INSERT INTO personalInfo (userCode, name, slug) VALUES (?, ?, ?)`, [userCode, name, slug], () => {
            res.status(201).json({ message: "Yaradıldı", userCode });
        });
    });
};

exports.getUsers = (req, res) => {
    db.all(`SELECT l.userCode, l.role, l.blocked, p.name FROM login l LEFT JOIN personalInfo p ON l.userCode = p.userCode`, (err, rows) => {
        res.json(rows || []);
    });
};

exports.deleteUser = (req, res) => {
    db.run(`DELETE FROM login WHERE userCode = ?`, [req.params.userCode], () => res.json({ message: "Silindi" }));
};

exports.toggleBlock = (req, res) => {
    db.run(`UPDATE login SET blocked = ? WHERE userCode = ?`, [req.body.blocked, req.body.userCode], () => res.json({ message: "OK" }));
};

exports.addSocial = (req, res) => {
    db.run(`INSERT INTO sosial (sosialName, sosialIcon) VALUES (?, ?)`, [req.body.name, req.body.icon], () => res.json({ message: "OK" }));
};

exports.getSocials = (req, res) => {
    db.all(`SELECT * FROM sosial`, (err, rows) => res.json(rows || []));
};