const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

/**
 * Məsuliyyət: Cədvəlləri sıfırdan yaratmaq və ilk admini əlavə etmək.
 * Mürəkkəblik: O(1)
 */
db.serialize(() => {
    // 1. Cədvəli yarat
    db.run(`CREATE TABLE IF NOT EXISTS login (
        userCode TEXT PRIMARY KEY, 
        pass TEXT, 
        role TEXT, 
        blocked BOOLEAN DEFAULT 0
    )`);

    // 2. Admini əlavə et
    const user = "admin77";
    const pass = "123";
    
    db.run(`INSERT OR IGNORE INTO login (userCode, pass, role) VALUES (?, ?, 'superadmin')`, 
        [user, pass], (err) => {
            if (err) return console.error("Xəta:", err.message);
            console.log(`UĞUR: '${user}' admini yaradıldı və bazaya yazıldı.`);
        });
});

db.close();