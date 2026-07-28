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
 * Generate PDF from HTML
 * @param {string} html - HTML content
 * @param {string} filename - filename for the PDF
 * @param {Object} options - { footerHtml, displayHeaderFooter }
 * @returns {Promise<{pdf: Buffer, filename: string}>}
 */
async function generatePDF(html, filename = 'document.pdf', options = {}) {
  let browser = null;

  const { footerHtml = null, displayHeaderFooter = false } = options;

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

    await page.waitForTimeout(500);

    const pdfOptions = {
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.6in',
        left: '0.5in'
      }
    };

    if (displayHeaderFooter && footerHtml) {
      pdfOptions.displayHeaderFooter = true;
      pdfOptions.footerTemplate = footerHtml;
      pdfOptions.headerTemplate = '<div></div>'; // Empty header
    }

    const pdf = await page.pdf(pdfOptions);

    await browser.close();

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

/**
 * Build footer HTML for Puppeteer
 */
function buildFooterHtml(course, lesson) {
  const courseTitle = course?.title || 'Unknown Course';
  const grade = course?.grade || 'N/A';
  const lessonNum = lesson?.lesson_number || '1';

  return `
    <div style="width: 100%; font-size: 9pt; font-family: Arial, Helvetica, sans-serif; padding: 0 0.25in; display: flex; justify-content: space-between; color: #333;">
      <div>
        ${escapeHtml(courseTitle).toUpperCase()} | ${grade} | LESSON ${lessonNum}
      </div>
      <div>
        PAGE <span class="pageNumber" style="color: #333;"></span> OF <span class="totalPages" style="color: #333;"></span>
      </div>
    </div>
  `;
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
    const html = buildLessonPDFHtml({ lesson, course, appUrl });

    const safeFilename = filename ||
      `${lesson.title || `Lesson-${lesson.lesson_number}`}.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');

    // Build footer with course/lesson info
    const footerHtml = buildFooterHtml(course, lesson);

    const { pdf } = await generatePDF(html, safeFilename, {
      footerHtml,
      displayHeaderFooter: true
    });

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

/**
 * Test page numbers - simple test to verify Puppeteer page numbers work
 * GET /test-page-numbers
 */
app.get('/test-page-numbers', async (req, res) => {
  const testHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page { size: letter; margin: 0.5in; }
        body { font-family: Arial; }
        .content { height: 9in; }
      </style>
    </head>
    <body>
      <div class="content">Page 1 content</div>
      <div class="content">Page 2 content</div>
      <div class="content">Page 3 content</div>
    </body>
    </html>
  `;

  const footerHtml = `
    <div style="width: 100%; font-size: 9pt; font-family: Arial; display: flex; justify-content: space-between;">
      <span>COURSE | GRADE | LESSON 1</span>
      <span>PAGE <span class="pageNumber"></span> OF <span class="totalPages"></span></span>
    </div>
  `;

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(testHtml, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.6in', left: '0.5in' },
      displayHeaderFooter: true,
      footerTemplate: footerHtml,
      headerTemplate: '<div></div>',
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=test-page-numbers.pdf');
    res.send(pdf);
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
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
