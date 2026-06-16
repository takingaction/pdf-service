/**
 * Builds HTML template for lesson PDF
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

/**
 * Build complete HTML document for a lesson
 * @param {Object} data - { lesson, course }
 * @returns {string} Complete HTML document
 */
function buildLessonPDFHtml({ lesson, course }) {
  const sectionsHtml = SECTIONS
    .filter(section => lesson[section.key] && lesson[section.key].trim())
    .map(section => `
      <div class="section">
        <h2>${section.label}</h2>
        <div class="lesson-content">
          ${lesson[section.key]}
        </div>
      </div>
    `)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lesson ${lesson.lesson_number}: ${lesson.title || 'Untitled'}</title>
  <style>
    @page {
      size: letter;
      margin: 0.75in;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #333;
      margin: 0;
      padding: 0;
    }

    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #333;
    }

    .header h1 {
      font-size: 22pt;
      font-weight: bold;
      margin: 0 0 8px 0;
      color: #111;
    }

    .meta {
      font-size: 10pt;
      color: #555;
    }

    .meta strong {
      color: #333;
    }

    .section {
      margin-bottom: 20px;
    }

    .section h2 {
      font-size: 13pt;
      font-weight: bold;
      margin: 0 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid #ccc;
      color: #222;
    }

    .lesson-content {
      font-size: 11pt;
      line-height: 1.5;
    }

    .lesson-content p {
      margin: 0 0 8px 0;
    }

    .lesson-content p:empty {
      min-height: 0.25rem;
      display: block;
    }

    .lesson-content h3 {
      font-size: 11pt;
      font-weight: bold;
      margin: 12px 0 4px 0;
    }

    .lesson-content ul,
    .lesson-content ol {
      margin: 0 0 8px 0;
      padding-left: 24px;
    }

    .lesson-content li {
      margin-bottom: 4px;
    }

    .lesson-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 10pt;
    }

    .lesson-content td,
    .lesson-content th {
      border: 1px solid #333;
      padding: 6px 8px;
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
      margin-left: 12px;
    }

    .lesson-content img[style*="float: left"] {
      float: left;
      margin-right: 12px;
    }

    .lesson-content img[style*="display: block; margin-left: auto; margin-right: auto"] {
      display: block;
      margin-left: auto;
      margin-right: auto;
    }

    .lesson-content a {
      color: #0066cc;
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

    /* CFU Block styling */
    .lesson-content [data-cfu-id] {
      background-color: #f9f9f9;
      border-left: 4px solid #666;
      padding: 12px 16px;
      margin: 12px 0;
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
  </style>
</head>
<body>
  <div class="header">
    <h1>Lesson ${lesson.lesson_number}: ${escapeHtml(lesson.title || 'Untitled')}</h1>
    <p class="meta">
      <strong>Course:</strong> ${escapeHtml(course?.title || 'Unknown Course')} |
      <strong>Grade:</strong> ${course?.grade || 'N/A'} |
      <strong>Discipline:</strong> ${course?.discipline || 'N/A'}
      ${lesson.total_time ? `| <strong>Time:</strong> ${escapeHtml(lesson.total_time)}` : ''}
    </p>
  </div>

  ${sectionsHtml}
</body>
</html>`;

  return html;
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
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

module.exports = {
  buildLessonPDFHtml,
  SECTIONS
};
