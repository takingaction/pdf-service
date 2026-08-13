/**
 * PDF Generation Service
 * Uses Puppeteer to render HTML to PDF
 */

const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { buildLessonPDFHtml, buildCoursePDFHtml } = require('./template');

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
 * Build footer HTML for Puppeteer
 */
function buildFooterHtml(course, lesson) {
  const courseTitle = course?.title || 'Unknown Course';
  const grade = course?.grade || 'N/A';
  const lessonNum = lesson?.lesson_number || '1';
  const year = new Date().getFullYear();

  return `
    <div style="width: 100%; font-family: Arial, Helvetica, sans-serif; padding: 0 0.5in; color: #333;">
      <div style="display: flex; justify-content: space-between; font-size: 9pt;">
        <div>
          ${escapeHtml(courseTitle).toUpperCase()} | GRADE ${grade} | LESSON ${lessonNum}
        </div>
      </div>
      <div style="font-size: 7pt; margin-top: 2pt;">
        &copy; ${year} Better Humans, LLC
      </div>
    </div>
  `;
}

/**
 * Build footer HTML for Course Scope and Sequence PDF
 */
function buildCourseFooterHtml(course) {
  const discipline = course?.discipline || 'COURSE';
  const disciplineLabel = discipline.toUpperCase() === 'DANCE' ? 'DANCE AND CULTURE' : discipline.toUpperCase();
  const year = new Date().getFullYear();

  return `
    <div style="width: 100%; font-family: Arial, Helvetica, sans-serif; padding: 0 0.5in; color: #333;">
      <div style="display: flex; justify-content: space-between; font-size: 9pt;">
        <div>${disciplineLabel}</div>
      </div>
      <div style="font-size: 7pt; margin-top: 2pt;">
        &copy; ${year} Better Humans, LLC
      </div>
    </div>
  `;
}

/**
 * Generate PDF from HTML
 */
async function generatePDF(html, filename = 'document.pdf', options = {}) {
  let browser = null;

  const { footerHtml = null, displayHeaderFooter = false } = options;

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
        bottom: '0.6in',
        left: '0.5in'
      }
    };

    if (displayHeaderFooter && footerHtml) {
      pdfOptions.displayHeaderFooter = true;
      pdfOptions.footerTemplate = footerHtml;
      pdfOptions.headerTemplate = '<div></div>';
    }

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
  const { lesson, course, filename, isVersionPdf } = req.body;

  console.log('isVersionPdf:', isVersionPdf);
  console.log('lesson.title:', lesson?.title);
  console.log('lesson.originalTitle:', lesson?.originalTitle);
  console.log('lesson.versionName:', lesson?.versionName);

  if (!lesson) {
    return res.status(400).json({ error: 'lesson object is required' });
  }

  try {
    const appUrl = process.env.APP_URL || 'https://bh-curriculum-management.vercel.app';
    const html = buildLessonPDFHtml({ lesson, course, appUrl, isVersionPdf });

    console.log(`HTML input size: ${html.length} bytes (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

    const safeFilename = filename ||
      `${lesson.title || `Lesson-${lesson.lesson_number}`}.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');

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
 * Course Scope and Sequence PDF endpoint
 * POST /course-pdf
 * Body: { course: object, lessons: array, filename?: string }
 * Returns: application/pdf
 */
app.post('/course-pdf', async (req, res) => {
  const { course, lessons, filename } = req.body;

  if (!course) {
    return res.status(400).json({ error: 'course object is required' });
  }

  try {
    const appUrl = process.env.APP_URL || 'https://bh-curriculum-management.vercel.app';
    const html = buildCoursePDFHtml({ course, lessons, appUrl });

    console.log(`Course PDF HTML input size: ${html.length} bytes (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

    const safeFilename = filename || `${course.title || 'course'}-scope-and-sequence.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');

    const footerHtml = buildCourseFooterHtml(course);

    const { pdf } = await generatePDF(html, safeFilename, {
      footerHtml,
      displayHeaderFooter: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);

  } catch (error) {
    console.error('Course PDF error:', error);
    res.status(500).json({
      error: 'Failed to generate course PDF',
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
