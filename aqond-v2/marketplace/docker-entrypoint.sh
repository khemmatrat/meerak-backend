#!/bin/bash
set -e
# Seed placeholder PHP when persistent volume hides image files
if [ ! -f /var/www/html/index.php ] || [ ! -f /var/www/html/.htaccess ]; then
  cp -a /seed/public/. /var/www/html/
fi
exec apache2-foreground
