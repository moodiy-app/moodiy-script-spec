// Moodiy Script Protocol v1: the previous step and the attachments, in JavaScript.
//
// Counts the words of the entry and says how many files are attached. When the previous step
// piped something to this one, it is added to the message.
//
// The optional argument `show_files` (a bool, set on the step of a flow) says whether the names of
// the attachments are listed in the message. It is on when the argument is not given.

function run(request) {
    var body = request.entry.content.trim();

    if (body === "") {
        return { status: "skipped", message: "The entry has no body to count." };
    }

    var words = body.split(/\s+/).length;
    var files = request.entry.attachments.map(function (file) { return file.name; });
    var showFiles = request.args && typeof request.args.show_files === "boolean" ? request.args.show_files : true;
    var text = words + " words, " + files.length + " attachment(s)" + (showFiles && files.length ? ": " + files.join(", ") : "");

    if (request.previous && request.previous.status === "ok" && request.previous.output) {
        console.info("the previous step (" + request.previous.script + ") said: " + request.previous.output);
        text += ". Before: " + request.previous.output;
    }

    return { message: text, output: String(words) };
}
