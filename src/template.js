/**
 * Builds HTML template for lesson PDF
 *
 * Layout:
 * - Page 1: Title page with "PERFORMERS READY!", course/grade, hero image
 * - Page 2: 2-column layout (Lesson Outline | Objectives/Vocabulary/Materials)
 * - Pages 3+: Full-width sections with coral headers
 * - Footer on all pages
 */

const SECTIONS = [
  { key: 'lesson_outline', label: 'Lesson Outline' },
  { key: 'learning_objectives', label: 'Learning Objectives' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'materials', label: 'Materials' },
  { key: 'vapa_text_block', label: 'VAPA Standards' },
  { key: 'ncas_text_block', label: 'NCAS Standards' },
  { key: 'welcome_opening', label: 'Welcome and Opening Check-In' },
  { key: 'actual_class_expectations', label: 'Class Expectations and Procedures' },
  { key: 'warm_up', label: 'Warm Up' },
  { key: 'lesson_hook', label: 'Lesson "Hook"' },
  { key: 'main_activity', label: 'Main Activity' },
  { key: 'instrument_expectations', label: 'Instrument Expectations' },
  { key: 'reflection', label: 'Reflection' },
  { key: 'closing_ceremony', label: 'Closing Ceremony' },
  { key: 'assessment', label: 'Assessment' }
];

const PAGE_2_LEFT_SECTIONS = ['lesson_outline'];
const PAGE_2_RIGHT_SECTIONS = ['learning_objectives', 'vocabulary', 'materials'];
const REMAINING_SECTIONS = SECTIONS.filter(
  s => !PAGE_2_LEFT_SECTIONS.includes(s.key) && !PAGE_2_RIGHT_SECTIONS.includes(s.key)
);

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

function buildSectionHtml(section, content, headerClass = '') {
  if (!content || !content.trim()) return '';
  return `
    <div class="section ${headerClass ? headerClass + '-section' : ''}">
      <div class="section-header ${headerClass ? 'section-header-' + headerClass : ''}">${escapeHtml(section.label)}</div>
      <div class="lesson-content">${content}</div>
    </div>
  `;
}

/**
 * Build the title page HTML
 */
function buildTitlePage({ lesson, course, appUrl }) {
  const courseTitle = escapeHtml(course?.title || 'Unknown Course');
  const grade = course?.grade || 'N/A';
  const discipline = course?.discipline || 'N/A';
  const imageUrl = course?.pdf_image_url && course.pdf_image_url.trim() ? course.pdf_image_url : null;
  const logoUrl = appUrl ? `${appUrl}/images/performers-ready.png` : 'https://bh-curriculum-management.vercel.app/images/performers-ready.png';

  return `
    <div class="title-page">
      <div class="logo-container">
        <img src="${logoUrl}" alt="Performers Ready!" class="logo" />
      </div>
      <div class="title-content">
        <h2 class="course-info">${courseTitle} | ${grade}</h2>
      </div>
      ${imageUrl ? `<div class="hero-image-container"><img src="${escapeHtml(imageUrl)}" alt="${courseTitle}" class="hero-image" /></div>` : '<div class="hero-image-placeholder"></div>'}
    </div>
  `;
}

/**
 * Build page 2 with 2-column layout
 */
