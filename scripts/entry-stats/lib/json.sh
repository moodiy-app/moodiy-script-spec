# Helpers for entry-stats.sh. Sourced, not run. Expects the request in $REQUEST.

# Reads one key of the request. plutil reads JSON, so no extra tool is needed.
# A missing key gives an empty text.
field() {
    plutil -extract "$1" raw -o - - <<<"$REQUEST" 2>/dev/null
}

# Escapes a text for a JSON string: the backslash first, then the quote and the line break.
json() {
    local text=${1//\\/\\\\}
    text=${text//\"/\\\"}
    echo "${text//$'\n'/\\n}"
}
