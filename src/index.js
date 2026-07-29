/**
 * PDF Generation Service
 * Uses Puppeteer to render HTML to PDF
 */

const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { buildLessonPDFHtml } = require('./template');

const app = express();
const PORT = process.env.PORT || 3000;

// Increase payload limit for HTML content
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-service' });
});

/**
 * Inject page numbers using CSS counters with @page auto-increment
 */
function injectPageNumbers(html, course, lesson) {
  const courseTitle = (course?.title || 'Unknown Course').toUpperCase();
  const grade = course?.grade || 'N/A';
  const lessonNum = lesson?.lesson_number || '1';
  const leftText = `${courseTitle} | ${grade} | LESSON ${lessonNum}`;

  const footerCss = `
    <style>
      @page {
        margin: 0.5in;
        margin-bottom: 0.8in;
        size: letter;
        counter-increment: page;
      }
      body {
        margin: 0;
      }
      .pdf-footer {
        position: fixed;
        bottom: 0.25in;
        left: 0.5in;
        right: 0.5in;
        font-family: Arial, sans-serif;
        font-size: 9pt;
        color: #333333;
        display: flex;
        justify-content: space-between;
      }
      .pdf-footer-left::before {
        content: "${leftText}";
      }
      .pdf-footer-right::before {
        content: "PAGE " counter(page);
      }
    </style>
  `;

  const footerHtml = `<div class="pdf-footer"><span class="pdf-footer-left"></span><span class="pdf-footer-right"></span></div>`;

  html = html.replace('</head>', `${footerCss}</head>`);
  html = html.replace('</body>', `${footerHtml}</body>`);

  return html;
}

/**
 * Generate PDF from HTML
 */
async function generatePDF(html, filename = 'document.pdf', options = {}) {
  let browser = null;

  const { course = null, lesson = null } = options;

  try {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--font-render-hinting=none',
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: 'new',
    });

    const page = await browser.newPage();

    // Inject page numbers via CSS before rendering
    if (course && lesson) {
      html = injectPageNumbers(html, course, lesson);
    }

    await page.setContent(html, {
      waitUntil: ['domcontentloaded', 'networkidle0'],
      timeout: 60000
    });

    await page.waitForTimeout(1000);

    const pdfOptions = {
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.8in',
        left: '0.5in'
      }
    };

    const pdf = await page.pdf(pdfOptions);

    await browser.close();

    console.log(`PDF output size: ${pdf.length} bytes (${(pdf.length / 1024 / 1024).toFixed(2)} MB)`);

    return { pdf, filename };

  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * PDF generation endpoint
 * POST /pdf
 * Body: { html: string, filename?: string }
 * Returns: application/pdf
 */
app.post('/pdf', async (req, res) => {
  const { html, filename = 'lesson.pdf' } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'html field is required' });
  }

  try {
    const { pdf, filename: safeFilename } = await generatePDF(html, filename);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({
      error: 'PDF generation failed',
      message: error.message
    });
  }
});

/**
 * Lesson PDF endpoint - accepts lesson data, builds HTML, generates PDF
 * POST /lesson-pdf
 * Body: { lesson: object, course: object, filename?: string }
 * Returns: application/pdf
 */
app.post('/lesson-pdf', async (req, res) => {
  const { lesson, course, filename } = req.body;

  if (!lesson) {
    return res.status(400).json({ error: 'lesson object is required' });
  }

  try {
    const appUrl = process.env.APP_URL || 'https://bh-curriculum-management.vercel.app';
    let html = buildLessonPDFHtml({ lesson, course, appUrl });

    console.log(`HTML input size: ${html.length} bytes (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

    const safeFilename = filename ||
      `${lesson.title || `Lesson-${lesson.lesson_number}`}.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');

    const { pdf } = await generatePDF(html, safeFilename, { course, lesson });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);

  } catch (error) {
    console.error('Lesson PDF error:', error);
    res.status(500).json({
      error: 'Failed to generate lesson PDF',
      message: error.message
    });
  }
});

/**
 * Debug endpoint - returns rendered HTML without PDF
 * POST /debug-html
 * Body: { lesson: object, course: object }
 * Returns: text/html
 */
app.post('/debug-html', (req, res) => {
  const { lesson, course } = req.body;

  if (!lesson) {
    return res.status(400).json({ error: 'lesson object is required' });
  }

  try {
    const appUrl = process.env.APP_URL || 'https://bh-curriculum-management.vercel.app';
    const html = buildLessonPDFHtml({ lesson, course, appUrl });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Debug HTML error:', error);
    res.status(500).json({
      error: 'Failed to build HTML',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`PDF service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`PDF endpoint: POST http://localhost:${PORT}/pdf`);
  console.log(`Lesson PDF: POST http://localhost:${PORT}/lesson-pdf`);
  console.log(`Debug HTML: POST http://localhost:${PORT}/debug-html`);
});
