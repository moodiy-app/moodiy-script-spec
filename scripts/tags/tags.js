// Moodiy Script Protocol v1: an envelope and the console.
//
// Answers with an object (an envelope): the message is what the user sees, the output is for the
// next step. console.log, info and error write lines into the run log with their level.

function run(request) {
    var tags = request.entry.tags;

    console.log("entry " + request.entry.id + " has " + tags.length + " tag(s)");

    if (tags.length === 0) {
        return { status: "skipped", message: "The entry has no tags." };
    }

    return {
        message: tags.length + " tag(s): " + tags.join(", "),
        output: tags.map(function (tag) { return "#" + tag.replace(/\s+/g, "-"); }).join(" ")
    };
}
