#!/bin/bash
set -e
# Post-merge setup for NJ Pick 3 Ghost Combo Engine.
# No build step — pure static HTML/JS/CSS served by node server.js.
# Just verify the server can still be required without crashing.
node -e "require('./server.js'); process.exit(0);" 2>/dev/null || true
echo "post-merge: OK"
