# Lab: Worker Metrics - Manual Instrumentation

### 🎯 Lab Goal

Add three custom business metric instruments to the worker — a `Counter`, a `Histogram`, and an `UpDownCounter` — and record them around the translation flow in `main.py`.

### 📝 What You'll Learn

- When to use `Counter`, `Histogram`, and `UpDownCounter`
- How to attach dimension attributes to metrics for filtering in Prometheus

### 📋 Tasks

**1. Create `code/worker/src/metrics.py`**

```python
"""Custom business metrics for the translation worker."""
from opentelemetry import metrics

meter = metrics.get_meter(__name__)

# Total jobs processed — dimensions: language, status (completed / error)
jobs_total = meter.create_counter(
    name="translation.jobs.total",
    description="Total number of translation jobs processed",
    unit="1",
)

# Distribution of translation execution time
translation_duration = meter.create_histogram(
    name="translation.duration",
    description="Time taken to translate a single job",
    unit="s",
)

# Current number of jobs being actively processed
active_jobs = meter.create_up_down_counter(
    name="translation.active_jobs",
    description="Number of jobs currently being processed",
    unit="1",
)
```

| Instrument      | When to use                                        |
| --------------- | -------------------------------------------------- |
| `Counter`       | Value only ever goes up (total jobs, total errors) |
| `Histogram`     | Distribution of values over time (latency)         |
| `UpDownCounter` | Value can decrease (active jobs, queue depth)      |

**2. Update `code/worker/src/main.py`**

Add the import:

```python
from .metrics import jobs_total, translation_duration, active_jobs
```

Inside the `process_translation_job` span, add `active_jobs.add(1)` right before the `try`, add a `finally` block to the `try/except` that calls `active_jobs.add(-1)`, and record `translation_duration` and `jobs_total` after a successful translate:

```python
with tracer.start_as_current_span("process_translation_job", ...) as span:
    start_time = time.time()
    active_jobs.add(1, attributes={"translation.target_language": target_lang})
    try:
        # ... validate ...

        # after translator.translate():
        translation_duration.record(
            duration_ms / 1000,
            attributes={"translation.target_language": target_lang},
        )
        jobs_total.add(1, attributes={
            "translation.target_language": target_lang,
            "translation.status": "completed",
        })

    except Exception as e:
        # ... existing error handling ...
        jobs_total.add(1, attributes={
            "translation.target_language": target_lang,
            "translation.status": "error",
        })

    finally:
        active_jobs.add(-1, attributes={"translation.target_language": target_lang})

    # ... inject context + publish result ...
```

**3. Deploy and verify**

Changes are picked up by hot-reload. Generate traffic, then verify in Prometheus at http://localhost:9090:

```promql
rate(translation_jobs_total{exported_job="translation-worker"}[2m])
```

```promql
histogram_quantile(0.95, rate(translation_duration_seconds_bucket{exported_job="translation-worker"}[5m]))
```

If using `ms` as the unit in the metric definition:

```promql
histogram_quantile(0.95, rate(translation_duration_milliseconds_bucket{exported_job="translation-worker"}[5m]))
```

### 🤖 AI Checkpoints

1. **Choosing the Right Metric Instrument:**

   Ask your AI assistant: "In this lab we used a `Counter`, a `Histogram`, and an `UpDownCounter` for the translation worker. Can you explain when to use each type, and give one example where using the wrong instrument would produce misleading data?"

   **What to evaluate:** Does it explain that `Counter` is for monotonically increasing totals (using it for a value that can decrease, like active jobs, would produce meaningless negative rate calculations)? Does it explain that `Histogram` captures distributions and is the right choice for latency (using a `Counter` for latency would lose the distribution and only let you compute average, not percentiles)? Does it clarify that `UpDownCounter` is for values that rise and fall, and that using a `Gauge` instead is an acceptable alternative for a point-in-time snapshot?

2. **Cardinality and Attribute Dimensions:**

   Ask: "Both `jobs_total` and `active_jobs` in this lab use `translation.target_language` as an attribute dimension. What is label cardinality, and what would happen to Prometheus storage if we added a high-cardinality attribute like `translation.job_id` instead?"

   **What to evaluate:** Does it explain that cardinality is the number of unique time series created by all combinations of attribute values? Does it describe that adding `job_id` (potentially millions of unique values) would create a new Prometheus series per job, quickly exhausting memory and disk? Does it recommend restricting metric attributes to low-cardinality dimensions (language, status, region) and keeping high-cardinality identifiers in traces or logs instead?

3. **Interpreting histogram_quantile in PromQL:**

   Ask: "Explain how `histogram_quantile(0.95, rate(translation_duration_bucket[5m]))` works. What does the 0.95 mean, and why is the `rate()` of the `_bucket` series needed rather than querying the histogram directly?"

   **What to evaluate:** Does it explain that `histogram_quantile` estimates the value below which 95% of observations fall (the p95 latency)? Does it clarify that Prometheus histograms are stored as cumulative `_bucket` counters, and `rate()` converts them to per-second rates over the window before `histogram_quantile` does the interpolation? Does it mention that histograms require the bucket boundaries (`_le` labels) to be set at instrumentation time, meaning you can't retrospectively compute percentiles at arbitrary boundaries?

### 📚 Resources

- [OpenTelemetry Metrics API — Instruments](https://opentelemetry.io/docs/concepts/signals/metrics/#metric-instruments)
- [Prometheus Histograms and Summaries](https://prometheus.io/docs/practices/histograms/)
- [Cardinality best practices](https://prometheus.io/docs/practices/naming/#labels)
