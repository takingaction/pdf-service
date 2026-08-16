/**
 * PDF Generation Service
 * Uses Puppeteer to render HTML to PDF with priority queue
 */

const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { buildLessonPDFHtml, buildCoursePDFHtml, buildDisciplinePDFHtml } = require('./template');
const { submitJob, cancelJob, getJobStatus, getJobResult, getQueueStats, setProcessCallback, PRIORITY } = require('./queue');

const app = express();
const PORT = process.env.PORT || 3000;

// Increase payload limit for HTML content
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Job processor callback - processes queued PDF jobs
setProcessCallback(async (job) => {
  const { pdfType, payload } = job;

  const appUrl = process.env.APP_URL || 'https://bh-curriculum-management.vercel.app';

  let html, safeFilename, footerHtml;

  switch (pdfType) {
    case 'lesson':
    case 'version': {
      const { lesson, course, filename, isVersionPdf } = payload;
      html = buildLessonPDFHtml({ lesson, course, appUrl, isVersionPdf });
      safeFilename = filename ||
        `${lesson.title || `Lesson-${lesson.lesson_number}`}.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');
      footerHtml = buildFooterHtml(course, lesson);
      break;
    }
    case 'course': {
      const { course, lessons, filename } = payload;
      html = buildCoursePDFHtml({ course, lessons, appUrl });
      safeFilename = filename ||
        `${course.discipline.toLowerCase()}-${course.grade.toLowerCase()}-scope-and-sequence.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');
      footerHtml = buildCourseFooterHtml(course);
      break;
    }
    case 'discipline': {
      const { courses, discipline, filename } = payload;
      html = buildDisciplinePDFHtml({ courses, discipline, appUrl });
      safeFilename = filename ||
        `${discipline.toLowerCase()}-scope-and-sequence.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');
      footerHtml = buildDisciplineFooterHtml(discipline);
      break;
    }
    default:
      throw new Error(`Unknown pdfType: ${pdfType}`);
  }

  console.log(`[Queue] Processing ${pdfType} job ${job.id}: ${safeFilename}`);

  const { pdf } = await generatePDF(html, safeFilename, {
    footerHtml,
    displayHeaderFooter: true
  });

  console.log(`[Queue] Completed ${pdfType} job ${job.id}: ${pdf.length} bytes`);

  return { pdf, filename: safeFilename };
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const stats = getQueueStats();
  res.json({
    status: 'ok',
    service: 'pdf-service',
    ...stats
  });
});

/**
 * Queue statistics
 * GET /queue/stats
 */
app.get('/queue/stats', (req, res) => {
  res.json(getQueueStats());
});

/**
 * Submit a job to the queue
 * POST /queue/submit
 * Body: { pdfType: 'lesson'|'version'|'course'|'discipline', payload: object, priority?: number }
 * Returns: { jobId, position }
 */
app.post('/queue/submit', (req, res) => {
  const { pdfType, payload, priority } = req.body;

  if (!pdfType || !payload) {
    return res.status(400).json({ error: 'pdfType and payload are required' });
  }

  const validTypes = ['lesson', 'version', 'course', 'discipline', 'batch'];
  if (!validTypes.includes(pdfType)) {
    return res.status(400).json({ error: `pdfType must be one of: ${validTypes.join(', ')}` });
  }

  const jobId = submitJob(pdfType, payload, priority || PRIORITY[pdfType.toUpperCase()] || 5);
  const status = getJobStatus(jobId);

  res.json({
    jobId,
    position: status.position,
    status: status.status
  });
});

/**
 * Get job status
 * GET /queue/status/:jobId
 */
app.get('/queue/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const status = getJobStatus(jobId);

  if (!status) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(status);
});

/**
 * Get job result (PDF if completed)
 * GET /queue/result/:jobId
 */
app.get('/queue/result/:jobId', (req, res) => {
  const { jobId } = req.params;
  const result = getJobResult(jobId);

  if (result.status === 'not_found') {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (result.status === 'completed' && result.pdf) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.pdf.length);
    return res.send(result.pdf);
  }

  res.json({ status: result.status });
});

/**
 * Cancel a pending job
 * DELETE /queue/cancel/:jobId
 */
app.delete('/queue/cancel/:jobId', (req, res) => {
  const { jobId } = req.params;
  const success = cancelJob(jobId);

  if (!success) {
    return res.status(400).json({ error: 'Cannot cancel job (not found or already processing)' });
  }

  res.json({ success: true, jobId });
});

/**
 * Debug network access - test if external URLs are reachable
 * GET /debug-network
 */
app.get('/debug-network', async (req, res) => {
  const testUrls = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://www.google.com',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+JP&display=swap'
  ];

  const results = [];

  for (const url of testUrls) {
    const start = Date.now();
    try {
      const response = await fetch(url, { timeout: 10000 });
      const elapsed = Date.now() - start;
      results.push({
        url: url.substring(0, 60) + (url.length > 60 ? '...' : ''),
        status: response.status,
        elapsed_ms: elapsed,
        success: true
      });
    } catch (error) {
      results.push({
        url: url.substring(0, 60) + (url.length > 60 ? '...' : ''),
        error: error.message,
        elapsed_ms: Date.now() - start,
        success: false
      });
    }
  }

  res.json({ node_fetch_results: results });
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
  const grade = course?.grade || 'N/A';
  const year = new Date().getFullYear();

  return `
    <div style="width: 100%; font-family: Arial, Helvetica, sans-serif; padding: 0 0.4in; color: #333;">
      <div style="font-size: 9pt;">
        ${disciplineLabel} | GRADE ${grade} | SCOPE AND SEQUENCE
      </div>
      <div style="font-size: 7pt; margin-top: 2pt;">
        &copy; ${year} Better Humans, LLC
      </div>
    </div>
  `;
}

/**
 * Build footer HTML for Discipline Scope and Sequence PDF
 */
function buildDisciplineFooterHtml(discipline) {
  const disciplineTitle = (discipline || 'COURSE').toUpperCase();
  const disciplineLabel = disciplineTitle === 'DANCE' ? 'DANCE AND CULTURE' : disciplineTitle;
  const year = new Date().getFullYear();

  return `
    <div style="width: 100%; font-family: Arial, Helvetica, sans-serif; padding: 0 0.4in; color: #333;">
      <div style="font-size: 9pt;">
        ${disciplineLabel} | GRADES TK-6 | SCOPE + SEQUENCE
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
    console.log('Generating PDF: launching browser');
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

    console.log('Generating PDF: browser launched, creating page');
    const page = await browser.newPage();

    console.log('Generating PDF: setting content');
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('Generating PDF: waiting for images to load');
    await page.evaluate(() => {
      const images = [...document.images];
      if (images.length === 0) return;
      return Promise.all(images.map(img =>
        img.complete ? Promise.resolve() : new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        })
      ));
    });

    console.log('Generating PDF: waiting for fonts to load');
    await page.evaluate(async () => {
      try {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
          console.log('Fonts ready:', [...document.fonts].map(f => `${f.family} ${f.status}`).join(', '));
        }
      } catch (e) {
        console.log('Font check error:', e.message);
      }
    });

    console.log('Generating PDF: waiting for render');
    await page.waitForTimeout(500);

    const pdfOptions = {
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
    };

    if (displayHeaderFooter && footerHtml) {
      pdfOptions.displayHeaderFooter = true;
      pdfOptions.headerTemplate = '<div></div>';
      pdfOptions.footerTemplate = footerHtml;
    }

    console.log('Generating PDF: creating PDF');
    const pdf = await page.pdf(pdfOptions);

    console.log(`Generating PDF: done, size: ${pdf.length} bytes`);

    return { pdf: Buffer.from(pdf), filename };

  } catch (error) {
    console.error('Generating PDF error:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Start server
app.listen(PORT, () => {
  console.log(`PDF service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Queue stats: GET http://localhost:${PORT}/queue/stats`);
  console.log(`Queue submit: POST http://localhost:${PORT}/queue/submit`);
  console.log(`Queue status: GET http://localhost:${PORT}/queue/status/:jobId`);
  console.log(`Queue result: GET http://localhost:${PORT}/queue/result/:jobId`);
  console.log(`Queue cancel: DELETE http://localhost:${PORT}/queue/cancel/:jobId`);
});