function buildPage2Html({ lesson, isVersionPdf }) {
  console.log('buildPage2Html - isVersionPdf:', isVersionPdf);
  console.log('buildPage2Html - lesson.title:', lesson?.title);
  console.log('buildPage2Html - lesson.originalTitle:', lesson?.originalTitle);
  console.log('buildPage2Html - lesson.versionName:', lesson?.versionName);

  const lessonNumber = lesson.lesson_number || '?';
  const lessonTitle = lesson.title || '';
  const originalTitle = lesson.originalTitle || lessonTitle;
  const versionName = lesson.versionName || '';

  const leftContent = PAGE_2_LEFT_SECTIONS
    .map(key => {
      const section = SECTIONS.find(s => s.key === key);
      return buildSectionHtml(section, lesson[key]);
    })
    .filter(Boolean)
    .join('');

  const rightContent = PAGE_2_RIGHT_SECTIONS
    .map(key => {
      const section = SECTIONS.find(s => s.key === key);
      return buildSectionHtml(section, lesson[key], 'teal');
    })
    .filter(Boolean)
    .join('');

  const planLabel = isVersionPdf && versionName
    ? `LESSON PLAN: CLASS ${lessonNumber} - (Version: ${escapeHtml(versionName)})`
    : `LESSON PLAN: CLASS ${lessonNumber}`;

  const displayTitle = isVersionPdf && originalTitle
    ? originalTitle
    : lessonTitle;

  return `
    <div class="page2-container">
      <div class="page2-header">
        <div class="lesson-plan-label">${planLabel}</div>
        <div class="lesson-title">&#8220;${escapeHtml(displayTitle)}&#8221;</div>
      </div>
      <div class="two-column">
        <div class="left-column">
          ${leftContent}
        </div>
        <div class="right-column">
          ${rightContent}
        </div>
      </div>
    </div>
  `;
}

/**
 * Build remaining sections as full-width
 */
function buildRemainingSectionsHtml({ lesson, course, appUrl }) {
  const getImageUrl = (filename) => {
    return appUrl
      ? `${appUrl}/images/${filename}`
      : `https://bh-curriculum-management.vercel.app/images/${filename}`;
  };

  const lastPageImage = `<img src="${getImageUrl('last-page.png')}" class="page-break-image page-break-last" />`;
  const logoEndUrl = appUrl
    ? `${appUrl}/images/logo-end.png`
    : `https://bh-curriculum-management.vercel.app/images/logo-end.png`;
  const logoEndHtml = `<div class="logo-end-container"><img src="${logoEndUrl}" alt="" class="logo-end" /></div>`;

  let sectionsHtml = '';
  let hasAssessment = false;

  REMAINING_SECTIONS.forEach(section => {
    let headerClass = '';
    if (section.key === 'vapa_text_block' || section.key === 'ncas_text_block') {
      headerClass = 'gray';
    } else if (section.key === 'assessment') {
      headerClass = 'assessment';
      hasAssessment = true;
    }

    let html = '';
    if (section.key === 'assessment') {
      html += `<div class="page-break-image-container page-break-top">${lastPageImage}</div>`;
    }

    html += buildSectionHtml(section, lesson[section.key], headerClass);

    // Append logo-end directly after assessment content
    if (section.key === 'assessment') {
      html += logoEndHtml;
    }

    sectionsHtml += `<div class="section-wrapper">${html}</div>`;
  });

  return `
    <div class="remaining-sections">
      ${sectionsHtml}
    </div>
  `;
}

/**
 * Build complete HTML document for a lesson
 * @param {Object} data - { lesson, course, appUrl, isVersionPdf }
 * @returns {string} Complete HTML document
 */
