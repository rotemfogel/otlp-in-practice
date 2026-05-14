import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

import { WinstonInstrumentation } from '@opentelemetry/instrumentation-winston';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';

const exportIntervalMillis = parseInt(
  process.env.OTEL_METRIC_EXPORT_INTERVAL || '10000',
  10,
);

// All configuration is driven by standard OTel environment variables:
//   OTEL_SERVICE_NAME                   — service name (required)
//   OTEL_EXPORTER_OTLP_ENDPOINT         — base URL for all signals, e.g. http://otel-collector:4318
//   OTEL_EXPORTER_OTLP_TRACES_ENDPOINT  — override traces endpoint
//   OTEL_EXPORTER_OTLP_METRICS_ENDPOINT — override metrics endpoint
//   OTEL_EXPORTER_OTLP_LOGS_ENDPOINT    — override logs endpoint
//   OTEL_METRIC_EXPORT_INTERVAL         — metrics export interval in ms (default 60000)
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
    exportIntervalMillis,
  }),
  logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
  instrumentations: [
    getNodeAutoInstrumentations(),
    new WinstonInstrumentation(),
  ],
});

sdk.start();
