// Moodiy Script Protocol v1: an envelope and the console.
//
// Answers with an object (an envelope): the message is what the user sees, the output is for the
// next step. console.log, info and error write lines into the run log with their level.
//
// The optional argument `limit` (an int, set on the step of a flow) keeps only the first tags.
// Without it, or with 0, every tag is kept.

function run(request) {
    var limit = request.args && typeof request.args.limit === "number" ? request.args.limit : 0;
    var tags = request.entry.tags;

    console.log("entry " + request.entry.id + " has " + tags.length + " tag(s)");

    if (tags.length === 0) {
        return { status: "skipped", message: "The entry has no tags." };
    }

    if (limit > 0) {
        tags = tags.slice(0, limit);
    }

    return {
        message: tags.length + " tag(s): " + tags.join(", "),
        output: tags.map(function (tag) { return "#" + tag.replace(/\s+/g, "-"); }).join(" ")
    };
}
