# Base image — Python 3.9 lightweight version
FROM python:3.9-slim

# Who made this
LABEL maintainer="mittalsaks"
LABEL description="eSim Session Manager Service"

# Set working directory inside container
WORKDIR /app

# Copy requirements first (for Docker cache optimization)
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all source files
COPY . .

# Port jis par session manager chalega
EXPOSE 8001

# Start command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]