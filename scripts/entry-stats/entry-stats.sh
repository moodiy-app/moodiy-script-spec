#!/usr/bin/env bash
#
# Moodiy Script Protocol v1: a Unix script that uses a helper file next to it.
#
# Counts the words and characters of the entry. The statistics are the output, so a following
# step gets them as `previous.output` when this step has "pipe to next" on.

HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib/json.sh
. "$HERE/lib/json.sh"

REQUEST=$(cat)
CONTENT=$(field entry.content)

# An entry without a body has nothing to count: "skipped" is a success that says so.
if [ -z "${CONTENT//[[:space:]]/}" ]; then
    echo '{"protocol":1,"status":"skipped","message":"The entry has no body to count."}'
    exit 0
fi

WORDS=$(wc -w <<<"$CONTENT" | tr -d ' ')
CHARS=$(printf '%s' "$CONTENT" | wc -m | tr -d ' ')
SUMMARY="${WORDS} words, ${CHARS} characters"

# What goes to stderr is only a line in the run log; it never decides success.
echo "counted: ${SUMMARY}" >&2

echo "{\"protocol\":1,\"message\":\"$(json "$SUMMARY")\",\"output\":\"$(json "$SUMMARY")\"}"
