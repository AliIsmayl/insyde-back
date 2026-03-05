// server.js (BACKEND - TAM)
// npm i express cors jsonwebtoken sqlite3 multer
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const db = new sqlite3.Database("./database.sqlite");
const SECRET = "secret_2026";

// ───── UPLOAD QOVLUĞU ─────
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./uploads"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ───── MIDDLEWARE ─────
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// ───── DB: TABLES ─────
db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON;");

  db.run(`CREATE TABLE IF NOT EXISTS login (
    userCode TEXT PRIMARY KEY,
    pass     TEXT,
    role     TEXT    DEFAULT 'user',
    blocked  INTEGER DEFAULT 0
  )`);

  db.run(
    `CREATE TABLE IF NOT EXISTS personalInfo (
      userCode   TEXT PRIMARY KEY,
      name       TEXT,
      email      TEXT,
      slug       TEXT,
      about      TEXT,
      image      TEXT,
      profession TEXT,
      skills     TEXT,
      themeColor TEXT DEFAULT '#c8a75e',
      createdAt  TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userCode) REFERENCES login(userCode) ON DELETE CASCADE
    )`,
    () => {
      // Sütunları sonradan əlavə etmək lazım olarsa (Error atsa belə görməzdən gələcək)
      db.run("ALTER TABLE personalInfo ADD COLUMN profession TEXT", () => {});
      db.run("ALTER TABLE personalInfo ADD COLUMN skills TEXT", () => {});
      db.run(
        "ALTER TABLE personalInfo ADD COLUMN themeColor TEXT DEFAULT '#c8a75e'",
        () => {},
      );
    },
  );

  db.run(`CREATE TABLE IF NOT EXISTS sosial (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    icon TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sosialInfo (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    userCode TEXT,
    category TEXT,
    link     TEXT,
    clicks   INTEGER DEFAULT 0,
    FOREIGN KEY(userCode) REFERENCES login(userCode) ON DELETE CASCADE
  )`);

  // Şikayət / Təklif / Əlaqə mesajları
  db.run(`CREATE TABLE IF NOT EXISTS complaints (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    userCode TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'complaint',   -- complaint | suggestion
    subject  TEXT,
    message  TEXT NOT NULL,
    reply    TEXT,
    status   TEXT NOT NULL DEFAULT 'pending',     -- pending | answered
    date     TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userCode) REFERENCES login(userCode) ON DELETE CASCADE
  )`);

  // Default superadmin yaradılması
  db.get("SELECT * FROM login WHERE role='superadmin'", (err, row) => {
    if (!row) {
      db.run(
        "INSERT INTO login (userCode, pass, role) VALUES ('SUPERADMIN','admin123','superadmin')",
      );
      db.run(
        "INSERT INTO personalInfo (userCode, name, slug) VALUES ('SUPERADMIN','Super Admin','super-admin')",
      );
      console.log("✅ Default superadmin: SUPERADMIN / admin123");
    }
  });
});

// ───── AUTH ─────
const auth = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token yoxdur" });

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Token etibarsızdır" });
    req.user = decoded; // { userCode, role }
    next();
  });
};

const superadminOnly = (req, res, next) => {
  if (req.user.role !== "superadmin")
    return res.status(403).json({ error: "İcazə yoxdur" });
  next();
};

// ───── LOGIN ─────
app.post("/api/login", (req, res) => {
  const { userCode, pass } = req.body;

  db.get(
    `SELECT l.*, p.slug
     FROM login l
     LEFT JOIN personalInfo p ON l.userCode = p.userCode
     WHERE l.userCode = ? AND l.pass = ?`,
    [userCode, pass],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(401).json({ error: "Səhv kod və ya şifrə" });
      if (row.blocked)
        return res.status(403).json({ error: "Hesabınız bloklanıb" });

      const token = jwt.sign(
        { userCode: row.userCode, role: row.role },
        SECRET,
      );

      res.json({
        token,
        role: row.role,
        userCode: row.userCode,
        slug: row.slug,
      });
    },
  );
});

// ───── PUBLIC: PLATFORMALAR ─────
app.get("/api/socials", (req, res) => {
  db.all("SELECT * FROM sosial", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// ───── USER: PROFILE ─────
app.get("/api/user/me", auth, (req, res) => {
  db.get(
    `SELECT p.*, l.blocked
     FROM personalInfo p
     LEFT JOIN login l ON p.userCode = l.userCode
     WHERE p.userCode=?`,
    [req.user.userCode],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: "Profil tapılmadı" });
      if (row.blocked === 1)
        return res.status(403).json({ error: "Hesab bloklanıb" });

      try {
        row.skills = JSON.parse(row.skills);
      } catch {
        row.skills = ["", "", ""];
      }
      res.json(row);
    },
  );
});

