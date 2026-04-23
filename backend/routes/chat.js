const express = require('express');
const router = express.Router();
const multer = require('multer');
const OpenAI = require('openai');

const client = new OpenAI({ 
  apiKey: process.env.TYPHOON_API_KEY,
  baseURL: 'https://api.opentyphoon.ai/v1'
});
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// ─── Multer: accept PDF, images, text files (max 20 MB) ──────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'text/plain', 'text/csv', 'text/html',
      'application/json',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ─── Helper: build message content with optional file ─────────────────────────
async function buildUserContent(text, file) {
  if (!file) return text;

  const mime = file.mimetype;
  let fileText = '';

  try {
    // PDF
    if (mime === 'application/pdf') {
      const data = await pdfParse(file.buffer);
      fileText = data.text;
    }
    // DOCX
    else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      fileText = result.value;
    }
    // Images
    else if (mime.startsWith('image/')) {
      return `[แนบรูปภาพ: ${file.originalname}]\n\n(ผู้ใช้ได้แนบรูปภาพมา แต่โมเดลนี้เป็น Text Model กรุณาแจ้งผู้ใช้ว่าไม่สามารถดูรูปได้)\n\n${text}`;
    }
    // Text-based files: read as plain text
    else {
      fileText = file.buffer.toString('utf-8');
    }

    if (fileText.length > 50000) {
      fileText = fileText.substring(0, 50000) + '\n... [ข้อความยาวเกินไป ถูกตัดออก] ...';
    }

    return `[เนื้อหาไฟล์: ${file.originalname}]\n\`\`\`\n${fileText}\n\`\`\`\n\n${text}`;
  } catch (err) {
    console.error('Parsing error:', err);
    return `[พยายามอ่านไฟล์ ${file.originalname} แต่เกิดข้อผิดพลาด]\n\n${text}`;
  }
}

// ─── POST /api/chat ────────────────────────────────────────────────────────────
router.post('/chat', upload.single('file'), async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message && !req.file) {
      return res.status(400).json({ error: 'message or file is required' });
    }

    // Parse conversation history
    let messages = [];
    try {
      messages = JSON.parse(history || '[]');
    } catch {
      messages = [];
    }

    // Append new user message
    const userContent = await buildUserContent(message || 'ช่วยวิเคราะห์ไฟล์นี้', req.file);
    messages.push({ role: 'user', content: userContent });

    // ─── Streaming ──────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Map system prompt and user history to OpenAI format
    const formattedMessages = [
      {
        role: 'system',
        content: `คุณเป็น Coworker AI ที่ช่วยงานด้านเอกสาร โค้ด และการวิเคราะห์ไฟล์
      
ความสามารถของคุณ:
- สร้าง แก้ไข และวิเคราะห์ไฟล์ทุกประเภท (PDF, Word, Excel, code, ข้อความ, รูปภาพ)
- เขียนและแก้ไขโค้ดทุกภาษา
- สรุปและวิเคราะห์เอกสาร
- แปลงรูปแบบไฟล์ (เช่น อธิบายวิธีแปลง CSV เป็น JSON)
- ตอบเป็นภาษาไทยเสมอ ยกเว้นโค้ดหรือคำศัพท์เทคนิค
- ตอบตรง กระชับ แต่ครบถ้วน
- ห้ามเกริ่นนำ (เช่น "นี่คือข้อมูล", "แน่นอน!") และห้ามสรุปปิดท้าย (เช่น "ต้องการอะไรเพิ่มไหม") ให้ตอบเฉพาะเนื้อหาล้วนๆ ทันที
- ห้ามพยายามสร้างไฟล์ด้วย Base64 หรือ Data URI เด็ดขาด ให้พิมพ์เนื้อหาออกมาเป็น Markdown ธรรมดา (ระบบจะมีปุ่มให้ผู้ใช้ดาวน์โหลดข้อความเป็นไฟล์ Word เอง)`
      },
      ...messages.map(m => {
        let content = m.content;
        if (Array.isArray(m.content)) {
          // Flatten array into text
          content = m.content.map(c => {
            if (c.type === 'text') return c.text;
            if (c.type === 'image' || c.type === 'document') {
               return `[แนบไฟล์ประเภท ${c.source.media_type}]`;
            }
            return JSON.stringify(c);
          }).join('\n');
        }
        return { role: m.role, content };
      })
    ];

    const stream = await client.chat.completions.create({
      model: 'typhoon-v2.5-30b-a3b-instruct',
      messages: formattedMessages,
      stream: true,
      max_tokens: 4096,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ type: 'delta', text: content })}\n\n`);
      }
    }
    
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);

    res.end();
  } catch (err) {
    console.error('[CHAT ERROR]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
