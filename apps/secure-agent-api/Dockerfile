# # ==========================================
# # 🔧 CONFIGURATION (Edit these lines only)
# # ==========================================
# ARG GO_VERSION=1.23-bookworm
# ARG REDIS_REPO_URL=https://github.com/Puneet-Pal-Singh/go-redis.git
# ARG BASE_IMAGE=docker.io/cloudflare/sandbox:0.7.0

# # ==========================================
# # Stage 1: The Builder
# # ==========================================
# FROM golang:${GO_VERSION} AS builder

# # Re-declare ARG because they reset after FROM
# ARG REDIS_REPO_URL 

# WORKDIR /app

# # 1. Clone the repo using the variable
# #    If you change the link at the top, this updates automatically.
# RUN git clone ${REDIS_REPO_URL} .

# # 2. Build
# RUN CGO_ENABLED=0 GOOS=linux go build -o my-redis-server ./cmd/redis-server/

# # ==========================================
# # Stage 2: The Runtime
# # ==========================================
# FROM ${BASE_IMAGE}

# USER root

# # 1. Install Dependencies (Official Redis included for testing)
# RUN apt-get update && \
#     apt-get install -y python3 python3-pip netcat-openbsd redis-server && \
#     rm -rf /var/lib/apt/lists/*

# # 2. Install Python Libs
# RUN python3 -m pip install redis requests numpy pandas

# # 3. Copy Binary
# COPY --from=builder /app/my-redis-server /usr/local/bin/my-redis-server
# RUN chmod +x /usr/local/bin/my-redis-server

# # 4. Setup Data Dir
# RUN mkdir -p /data

# WORKDIR /root

# ==========================================
# 🔧 CONFIGURATION
# ==========================================
ARG GO_VERSION=1.23-bookworm
ARG REDIS_REPO_URL=https://github.com/Puneet-Pal-Singh/go-redis.git
ARG BASE_IMAGE=docker.io/cloudflare/sandbox:0.7.0

# Stage 1: The Builder (Go-Redis)
FROM golang:${GO_VERSION} AS builder
ARG REDIS_REPO_URL 
WORKDIR /app
RUN git clone ${REDIS_REPO_URL} .
RUN CGO_ENABLED=0 GOOS=linux go build -o my-redis-server ./cmd/redis-server/

# Stage 2: The Universal Runtime
FROM ${BASE_IMAGE}
USER root

# 1. Install System Dependencies
RUN apt-get update && \
    apt-get install -y \
    python3 python3-pip \
    netcat-openbsd redis-server \
    curl git build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Node.js (v20 LTS) & TS Tools
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g typescript tsx

# 3. Install Rust (Minimal Profile)
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path

# 4. Install Python Libs
RUN python3 -m pip install redis requests numpy pandas

# 5. Copy Go-Redis Binary
COPY --from=builder /app/my-redis-server /usr/local/bin/my-redis-server
RUN chmod +x /usr/local/bin/my-redis-server

# 6. Setup Data Dir
RUN mkdir -p /data
WORKDIR /root