# openclaw-langfuse-integration

# Complete Guide: OpenClaw + Langfuse Integration on Ubuntu

## Table of Contents
1. [OpenClaw Installation](#1-openclaw-installation)
2. [Langfuse Installation with Docker](#2-langfuse-installation-with-docker)
3. [Nginx Reverse Proxy Setup](#3-nginx-reverse-proxy-setup)
4. [OpenClaw → Langfuse Bridge Script](#4-openclaw--langfuse-bridge-script)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. OpenClaw Installation

### Prerequisites
- Ubuntu 20.04+ or Debian-based Linux
- Node.js 18+ (required for OpenClaw)
- systemd (for service management)

### 1.1 Install Node.js with NVM

```bash
# Install NVM (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell configuration
source ~/.bashrc

# Install Node.js 20 (LTS)
nvm install 20
nvm use 20
nvm alias default 20

# Verify installation
node --version  # Should show v20.x.x
npm --version
1.2 Install OpenClaw Gateway
bash
# Install OpenClaw globally
npm install -g openclaw-gateway

# Verify installation
openclaw-gateway --version
1.3 Configure OpenClaw
bash
# Create config directory
mkdir -p ~/.openclaw

# Initialize OpenClaw configuration
openclaw-gateway init

# The config is stored in: ~/.openclaw/openclaw.json
Edit the configuration:

bash
nano ~/.openclaw/openclaw.json
Key settings to configure:

port: Default is 18789

provider: Choose your LLM provider (google, openai, anthropic)

apiKey: Your API key for the provider

model: Model name (e.g., gemini-2.5-flash-preview-09-2025)

Example config:

json
{
  "port": 18789,
  "assistant": {
    "name": "Stebbot",
    "avatar": "🤙"
  },
  "agent": {
    "provider": "google",
    "model": "gemini-2.5-flash-preview-09-2025",
    "apiKey": "YOUR_GOOGLE_API_KEY"
  }
}
1.4 Set up OpenClaw as Systemd Service
Create the service file:

bash
mkdir -p ~/.config/systemd/user
nano ~/.config/systemd/user/openclaw-gateway.service
Add this content:

text
[Unit]
Description=OpenClaw Gateway Service
After=network.target

[Service]
Type=simple
ExecStart=/home/YOUR_USERNAME/.nvm/versions/node/v20.x.x/bin/openclaw-gateway start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-gateway

[Install]
WantedBy=default.target
Important: Replace the ExecStart path with your actual path:

bash
# Find the correct path
which openclaw-gateway
# Use that full path in the service file
Enable and start the service:

bash
# Reload systemd
systemctl --user daemon-reload

# Enable service to start on boot
systemctl --user enable openclaw-gateway.service

# Start the service
systemctl --user start openclaw-gateway.service

# Check status
systemctl --user status openclaw-gateway.service

# View logs
journalctl --user -u openclaw-gateway.service -f
1.5 Access OpenClaw UI
Open your browser and navigate to:

text
http://localhost:18789
You should see the OpenClaw chat interface.

2. Langfuse Installation with Docker
2.1 Prerequisites
bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (to run without sudo)
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt install docker-compose -y

# Verify installation
docker --version
docker-compose --version
2.2 Create Langfuse Directory
bash
mkdir -p ~/langfuse
cd ~/langfuse
2.3 Create Docker Compose File
bash
nano docker-compose.yml

You can find the docker-compose in the repo.

Important: Generate secure secrets:

bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate SALT
openssl rand -base64 32

# Update the .env with these values
2.4 Start Langfuse
bash
cd ~/langfuse
docker-compose up -d

# Check logs
docker-compose logs -f langfuse-server

# Check status
docker-compose ps
Langfuse should now be running on http://localhost:3001

2.5 Initial Langfuse Setup
With the init environment variables in the langfuse-web container, you pre-create project and credentials, but for openclaw you better create new API Keys as follows:

Go to Settings → API Keys

Create a new API key pair:

Public Key: pk-lf-...

Secret Key: sk-lf-...

Save these keys for later use

3. Nginx Reverse Proxy Setup
3.1 Install Nginx
bash
sudo apt update
sudo apt install nginx -y

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
3.2 Configure Domain (if using)
If you have a domain, set up DNS A record pointing to your server IP.

3.3 Create Nginx Configuration
bash
sudo nano /etc/nginx/sites-available/langfuse
Add this configuration:

text
server {
    listen 80;
    server_name langfuse.yourdomain.com;  # Change this

    # Increase upload size for large traces
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for long-running requests
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
        send_timeout 300;
    }
}
Enable the site:

bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/langfuse /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
3.4 Install SSL Certificate (Let's Encrypt)
bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d langfuse.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
Certbot automatically updates your Nginx config to use HTTPS.

3.5 Update Docker Compose for HTTPS
bash
cd ~/langfuse
nano docker-compose.yml
Update the NEXTAUTH_URL:

text
NEXTAUTH_URL: https://langfuse.yourdomain.com
Restart Langfuse:

bash
docker-compose down
docker-compose up -d

4. OpenClaw → Langfuse Bridge Script
4.1 Why We Need This

## OpenClaw doesn't have native Langfuse integration. The bridge script:

Monitors OpenClaw systemd logs in real-time

Extracts conversation data (model, timing, output)

Sends traces to Langfuse API

Runs continuously as a background service

Limitations:

User input is NOT captured (OpenClaw doesn't log it)

Only assistant output, timing, and metadata are tracked

4.2 Install PM2 (Process Manager)
bash
npm install -g pm2

# Enable PM2 to start on boot
pm2 startup
# Follow the command it shows
4.3 Create the Bridge Script
bash
nano ~/openclaw-langfuse-bridge.js

The script is in the repo.


4.4 Configure the Script
Update these values in the script:

javascript
const LANGFUSE_HOST = 'https://langfuse.yourdomain.com';  // Your Langfuse URL
const LANGFUSE_PUBLIC_KEY = 'pk-lf-...';                   // From Langfuse Settings
const LANGFUSE_SECRET_KEY = 'sk-lf-...';                   // From Langfuse Settings

Make it executable:

bash
chmod +x ~/openclaw-langfuse-bridge.js

4.5 Start with PM2
bash
# Start the bridge
pm2 start ~/openclaw-langfuse-bridge.js --name openclaw-langfuse-bridge

# Save PM2 configuration
pm2 save

# View logs
pm2 logs openclaw-langfuse-bridge

# Check status
pm2 status
4.6 Test the Integration
Open OpenClaw UI: http://localhost:18789

Send a message to the assistant

Check PM2 logs: pm2 logs openclaw-langfuse-bridge

You should see: 📊 Trace started, 💬 Captured, ✅ Sent to Langfuse

Open Langfuse UI: https://langfuse.yourdomain.com

Go to your project → Traces

You should see the conversation trace with:

Timestamp

Model name

Duration

Assistant output

Session ID

5. Troubleshooting
OpenClaw Issues
Service won't start:

bash
# Check logs
journalctl --user -u openclaw-gateway.service -n 50

# Common issues:
# - Wrong Node.js path in service file
# - Missing API key in config
# - Port already in use
Can't access UI:

bash
# Check if OpenClaw is running
systemctl --user status openclaw-gateway.service

# Check what port it's using
cat ~/.openclaw/openclaw.json | grep port

# Check if port is open
ss -tlnp | grep 18789
Langfuse Issues
Container won't start:

bash
cd ~/langfuse
docker-compose logs langfuse-server

# Common issues:
# - Database connection failed (wait for healthcheck)
# - Port 3001 already in use
# - Missing environment variables
Can't access Langfuse UI:

bash
# Check containers
docker-compose ps

# Check Nginx
sudo nginx -t
sudo systemctl status nginx

# Check logs
docker-compose logs -f
SSL certificate issues:

bash
# Renew certificate
sudo certbot renew

# Check certificate status
sudo certbot certificates
Bridge Script Issues
Script not capturing logs:

bash
# Check if PM2 is running
pm2 status

# Check logs
pm2 logs openclaw-langfuse-bridge --lines 100

# Verify OpenClaw is logging
journalctl --user -u openclaw-gateway.service -f

# Restart the bridge
pm2 restart openclaw-langfuse-bridge
Traces not appearing in Langfuse:

bash
# Check API keys are correct
nano ~/openclaw-langfuse-bridge.js

# Test Langfuse API manually
curl -X POST https://langfuse.yourdomain.com/api/public/ingestion \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'pk-lf-...:sk-lf-...' | base64)" \
  -d '{"batch":[]}'

# Should return: {"successes":[],"errors":[]}
Output is truncated:

bash
# Verify --all flag is in the script
grep "'--all'" ~/openclaw-langfuse-bridge.js

# If missing, add it:
nano ~/openclaw-langfuse-bridge.js
# In the spawn line, add '--all' to the array
Useful Commands
OpenClaw:

bash
# Restart service
systemctl --user restart openclaw-gateway.service

# View live logs
journalctl --user -u openclaw-gateway.service -f

# Check config
cat ~/.openclaw/openclaw.json

# Update OpenClaw
npm update -g openclaw-gateway
Langfuse:

bash
# Restart Langfuse
cd ~/langfuse
docker-compose restart

# View logs
docker-compose logs -f langfuse-server

# Backup database
docker exec langfuse-db pg_dump -U langfuse langfuse > langfuse-backup.sql

# Update Langfuse
docker-compose pull
docker-compose up -d
Bridge Script:

bash
# View logs
pm2 logs openclaw-langfuse-bridge

# Restart
pm2 restart openclaw-langfuse-bridge

# Stop
pm2 stop openclaw-langfuse-bridge

# Remove from PM2
pm2 delete openclaw-langfuse-bridge

# Update script and restart
nano ~/openclaw-langfuse-bridge.js
pm2 restart openclaw-langfuse-bridge
System:

bash
# Check all services
systemctl --user status openclaw-gateway.service
sudo systemctl status nginx
docker-compose ps
pm2 status

# Check ports
ss -tlnp | grep -E "18789|3001|80|443"

# Check disk space
df -h

# Check memory
free -h
Architecture Overview
text
┌─────────────────────────────────────────────────────────────┐
│                         User Browser                        │
│  http://localhost:18789  |  https://langfuse.yourdomain.com │
└──────────────┬────────────────────────────┬─────────────────┘
               │                            │
               ▼                            ▼
    ┌──────────────────┐         ┌──────────────────┐
    │  OpenClaw UI     │         │  Nginx (80/443)  │
    │  Port 18789      │         │  Reverse Proxy   │
    └────────┬─────────┘         └────────┬─────────┘
             │                            │
             ▼                            ▼
    ┌──────────────────┐         ┌──────────────────┐
    │ openclaw-gateway │         │ Langfuse Server  │
    │ (systemd user)   │         │ (Docker:3001)    │
    └────────┬─────────┘         └────────┬─────────┘
             │                            │
             │ logs                       │
             ▼                            ▼
    ┌──────────────────┐         ┌──────────────────┐
    │ systemd journal  │         │ PostgreSQL DB    │
    │ (journalctl)     │         │ (Docker)         │
    └────────┬─────────┘         └──────────────────┘
             │
             │ monitored by
             ▼
    ┌──────────────────┐
    │ Bridge Script    │──────────HTTP POST────────┐
    │ (PM2 managed)    │                           │
    └──────────────────┘                           │
                                                   │
                                                   ▼
                                          Langfuse Ingestion API

Additional Notes
Security Considerations
API Keys: Store Langfuse keys securely, don't commit to git

Firewall: Only expose necessary ports (80, 443)

SSL: Always use HTTPS in production

Database: Langfuse DB is only accessible to Docker network

OpenClaw: Consider adding authentication if exposing publicly

Performance
Langfuse: PostgreSQL volume persists data across restarts

Bridge: Minimal CPU/memory usage, processes logs in real-time

OpenClaw: Performance depends on LLM provider rate limits

Backup
bash
# Backup Langfuse database
docker exec langfuse-db pg_dump -U langfuse langfuse > backup-$(date +%Y%m%d).sql

# Backup OpenClaw config
cp ~/.openclaw/openclaw.json ~/openclaw-backup-$(date +%Y%m%d).json

# Backup bridge script
cp ~/openclaw-langfuse-bridge.js ~/openclaw-langfuse-bridge-backup.js
Monitoring
Set up monitoring for:

OpenClaw service uptime

Langfuse container health

Bridge script PM2 status

Nginx access/error logs

Disk space (Langfuse DB can grow)

Credits:
OpenClaw: https://github.com/openclaw/openclaw
Langfuse: https://langfuse.com
Tutorial Reference: https://www.codecademy.com/article/open-claw-tutorial-installation-to-first-chat-setup