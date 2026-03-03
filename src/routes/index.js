// Məqsəd: Bütün endpointləri bir yerdə cəmləyərək app.js-i təmiz saxlamaq.
const express = require('express');
const router = express.Router();

const authCtrl = require('../controllers/auth');
const adminCtrl = require('../controllers/admin');
const userCtrl = require('../controllers/user');

const { verifyToken, checkRole } = require('../middlewares/auth');

// Auth
router.post('/auth/login', authCtrl.login);

// Admin Routes
router.post('/admin/social', verifyToken, checkRole('superadmin'), adminCtrl.createSocialCategory);

// User Routes
router.post('/user/personal-info', verifyToken, checkRole('user'), userCtrl.createPersonalInfo);
router.post('/user/social-info', verifyToken, checkRole('user'), userCtrl.addSocialInfo);

module.exports = router;