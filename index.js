const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Foreshadow server is running' });
});

// Helper: Call Gemini API
async function callGemini(prompt) {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    }
  );
  return response.data.candidates[0].content.parts[0].text;
}

// Helper: Scrape article from URL
async function scrapeArticle(url) {
  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  const $ = cheerio.load(response.data);

  // Extract title
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    $('title').text().trim();

  // Extract image
  const image_url =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    null;

  // Extract source name
  const source_name =
    $('meta[property="og:site_name"]').attr('content') ||
    new URL(url).hostname.replace('www.', '');

  // Extract main content
  $('script, style, nav, footer, header, aside, .ad, .advertisement').remove();
  const content =
    $('article').text().trim() ||
    $('main').text().trim() ||
    $('body').text().trim().substring(0, 3000);

  return { title, image_url, source_name, content };
}

// Helper: Parse Gemini JSON response
function parseGeminiJson(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// POST /api/ai/process-article
app.post('/api/ai/process-article', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const { title, image_url, source_name, content } = await scrapeArticle(url);

    const prompt = `
You are a news editor for a Bangladeshi news app called The Foreshadow.
Analyze this article and return ONLY a valid JSON object with no extra text or markdown.

Article Title: ${title}
Article Content: ${content.substring(0, 2000)}
Source: ${source_name}

Return this exact JSON structure:
{
  "title_en": "English title (max 10 words, punchy)",
  "title_bn": "Bengali translation of the title",
  "summary_en": "2-3 sentence English summary for Bangladeshi readers",
  "summary_bn": "Bengali translation of the summary",
  "category": "One of: Politics, Business, Technology, Sports, International, Entertainment, Health, General",
  "image_url": "${image_url || ''}",
  "source_name": "${source_name}",
  "source_url": "${url}",
  "ai_score": 0.85,
  "is_local": false
}`;

    const raw = await callGemini(prompt);
    const result = parseGeminiJson(raw);
    res.json(result);
  } catch (err) {
    console.error('process-article error:', err.message);
    res.status(500).json({ error: 'Failed to process article', details: err.message });
  }
});

// POST /api/ai/search-keyword
app.post('/api/ai/search-keyword', async (req, res) => {
  const { keyword } = req.body;
  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });

  try {
    const prompt = `
You are a news editor for a Bangladeshi news app called The Foreshadow.
A journalist searched for the keyword: "${keyword}"

Generate a realistic news article preview about this topic relevant to Bangladesh or global news that affects Bangladesh.
Return ONLY a valid JSON object with no extra text or markdown:

{
  "title_en": "English headline (max 10 words, punchy)",
  "title_bn": "Bengali translation of the headline",
  "summary_en": "2-3 sentence English summary relevant to Bangladeshi readers",
  "summary_bn": "Bengali translation of the summary",
  "category": "One of: Politics, Business, Technology, Sports, International, Entertainment, Health, General",
  "image_url": "",
  "source_name": "The Foreshadow",
  "source_url": "",
  "ai_score": 0.80,
  "is_local": true
}`;

    const raw = await callGemini(prompt);
    const result = parseGeminiJson(raw);
    res.json(result);
  } catch (err) {
    console.error('search-keyword error:', err.message);
    res.status(500).json({ error: 'Failed to process keyword', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Foreshadow server running on port ${PORT}`);
});