function buildLessonPDFHtml({ lesson, course, appUrl, isVersionPdf }) {
  const titlePage = buildTitlePage({ lesson, course, appUrl });
  const page2Html = buildPage2Html({ lesson, isVersionPdf });
  const remainingHtml = buildRemainingSectionsHtml({ lesson, course, appUrl });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lesson ${lesson.lesson_number}: ${escapeHtml(lesson.title || 'Untitled')}</title>
  <style>
    @page {
      size: letter;
      margin: 0.25in 0.4in 0.7in 0.4in;
    }

    @page :first {
      size: letter;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      margin: 0;
      padding: 0;
    }

    /* Page 2 */
    .page2-container {
    }

    /* Title Page */
    .title-page {
      width: 100%;
      height: 100vh;
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
    }

    .logo-container {
      padding: 0.5in 0.5in 0.2in;
      text-align: left;
    }

    .logo {
      height: 144px;
      width: auto;
    }

    .title-content {
      padding: 0.2in 0.5in;
      text-align: left;
      background-color: #e37c64;
      color: white;
    }

    .performers-ready {
      font-size: 32pt;
      font-weight: bold;
      color: #0d7377;
      margin: 0 0 24px 0;
      letter-spacing: 2px;
    }

    .course-info {
      font-size: 18pt;
      font-weight: normal;
      color: inherit;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .hero-image-container {
      flex: 1;
      width: 100%;
      overflow: hidden;
      margin-top: 40px;
    }

    .hero-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
    }

    .hero-image-placeholder {
      flex: 1;
      background-color: #f5f5f5;
    }

    /* Page 2 - Two Column */
    .page2-container {
      page-break-after: auto;
      break-after: auto;
    }

    .two-column {
      display: flex;
      gap: 24px;
      height: 100%;
    }

    .left-column {
      flex: 1;
      min-width: 0;
    }

    .left-column table {
      table-layout: fixed;
    }

    .left-column table td:first-child {
      width: 70%;
    }

    .left-column table td:last-child {
      width: 30%;
    }

    /* Lesson Outline - tighter bullet spacing */
    .left-column .lesson-content li {
      margin-bottom: -5px;
    }

    .right-column {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Page 2 Header */
    .page2-header {
      margin-bottom: 40px;
    }

    .lesson-plan-label {
      font-size: 18pt;
      font-weight: bold;
      color: #333;
      margin-bottom: 8px;
    }

    .lesson-title {
      font-size: 30pt;
      font-weight: bold;
      color: #333;
    }

    /* Section Styling */
    .section {
      margin-bottom: 0;
      break-inside: avoid;
      break-after: auto;
    }

    .section-header {
      background-color: #e37c64;
      color: white;
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      padding: 8px 12px;
      margin-bottom: 8px;
      margin-top: 16px;
      clear: both;
    }

    .section-header-teal {
      background-color: #63F6D2;
      color: #333;
    }

    .section-header-gray {
      background-color: #D1D3DB;
      color: #333;
    }

    /* Lesson Outline - no link styling */
    .left-column .lesson-content a {
      color: #333 !important;
      text-decoration: none !important;
      font-weight: bold;
    }

    /* Assessment table styling */
    .assessment-section {
      margin-bottom: 0;
    }

    .assessment-section table {
      border: 2px solid #e37c64;
      table-layout: fixed;
      width: 100% !important;
    }

    /* Header row - coral bg with white text */
    .assessment-section table thead th,
    .assessment-section table tr:first-child td {
      background-color: #e37c64 !important;
      color: white !important;
      font-weight: bold;
    }

    /* Equal borders for all cells - 2px to match outer border */
    .assessment-section table td,
    .assessment-section table th {
      border: 2px solid #e37c64 !important;
    }

    /* Equal column widths */
    .assessment-section table th,
    .assessment-section table td {
      width: 25%;
    }

    /* Page break images - flush to page edges (override parent padding) */
    .page-break-image-container {
      width: 100%;
      margin: 0;
      overflow: hidden;
      padding-bottom: 40px;
      box-sizing: border-box;
    }

    .page-break-image-container + .section {
      padding-top: 0 !important;
    }

    .page-break-top {
      break-before: page;
    }

    .page-break-image {
      width: 100%;
      margin: 0;
      display: block;
      object-fit: contain;
    }

    .lesson-content {
      font-size: 10pt;
      line-height: 1.4;
    }

    .lesson-content p {
      margin: 0 0 6px 0;
    }

    .lesson-content p:empty {
      min-height: 0.25rem;
      display: block;
    }

    .lesson-content h3 {
      font-size: 11pt;
      font-weight: bold;
      margin: 10px 0 4px 0;
    }

    .lesson-content ul,
    .lesson-content ol {
      margin: 0 0 6px 0;
      padding-left: 20px;
    }

    .lesson-content li {
      margin-bottom: 3px;
    }

    /* CFU Block styling */
    .lesson-content [data-check-for-understanding="true"] {
      padding: 3px 20px !important;
      margin: 8px 0 48px 0 !important;
      border-radius: 8px;
      background-size: 100% 100% !important;
      overflow: hidden;
    }

    /* Use display:flow-root to create block formatting context for wrapped CFUs */
    .lesson-content .cfu-wrap-top-left,
    .lesson-content .cfu-wrap-top-right,
    .lesson-content .cfu-wrap-bottom-left,
    .lesson-content .cfu-wrap-bottom-right {
      display: flow-root;
    }

    .lesson-content [data-check-for-understanding="true"] table {
      width: 100%;
      border-collapse: collapse;
      border: none;
    }

    .lesson-content [data-check-for-understanding="true"] table td,
    .lesson-content [data-check-for-understanding="true"] table th,
    .lesson-content [data-check-for-understanding="true"] table tr,
    .lesson-content [data-check-for-understanding="true"] .cfu-image-cell,
    .lesson-content [data-check-for-understanding="true"] .cfu-text-cell {
      border: none !important;
      border-collapse: collapse;
    }

    /* CFU alignment classes - float-based positioning */
    .lesson-content .cfu-wrap-top-left {
      float: left;
      margin: 0 20px 16px 0 !important;
    }

    .lesson-content .cfu-wrap-top-right {
      float: right;
      margin: 0 0 16px 20px !important;
    }

    .lesson-content .cfu-wrap-top-center {
      margin: 0 auto 16px auto !important;
    }

    .lesson-content .cfu-left {
      float: left;
      margin-right: 20px !important;
    }

    .lesson-content .cfu-right {
      float: right;
      margin-left: 20px !important;
    }

    .lesson-content .cfu-center {
      margin: 0 auto !important;
    }

    .lesson-content .cfu-wrap-bottom-left {
      float: left;
      margin: 16px 20px 0 0 !important;
    }

    .lesson-content .cfu-wrap-bottom-right {
      float: right;
      margin: 16px 0 0 20px !important;
      clear: left;
    }

    .lesson-content .cfu-wrap-bottom-center {
      margin: 16px auto 0 auto !important;
    }

    /* Override bottom margin for wrapped CFUs to prevent overlap - MUST come after all margin rules */
    .lesson-content .cfu-wrap-top-left,
    .lesson-content .cfu-wrap-top-right {
      margin-bottom: 20px !important;
    }

    /* Clear floats after non-wrapped CFU */
    .lesson-content [data-check-for-understanding]:not([class*="wrap"])::after {
      content: "";
      display: table;
      clear: both;
    }

    /* CFU cell styling */
    .lesson-content .cfu-text-cell h4 {
      margin: 0 !important;
      font-size: 10pt !important;
      font-weight: 700 !important;
      color: #333 !important;
    }

    .lesson-content .cfu-text-cell p {
      margin: 2px 0 0 0;
      font-size: 10pt;
      color: #333;
    }

    .lesson-content .cfu-image-cell {
      width: 25%;
      vertical-align: middle;
      text-align: right;
      padding: 4px;
    }

    .lesson-content .cfu-text-cell {
      width: 75%;
      vertical-align: middle;
      text-align: left;
      padding: 4px;
    }

    /* General table styles - come after CFU to not override CFU borders */
    .lesson-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 10pt;
    }

    .lesson-content td,
    .lesson-content th {
      border: 1px solid #333;
      padding: 5px 7px;
      vertical-align: top;
    }

    .lesson-content th {
      background-color: #f0f0f0;
      font-weight: bold;
    }

    .lesson-content img {
      max-width: 100%;
      height: auto;
    }

    .lesson-content img[style*="float: right"] {
      float: right;
      margin-left: 10px;
    }

    .lesson-content img[style*="float: left"] {
      float: left;
      margin-right: 10px;
    }

    .lesson-content img[style*="display: block; margin-left: auto; margin-right: auto"] {
      display: block;
      margin-left: auto;
      margin-right: auto;
    }

    .lesson-content a {
      color: #0d7377;
      text-decoration: underline;
    }

    .lesson-content strong,
    .lesson-content b {
      font-weight: bold;
    }

    .lesson-content em,
    .lesson-content i {
      font-style: italic;
    }

    /* Lists with indentation support */
    .lesson-content ul {
      list-style-type: disc;
    }

    .lesson-content ul ul {
      list-style-type: circle;
    }

    .lesson-content ul ul ul {
      list-style-type: square;
    }

    .lesson-content ol {
      list-style-type: decimal;
    }

    .lesson-content ol ol {
      list-style-type: lower-alpha;
    }

    .lesson-content ol ol ol {
      list-style-type: lower-roman;
    }

    /* Table with grid disabled */
    .lesson-content table[data-show-grid="false"] td,
    .lesson-content table[data-show-grid="false"] th {
      border: none;
    }

    /* Remaining sections */
    .remaining-sections {
      margin-top: 0;
    }

    .remaining-sections .section {
      margin-bottom: 20px;
      break-inside: avoid;
      break-after: auto;
    }

    /* Footer handling via Puppeteer */
    .footer {
      display: none;
    }

    /* Logo end - centered below assessment table */
    .logo-end-container {
      text-align: center;
      padding-top: 20px;
      padding-bottom: 20px;
      margin-top: 40px;
      margin-bottom: 0;
    }

    .logo-end {
      width: 35%;
      display: inline-block;
    }
  </style>
</head>
<body>
  ${titlePage}
  ${page2Html}
  ${remainingHtml}
</body>
</html>`;

  return html;
}

/**
 * Extracts the text content after <strong>Content:</strong> in the learning_objectives HTML
 */
function extractContentSection(html) {
  if (!html) return '';

  // Find Content: section - match <strong>Content: </strong> (with optional space before closing tag)
  const strongMatch = html.match(/<strong[^>]*>Content:\s*<\/strong>/i);
  if (!strongMatch) return '';

  // Get everything after the strong tag until </p>
  const startIdx = strongMatch.index + strongMatch[0].length;
  const untilEndP = html.indexOf('</p>', startIdx);
  if (untilEndP === -1) return '';

  let text = html.slice(startIdx, untilEndP).trim();
  // Strip any remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Build the title page for Course Scope and Sequence PDF
 */
function buildCourseTitlePage({ course, appUrl }) {
  const courseTitle = escapeHtml(course?.title || 'Unknown Course');
  const grade = course?.grade || 'N/A';
  const discipline = course?.discipline || 'N/A';
  const summary = course?.summary || '';
  const logoUrl = appUrl ? `${appUrl}/images/performers-ready.png` : 'https://bh-curriculum-management.vercel.app/images/performers-ready.png';

  return `
    <div class="course-title-page">
      <div class="course-header">
        <div class="logo-container">
          <img src="${logoUrl}" alt="Performers Ready!" class="logo" />
        </div>
        <div class="scope-title">SCOPE AND SEQUENCE</div>
      </div>
      <div class="course-title-bar">
        <h1 class="course-title-text">${courseTitle} | GRADE ${grade}</h1>
      </div>
      ${summary ? `<div class="course-summary">${summary}</div>` : ''}
    </div>
  `;
}

/**
 * Build lesson entries for Course PDF
 */
function buildLessonEntriesHtml({ lessons }) {
  if (!lessons || lessons.length === 0) return '';

  return lessons.map(lesson => {
    const lessonNum = lesson.lesson_number || '?';
    const lessonTitle = escapeHtml(lesson.title || 'Untitled');
    const contentText = extractContentSection(lesson.learning_objectives);

    return `
      <div class="lesson-entry">
        <div class="lesson-entry-title">
          <span class="lesson-number">CLASS ${lessonNum}:</span> ${lessonTitle}
        </div>
        ${contentText ? `<div class="lesson-entry-content">${escapeHtml(contentText)}</div>` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Build complete HTML document for a course Scope and Sequence PDF
 */
function buildCoursePDFHtml({ course, lessons, appUrl }) {
  const titlePage = buildCourseTitlePage({ course, appUrl });
  const lessonEntries = buildLessonEntriesHtml({ lessons });

  const getImageUrl = (filename) => {
    return appUrl
      ? `${appUrl}/images/${filename}`
      : `https://bh-curriculum-management.vercel.app/images/${filename}`;
  };

  const logoEndUrl = getImageUrl('logo-end.png');
  const logoEndHtml = `<div class="logo-end-container"><img src="${logoEndUrl}" alt="" class="logo-end" /></div>`;

  const discipline = course?.discipline || 'COURSE';
  const disciplineLabel = discipline.toUpperCase() === 'DANCE' ? 'DANCE AND CULTURE' : discipline.toUpperCase();
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(course?.title || 'Course')} - Scope and Sequence</title>
  <style>
    @page {
      size: letter;
      margin: 0.4in 0.4in 0.7in 0.4in;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      margin: 0;
      padding: 0;
      color: #333;
    }

    /* Course Title Page */
    .course-title-page {
      padding-bottom: 0;
    }

    .course-header {
      padding: 0.4in 0 0.15in;
    }

    .logo-container {
      text-align: left;
    }

    .logo {
      height: 144px;
      width: auto;
    }

    .scope-title {
      font-size: 30pt;
      font-weight: bold;
      color: #333;
      text-align: right;
      padding-top: 10px;
    }

    .course-title-bar {
      background-color: #e37c64;
      padding: 20px 0.3in;
    }

    .course-title-text {
      font-size: 24pt;
      font-weight: bold;
      color: white;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .course-summary {
      padding: 0.15in 0;
      font-size: 12pt;
      line-height: 1.5;
    }

    /* Lesson Entries */
    .lessons-container {
      padding-top: 15px;
      padding-bottom: 60px;
    }

    .lesson-entry {
      margin-bottom: 20px;
      break-inside: avoid;
      padding-left: 0;
    }

    .lesson-entry-title {
      font-size: 14pt;
      font-weight: bold;
      color: #333;
      margin-bottom: 6px;
      padding-left: 0;
    }

    .lesson-number {
      color: #e37c64;
    }

    .lesson-entry-content {
      font-size: 11pt;
      line-height: 1.5;
      padding-left: 0;
      color: #444;
    }

    /* Footer handling via Puppeteer */
    .footer {
      display: none;
    }

    /* Logo end - centered below content */
    .logo-end-container {
      text-align: center;
      padding-top: 30px;
      padding-bottom: 20px;
      margin-top: 40px;
    }

    .logo-end {
      width: 35%;
      display: inline-block;
    }
  </style>
</head>
<body>
  ${titlePage}
  <div class="lessons-container">
    ${lessonEntries}
  </div>
  ${logoEndHtml}
</body>
</html>`;

  return html;
}

/**
 * Build complete HTML document for a Discipline Scope and Sequence PDF
 */
function buildDisciplinePDFHtml({ courses, discipline, appUrl }) {
  const disciplineTitle = (discipline || 'COURSE').toUpperCase();
  const disciplineLabel = disciplineTitle === 'DANCE' ? 'DANCE AND CULTURE' : disciplineTitle;
  const logoUrl = appUrl ? `${appUrl}/images/performers-ready.png` : 'https://bh-curriculum-management.vercel.app/images/performers-ready.png';

  // Consolidate grades: PK+K -> TK/K, 1+2 -> GRADES 1-2, others individual
  const consolidatedCourses = [];
  let i = 0;
  while (i < courses.length) {
    const course = courses[i];
    const grade = course.grade;

    if (grade === 'PK') {
      // Check if next is K
      const next = courses[i + 1];
      if (next && next.grade === 'K') {
        // Combine PK + K as TK/K, use PK's title/summary
        consolidatedCourses.push({
          gradeLabel: 'TK/K',
          title: course.title,
          summary: course.summary
        });
        i += 2; // Skip both PK and K
      } else {
        consolidatedCourses.push({
          gradeLabel: 'TK/K',
          title: course.title,
          summary: course.summary
        });
        i++;
      }
    } else if (grade === 'K') {
      // Skip - already handled by PK
      i++;
    } else if (grade === '1') {
      // Check if next is 2
      const next = courses[i + 1];
      if (next && next.grade === '2') {
        // Combine 1 + 2 as GRADES 1-2, use grade 1's title/summary
        consolidatedCourses.push({
          gradeLabel: 'GRADES 1-2',
          title: course.title,
          summary: course.summary
        });
        i += 2; // Skip both 1 and 2
      } else {
        consolidatedCourses.push({
          gradeLabel: 'GRADE 1',
          title: course.title,
          summary: course.summary
        });
        i++;
      }
    } else if (grade === '2') {
      // Skip - already handled by 1
      i++;
    } else {
      // Grades 3-6
      consolidatedCourses.push({
        gradeLabel: `GRADE ${grade}`,
        title: course.title,
        summary: course.summary
      });
      i++;
    }
  }

  const courseEntries = consolidatedCourses.map(entry => {
    const courseTitle = escapeHtml(entry.title || 'Untitled Course');
    const summary = entry.summary || '';
    const gradeLabel = entry.gradeLabel;

    return `
      <div class="course-entry">
        <div class="course-entry-title">${gradeLabel}: ${courseTitle}</div>
        ${summary ? `<div class="course-entry-summary">${escapeHtml(summary)}</div>` : ''}
      </div>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${disciplineLabel} - Scope and Sequence</title>
  <style>
    @page {
      size: letter;
      margin: 0.4in 0.4in 0.7in 0.4in;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      margin: 0;
      padding: 0;
      color: #333;
    }

    /* Discipline Title Page */
    .discipline-title-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .discipline-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 0.4in 0 0.15in;
    }

    .logo-container {
      text-align: left;
    }

    .logo {
      height: 120px;
      width: auto;
    }

    .scope-title {
      font-size: 18pt;
      font-weight: bold;
      color: white;
      background-color: #e37c64;
      padding: 15px 20px;
      text-align: right;
      white-space: nowrap;
    }

    .discipline-title-bar {
      background-color: #e37c64;
      padding: 15px 0.3in;
    }

    .discipline-title-text {
      font-size: 28pt;
      font-weight: bold;
      color: white;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* Course Entries */
    .courses-container {
      flex: 1;
      padding: 0.15in 0;
      overflow: hidden;
    }

    .course-entry {
      margin-bottom: 12px;
      break-inside: avoid;
    }

    .course-entry-title {
      font-size: 13pt;
      font-weight: bold;
      color: #333;
      margin-bottom: 4px;
    }

    .course-entry-summary {
      font-size: 11pt;
      line-height: 1.4;
      color: #555;
    }

    /* Footer handling via Puppeteer */
    .footer {
      display: none;
    }
  </style>
</head>
<body>
  <div class="discipline-title-page">
    <div class="discipline-header">
      <div class="logo-container">
        <img src="${logoUrl}" alt="Performers Ready!" class="logo" />
      </div>
      <div class="scope-title">SCOPE & SEQUENCE</div>
    </div>
    <div class="discipline-title-bar">
      <h1 class="discipline-title-text">${disciplineLabel}</h1>
    </div>
    <div class="courses-container">
      ${courseEntries}
    </div>
  </div>
</body>
</html>`;

  return html;
}

module.exports = {
  buildLessonPDFHtml,
  buildCoursePDFHtml,
  buildDisciplinePDFHtml,
  SECTIONS
};
