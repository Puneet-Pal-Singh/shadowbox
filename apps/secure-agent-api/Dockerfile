# FROM docker.io/cloudflare/sandbox:0.7.0

# # Switch to root user to install packages
# USER root

# # 1. Install dependencies
# # We install 'golang', 'git', and 'python3-pip'
# RUN apt-get update && \
#     apt-get install -y python3 python3-pip golang git curl netcat-openbsd && \
#     rm -rf /var/lib/apt/lists/*

# # 2. Pre-install Python libraries
# # FIX: Removed '--break-system-packages' because this pip version doesn't support/need it
# RUN python3 -m pip install redis requests numpy pandas

# # 3. THE FLEX: Clone YOUR Go-Redis project and build it
# WORKDIR /root
# # Cloning your specific repo
# RUN git clone https://github.com/Puneet-Pal-Singh/go-redis.git

# # 4. Compile it
# WORKDIR /root/go-redis
# # Build the binary and name it 'my-redis-server'
# RUN go build -o my-redis-server .

# # Move it to a global path so we can run it easily later
# RUN mv my-redis-server /usr/local/bin/

# # Reset Workdir
# WORKDIR /root



# ==========================================
# Stage 1: The Builder (Compiling your Go-Redis)
# ==========================================
# FROM golang:1.23-bookworm AS builder

# WORKDIR /app

# # 1. Clone your repository
# RUN git clone https://github.com/Puneet-Pal-Singh/go-redis.git .

# # 2. Build the binary
# # We use CGO_ENABLED=0 to create a static binary (no dependency issues in the next stage)
# # We point to './cmd/redis-server/' because that is where your main.go lives
# RUN CGO_ENABLED=0 GOOS=linux go build -o my-redis-server ./cmd/redis-server/

# # ==========================================
# # Stage 2: The Runtime (Cloudflare Sandbox)
# # ==========================================
# FROM docker.io/cloudflare/sandbox:0.7.0

# # Switch to root for installation
# USER root

# # 1. Install Runtime Dependencies
# # Notice: We DO NOT need 'golang' or 'git' here anymore. Much cleaner!
# RUN apt-get update && \
#     apt-get install -y python3 python3-pip netcat-openbsd && \
#     rm -rf /var/lib/apt/lists/*

# # 2. Pre-install Python libraries (for the Agent)
# RUN python3 -m pip install redis requests numpy pandas

# # 3. Copy the compiled binary from Stage 1
# COPY --from=builder /app/my-redis-server /usr/local/bin/my-redis-server

# # 4. Permissions (Just in case)
# RUN chmod +x /usr/local/bin/my-redis-server

# # Reset Workdir
# WORKDIR /root

# # Required during local development to access exposed ports
# EXPOSE 8080



# ----------------------------------------------------------------------------------------------------------
# ==========================================
# 🔧 CONFIGURATION (Edit these lines only)
# ==========================================
ARG GO_VERSION=1.23-bookworm
ARG REDIS_REPO_URL=https://github.com/Puneet-Pal-Singh/go-redis.git
ARG BASE_IMAGE=docker.io/cloudflare/sandbox:0.7.0

# ==========================================
# Stage 1: The Builder
# ==========================================
FROM golang:${GO_VERSION} AS builder

# Re-declare ARG because they reset after FROM
ARG REDIS_REPO_URL 

WORKDIR /app

# 1. Clone the repo using the variable
#    If you change the link at the top, this updates automatically.
RUN git clone ${REDIS_REPO_URL} .

# 2. Build
RUN CGO_ENABLED=0 GOOS=linux go build -o my-redis-server ./cmd/redis-server/

# ==========================================
# Stage 2: The Runtime
# ==========================================
FROM ${BASE_IMAGE}

USER root

# 1. Install Dependencies (Official Redis included for testing)
RUN apt-get update && \
    apt-get install -y python3 python3-pip netcat-openbsd redis-server && \
    rm -rf /var/lib/apt/lists/*

# 2. Install Python Libs
RUN python3 -m pip install redis requests numpy pandas

# 3. Copy Binary
COPY --from=builder /app/my-redis-server /usr/local/bin/my-redis-server
RUN chmod +x /usr/local/bin/my-redis-server

# 4. Setup Data Dir
RUN mkdir -p /data

WORKDIR /root