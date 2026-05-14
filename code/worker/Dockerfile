# Build stage - download and install translation models
FROM python:3.12-slim AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY pyproject.toml ./

# Install PyTorch CPU-only version first to prevent CUDA version (3GB+) from being installed
# This is critical for keeping image size reasonable on AMD64
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install Python dependencies (argostranslate will use the CPU-only PyTorch we just installed)
RUN pip install --no-cache-dir . && \
    # Clean up unnecessary files to reduce image size
    find /usr/local/lib/python3.12/site-packages -type d \( -name "tests" -o -name "test" \) -exec rm -rf {} + 2>/dev/null || true && \
    find /usr/local/lib/python3.12/site-packages -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true && \
    find /usr/local/lib/python3.12/site-packages \( -name "*.pyc" -o -name "*.pyo" \) -delete 2>/dev/null || true

# Download Argos Translate models
COPY download_models.py ./
RUN python download_models.py && \
    # Clean up downloaded package files (keep only installed models)
    rm -rf /tmp/* /root/.cache

# Runtime stage
FROM python:3.12-slim

WORKDIR /app

# Copy installed packages and models from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /root/.local/share/argos-translate /root/.local/share/argos-translate

# Copy source code
COPY src ./src

# Set Python path
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Clean up any remaining cache files
RUN find /usr/local/lib/python3.12/site-packages -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

# Run the worker
CMD ["python", "-m", "src.main"]
