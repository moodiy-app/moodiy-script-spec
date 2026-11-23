// Moodiy Script Protocol v1: the smallest JavaScript script.
//
// Moodiy reads the file and calls run(request) with the request already parsed. A string that is
// returned is the output of the step. A JavaScript script runs inside Moodiy and has no network,
// file or process access (use a Unix script for those).

function run(request) {
    return "Hello from JavaScript: " + (request.entry.title || "untitled") + " (" + request.trigger + ")";
}
