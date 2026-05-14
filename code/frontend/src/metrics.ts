import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('translation-frontend', '1.0.0');

export const translationRequestsCounter = meter.createCounter(
  'translation.requests.total',
  { description: 'Total translation requests' },
);

export const jobsEnqueuedCounter = meter.createCounter(
  'translation.jobs.enqueued.total',
  { description: 'Total translation jobs enqueued' },
);

export const requestDuration = meter.createHistogram(
  'translation.request.duration',
  { description: 'Translation request processing time', unit: 'ms' },
);

export const validationErrorsCounter = meter.createCounter(
  'translation.validation.errors.total',
  { description: 'Translation validation errors' },
);
