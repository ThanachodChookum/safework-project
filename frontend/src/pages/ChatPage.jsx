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

  const getFileColor = (extension) => {
    const colors = {
      PDF: '#ff4d4f',
      DOCX: '#2b579a', DOC: '#2b579a',
      XLSX: '#217346', XLS: '#217346',
      CSV: '#10b981',
      JSON: '#f59e0b',
      PY: '#3776ab', JS: '#f7df1e',
      HTML: '#e34c26', CSS: '#264de4',
      TXT: '#6b7280'
    };
    return colors[extension] || 'var(--accent)';
  };

  return (
    <div className="file-chip" style={{ borderLeftColor: getFileColor(ext) }}>
      {isImage
        ? <img src={URL.createObjectURL(file)} alt={file.name} className="file-chip-img" />
        : <span className="file-chip-ext" style={{ backgroundColor: getFileColor(ext) + '22', color: getFileColor(ext) }}>{ext}</span>
      }
      <span className="file-chip-name">{file.name}</span>
      <button className="file-chip-remove" onClick={onRemove} title="Remove">✕</button>
    </div>
  );
}

function PreviewPanel({ data, onClose }) {
  if (!data) return null;

  const renderContent = () => {
    if (data.type === 'csv') {
      const rows = data.content.split('\n').filter(r => r.trim());
      const header = rows[0]?.split(',').map(h => h.trim());
      const body = rows.slice(1).map(r => r.split(',').map(c => c.trim()));

      return (
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead>
              <tr>{header?.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (data.type === 'doc') {
      return (
        <div className="preview-doc-container">
          <div className="preview-doc">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {data.content}
            </ReactMarkdown>
          </div>
        </div>
      );
    }

    if (data.type === 'diff' || data.language === 'diff') {
      const lines = data.content.split('\n');
      return (
        <div className="preview-diff">
          {lines.map((line, i) => {
            const isAdd = line.startsWith('+');
            const isRem = line.startsWith('-');
            return (
              <div key={i} className={isAdd ? 'diff-add' : isRem ? 'diff-remove' : ''}>
                {line}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <SyntaxHighlighter
        language={data.language || 'text'}
        style={oneDark}
        customStyle={{ margin: 0, borderRadius: '8px', fontSize: '13px' }}
        showLineNumbers
      >
        {data.content}
      </SyntaxHighlighter>
    );
  };

  return (
    <div className="chat-preview">
      <div className="preview-header">
        <div className="preview-title">{data.title || 'Preview'}</div>
        <button className="preview-close" onClick={onClose}>✕</button>
      </div>
      <div className="preview-content">
        {renderContent()}
      </div>
    </div>
  );
}

function Message({ msg, onPreview }) {
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

    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
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

  const downloadTxt = () => {
    const blob = new Blob([msg.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AI_Document.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    // Basic CSV to pseudo-excel (tab-separated)
    const content = msg.content.includes('```')
      ? msg.content.match(/```(?:csv|excel|xlsx)?\n([\s\S]*?)```/)?.[1] || msg.content
      : msg.content;

    const blob = new Blob([content], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AI_Data.xls';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const element = document.createElement('div');
    element.style.padding = '40px';
    element.style.color = '#333';
    element.style.background = '#fff';
    element.style.fontFamily = 'Sarabun, sans-serif';

    // Basic Markdown to HTML conversion for PDF
    let htmlContent = msg.content
      .replace(/# (.*)/g, '<h1 style="color:#000; text-align:center; border-bottom:1px solid #ccc; padding-bottom:10px;">$1</h1>')
      .replace(/## (.*)/g, '<h2 style="color:#222; border-bottom:1px solid #eee; padding-bottom:5px; margin-top:20px;">$1</h2>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/```([\s\S]*?)```/g, '<pre style="background:#f4f4f4; padding:10px; border-radius:5px; font-family:monospace; white-space:pre-wrap;">$1</pre>')
      .replace(/\n/g, '<br/>');

    element.innerHTML = `<div style="max-width:800px; margin:auto;">${htmlContent}</div>`;

    const opt = {
      margin: 10,
      filename: 'AI_Report.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Use html2pdf library
    if (window.html2pdf) {
      window.html2pdf().set(opt).from(element).save();
    } else {
      alert('ขออภัย ระบบ PDF กำลังโหลด กรุณารอสักครู่แล้วลองใหม่ครับ');
    }
  };

  const downloadAsFile = (content, lang) => {
    const langMap = {
      python: 'py', py: 'py',
      javascript: 'js', js: 'js',
      typescript: 'ts', ts: 'ts',
      html: 'html',
      css: 'css',
      json: 'json',
      csv: 'csv',
      excel: 'xls',
      xlsx: 'xlsx',
      sql: 'sql',
      markdown: 'md', md: 'md',
      text: 'txt', txt: 'txt',
      bash: 'sh', sh: 'sh',
      powershell: 'ps1',
      java: 'java',
      c: 'c', cpp: 'cpp',
      go: 'go',
      rust: 'rs',
      php: 'php',
      ruby: 'rb',
    };
    const ext = langMap[lang.toLowerCase()] || 'txt';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_generated_file.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`msg-row ${isUser ? 'user' : 'ai'}`}>
      <div className="msg-avatar">{isUser ? '👤' : '🤖'}</div>
      <div className="msg-bubble">
        {msg.file && (() => {
          const ext = msg.file.split('.').pop().toUpperCase();
          const getFileColor = (extension) => {
            const colors = {
              PDF: '#ff4d4f',
              DOCX: '#2b579a', DOC: '#2b579a',
              XLSX: '#217346', XLS: '#217346',
              CSV: '#10b981',
              JSON: '#f59e0b',
              TXT: '#6b7280'
            };
            return colors[extension] || 'var(--text-muted)';
          };
          const color = getFileColor(ext);
          return (
            <div className="msg-file-badge" style={{ borderLeft: `3px solid ${color}` }}>
              <span className="msg-file-badge-ext" style={{ color: color }}>{ext}</span>
              <span className="msg-file-badge-name">{msg.file}</span>
            </div>
          );
        })()}
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
                      <div className="code-header">
                        {lang && <div className="code-lang">{lang}</div>}
                        <div className="code-tools">
                          <button
                            className="code-tool-btn"
                            onClick={() => {
                              navigator.clipboard.writeText(String(children));
                              setCopied(true);
                              setTimeout(() => setCopied(false), 1500);
                            }}
                          >
                            {copied ? '✓ Copied' : 'Copy'}
                          </button>
                          <button
                            className="code-tool-btn download"
                            onClick={() => downloadAsFile(String(children), lang || 'text')}
                          >
                            💾 Download
                          </button>
                          <button
                            className="code-tool-btn preview"
                            onClick={() => onPreview({
                              type: (lang === 'csv') ? 'csv' : 'code',
                              title: `Preview: ${lang || 'file'}`,
                              content: String(children).replace(/\n$/, ''),
                              language: lang
                            })}
                          >
                            👁 Preview
                          </button>
                        </div>
                      </div>
                      <SyntaxHighlighter
                        language={lang || 'text'}
                        style={oneDark}
                        customStyle={{ margin: 0, borderRadius: '0 0 8px 8px', fontSize: '13px' }}
                        showLineNumbers
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
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
            <button className="msg-action-btn pdf" onClick={downloadPdf} title="ดาวน์โหลดเป็น PDF">
              📕 PDF
            </button>
            <button className="msg-action-btn word" onClick={downloadDocx} title="ดาวน์โหลดเป็น Word">
              📘 Word
            </button>
            {(msg.content.toLowerCase().includes('excel') || msg.content.toLowerCase().includes('csv') || msg.content.includes('|')) && (
              <button className="msg-action-btn excel" onClick={downloadExcel} title="ดาวน์โหลดเป็น Excel">
                📗 Excel
              </button>
            )}
            <button className="msg-action-btn text" onClick={downloadTxt} title="ดาวน์โหลดเป็น Text">
              📄 Text
            </button>
            <button className="msg-action-btn preview" onClick={() => onPreview({
              type: 'doc',
              title: 'Document Preview',
              content: msg.content
            })} title="ดูตัวอย่างเอกสาร">
              👁 Preview
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
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build history for API (exclude streaming placeholder)
  const buildHistory = (currentMessages) => {
    return currentMessages
      .filter(m => !m.streaming)
      .map(m => ({ role: m.role, content: m.content }));
  };

  const sendMessage = useCallback(async (text = input) => {
    if ((!text.trim() && !file) || loading) return;
    setLoading(true);

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: text.trim(),
      file: file?.name,
    };

    // Prepare history BEFORE updating state to avoid closure issues.
    // We only send previous messages, because the backend appends the current user message itself.
    const currentHistory = buildHistory(messages);

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setFile(null);

    // Placeholder for AI response
    const aiId = Date.now() + 1;
    const placeholder = { id: aiId, role: 'assistant', content: '', streaming: true };
    setMessages(prev => [...prev, placeholder]);

    let timeoutId = setTimeout(() => {
      setMessages(prev => prev.map(m => (m.id === aiId && m.content === '')
        ? { ...m, content: '⌛ กำลังประมวลผล... (ใช้เวลามากกว่าปกติเล็กน้อย)' }
        : m
      ));
    }, 10000);

    try {
      const form = new FormData();
      form.append('message', text.trim());
      form.append('history', JSON.stringify(currentHistory));
      if (file) form.append('file', file);

      const resp = await fetch(API, { method: 'POST', body: form });
      clearTimeout(timeoutId);

      if (!resp.ok) throw new Error(`Server error ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let hasReceivedData = false;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

          try {
            const jsonStr = trimmedLine.slice(6);
            const evt = JSON.parse(jsonStr);

            if (evt.type === 'delta' && evt.text) {
              if (!hasReceivedData) {
                hasReceivedData = true;
                setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: '' } : m));
              }
              setMessages(prev =>
                prev.map(m => m.id === aiId ? { ...m, content: m.content + evt.text } : m)
              );
            }
            if (evt.type === 'done') {
              setMessages(prev =>
                prev.map(m => m.id === aiId ? { ...m, streaming: false } : m)
              );
            }
            if (evt.type === 'error') throw new Error(evt.message);
          } catch (e) {
            console.warn('[STREAM PARSE ERROR]', e);
          }
        }
      }

      if (!hasReceivedData) {
        throw new Error('AI ไม่ส่งข้อมูลกลับมา (Empty Stream)');
      }
    } catch (err) {
      clearTimeout(timeoutId);
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
  }, [input, file, loading, messages]);

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
      <div className="chat-main">
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
            messages.map(msg => <Message key={msg.id} msg={msg} onPreview={setPreview} />)
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

      {preview && (
        <PreviewPanel data={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
