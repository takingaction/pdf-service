/**
 * PDF Generation Service
 * Uses Puppeteer to render HTML to PDF
 */

const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { buildLessonPDFHtml, buildCoursePDFHtml, buildDisciplinePDFHtml } = require('./template');

const app = express();
const PORT = process.env.PORT || 3000;

// Increase payload limit for HTML content
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// In-memory queue for PDF generation (prevents RAM exhaustion on single-instance Render)
let isGenerating = false;
const requestQueue = [];
const pendingResults = new Map(); // lessonId -> { status: 'queued'|'processing'|'completed'|'failed', position?, pdf?, filename?, error?, timestamp? }

/**
 * Clean up stale pending results (older than 10 minutes)
 * Called periodically and on each status check
 */
function cleanupStaleResults() {
  const staleThreshold = 15 * 60 * 1000; // 15 minutes
  const processingThreshold = 5 * 60 * 1000; // 5 minutes for stuck processing
  const now = Date.now();
  let cleaned = 0;
  let totalEntries = 0;
  for (const [lessonId, result] of pendingResults) {
    totalEntries++;
    const age = result.timestamp ? now - result.timestamp : null;

    // Clean entries that are:
    // 1. No timestamp (old format) OR
    // 2. Older than 15 minutes OR
    // 3. 'processing' for more than 5 minutes (stuck)
    let shouldClean = false;

    if (!result.timestamp) {
      shouldClean = true; // Old format
    } else if (age > staleThreshold) {
      shouldClean = true; // Too old
    } else if (result.status === 'processing' && age > processingThreshold) {
      shouldClean = true; // Stuck processing
    }

    if (shouldClean) {
      console.log(`[Queue] Cleaning stale: ${lessonId.substring(0, 8)}... status=${result.status} age=${age ? Math.round(age/1000) : 'no-ts'}s`);
      pendingResults.delete(lessonId);
      cleaned++;
    }
  }
  if (cleaned > 0 || totalEntries > 0) {
    console.log(`[Queue] Cleanup: ${cleaned}/${totalEntries} entries cleaned, ${pendingResults.size} remaining`);
  }
  return cleaned;
}

// Run cleanup every 2 minutes with error handling
setInterval(() => {
  try {
    cleanupStaleResults();
  } catch (e) {
    console.error('[Queue] Cleanup interval error:', e);
  }
}, 2 * 60 * 1000);

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  cleanupStaleResults();
  const now = Date.now();
  const pendingDetails = [];
  for (const [lessonId, result] of pendingResults) {
    const age = result.timestamp ? Math.round((now - result.timestamp) / 1000) : null;
    pendingDetails.push({
      lessonId: lessonId.substring(0, 8) + '...',
      status: result.status,
      age_seconds: age,
      position: result.position
    });
  }

  // Detect stuck state: isGenerating true but queue empty (PDF generation hung)
  const stuck = isGenerating && requestQueue.length === 0 && pendingResults.size === 0;

  res.json({
    status: 'ok',
    service: 'pdf-service',
    queue_length: requestQueue.length,
    is_generating: isGenerating,
    pending_results: pendingResults.size,
    pending_details: pendingDetails,
    stuck_warning: stuck,
    message: stuck ? 'Queue may be stuck - use POST /force-reset or /skip-current' : undefined
  });
});

/**
 * Clear stuck queue and reset state
 * POST /clear-stuck
 */
app.post('/clear-stuck', (req, res) => {
  const count = requestQueue.length;
  requestQueue.length = 0;
  pendingResults.clear();
  isGenerating = false;
  console.log(`[Queue] Cleared stuck queue: ${count} items removed, isGenerating reset`);
  res.json({
    status: 'ok',
    message: `Cleared ${count} queued items, reset isGenerating`,
    queue_length: 0,
    is_generating: false,
    pending_results: 0
  });
});

/**
 * Skip current stuck PDF and continue processing next in queue
 * POST /skip-current
 */
