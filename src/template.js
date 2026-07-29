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
  { key: 'welcome_opening', label: 'Welcome and Opening Check-In' },
  { key: 'actual_class_expectations', label: 'Class Expectations and Procedures' },
  { key: 'warm_up', label: 'Warm Up' },
  { key: 'lesson_hook', label: 'Lesson "Hook"' },
  { key: 'main_activity', label: 'Main Activity' },
  { key: 'instrument_expectations', label: 'Instrument Expectations' },
  { key: 'vapa_text_block', label: 'VAPA Standards' },
  { key: 'ncas_text_block', label: 'NCAS Standards' },
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
function buildPage2Html({ lesson }) {
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

  return `
    <div class="page2-container">
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
function buildRemainingSectionsHtml({ lesson }) {
  const sectionsHtml = REMAINING_SECTIONS
    .map(section => {
      let headerClass = '';
      if (section.key === 'vapa_text_block' || section.key === 'ncas_text_block') {
        headerClass = 'gray';
      } else if (section.key === 'assessment') {
        headerClass = 'assessment';
      }
      return buildSectionHtml(section, lesson[section.key], headerClass);
    })
    .filter(Boolean)
    .join('');

  return `
    <div class="remaining-sections">
      ${sectionsHtml}
    </div>
  `;
}

/**
 * Build complete HTML document for a lesson
 * @param {Object} data - { lesson, course }
 * @returns {string} Complete HTML document
 */
function buildLessonPDFHtml({ lesson, course, appUrl }) {
  const titlePage = buildTitlePage({ lesson, course, appUrl });
  const page2Html = buildPage2Html({ lesson });
  const remainingHtml = buildRemainingSectionsHtml({ lesson });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lesson ${lesson.lesson_number}: ${escapeHtml(lesson.title || 'Untitled')}</title>
  <style>
    @page {
      size: letter;
      margin: 0.5in;
      margin-top: 0.4in;
      margin-bottom: 0.6in;
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
      color: #333;
      margin: 0;
      padding: 0;
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

    .right-column {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Section Styling */
    .section {
      margin-bottom: 16px;
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
    .assessment-section table {
      border: 2px solid #e37c64;
    }

    .assessment-section table th {
      background-color: #e37c64;
      color: white;
    }

    .assessment-section table td {
      border: 1px solid #e37c64;
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
      margin: 0 16px 16px 0;
    }

    .lesson-content .cfu-wrap-top-right {
      float: right;
      margin: 0 0 16px 16px;
    }

    .lesson-content .cfu-wrap-top-center {
      margin: 0 auto 16px auto;
    }

    .lesson-content .cfu-left {
      float: left;
      margin-right: 16px;
    }

    .lesson-content .cfu-right {
      float: right;
      margin-left: 16px;
    }

    .lesson-content .cfu-center {
      margin: 0 auto;
    }

    .lesson-content .cfu-wrap-bottom-left {
      float: left;
      margin: 16px 16px 0 0;
    }

    .lesson-content .cfu-wrap-bottom-right {
      float: right;
      margin: 16px 0 0 16px;
      clear: left;
    }

    .lesson-content .cfu-wrap-bottom-center {
      margin: 16px auto 0 auto;
    }

    /* Override bottom margin for wrapped CFUs to prevent overlap - MUST come after all margin rules */
    .lesson-content .cfu-wrap-top-left,
    .lesson-content .cfu-wrap-top-right {
      margin-bottom: 96px !important;
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

module.exports = {
  buildLessonPDFHtml,
  SECTIONS
};
