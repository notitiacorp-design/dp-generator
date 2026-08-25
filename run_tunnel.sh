#!/bin/bash
exec /home/openclaw/cloudflared tunnel --url http://localhost:3000 --no-autoupdate 2>&1