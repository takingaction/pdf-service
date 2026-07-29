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
 * Inject page numbers using CSS counters - works on all Chromium builds
 */
function injectPageNumberCss(html, course, lesson) {
  const courseTitle = (course?.title || 'Unknown Course').toUpperCase();
  const grade = course?.grade || 'N/A';
  const lessonNum = lesson?.lesson_number || '1';
  const leftText = `${courseTitle} | ${grade} | LESSON ${lessonNum}`;

  const css = `
    <style>
      @page {
        margin: 0.5in 0.5in 0.8in 0.5in;
      }
      html {
        counter-reset: page;
      }
      .page-footer {
        position: fixed;
        bottom: 0.25in;
        left: 0.5in;
        right: 0.5in;
        font-family: Arial, sans-serif;
        font-size: 9pt;
        color: #333;
        display: flex;
        justify-content: space-between;
      }
      .page-footer-left::before {
        counter-increment: page;
        content: "${leftText}";
      }
      .page-footer-right::after {
        content: "PAGE " counter(page) " OF " counter(pages);
      }
    </style>
    <div class="page-footer">
      <span class="page-footer-left"></span>
      <span class="page-footer-right"></span>
    </div>
  `;

  return html.replace('</body>', `${css}</body>`);
}

/**
 * Generate PDF from HTML
 */
async function generatePDF(html, filename = 'document.pdf', options = {}) {
  let browser = null;

  const { course = null, lesson = null } = options;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

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
      },
      // TEST: barebones footer to check if pageNumber/totalPages injection works
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:12pt;color:red;font-family:Arial;">PAGE <span class="pageNumber"></span> OF <span class="totalPages"></span></div>',
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

    // CSS counter injection disabled - testing native footer template instead
    // if (course && lesson) {
    //   html = injectPageNumberCss(html, course, lesson);
    // }

    const safeFilename = filename ||
      `${lesson.title || `Lesson-${lesson.lesson_number}`}.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');

    const { pdf } = await generatePDF(html, safeFilename);

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
