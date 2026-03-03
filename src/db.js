const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS login (
        userCode TEXT PRIMARY KEY, pass TEXT, role TEXT, blocked BOOLEAN DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS superadmin (user TEXT, blocked BOOLEAN)`);
    db.run(`CREATE TABLE IF NOT EXISTS personalInfo (
        userCode TEXT, name TEXT, email TEXT, slug TEXT, about TEXT, image TEXT,
        FOREIGN KEY(userCode) REFERENCES login(userCode) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS sosial (sosialName TEXT, sosialIcon TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS sosialInfo (
        userCode TEXT, sosialCategory TEXT, sosialLink TEXT
    )`);
});

module.exports = db;