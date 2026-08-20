#!/bin/sh
# SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
# Serve this folder over http://127.0.0.1 and open Aurelian Lite in a browser.
#
# Why bother, when the page opens by double-click: a page opened from file:// gets an
# opaque origin, and a browser does not keep IndexedDB for one. Every start downloads
# the extraction model again. Served from a local address it is a normal origin, so the
# model is downloaded once and stays.
#
#   ./start.sh                 serve the folder, open the browser
#   ./start.sh --llm           also run a local language model (llama.cpp) that answers
#                              on the same address, so there is no second origin
#   ./start.sh --port 9000     use another port
#   ./start.sh --model x.gguf  use this model file instead of the one found here
#
# Nothing leaves the machine: the address is bound to 127.0.0.1, never to 0.0.0.0.
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PORT=8127
LLM=0
MODEL=""

while [ $# -gt 0 ]; do
  case $1 in
    --llm) LLM=1 ;;
    --port) PORT=$2; shift ;;
    --model) MODEL=$2; shift ;;
    -h|--help) sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

[ -f "$DIR/index.html" ] || [ -f "$DIR/aurelian-lite.html" ] || {
  echo "No aurelian-lite.html or index.html next to this script." >&2; exit 1; }
PAGE=index.html
[ -f "$DIR/index.html" ] || PAGE=aurelian-lite.html
URL="http://127.0.0.1:$PORT/$PAGE"

open_browser() {
  # Give the server a moment to bind before the browser asks for the page.
  sleep 1
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true
  else echo "Open $URL in your browser."; fi
}

if [ "$LLM" -eq 0 ]; then
  # ── Just the page ────────────────────────────────────────────────────────────
  echo "Aurelian Lite on $URL   (Ctrl-C to stop)"
  open_browser &
  if command -v python3 >/dev/null 2>&1; then exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIR"
  elif command -v python >/dev/null 2>&1; then exec python -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIR"
  elif command -v node >/dev/null 2>&1; then exec npx --yes serve --listen "tcp://127.0.0.1:$PORT" "$DIR"
  else
    echo "Needs python3 or node to serve the folder. Install either, or open the file directly." >&2
    exit 1
  fi
fi

# ── The page AND a language model, from one process ────────────────────────────
# llama-server serves static files with --path, so the page and the model answer on
# the same address. One origin: no cross-origin request, and the browser keeps the
# storage it would drop for a file:// page.
SERVER="$DIR/llama-server"
[ -x "$SERVER" ] || SERVER=$(command -v llama-server 2>/dev/null || echo "")
[ -n "$SERVER" ] || {
  echo "No llama-server found next to this script or on the PATH." >&2
  echo "Fetch a build for your machine from https://github.com/ggml-org/llama.cpp/releases" >&2
  echo "and put the llama-server binary in $DIR." >&2
  exit 1; }

if [ -z "$MODEL" ]; then
  MODEL=$(find "$DIR" -maxdepth 1 -name '*.gguf' 2>/dev/null | head -n 1)
fi
[ -n "$MODEL" ] && [ -f "$MODEL" ] || {
  echo "No .gguf model file found in $DIR (and none given with --model)." >&2
  echo "A model is a large download - pick one deliberately rather than having a script" >&2
  echo "guess for you. Anything llama.cpp reads will do; 7B-14B at q4 is the useful range." >&2
  exit 1; }

# Leave the machine usable while it works: one request at a time, a bounded context,
# and one core kept free so the desktop keeps responding.
CORES=$( (getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2) )
THREADS=$(( CORES > 1 ? CORES - 1 : 1 ))

echo "Aurelian Lite on $URL   (Ctrl-C to stop)"
echo "  model   $(basename "$MODEL")"
echo "  threads $THREADS of $CORES · context 4096 · one request at a time"
open_browser &
exec "$SERVER" --path "$DIR" --host 127.0.0.1 --port "$PORT" \
  --model "$MODEL" --threads "$THREADS" --ctx-size 4096 --parallel 1
