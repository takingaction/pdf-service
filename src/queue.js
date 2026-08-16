/**
 * PDF Queue Module
 * Priority-based queue for PDF generation - ensures only 1 PDF generates at a time
 * to prevent RAM exhaustion on single-instance Render Starter (512MB)
 */

let queue = [];
let currentJob = null;
let isProcessing = false;

const PRIORITY = {
  LESSON: 1,
  VERSION: 1,
  COURSE: 1,
  DISCIPLINE: 1,
  BATCH: 9,
};

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function getNextJob() {
  const pending = queue.filter(j => j.status === 'pending');
  if (pending.length === 0) return null;

  pending.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  return pending[0];
}

function getQueuePosition(job) {
  if (job.status !== 'pending') return 0;
  const pending = queue.filter(j => j.status === 'pending' && j.priority <= job.priority);
  pending.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  return pending.findIndex(j => j.id === job.id) + 1;
}

function submitJob(pdfType, payload, priority = 5) {
  const job = {
    id: generateJobId(),
    pdfType,
    payload,
    priority: typeof priority === 'string' ? PRIORITY[priority] || 5 : priority,
    status: 'pending',
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    result: null,
    error: null,
  };
  queue.push(job);
  processQueue();
  return job.id;
}

function cancelJob(jobId) {
  const job = queue.find(j => j.id === jobId);
  if (!job) return false;
  if (job.status === 'processing') return false;
  job.status = 'cancelled';
  return true;
}

function getJobStatus(jobId) {
  const job = queue.find(j => j.id === jobId);
  if (!job) return null;

  return {
    id: job.id,
    pdfType: job.pdfType,
    status: job.status,
    position: getQueuePosition(job),
    result: job.result || null,
    error: job.error || null,
  };
}

function getJobResult(jobId) {
  const job = queue.find(j => j.id === jobId);
  if (!job) return { status: 'not_found' };
  if (job.status === 'completed' && job.result) {
    return {
      status: 'completed',
      pdf: job.result.pdf,
      filename: job.result.filename,
      contentType: 'application/pdf'
    };
  }
  return { status: job.status };
}

function getQueueStats() {
  const pending = queue.filter(j => j.status === 'pending');
  const processing = queue.filter(j => j.status === 'processing');
  const completed = queue.filter(j => j.status === 'completed');
  const failed = queue.filter(j => j.status === 'failed');

  return {
    queue_length: pending.length,
    current_job: currentJob ? {
      id: currentJob.id,
      pdfType: currentJob.pdfType,
      started_at: currentJob.started_at,
    } : null,
    is_processing: isProcessing,
    stats: {
      pending: pending.length,
      processing: processing.length,
      completed: completed.length,
      failed: failed.length,
    }
  };
}

function setProcessCallback(callback) {
  processJobCallback = callback;
}

let processJobCallback = null;

async function processQueue() {
  if (isProcessing) return;

  const job = getNextJob();
  if (!job) return;

  isProcessing = true;
  currentJob = job;
  job.status = 'processing';
  job.started_at = new Date().toISOString();

  try {
    if (processJobCallback) {
      const result = await processJobCallback(job);
      job.result = result;
      job.status = 'completed';
      job.completed_at = new Date().toISOString();
    } else {
      throw new Error('No job processor configured');
    }
  } catch (error) {
    job.error = error.message;
    job.status = 'failed';
    job.completed_at = new Date().toISOString();
  } finally {
    currentJob = null;
    isProcessing = false;
    processQueue();
  }
}

module.exports = {
  submitJob,
  cancelJob,
  getJobStatus,
  getJobResult,
  getQueueStats,
  setProcessCallback,
  PRIORITY,
};
