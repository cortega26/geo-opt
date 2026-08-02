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
args=(audit "$path_input" --summary --format json --model "$model_input")

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

# Parse the aggregate score from summary JSON (--summary emits one object
# with averageScore covering the whole audited set, not file zero). Missing
# or non-numeric scores fail the step loudly instead of fabricating a zero:
# a badge that says nothing truthful is worse than no badge (Plan 072).
PARSE_FAILED=0
SCORE=$(printf '%s\n' "$OUTPUT" | node -e "
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    let d;
    try {
      d = JSON.parse(chunks.join(''));
    } catch (err) {
      console.error('geo-opt action: audit output is not valid JSON: ' + err.message);
      process.exit(2);
    }
    // typeof guard first: Number() would coerce null (JSON.stringify of NaN)
    // to 0 and strings to numbers, silently fabricating a score. Single
    // quotes inside this double-quoted node -e string survive bash.
    const s = d?.averageScore;
    if (typeof s !== 'number' || !Number.isFinite(s)) {
      console.error('geo-opt action: audit summary has no numeric averageScore; cannot render a truthful badge');
      process.exit(2);
    }
    process.stdout.write(String(Math.round(s)));
  });
") || PARSE_FAILED=$?

if [ "$PARSE_FAILED" -ne 0 ]; then
  # Never claim a score we do not have. Keep the audit output visible.
  echo "passed=false" >> "$GITHUB_OUTPUT"
  printf '%s\n' "$OUTPUT"
  exit "$PARSE_FAILED"
fi

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
