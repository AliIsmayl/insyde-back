// src/app.test.js
const request = require('supertest');
const app = require('./app');

describe('CORS Middleware', () => {
    it('CORS başlıqları hər sorğuda mövcud olmalıdır', async () => {
        // Niyə: İxtiyari mövcud olmayan bir yola sorğu atıb başlıqları yoxlayırıq
        const res = await request(app).options('/api/auth/login');
        
        // Mürəkkəblik: O(1) xassə yoxlanışı
        expect(res.headers['access-control-allow-origin']).toBe('*');
    });
});