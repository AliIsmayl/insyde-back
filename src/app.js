// src/app.js
// Məqsəd: Express tətbiqinin ayarları və cross-origin icazələrinin verilməsi.
const express = require('express');
const cors = require('cors'); 
const routes = require('./routes');

const app = express();

// Niyə: Brauzerin fərqli portlardan (məsələn, 5500-dən 3000-ə) gələn sorğuları bloklamasının qarşısını almaq üçün.
// Dövr Mürəkkəbliyi: O(1) - Sadəcə gələn hər sorğuya lazımi təhlükəsizlik başlıqlarını (headers) əlavə edir.
app.use(cors()); 

// Niyə: JSON formatında gələn body məlumatlarını oxumaq üçün.
app.use(express.json());

// Bütün API-ları /api prefiksi altına alırıq
app.use('/api', routes);

module.exports = app;