// Şəkil yüklənəndə və profili yeniləyəndə
app.put("/api/user/me", auth, upload.single("image"), (req, res) => {
  const { email, about, profession, themeColor } = req.body;
  let { skills } = req.body;

  const skillsString = skills
    ? typeof skills === "string"
      ? skills
      : JSON.stringify(skills)
    : '["","",""]';

  if (req.file) {
    const imagePath = `/uploads/${req.file.filename}`;
    db.run(
      `UPDATE personalInfo
       SET email=?, about=?, profession=?, skills=?, themeColor=?, image=?
       WHERE userCode=?`,
      [
        email,
        about,
        profession,
        skillsString,
        themeColor,
        imagePath,
        req.user.userCode,
      ],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, image: req.file.filename });
      },
    );
  } else {
    db.run(
      `UPDATE personalInfo
       SET email=?, about=?, profession=?, skills=?, themeColor=?
       WHERE userCode=?`,
      [email, about, profession, skillsString, themeColor, req.user.userCode],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
      },
    );
  }
});

// ───── USER: SOCIAL LINKS ─────
app.get("/api/user/social-info", auth, (req, res) => {
  db.all(
    `SELECT si.id, si.category, si.link, si.clicks AS clickCount, s.icon
     FROM sosialInfo si
     LEFT JOIN sosial s ON si.category = s.name
     WHERE si.userCode=?`,
    [req.user.userCode],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

app.put("/api/user/social-info", auth, (req, res) => {
  const { links } = req.body;
  if (!Array.isArray(links))
    return res.status(400).json({ error: "Yanlış məlumat formatı" });

  db.all(
    "SELECT id, clicks FROM sosialInfo WHERE userCode=?",
    [req.user.userCode],
    (err, existingRows) => {
      if (err) return res.status(500).json({ error: err.message });

      const clicksMap = {};
      (existingRows || []).forEach((row) => {
        clicksMap[row.id] = row.clicks;
      });

      db.run(
        "DELETE FROM sosialInfo WHERE userCode=?",
        [req.user.userCode],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          if (links.length === 0) return res.json({ ok: true });

          const stmt = db.prepare(
            "INSERT INTO sosialInfo (userCode, category, link, clicks) VALUES (?, ?, ?, ?)",
          );

          links.forEach((linkObj) => {
            let currentClicks = 0;
            if (
              !String(linkObj.id).startsWith("temp-") &&
              clicksMap[linkObj.id]
            ) {
              currentClicks = clicksMap[linkObj.id];
            }

            stmt.run(
              req.user.userCode,
              linkObj.category || linkObj.platform,
              linkObj.link,
              currentClicks,
            );
          });

          stmt.finalize((err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
          });
        },
      );
    },
  );
});

app.post("/api/social-click/:id", (req, res) => {
  db.run(
    "UPDATE sosialInfo SET clicks = clicks + 1 WHERE id = ?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    },
  );
});

// ─────────────────────────────────────────────
//  ŞİKAYƏT / TƏKLİF (AdminPanel burdan göndərəcək)
// ─────────────────────────────────────────────
app.post("/api/complaints", auth, (req, res) => {
  const { type, subject, message } = req.body;

  if (!message || !message.trim())
    return res.status(400).json({ error: "Mesaj boş ola bilməz" });

  const finalType = ["complaint", "suggestion"].includes(type)
    ? type
    : "complaint";

  db.run(
    `INSERT INTO complaints (userCode, type, subject, message, status, date)
     VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
    [req.user.userCode, finalType, subject?.trim() || null, message.trim()],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true, id: this.lastID });
    },
  );
});

// User öz müraciətlərini görə bilər (istəsən sonradan AdminPanel-də göstərərik)
app.get("/api/user/complaints", auth, (req, res) => {
  db.all(
    `SELECT id, type, subject, message, reply, status, date
     FROM complaints
     WHERE userCode=?
     ORDER BY date DESC`,
    [req.user.userCode],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

// Superadmin bütün müraciətlər
app.get("/api/admin/complaints", auth, superadminOnly, (req, res) => {
  db.all(
    `SELECT c.id, c.userCode, c.type, c.subject, c.message, c.reply, c.status, c.date,
            p.name AS fullName
     FROM complaints c
     LEFT JOIN personalInfo p ON c.userCode = p.userCode
     ORDER BY c.date DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

app.post(
  "/api/admin/complaints/:id/reply",
  auth,
  superadminOnly,
  (req, res) => {
    const { reply } = req.body;
    if (!reply || !reply.trim())
      return res.status(400).json({ error: "Cavab boş ola bilməz" });

    db.get(
      "SELECT id FROM complaints WHERE id=?",
      [req.params.id],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Mesaj tapılmadı" });

        db.run(
          "UPDATE complaints SET reply=?, status='answered' WHERE id=?",
          [reply.trim(), req.params.id],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
          },
        );
      },
    );
  },
);

// ───── SUPERADMIN: USERS + SOCIALS (SuperAdmin üçün) ─────
app.get("/api/admin/users", auth, superadminOnly, (req, res) => {
  db.all(
    `SELECT l.userCode, l.pass, l.blocked,
            p.name, p.email, p.slug, p.about, p.image,
            p.profession, p.skills, p.themeColor, p.createdAt
     FROM login l
     LEFT JOIN personalInfo p ON l.userCode = p.userCode
     WHERE l.role='user'
     ORDER BY p.createdAt DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const formatted = (rows || []).map((r) => {
        try {
          r.skills = JSON.parse(r.skills);
        } catch {
          r.skills = ["", "", ""];
        }
        return r;
      });
      res.json(formatted);
    },
  );
});

// Yeni İstifadəçi yaradılması (həm login həm personalInfo cədvəlinə əlavə olunur)
app.post("/api/admin/users", auth, superadminOnly, (req, res) => {
  const { userCode, name, pass } = req.body;

  if (!userCode || !name || !pass)
    return res.status(400).json({ error: "Bütün xanaları doldurun" });

  const slug = String(userCode).toLowerCase();

  db.get(
    "SELECT userCode FROM login WHERE userCode=?",
    [userCode],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row)
        return res
          .status(409)
          .json({ error: "Bu istifadəçi kodu artıq mövcuddur!" });

      db.run(
        "INSERT INTO login (userCode, pass, role) VALUES (?, ?, 'user')",
        [userCode, pass],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          db.run(
            `INSERT INTO personalInfo (userCode, name, slug, profession, skills, themeColor)
             VALUES (?, ?, ?, '', '["","",""]', '#c8a75e')`,
            [userCode, name, slug],
            (err2) => {
              if (err2) return res.status(500).json({ error: err2.message });
              res.json({ userCode, name, slug });
            },
          );
        },
      );
    },
  );
});

// User məlumatlarının Superadmin tərəfindən yenilənməsi
app.put("/api/admin/users/:code", auth, superadminOnly, (req, res) => {
  const oldCode = req.params.code;
  const { userCode, name, pass } = req.body;

  // 1. userCode dəyişibsə, yeni kodun mövcud olub-olmadığını yoxlayırıq
  db.get(
    "SELECT userCode FROM login WHERE userCode=?",
    [userCode],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row && row.userCode !== oldCode) {
        return res
          .status(409)
          .json({ error: "Bu istifadəçi kodu artıq mövcuddur!" });
      }

      // 2. Parolu yeniləyirik
      const slug = String(userCode).toLowerCase();

      // CASCADE ON DELETE / UPDATE olmadığı üçün hər iki cədvəli güncəlləməliyik
      // SQLite üçün PRAGMA foreign_keys = ON varsa, UPDATE CASCADE işləyə bilər,
      // amma işini qarantiya almaq üçün ardıcıl yazaq.
      db.run(
        "UPDATE login SET userCode=?, pass=? WHERE userCode=?",
        [userCode, pass, oldCode],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });

          db.run(
            "UPDATE personalInfo SET userCode=?, name=?, slug=? WHERE userCode=?",
            [userCode, name, slug, oldCode],
            (err3) => {
              if (err3) return res.status(500).json({ error: err3.message });
              res.json({ ok: true, userCode, name, slug });
            },
          );
        },
      );
    },
  );
});

// User silinməsi
app.delete("/api/admin/users/:code", auth, superadminOnly, (req, res) => {
  db.run("DELETE FROM login WHERE userCode=?", [req.params.code], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// Bloklama və Blokdan çıxarma
app.patch("/api/admin/users/block", auth, superadminOnly, (req, res) => {
  const { userCode, blocked } = req.body;
  db.run(
    "UPDATE login SET blocked=? WHERE userCode=?",
    [blocked ? 1 : 0, userCode],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    },
  );
});

// Admin panelində userlərin sosial linklərini görmək
app.get("/api/admin/users/:code/social", auth, superadminOnly, (req, res) => {
  db.all(
    "SELECT * FROM sosialInfo WHERE userCode=?",
    [req.params.code],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

// Platform əlavə etmək
app.post("/api/admin/social", auth, superadminOnly, (req, res) => {
  const { name, icon } = req.body;
  db.run(
    "INSERT INTO sosial (name, icon) VALUES (?, ?)",
    [name, icon],
    (err) => {
      if (err)
        return res.status(400).json({ error: "Bu platform artıq mövcuddur" });
      res.json({ ok: true });
    },
  );
});

// Platform silmək
app.delete("/api/admin/social/:id", auth, superadminOnly, (req, res) => {
  db.run("DELETE FROM sosial WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// ───── START SERVER ─────
app.listen(3000, () =>
  console.log(
    "✅ Server 3000 portunda işə düşdü. Superadmin: SUPERADMIN / admin123",
  ),
);
