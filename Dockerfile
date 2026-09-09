# VoiceShield AI Backend Dockerfile
# Uses python:3.11-slim which has apt-get for FFmpeg (required by PyAV)
FROM python:3.11-slim

# Install FFmpeg (required for PyAV audio decoding)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project files
COPY . .

# Expose port (Render/Railway will set PORT env var)
ENV PORT=8000
EXPOSE $PORT

# Run the FastAPI backend
CMD uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
