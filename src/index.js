/**
 * PDF Generation Service
 * Uses Puppeteer to render HTML to PDF
 */

const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { buildLessonPDFHtml } = require('./template');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
 * Add page numbers to PDF using pdf-lib
 * Uses incremental save to avoid file bloat
 */
async function addPageNumbers(pdfBytes, course, lesson) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const total = pages.length;

  const courseTitle = (course?.title || 'Unknown Course').toUpperCase();
  const grade = course?.grade || 'N/A';
  const lessonNum = lesson?.lesson_number || '1';
  const leftText = `${courseTitle} | ${grade} | LESSON ${lessonNum}`;

  const fontSize = 9;
  const y = 22;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width } = page.getSize();

    page.drawText(leftText, {
      x: 36,
      y,
      size: fontSize,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });

    const pageNumText = `PAGE ${i + 1} OF ${total}`;
    const textWidth = font.widthOfTextAtSize(pageNumText, fontSize);
    page.drawText(pageNumText, {
      x: width - 36 - textWidth,
      y,
      size: fontSize,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  return await pdfDoc.save({ incremental: true });
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

    // Check base PDF size first - if already near limit, skip pdf-lib entirely
    const SIZE_BUFFER = 500 * 1024; // 500KB buffer for safety
    const basePdfSize = pdf.length;

    // Add page numbers using pdf-lib
    let finalPdf = pdf;
    let usedPdfLib = false;

    if (course && lesson && basePdfSize < (MAX_FILE_SIZE - SIZE_BUFFER)) {
      try {
        finalPdf = await addPageNumbers(pdf, course, lesson);
        usedPdfLib = true;

        // If too large with pdf-lib, fall back to no page numbers
        if (finalPdf.length > MAX_FILE_SIZE) {
          console.log(`PDF too large with page numbers (${finalPdf.length} bytes), falling back`);
          finalPdf = pdf;
          usedPdfLib = false;
        }
      } catch (err) {
        console.error('pdf-lib error, using PDF without page numbers:', err.message);
        finalPdf = pdf;
      }
    } else if (basePdfSize >= (MAX_FILE_SIZE - SIZE_BUFFER)) {
      console.log(`Base PDF too large (${basePdfSize} bytes), skipping page numbers`);
    }

    console.log(`Generated PDF: ${finalPdf.length} bytes, usedPdfLib: ${usedPdfLib}`);

    return { pdf: finalPdf, filename };

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
    const html = buildLessonPDFHtml({ lesson, course, appUrl });

    console.log(`HTML input size: ${html.length} bytes (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

    const safeFilename = filename ||
      `${lesson.title || `Lesson-${lesson.lesson_number}`}.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');

    const { pdf } = await generatePDF(html, safeFilename, { course, lesson });

    console.log(`PDF output size: ${pdf.length} bytes (${(pdf.length / 1024 / 1024).toFixed(2)} MB)`);

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
