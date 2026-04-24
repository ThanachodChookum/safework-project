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
    console.log('[CHAT] New Request:', { message, historyLength: history?.length, hasFile: !!req.file });

    if (!process.env.TYPHOON_API_KEY) {
      console.error('[CHAT ERROR] Missing TYPHOON_API_KEY');
      return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    }

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
        content: `You are Coworker AI, a professional Thai assistant.
Capabilities: File analysis (PDF, Word, Excel, Code), generation of any file format, and summarization.
Rules:
1. Always respond in Thai. Be concise.
2. No intro/outro (e.g., "Certainly!", "Here is..."). Start immediately.
3. Use Code Blocks for structured files (CSV, JSON, Code) with correct lang/ext.
4. Use normal Markdown for reports and articles.
5. If requested for a specific file format, provide its content in a code block.`
      },
      ...messages
        .filter(m => m.content && !m.content.startsWith('⌛'))
        .map(m => {
          let content = m.content;
          if (Array.isArray(m.content)) {
            content = m.content.map(c => c.text || '').join('\n');
          }
          return { role: m.role, content: String(content) };
        })
    ];

    console.log('[CHAT] Final Payload:', JSON.stringify(formattedMessages.slice(-2)));

    console.log('[CHAT] Calling Typhoon API...');
    
    // Add an AbortController to set a hard timeout (e.g., 20 seconds) for the initial response
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let stream;
    try {
      stream = await client.chat.completions.create({
        model: 'typhoon-v2.5-30b-a3b-instruct',
        messages: formattedMessages,
        stream: true,
        max_tokens: 4096,
      }, { signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error('API Timeout: ระบบ API ของ Typhoon ไม่ตอบสนองในเวลาที่กำหนด (อาจเกิดจากเซิร์ฟเวอร์หลักล่มหรือหน่วง)');
      }
      throw e;
    }

    console.log('[CHAT] Stream started, sending chunks...');
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ type: 'delta', text: content })}\n\n`);
      }
    }
    
    console.log('[CHAT] Stream finished successfully');
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
