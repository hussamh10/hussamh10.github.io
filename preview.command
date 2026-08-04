#!/bin/zsh
# Double-click this to preview the site.
#
# The page reads its text from content/*.md, and a browser will not allow that
# when a page is opened straight off the disk — so it has to be served. This
# starts a small local server and opens it. Close the Terminal window to stop.

cd "$(dirname "$0")" || exit 1

PORT=8080
while lsof -i ":$PORT" >/dev/null 2>&1; do PORT=$((PORT + 1)); done

echo "Serving $(pwd)"
echo "   http://localhost:$PORT"
echo "Close this window when you are done."
echo

sleep 1 && open "http://localhost:$PORT/" &
python3 -m http.server "$PORT"
