const express = require('express');
const router = express.Router();
const Parser = require('rss-parser');

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'AccidentNewsBot/1.0' },
  customFields: {
    item: [
      ['media:thumbnail', 'thumbnail'],
      ['enclosure', 'enclosure'],
      ['description', 'description'],
    ],
  },
});

// ─── Thai accident keywords ───────────────────────────────────────────────────
const ACCIDENT_KEYWORDS = [
  'อุบัติเหตุ', 'ชนกัน', 'ชนท้าย', 'พลิกคว่ำ', 'ตกถนน', 'ตกเขา', 'ตกคลอง',
  'รถชน', 'รถยนต์ชน', 'รถบรรทุก', 'มอเตอร์ไซค์ชน', 'จักรยานยนต์ชน',
  'ไฟไหม้', 'ระเบิด', 'สะพานถล่ม', 'ดินถล่ม', 'น้ำท่วม',
  'คนเจ็บ', 'ดับ', 'เสียชีวิต', 'บาดเจ็บ', 'เสียหาย',
  'ทางหลวง', 'ทางด่วน', 'ถนน', 'intersection',
];

// ─── RSS feed sources (Thailand) ─────────────────────────────────────────────
const RSS_FEEDS = [
  {
    name: 'Thai PBS',
    url: 'https://www.thaipbs.or.th/news/rss',
    logoUrl: 'https://www.thaipbs.or.th/favicon.ico',
  },
  {
    name: 'Sanook News',
    url: 'https://www.sanook.com/news/feed/',
    logoUrl: 'https://img.sanook.com/favicon.ico',
  },
  {
    name: 'Khaosod',
    url: 'https://www.khaosod.co.th/feed',
    logoUrl: 'https://www.khaosod.co.th/favicon.ico',
  },
  {
    name: 'Matichon',
    url: 'https://www.matichon.co.th/feed',
    logoUrl: 'https://www.matichon.co.th/favicon.ico',
  },
  {
    name: 'Daily News',
    url: 'https://www.dailynews.co.th/feed/',
    logoUrl: 'https://www.dailynews.co.th/favicon.ico',
  },
];

// ─── Simple in-memory cache (5 minutes) ──────────────────────────────────────
let cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

function isAccident(item) {
  const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.description || ''}`;
  return ACCIDENT_KEYWORDS.some(kw => text.includes(kw));
}

function extractImage(item) {
  if (item.enclosure?.url && item.enclosure.url.match(/\.(jpg|jpeg|png|webp)/i)) return item.enclosure.url;
  if (item.thumbnail?.['$']?.url) return item.thumbnail['$'].url;
  if (item.thumbnail) return item.thumbnail;
  // Try to pull first <img> from description
  const match = (item.description || '').match(/src="([^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i);
  if (match) return match[1];
  return null;
}

// ─── Extract rough location from title/description ────────────────────────────
function extractLocation(text) {
  const provincePatterns = [
    'กรุงเทพ', 'เชียงใหม่', 'ภูเก็ต', 'ขอนแก่น', 'นครราชสีมา', 'อุดรธานี',
    'สงขลา', 'ชลบุรี', 'ระยอง', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ',
    'อยุธยา', 'สระบุรี', 'ลพบุรี', 'นครสวรรค์', 'พิษณุโลก', 'เชียงราย',
    'แม่ฮ่องสอน', 'ลำพูน', 'ลำปาง', 'น่าน', 'แพร่', 'อุตรดิตถ์',
    'สุโขทัย', 'กำแพงเพชร', 'ตาก', 'เพชรบูรณ์', 'พิจิตร',
    'กาฬสินธุ์', 'มหาสารคาม', 'ร้อยเอ็ด', 'ยโสธร', 'อำนาจเจริญ',
    'มุกดาหาร', 'นครพนม', 'สกลนคร', 'บึงกาฬ', 'หนองคาย', 'เลย',
    'หนองบัวลำภู', 'ชัยภูมิ', 'บุรีรัมย์', 'สุรินทร์', 'ศรีสะเกษ',
    'อุบลราชธานี', 'กระบี่', 'ตรัง', 'พัทลุง', 'สตูล', 'นราธิวาส',
    'ปัตตานี', 'ยะลา', 'สุราษฎร์ธานี', 'นครศรีธรรมราช', 'ชุมพร',
    'ระนอง', 'พังงา', 'กาญจนบุรี', 'ราชบุรี', 'สุพรรณบุรี',
    'นครปฐม', 'สมุทรสาคร', 'สมุทรสงคราม', 'เพชรบุรี', 'ประจวบคีรีขันธ์',
    'จันทบุรี', 'ตราด', 'สระแก้ว', 'นครนายก', 'ปราจีนบุรี', 'ฉะเชิงเทรา',
  ];
  for (const prov of provincePatterns) {
    if (text.includes(prov)) return prov;
  }
  return null;
}

// ─── GET /api/news ─────────────────────────────────────────────────────────────
router.get('/news', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && (now - cache.ts) < CACHE_TTL) {
      return res.json(cache.data);
    }

    const results = await Promise.allSettled(
      RSS_FEEDS.map(async (feed) => {
        const rss = await parser.parseURL(feed.url);
        return rss.items.map(item => ({
          id: item.guid || item.link || `${feed.name}-${item.pubDate}`,
          title: item.title || '',
          description: (item.contentSnippet || item.description || '').replace(/<[^>]+>/g, '').slice(0, 200),
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || '',
          source: feed.name,
          sourceLogo: feed.logoUrl,
          image: extractImage(item),
          location: extractLocation(`${item.title || ''} ${item.contentSnippet || ''}`),
        }));
      })
    );

    const allItems = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .filter(isAccident);

    // De-duplicate by title similarity & sort newest first
    const seen = new Set();
    const unique = allItems.filter(item => {
      const key = item.title.slice(0, 30);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    const payload = { items: unique.slice(0, 40), updatedAt: new Date().toISOString() };
    cache = { data: payload, ts: now };

    res.json(payload);
  } catch (err) {
    console.error('[NEWS ERROR]', err.message);
    res.status(500).json({ error: 'Failed to fetch news', detail: err.message });
  }
});

// ─── GET /api/news/geocode?location=... ───────────────────────────────────────
router.get('/news/geocode', async (req, res) => {
  const { location } = req.query;
  if (!location) return res.status(400).json({ error: 'location required' });

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location + ' ประเทศไทย')}&format=json&limit=1`;

  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'AccidentNewsBot/1.0' } });
    const data = await resp.json();
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      res.json({ lat, lng, formattedAddress: data[0].display_name });
    } else {
      res.status(404).json({ error: 'Location not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
