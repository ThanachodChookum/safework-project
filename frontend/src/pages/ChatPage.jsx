import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './ChatPage.css';

const API = '/api/chat';

const SUGGESTED = [
  'ช่วยเขียนโค้ด Python อ่านไฟล์ CSV และสรุปข้อมูล',
  'แปลงเอกสาร Word เป็น Markdown',
  'สร้าง template รายงานภาษาไทย',
  'ช่วยแก้บัคในโค้ดของฉัน',
];

function FileChip({ file, onRemove }) {
  const ext = file.name.split('.').pop().toUpperCase();
  const isImage = file.type.startsWith('image/');
  return (
    <div className="file-chip">
      {isImage
        ? <img src={URL.createObjectURL(file)} alt={file.name} className="file-chip-img" />
        : <span className="file-chip-ext">{ext}</span>
      }
      <span className="file-chip-name">{file.name}</span>
      <button className="file-chip-remove" onClick={onRemove} title="Remove">✕</button>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);

  const copyText = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadDocx = () => {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Document</title></head><body>";
    const footer = "</body></html>";
    let htmlContent = msg.content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
      
    const sourceHTML = header + `<div style="font-family: Sarabun, sans-serif; font-size: 14pt;">${htmlContent}</div>` + footer;
    
    const blob = new Blob(['\\ufeff', sourceHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    
    const fileDownload = document.createElement("a");
    fileDownload.style.display = 'none';
    fileDownload.href = url;
    fileDownload.download = 'AI_Document.doc';
    
    document.body.appendChild(fileDownload);
    fileDownload.click();
    
    setTimeout(() => {
      document.body.removeChild(fileDownload);
      URL.revokeObjectURL(url);
    }, 100);
  };

  return (
    <div className={`msg-row ${isUser ? 'user' : 'ai'}`}>
      <div className="msg-avatar">{isUser ? '👤' : '🤖'}</div>
      <div className="msg-bubble">
        {msg.file && (
          <div className="msg-file-badge">
            📎 {msg.file}
          </div>
        )}
        {isUser ? (
          <p className="msg-text">{msg.content}</p>
        ) : (
          <div className="msg-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ inline, className, children }) {
                  const lang = (className || '').replace('language-', '');
                  if (inline) return <code className="inline-code">{children}</code>;
                  return (
                    <div className="code-block">
                      {lang && <div className="code-lang">{lang}</div>}
                      <SyntaxHighlighter
                        language={lang || 'text'}
                        style={oneDark}
                        customStyle={{ margin: 0, borderRadius: '0 0 8px 8px', fontSize: '13px' }}
                        showLineNumbers
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                      <button
                        className="code-copy"
                        onClick={() => {
                          navigator.clipboard.writeText(String(children));
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  );
                },
                table({ children }) {
                  return <div className="table-wrap"><table>{children}</table></div>;
                },
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        )}
        {!isUser && msg.content && (
          <div className="msg-actions">
            <button className="msg-action-btn" onClick={copyText} title="คัดลอกข้อความ">
              {copied ? '✓' : '⎘'}
            </button>
            <button className="msg-action-btn" onClick={downloadDocx} title="ดาวน์โหลดเป็น Word">
              💾 Word
            </button>
          </div>
        )}
        {msg.streaming && <span className="typing-cursor" />}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build history for API (exclude streaming placeholder)
  const buildHistory = useCallback(() => {
    return messages
      .filter(m => !m.streaming)
      .map(m => ({ role: m.role, content: m.content }));
  }, [messages]);

  const sendMessage = useCallback(async (text = input) => {
    if ((!text.trim() && !file) || loading) return;
    setLoading(true);

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: text.trim(),
      file: file?.name,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setFile(null);

    // Placeholder for AI response
    const aiId = Date.now() + 1;
    setMessages(prev => [...prev, { id: aiId, role: 'assistant', content: '', streaming: true }]);

    try {
      const form = new FormData();
      form.append('message', text.trim());
      form.append('history', JSON.stringify(buildHistory()));
      if (file) form.append('file', file);

      const resp = await fetch(API, { method: 'POST', body: form });
      if (!resp.ok) throw new Error(`Server error ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'delta') {
              setMessages(prev =>
                prev.map(m => m.id === aiId
                  ? { ...m, content: m.content + evt.text }
                  : m
                )
              );
            }
            if (evt.type === 'done') {
              setMessages(prev =>
                prev.map(m => m.id === aiId ? { ...m, streaming: false } : m)
              );
            }
            if (evt.type === 'error') throw new Error(evt.message);
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === aiId
            ? { ...m, content: `❌ เกิดข้อผิดพลาด: ${err.message}`, streaming: false }
            : m
        )
      );
    } finally {
      setLoading(false);
      textRef.current?.focus();
    }
  }, [input, file, loading, buildHistory]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const clearChat = () => {
    if (window.confirm('ล้างการสนทนาทั้งหมด?')) setMessages([]);
  };

  return (
    <div
      className="chat-layout"
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* ── Header ── */}
      <div className="chat-header">
        <div>
          <div className="chat-title">AI Coworker</div>
          <div className="chat-subtitle">ช่วยสร้าง แก้ไข วิเคราะห์ไฟล์ทุกประเภท</div>
        </div>
        {messages.length > 0 && (
          <button className="clear-btn" onClick={clearChat}>ล้างการสนทนา</button>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="empty-icon">🤖</div>
            <h2>สวัสดีครับ ผมคือ AI Coworker</h2>
            <p>ถามอะไรก็ได้ หรือแนบไฟล์เพื่อให้ผมช่วยวิเคราะห์</p>
            <div className="suggestions">
              {SUGGESTED.map((s, i) => (
                <button key={i} className="suggest-btn" onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => <Message key={msg.id} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="chat-input-area">
        {file && (
          <div className="file-chips">
            <FileChip file={file} onRemove={() => setFile(null)} />
          </div>
        )}
        <div className="input-row">
          <button
            className="attach-btn"
            onClick={() => fileRef.current.click()}
            title="แนบไฟล์"
            disabled={loading}
          >
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.json,.html,.docx,.xlsx"
          />
          <textarea
            ref={textRef}
            className="chat-textarea"
            placeholder="พิมพ์ข้อความ หรือลากไฟล์มาวาง… (Shift+Enter ขึ้นบรรทัดใหม่)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            style={{ height: 'auto' }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
            }}
            disabled={loading}
          />
          <button
            className={`send-btn ${loading ? 'loading' : ''}`}
            onClick={() => sendMessage()}
            disabled={loading || (!input.trim() && !file)}
          >
            {loading ? <span className="spinner" /> : '↑'}
          </button>
        </div>
        <div className="input-hint">
          รองรับ PDF · รูปภาพ · Word · Excel · Code · Text &nbsp;|&nbsp; ขนาดสูงสุด 20 MB
        </div>
      </div>
    </div>
  );
}