app.post('/skip-current', (req, res) => {
  if (!isGenerating) {
    return res.status(400).json({ error: 'No PDF currently being generated' });
  }

  const pendingBefore = pendingResults.size;
  isGenerating = false;

  // Clean up any pending results that might be stuck
  pendingResults.clear();

  console.log(`[Queue] Skipped current PDF, queue length: ${requestQueue.length}`);

  // Trigger processing next item
  processQueue();

  res.json({
    status: 'ok',
    message: 'Skipped current PDF, queue processing continued',
    queue_length: requestQueue.length,
    is_generating: isGenerating
  });
});

/**
 * Queue status endpoint - check position in queue or get result
 */
app.get('/lesson-pdf-status', (req, res) => {
  const { lessonId } = req.query;
  if (!lessonId) {
    return res.status(400).json({ error: 'lessonId query param required' });
  }

  // Clean up stale entries on each status check
  cleanupStaleResults();

  // Check if we have a result stored
  const result = pendingResults.get(lessonId);
  if (result) {
    if (result.status === 'completed') {
      // Clean up and return PDF
      pendingResults.delete(lessonId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', result.pdf.length);
      return res.send(result.pdf);
    }
    if (result.status === 'failed') {
      pendingResults.delete(lessonId);
      return res.status(500).json({ error: 'Failed to generate PDF', message: result.error });
    }
    // Still queued or processing
    return res.json({
      status: result.status,
      position: result.position,
      queue_length: requestQueue.length
    });
  }

  // Check if still in queue
  const position = requestQueue.findIndex(item => item.lessonId === lessonId);
  if (position !== -1) {
    return res.json({
      status: 'queued',
      position: position + 1,
      queue_length: requestQueue.length
    });
  }

  // Could be currently processing (not in queue but isGenerating is true)
  if (isGenerating) {
    return res.json({
      status: 'processing',
      position: 0,
      queue_length: 0
    });
  }

  return res.json({ status: 'not_found', position: -1 });
});

/**
 * Process next item in queue
 */
async function processQueue() {
  if (isGenerating || requestQueue.length === 0) return;

  isGenerating = true;
  const { lessonId, lesson, course, filename, isVersionPdf } = requestQueue.shift();

  // Update position for remaining items in queue
  requestQueue.forEach((item, idx) => {
    const result = pendingResults.get(item.lessonId);
    if (result) result.position = idx + 1;
  });

  console.log(`[Queue] Processing lesson ${lessonId} (${requestQueue.length} remaining in queue)`);

  // Mark as processing
  const existingResult = pendingResults.get(lessonId);
  if (existingResult) {
    existingResult.status = 'processing';
  }

  try {
    const appUrl = process.env.APP_URL || 'https://bh-curriculum-management.vercel.app';
    console.log(`[Queue] Building HTML for lesson ${lessonId}`);
    const html = buildLessonPDFHtml({ lesson, course, appUrl, isVersionPdf });

    console.log(`[Queue] HTML input size: ${html.length} bytes (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

    const safeFilename = filename ||
      `${lesson.title || `Lesson-${lesson.lesson_number}`}.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');

    const footerHtml = buildFooterHtml(course, lesson);

    console.log(`[Queue] Starting PDF generation for lesson ${lessonId}`);

    const { pdf } = await generatePDF(html, safeFilename, {
      footerHtml,
      displayHeaderFooter: true
    });

    console.log(`[Queue] PDF generated successfully for lesson ${lessonId}, size: ${pdf.length} bytes`);

    pendingResults.set(lessonId, {
      status: 'completed',
      pdf,
      filename: safeFilename,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error(`[Queue] Error generating PDF for lesson ${lessonId}:`, error.message);

    pendingResults.set(lessonId, {
      status: 'failed',
      error: error.message,
      timestamp: Date.now()
    });
  } finally {
    isGenerating = false;
    processQueue();
  }
}

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

    console.log('Generating PDF: waiting briefly');
    await page.waitForTimeout(100);

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

    console.log('Generating PDF: creating PDF');
    const pdf = await page.pdf(pdfOptions);

    console.log('Generating PDF: closing browser');
    await browser.close();
    browser = null;

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
 * Body: { lesson: object, course: object, filename?: string, lessonId?: string }
 * Returns: application/pdf (when processed) or 202 with queue position (when queued)
 */
app.post('/lesson-pdf', async (req, res) => {
  const { lesson, course, filename, isVersionPdf, lessonId } = req.body;

  console.log('isVersionPdf:', isVersionPdf);
  console.log('lesson.title:', lesson?.title);
  console.log('lesson.originalTitle:', lesson?.originalTitle);
  console.log('lesson.versionName:', lesson?.versionName);

  if (!lesson) {
    return res.status(400).json({ error: 'lesson object is required' });
  }

  // Generate a unique ID for this request if not provided
  const requestId = lessonId || lesson.id || `req_${Date.now()}`;

  // If service is busy (generating OR items ahead in queue), add to queue and return position
  if (isGenerating || requestQueue.length > 0) {
    // Add to queue
    requestQueue.push({
      lessonId: requestId,
      lesson,
      course,
      filename,
      isVersionPdf
    });

    const position = requestQueue.length;
    console.log(`[Queue] Service busy, lesson ${requestId} queued at position ${position}`);

    // Store queued status
    pendingResults.set(requestId, {
      status: 'queued',
      position,
      queue_length: requestQueue.length - 1,
      timestamp: Date.now()
    });

    return res.status(202).json({
      status: 'queued',
      position,
      queue_length: requestQueue.length - 1,
      requestId,
      message: 'PDF generation in progress. Your request is #' + position + ' in queue.'
    });
  }

  // Queue is empty and not generating - start processing immediately
  isGenerating = true;
  pendingResults.set(requestId, {
    status: 'processing',
    position: 0,
    queue_length: 0,
    timestamp: Date.now()
  });

  // Add to queue (so processQueue can process it)
  requestQueue.push({
    lessonId: requestId,
    lesson,
    course,
    filename,
    isVersionPdf
  });

  // Process queue asynchronously
  processQueue().then(() => {
    // This shouldn't be reached since processQueue doesn't return
  }).catch(err => {
    console.error('[Queue] Unexpected error:', err);
  });

  // Return immediately - PDF will be polled via status endpoint
  return res.status(202).json({
    status: 'processing',
    position: 0,
    queue_length: 0,
    requestId,
    message: 'PDF generation started. Poll /lesson-pdf-status for completion.'
  });
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

/**
 * Discipline Scope and Sequence PDF endpoint
 * POST /discipline-pdf
 * Body: { courses: array, discipline: string, filename?: string }
 * Returns: application/pdf
 */
app.post('/discipline-pdf', async (req, res) => {
  const { courses, discipline, filename } = req.body;

  if (!courses || !discipline) {
    return res.status(400).json({ error: 'courses array and discipline are required' });
  }

  try {
    const appUrl = process.env.APP_URL || 'https://bh-curriculum-management.vercel.app';
    const html = buildDisciplinePDFHtml({ courses, discipline, appUrl });

    console.log(`Discipline PDF HTML input size: ${html.length} bytes (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

    const safeFilename = filename || `${discipline.toLowerCase()}-scope-and-sequence.pdf`.replace(/[^a-zA-Z0-9\-_. ]/g, '');

    const footerHtml = buildDisciplineFooterHtml(discipline);

    const { pdf } = await generatePDF(html, safeFilename, {
      footerHtml,
      displayHeaderFooter: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);

  } catch (error) {
    console.error('Discipline PDF error:', error);
    res.status(500).json({
      error: 'Failed to generate discipline PDF',
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
  console.log(`Course PDF: POST http://localhost:${PORT}/course-pdf`);
  console.log(`Discipline PDF: POST http://localhost:${PORT}/discipline-pdf`);
  console.log(`Debug HTML: POST http://localhost:${PORT}/debug-html`);
});
