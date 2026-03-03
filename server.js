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

const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ───── CƏDVƏLLƏR ─────
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS login (
    userCode TEXT PRIMARY KEY,
    pass TEXT,
    role TEXT DEFAULT 'user',
    blocked INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS personalInfo (
    userCode TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    slug TEXT,
    about TEXT,
    image TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userCode) REFERENCES login(userCode) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sosial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    icon TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sosialInfo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userCode TEXT,
    category TEXT,
    link TEXT,
    clicks INTEGER DEFAULT 0,
    FOREIGN KEY(userCode) REFERENCES login(userCode) ON DELETE CASCADE
  )`);

  // Default superadmin yarat
  db.get("SELECT * FROM login WHERE role = 'superadmin'", (err, row) => {
    if (!row) {
      db.run(
        "INSERT INTO login (userCode, pass, role) VALUES ('SUPERADMIN', 'admin123', 'superadmin')",
      );
      db.run(
        "INSERT INTO personalInfo (userCode, name, slug) VALUES ('SUPERADMIN', 'Super Admin', 'super-admin')",
      );
      console.log(
        "✅ Default superadmin yaradıldı. Kod: SUPERADMIN, Şifrə: admin123",
      );
    }
  });
});

// ───── AUTH MİDDLEWARE ─────
const auth = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token yoxdur" });
  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Token etibarsızdır" });
    req.user = decoded;
    next();
  });
};

const superadminOnly = (req, res, next) => {
  if (req.user.role !== "superadmin")
    return res.status(403).json({ error: "İcazə yoxdur" });
  next();
};

// ─── YENİ USER KODU GENERASİYA FUNKSİYASI (8 SİMVOLLU) ───
const generateRandomUserCode = () => {
  const prefixes = ["SYD", "INS"];
  const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];

  // 5 rəqəmli təsadüfi ədəd generasiya et (00000 - 99999 arası)
  const randomDigits = String(Math.floor(Math.random() * 100000)).padStart(
    5,
    "0",
  );

  return `${randomPrefix}${randomDigits}`;
};

// ───── AUTH (LOGİN) ─────
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

// ───── SUPERADMIN: İSTİFADƏÇİLƏR ─────
app.post("/api/admin/users", auth, superadminOnly, (req, res) => {
  const { name, pass } = req.body;
  if (!name || !pass)
    return res.status(400).json({ error: "Ad və şifrə tələb olunur" });

  const attemptCreateUser = () => {
    const uCode = generateRandomUserCode();
    const slug = uCode.toLowerCase();

    db.get(
      "SELECT userCode FROM login WHERE userCode = ?",
      [uCode],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) return attemptCreateUser();

        db.run(
          "INSERT INTO login (userCode, pass, role) VALUES (?, ?, 'user')",
          [uCode, pass],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.run(
              "INSERT INTO personalInfo (userCode, name, slug) VALUES (?, ?, ?)",
              [uCode, name, slug],
              (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });

                // Uğurla yarandısa front-a qaytarır
                res.json({ userCode: uCode, name, slug });
              },
            );
          },
        );
      },
    );
  };

  attemptCreateUser();
});

app.get("/api/admin/users", auth, superadminOnly, (req, res) => {
  db.all(
    `SELECT l.userCode, l.pass, l.blocked, p.name, p.email, p.slug, p.about, p.image, p.createdAt
     FROM login l
     LEFT JOIN personalInfo p ON l.userCode = p.userCode
     WHERE l.role = 'user'`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

app.put(
  "/api/admin/users/:code",
  auth,
  superadminOnly,
  upload.single("image"),
  (req, res) => {
    const { name, email, about, pass } = req.body;
    const code = req.params.code;
    let image = req.body.image;
    if (req.file) image = `/uploads/${req.file.filename}`;

    db.run(
      "UPDATE personalInfo SET name=?, email=?, about=?, image=? WHERE userCode=?",
      [name, email, about, image, code],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if (pass) {
          db.run("UPDATE login SET pass=? WHERE userCode=?", [pass, code]);
        }
        res.json({ ok: true });
      },
    );
  },
);

app.delete("/api/admin/users/:code", auth, superadminOnly, (req, res) => {
  db.run("DELETE FROM login WHERE userCode = ?", [req.params.code], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

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

// ───── SUPERADMIN: SOSİAL PLATFORMALAR ─────
app.post("/api/admin/social", auth, superadminOnly, (req, res) => {
  const { name, icon } = req.body;
  if (!name || !icon)
    return res.status(400).json({ error: "Ad və ikon tələb olunur" });
  db.run(
    "INSERT INTO sosial (name, icon) VALUES (?, ?)",
    [name, icon],
    (err) => {
      if (err) return res.status(400).json({ error: "Bu ad artıq mövcuddur" });
      res.json({ ok: true });
    },
  );
});

app.delete("/api/admin/social/:id", auth, superadminOnly, (req, res) => {
  db.run("DELETE FROM sosial WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

app.get("/api/socials", (req, res) => {
  db.all("SELECT * FROM sosial", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// ───── USER: PROFİL ─────
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

      res.json(row);
    },
  );
});

app.put("/api/user/me", auth, upload.single("image"), (req, res) => {
  const { name, email, about } = req.body;
  let imagePath = null;

  if (req.file) {
    imagePath = `/uploads/${req.file.filename}`;
  } else if (req.body.image) {
    imagePath = req.body.image;
  }

  if (imagePath) {
    db.run(
      "UPDATE personalInfo SET name=?, email=?, about=?, image=? WHERE userCode=?",
      [name, email, about, imagePath, req.user.userCode],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, image: imagePath });
      },
    );
  } else {
    db.run(
      "UPDATE personalInfo SET name=?, email=?, about=? WHERE userCode=?",
      [name, email, about, req.user.userCode],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
      },
    );
  }
});

// ───── USER: SOSİAL LİNKLƏR ─────
app.get("/api/user/social-info", auth, (req, res) => {
  db.all(
    "SELECT si.id, si.category, si.link, si.clicks as clickCount, s.icon FROM sosialInfo si LEFT JOIN sosial s ON si.category = s.name WHERE si.userCode=?",
    [req.user.userCode],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

// ✅ BÜTÜN LİNKLƏRİ TƏK BİR SƏFƏRDƏ YENİLƏYƏN API (PUT /api/user/social-info)
app.put("/api/user/social-info", auth, (req, res) => {
  const links = req.body.links;

  if (!Array.isArray(links)) {
    return res.status(400).json({ error: "Yanlış məlumat formatı" });
  }

  db.all(
    "SELECT id, clicks FROM sosialInfo WHERE userCode=?",
    [req.user.userCode],
    (err, existingRows) => {
      if (err) return res.status(500).json({ error: err.message });

      const clicksMap = {};
      existingRows.forEach((row) => {
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

// ✅ BAXIŞ SAYINI ARTIRMAQ ÜÇÜN PUBLIC API
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

app.listen(3000, () =>
  console.log("✅ Server 3000-dədir. Superadmin: SUPERADMIN / admin123"),
);
