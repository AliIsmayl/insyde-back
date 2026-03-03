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
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ───── CƏDVƏLLƏR ─────
db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");

  db.run(`CREATE TABLE IF NOT EXISTS login (
    userCode TEXT PRIMARY KEY,
    pass TEXT,
    role TEXT DEFAULT 'user',
    blocked INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS personalInfo (
    userCode TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    slug TEXT,
    about TEXT,
    image TEXT,
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

  // Default superadmin
  db.get("SELECT * FROM login WHERE role = 'superadmin'", (err, row) => {
    if (!row) {
      db.run(
        "INSERT INTO login (userCode, pass, role) VALUES ('SUPERADMIN', 'admin123', 'superadmin')",
      );
      db.run(
        "INSERT INTO personalInfo (userCode, name, slug) VALUES ('SUPERADMIN', 'Super Admin', 'super-admin')",
      );
      console.log(
        "Default superadmin yaradıldı. Kod: SUPERADMIN, Şifrə: admin123",
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

// ───── AUTH ─────
app.post("/api/login", (req, res) => {
  const { userCode, pass } = req.body;
  db.get(
    "SELECT * FROM login WHERE userCode = ? AND pass = ?",
    [userCode, pass],
    (err, row) => {
      if (!row) return res.status(401).json({ error: "Səhv kod və ya şifrə" });
      if (row.blocked)
        return res.status(403).json({ error: "Hesabınız bloklanıb" });
      const token = jwt.sign(
        { userCode: row.userCode, role: row.role },
        SECRET,
      );
      res.json({ token, role: row.role, userCode: row.userCode });
    },
  );
});

// ───── SUPERADMIN: İSTİFADƏÇİLƏR ─────
app.post("/api/admin/users", auth, superadminOnly, (req, res) => {
  const { name, pass } = req.body;
  if (!name || !pass)
    return res.status(400).json({ error: "Ad və şifrə tələb olunur" });

  const uCode = "SYD" + Math.floor(1000 + Math.random() * 9000);
  const slug =
    name.toLowerCase().replace(/ /g, "-") +
    "-" +
    Math.floor(100 + Math.random() * 900);

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
          res.json({ userCode: uCode, name, slug });
        },
      );
    },
  );
});

app.get("/api/admin/users", auth, superadminOnly, (req, res) => {
  db.all(
    `SELECT l.userCode, l.pass, l.blocked, l.createdAt,
            p.name, p.email, p.slug, p.about, p.image
     FROM login l
     LEFT JOIN personalInfo p ON l.userCode = p.userCode
     WHERE l.role = 'user'`,
    (err, rows) => res.json(rows || []),
  );
});

// ─── İstifadəçi yenilə — userCode dəyişikliyi daxil ───────────────────────
app.put("/api/admin/users/:code", auth, superadminOnly, (req, res) => {
  // ── Content-Type-a görə multer tətbiq et ya etmə ──
  // multer aktiv olanda JSON body-ni korladığı üçün
  // şərti olaraq işlədirik
  const contentType = req.headers["content-type"] || "";

  const processRequest = (imageVal) => {
    const oldCode = req.params.code;
    const newCode = (req.body.userCode || "").trim() || oldCode;
    const { name, email, about, pass } = req.body;
    const image = imageVal;

    // ── userCode eynidir → sadə UPDATE ──
    if (newCode === oldCode) {
      db.run(
        "UPDATE personalInfo SET name=?, email=?, about=?, image=? WHERE userCode=?",
        [name || null, email || null, about || null, image || null, oldCode],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          if (pass && pass.trim()) {
            db.run("UPDATE login SET pass=? WHERE userCode=?", [pass, oldCode]);
          }
          return res.json({ ok: true, userCode: oldCode });
        },
      );
      return;
    }

    // ── userCode dəyişir → əvvəlcə yeni kod mövcuddur? ──
    db.get(
      "SELECT * FROM login WHERE userCode = ?",
      [newCode],
      (err, existing) => {
        if (existing) {
          return res
            .status(409)
            .json({ error: "Bu kod artıq başqa istifadəçiyə aiddir." });
        }

        // ── Transaction başlat ──
        db.run("BEGIN TRANSACTION", (beginErr) => {
          if (beginErr)
            return res.status(500).json({ error: beginErr.message });

          const rollback = (errMsg) => {
            db.run("ROLLBACK");
            return res.status(500).json({ error: errMsg });
          };

          // 1. Köhnə login sırasını oxu
          db.get(
            "SELECT * FROM login WHERE userCode=?",
            [oldCode],
            (e1, loginRow) => {
              if (e1 || !loginRow) return rollback("İstifadəçi tapılmadı.");

              const finalPass = pass && pass.trim() ? pass : loginRow.pass;

              // 2. Yeni userCode ilə login-ə INSERT et
              db.run(
                "INSERT INTO login (userCode, pass, role, blocked, createdAt) VALUES (?, ?, ?, ?, ?)",
                [
                  newCode,
                  finalPass,
                  loginRow.role,
                  loginRow.blocked,
                  loginRow.createdAt,
                ],
                (e2) => {
                  if (e2) return rollback(e2.message);

                  // 3. personalInfo-nu oxu
                  db.get(
                    "SELECT * FROM personalInfo WHERE userCode=?",
                    [oldCode],
                    (e3, pRow) => {
                      if (e3) return rollback(e3.message);

                      // 4. Yeni userCode ilə personalInfo-ya INSERT OR REPLACE et
                      db.run(
                        `INSERT OR REPLACE INTO personalInfo
                   (userCode, name, email, slug, about, image)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                          newCode,
                          name || (pRow && pRow.name) || null,
                          email || (pRow && pRow.email) || null,
                          pRow && pRow.slug,
                          about || (pRow && pRow.about) || null,
                          image || (pRow && pRow.image) || null,
                        ],
                        (e4) => {
                          if (e4) return rollback(e4.message);

                          // 5. sosialInfo-da userCode-u yenilə
                          db.run(
                            "UPDATE sosialInfo SET userCode=? WHERE userCode=?",
                            [newCode, oldCode],
                            (e5) => {
                              if (e5) return rollback(e5.message);

                              // 6. Köhnə login sırasını sil
                              db.run(
                                "DELETE FROM login WHERE userCode=?",
                                [oldCode],
                                (e6) => {
                                  if (e6) return rollback(e6.message);

                                  // 7. COMMIT
                                  db.run("COMMIT", (e7) => {
                                    if (e7) return rollback(e7.message);
                                    return res.json({
                                      ok: true,
                                      userCode: newCode,
                                    });
                                  });
                                },
                              );
                            },
                          );
                        },
                      );
                    },
                  );
                },
              );
            },
          );
        });
      },
    );
  };

  // multipart (şəkil yükləmə) olarsa multer işlət
  if (contentType.includes("multipart/form-data")) {
    upload.single("image")(req, res, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      const imageVal = req.file
        ? `/uploads/${req.file.filename}`
        : req.body.image || null;
      processRequest(imageVal);
    });
  } else {
    // JSON body — multer yoxdur, req.body birbaşa oxunur
    processRequest(req.body.image || null);
  }
});

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

