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
    unit="ms",
)

# Current number of jobs being actively processed
active_jobs = meter.create_up_down_counter(
    name="translation.active_jobs",
    description="Number of jobs currently being processed",
    unit="1",
)
