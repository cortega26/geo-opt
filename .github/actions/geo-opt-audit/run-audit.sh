#!/usr/bin/env bash
# geo-opt composite action runner. Inputs arrive as environment variables so
# they stay data, never shell source: GitHub Actions assigns env values
# verbatim, while interpolating input expressions into run: text would hand
# user input to the shell parser.

cli_path="$GEO_OPT_CLI_PATH"
path_input="$GEO_OPT_INPUT_PATH"
model_input="$GEO_OPT_INPUT_MODEL"
recursive_input="$GEO_OPT_INPUT_RECURSIVE"
threshold_input="$GEO_OPT_INPUT_THRESHOLD"
label_input="$GEO_OPT_INPUT_LABEL"

# Build audit command as separate argv elements, expanded quoted so a path
# with spaces, quotes, or shell metacharacters stays one inert argument
args=(audit "$path_input" --format json --model "$model_input")

if [[ "$recursive_input" == "true" ]]; then
  args+=(--recursive)
fi

if [[ -n "$threshold_input" ]]; then
  args+=(--threshold "$threshold_input")
fi

# Run audit; capture stdout and exit code separately, keep stderr visible
# in the job log without polluting the parsed stdout. The stderr file lives
# in $RUNNER_TEMP so the repo is never modified.
OUTPUT=$(node "$cli_path" "${args[@]}" 2>"$RUNNER_TEMP/geo-opt-audit-stderr.txt") || AUDIT_EXIT=$?
AUDIT_EXIT=${AUDIT_EXIT:-0}
cat "$RUNNER_TEMP/geo-opt-audit-stderr.txt" >&2

# Parse score from JSON (handles single-file and multi-file output)
SCORE=$(printf '%s\n' "$OUTPUT" | node -e "
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    try {
      const d = JSON.parse(chunks.join(''));
      const s = Array.isArray(d) ? (d[0]?.effectiveScore ?? 0) : (d.effectiveScore ?? 0);
      process.stdout.write(String(Math.round(s)));
    } catch { process.stdout.write('0'); }
  });
")

# Compute badge color
COLOR="red"
if   [ "$SCORE" -ge 90 ]; then COLOR="brightgreen"
elif [ "$SCORE" -ge 76 ]; then COLOR="green"
elif [ "$SCORE" -ge 61 ]; then COLOR="yellow"
elif [ "$SCORE" -ge 41 ]; then COLOR="orange"
fi

LABEL_ENC=$(printf '%s' "$label_input" | sed 's/ /_/g')
BADGE_URL="https://img.shields.io/badge/${LABEL_ENC}-${SCORE}%2F100-${COLOR}"
BADGE_MD="![$label_input](${BADGE_URL})"

echo "score=${SCORE}"        >> "$GITHUB_OUTPUT"
echo "badge-url=${BADGE_URL}" >> "$GITHUB_OUTPUT"
echo "badge-markdown=${BADGE_MD}" >> "$GITHUB_OUTPUT"

if [ "$AUDIT_EXIT" -eq 0 ]; then
  echo "passed=true" >> "$GITHUB_OUTPUT"
else
  echo "passed=false" >> "$GITHUB_OUTPUT"
fi

# Re-print the audit output; stderr was already streamed above
printf '%s\n' "$OUTPUT"

exit "$AUDIT_EXIT"
