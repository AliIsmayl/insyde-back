const jwt = require('jsonwebtoken');
const SECRET = "top_secret_key";

exports.verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Token yoxdur" });
    try {
        req.user = jwt.verify(token, SECRET);
        next();
    } catch (err) { res.status(401).json({ error: "Keçərsiz token" }); }
};

exports.checkRole = (role) => (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: "İcazə yoxdur" });
    next();
};

exports.SECRET = SECRET;