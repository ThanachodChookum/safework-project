# SafeWork — AI Coworker + Thailand Accident News

เว็บแอปพลิเคชัน 2 หน้า:
- **หน้า 1**: AI Coworker Chat พร้อม file upload (PDF, รูปภาพ, code, เอกสาร)
- **หน้า 2**: ข่าวอุบัติเหตุไทย พร้อมแผนที่และโรงพยาบาลใกล้เคียง

## โครงสร้างโปรเจกต์

```
project/
├── backend/          Node.js + Express
│   ├── server.js     entry point
│   ├── routes/
│   │   ├── chat.js       POST /api/chat
│   │   ├── news.js       GET /api/news, GET /api/news/geocode
│   │   └── hospitals.js  GET /api/hospitals
│   ├── .env.example
│   └── package.json
└── frontend/         React + Vite
    ├── src/
    │   ├── App.jsx
    │   ├── pages/
    │   │   ├── ChatPage.jsx + .css
    │   │   └── NewsPage.jsx + .css
    │   ├── index.css
    │   └── main.jsx
    ├── .env.example
    ├── vite.config.js
    └── package.json
```

## ขั้นตอนการติดตั้ง

### 1. เตรียม API Keys

| Key | ได้จากที่ไหน | ใช้ทำอะไร |
|-----|-------------|-----------|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com | Chat AI (หน้า 1) |
| `GOOGLE_API_KEY` | https://console.cloud.google.com | Maps + Places + Geocoding (หน้า 2) |

**Google API ต้องเปิด:**
- Maps JavaScript API
- Places API
- Geocoding API

### 2. ติดตั้ง Backend

```bash
cd backend
cp .env.example .env
# แก้ไข .env ใส่ keys

npm install
npm run dev    # development (port 5000)
# หรือ
npm start      # production
```

### 3. ติดตั้ง Frontend

```bash
cd frontend
cp .env.example .env
# ใส่ VITE_GOOGLE_API_KEY

npm install
npm run dev    # development (port 3000)
```

### 4. เปิดเบราว์เซอร์

```
http://localhost:3000
```

Vite จะ proxy `/api/*` ไปที่ backend port 5000 อัตโนมัติ

---

## API Endpoints

### POST /api/chat
Chat กับ Claude พร้อม streaming

**Form Data:**
- `message` (string) — ข้อความ
- `history` (JSON string) — ประวัติการสนทนา `[{role, content}]`
- `file` (File, optional) — ไฟล์แนบ

**Response:** `text/event-stream`
```
data: {"type":"delta","text":"..."}
data: {"type":"done"}
```

---

### GET /api/news
ดึงข่าวอุบัติเหตุจาก RSS หลายแหล่ง (cache 5 นาที)

**Response:**
```json
{
  "items": [
    {
      "id": "...",
      "title": "...",
      "description": "...",
      "link": "...",
      "pubDate": "2025-01-01T00:00:00Z",
      "source": "Thai PBS",
      "image": "https://...",
      "location": "เชียงใหม่"
    }
  ],
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

---

### GET /api/news/geocode?location=เชียงใหม่
แปลงชื่อสถานที่เป็น lat/lng

---

### GET /api/hospitals?lat=13.75&lng=100.50
ค้นหาโรงพยาบาลใกล้เคียง 3 แห่ง (Google Places API)

---

## Production Deploy

### Backend (Railway / Render / VPS)
```bash
cd backend
npm start
# ตั้ง env vars: ANTHROPIC_API_KEY, GOOGLE_API_KEY, FRONTEND_URL
```

### Frontend (Vercel / Netlify)
```bash
cd frontend
npm run build
# dist/ folder พร้อม deploy
# ตั้ง VITE_GOOGLE_API_KEY ใน env
# แก้ vite.config.js proxy → ชี้ไปที่ backend URL จริง
```

---

## เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
|------|-----------|
| Frontend | React 18 + Vite + React Router |
| Markdown | react-markdown + remark-gfm |
| Syntax highlight | react-syntax-highlighter |
| Backend | Node.js + Express |
| AI | Anthropic Claude claude-sonnet-4-20250514 |
| News | rss-parser (Thai PBS, Sanook, Khaosod, Matichon, Daily News) |
| Maps | Google Maps JavaScript API |
| Hospitals | Google Places Nearby Search API |
| Geocoding | Google Geocoding API |
| Upload | multer (memory storage) |
| Rate limiting | express-rate-limit |
