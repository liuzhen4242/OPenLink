#!/bin/zsh
# sync-obsidian.sh — watches the Obsidian vault Projects folder and rsyncs
# changes into the Astro src/content/projects/Projects directory.

OBSIDIAN_DIR="/Users/zhenliu/极空云/obsidian/Projects/"
ASTRO_DIR="/Users/zhenliu/study/coding/OpenLink/src/content/projects/Projects/"

echo "Syncing: $OBSIDIAN_DIR → $ASTRO_DIR"
rsync -a --delete "$OBSIDIAN_DIR" "$ASTRO_DIR"
echo "[$(date +%H:%M:%S)] ✔ Initial sync done – watching…"

while true; do
  sleep 2
  rsync -a --delete "$OBSIDIAN_DIR" "$ASTRO_DIR" 2>/dev/null
  # Only log when something actually changed (check via md5 of listing)
done