// Superadmin: istifadəçinin social linklərini gör
app.get("/api/admin/users/:code/social", auth, superadminOnly, (req, res) => {
  db.all(
    "SELECT * FROM sosialInfo WHERE userCode=?",
    [req.params.code],
    (err, rows) => res.json(rows || []),
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
  db.all("SELECT * FROM sosial", (err, rows) => res.json(rows || []));
});

// ───── USER: PROFİL ─────
app.get("/api/user/me", auth, (req, res) => {
  db.get(
    `SELECT p.*, l.blocked, l.createdAt
     FROM personalInfo p
     JOIN login l ON p.userCode = l.userCode
     WHERE p.userCode=?`,
    [req.user.userCode],
    (err, row) => {
      if (!row) return res.status(404).json({ error: "Profil tapılmadı" });
      res.json(row);
    },
  );
});

app.put("/api/user/me", auth, upload.single("image"), (req, res) => {
  const { name, email, about } = req.body;
  let image = req.body.image;
  if (req.file) image = `/uploads/${req.file.filename}`;

  db.run(
    "UPDATE personalInfo SET name=?, email=?, about=?, image=? WHERE userCode=?",
    [name, email, about, image, req.user.userCode],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    },
  );
});

// ───── USER: SOSİAL LİNKLƏR ─────
app.get("/api/user/social-info", auth, (req, res) => {
  db.all(
    `SELECT si.id, si.category, si.link, si.clicks, s.icon
     FROM sosialInfo si
     LEFT JOIN sosial s ON si.category = s.name
     WHERE si.userCode=?`,
    [req.user.userCode],
    (err, rows) => res.json(rows || []),
  );
});

app.post("/api/user/social-info", auth, (req, res) => {
  const { category, link } = req.body;
  if (!category || !link)
    return res.status(400).json({ error: "Kateqoriya və link tələb olunur" });
  db.run(
    "INSERT INTO sosialInfo (userCode, category, link) VALUES (?, ?, ?)",
    [req.user.userCode, category, link],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    },
  );
});

app.delete("/api/user/social-info/:id", auth, (req, res) => {
  db.run(
    "DELETE FROM sosialInfo WHERE id=? AND userCode=?",
    [req.params.id, req.user.userCode],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    },
  );
});

// ───── SOSİAL LİNK KLİK SAYACI (public) ─────
app.post("/api/social/click/:id", (req, res) => {
  db.run(
    "UPDATE sosialInfo SET clicks = clicks + 1 WHERE id=?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    },
  );
});

// ───── PUBLIC: SLUG ilə profil ─────
app.get("/api/profile/:slug", (req, res) => {
  db.get(
    `SELECT p.*, l.userCode
     FROM personalInfo p
     JOIN login l ON p.userCode = l.userCode
     WHERE p.slug=? AND l.blocked=0`,
    [req.params.slug],
    (err, profile) => {
      if (!profile) return res.status(404).json({ error: "Profil tapılmadı" });
      db.all(
        `SELECT si.id, si.category, si.link, si.clicks, s.icon
         FROM sosialInfo si
         LEFT JOIN sosial s ON si.category = s.name
         WHERE si.userCode=?`,
        [profile.userCode],
        (e, links) => res.json({ ...profile, links: links || [] }),
      );
    },
  );
});

app.listen(3000, () =>
  console.log("✅ Server 3000-dədir. Superadmin: SUPERADMIN / admin123"),
);
