import { Span, SpanStatusCode, trace } from '@opentelemetry/api';

export const tracer = trace.getTracer('translation-frontend', '1.0.0');

export const setSpanError = (span: Span, error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  span.recordException(error instanceof Error ? error : new Error(message));
  span.setStatus({ code: SpanStatusCode.ERROR, message });
};
