# ==============================================================================
# IBVAP - Tactical Computer Vision & Border Surveillance Backend
# Multi-platform Docker Container (Linux x86_64, ARM64 / Apple Silicon)
# ==============================================================================

FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install runtime system libraries required by OpenCV, PyTorch, and video codecs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definition first for caching layer
COPY backend/requirements.txt ./backend/requirements.txt

# Pre-install CPU-optimized PyTorch to minimize container size & accelerate builds
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r ./backend/requirements.txt

# Copy all source files and pre-trained AI models
COPY . .

# Ensure storage directories exist
RUN mkdir -p backend/storage/videos backend/storage/evidence backend/models

# Expose internal service port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Start FastAPI backend with dynamic cloud port injection
WORKDIR /app/backend
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
