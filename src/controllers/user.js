// Məqsəd: Userin şəxsi və sosial məlumatlarını bazaya yazması.
const db = require('../db');

exports.createPersonalInfo = (req, res) => {
    const { slug, about, name, email, image } = req.body;
    const userCode = req.user.userCode; // Tokendən gəlir, saxtalaşdırıla bilməz.

    if (!name || !email) {
        return res.status(400).json({ error: "Name və Email mütləqdir" });
    }

    const info = { "user-code": userCode, slug, about, name, email, image, blocked: false };
    
    // Dövr Mürəkkəbliyi: O(1)
    db.personalInfo.push(info);
    return res.status(201).json({ message: "Personal info yadda saxlanıldı", data: info });
};

exports.addSocialInfo = (req, res) => {
    const { sosialCategory, sosialLink } = req.body;
    const userCode = req.user.userCode;

    if (!sosialCategory || !sosialLink) {
        return res.status(400).json({ error: "sosialCategory və sosialLink lazımdır" });
    }

    // Dövr Mürəkkəbliyi: O(N) - N sosial kateqoriyaların sayıdır.
    const categoryExists = db.sosial.some(s => s["sosial-name"] === sosialCategory);
    if (!categoryExists) {
        return res.status(404).json({ error: "Belə bir sosial kateqoriya (məs: Instagram) admin tərəfindən yaradılmayıb" });
    }

    const socialInfo = { "user-code": userCode, "sosial-category": sosialCategory, "sosial-link": sosialLink };
    
    // Dövr Mürəkkəbliyi: O(1)
    db.sosialInfo.push(socialInfo);
    
    return res.status(201).json({ message: "Sosial linkiniz əlavə edildi", data: socialInfo });
};