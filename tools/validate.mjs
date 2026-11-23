#!/usr/bin/env node
// Validates a Moodiy script catalog repository against spec version 1 (docs/spec.md).
//
// Usage: node tools/validate.mjs [repository-folder]
//
// Dependency-free, Node 18 or later. Prints one line per problem and exits with 1 when there is
// an error. Warnings do not change the exit status.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LIMITS = {
    nameLength: 100,
    descriptionLength: 500,
    detailBytes: 200 * 1024,
    fileBytes: 5 * 1024 * 1024,
    totalBytes: 20 * 1024 * 1024,
    maxFiles: 100,
    maxSteps: 50,
    maxArgs: 20,
    argDescriptionLength: 200,
    argStringLength: 4096,
    maxPathLength: 255,
    maxHomepageLength: 2048
};

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const VERSION_PATTERN = /^[0-9]+(\.[0-9]+)*(-[0-9A-Za-z.-]+)?$/;
const ARG_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ARG_TYPES = ["int", "double", "bool", "string"];
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const errors = [];
const warnings = [];

function show(path) {
    return relative(root, path).split("\\").join("/") || ".";
}

function error(path, message) {
    errors.push(`ERROR   ${show(path)}: ${message}`);
}

function warn(path, message) {
    warnings.push(`WARNING ${show(path)}: ${message}`);
}

function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function length(text) {
    return [...text].length;
}

// Walks the repository once and reports every symbolic link. The .git and node_modules folders are skipped.
function checkNoSymlinks(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules") {
            continue;
        }

        const path = join(folder, entry.name);

        if (entry.isSymbolicLink()) {
            error(path, "symbolic links are not allowed");
        } else if (entry.isDirectory()) {
            checkNoSymlinks(path);
        }
    }
}

// Reads a JSON file that must hold an object. Returns undefined, after reporting why, when it cannot.
function readJSON(path) {
    let bytes;

    try {
        bytes = readFileSync(path);
    } catch (reason) {
        error(path, `cannot be read (${reason.code ?? reason.message})`);
        return undefined;
    }

    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        error(path, "starts with a byte order mark; save it as plain UTF-8");
        return undefined;
    }

    let value;

    try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (reason) {
        error(path, `is not valid UTF-8 JSON (${reason.message})`);
        return undefined;
    }

    if (!isObject(value)) {
        error(path, "must be a JSON object");
        return undefined;
    }

    return value;
}

function checkUnknownFields(path, object, known) {
    for (const key of Object.keys(object)) {
        if (!known.includes(key)) {
            warn(path, `unknown field "${key}" is ignored by clients (a typo?)`);
        }
    }
}

// Returns the reason a relative path is not allowed, or undefined when it is fine.
function pathProblem(value) {
    if (typeof value !== "string" || value === "") {
        return "must be a non-empty string";
    }

    if (value.length > LIMITS.maxPathLength) {
        return `is longer than ${LIMITS.maxPathLength} characters`;
    }

    if (CONTROL_CHARACTERS.test(value)) {
        return "contains a control character";
    }

    if (value.includes("\\")) {
        return "must use / as the separator, not a backslash";
    }

    if (value.startsWith("/")) {
        return "must be relative, without a leading /";
    }

    if (value.endsWith("/")) {
        return "must name a file, not a folder";
    }

    for (const segment of value.split("/")) {
        if (segment === "") {
            return "has an empty segment (//)";
        }

        if (segment === "." || segment === "..") {
            return `has a "${segment}" segment`;
        }
    }

    return undefined;
}

function checkText(path, object, key, { max, multiline }) {
    const value = object[key];

    if (value === undefined) {
        error(path, `"${key}" is required`);
        return;
    }

    if (typeof value !== "string") {
        error(path, `"${key}" must be a string`);
        return;
    }

    if (value.trim() === "") {
        error(path, `"${key}" must not be empty`);
    } else if (length(value) > max) {
        error(path, `"${key}" is ${length(value)} characters, at most ${max} are allowed`);
    }

    const forbidden = multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : CONTROL_CHARACTERS;

    if (forbidden.test(value)) {
        error(path, `"${key}" contains a control character${multiline ? "" : " (it must be one line)"}`);
    }
}

function checkHomepage(path, object) {
    const value = object.homepage;

    if (value === undefined) {
        return;
    }

    if (typeof value !== "string" || !/^https:\/\/[^\s]+$/.test(value) || value.length > LIMITS.maxHomepageLength) {
        error(path, `"homepage" must be an https address without spaces`);
        return;
    }

    try {
        new URL(value);
    } catch {
        error(path, `"homepage" is not a valid address`);
    }
}

function checkId(path, object, folderName) {
    const value = object.id;

    if (value === undefined) {
        error(path, `"id" is required`);
        return false;
    }

    if (typeof value !== "string" || !ID_PATTERN.test(value)) {
        error(path, `"id" must match ${ID_PATTERN}`);
        return false;
    }

    if (value !== folderName) {
        error(path, `"id" is "${value}" but the folder is named "${folderName}"; they must be equal`);
        return false;
    }

    return true;
}

function checkVersion(path, object) {
    const value = object.version;

    if (value === undefined) {
        error(path, `"version" is required`);
    } else if (typeof value === "number") {
        if (!Number.isFinite(value) || value < 0) {
            error(path, `"version" must not be negative`);
        } else {
            warn(path, `"version" is a number; a number loses a trailing zero (1.10 becomes 1.1), so write it as a string`);
        }
    } else if (typeof value !== "string" || !VERSION_PATTERN.test(value) || value.length > 64) {
        error(path, `"version" must be a string like 1.0, 1.2.3 or 1.0-beta`);
    }
}

// Checks the optional detail file: it exists, is an html file inside the folder, and is small and self-contained.
function checkDetail(manifestPath, folder, object) {
    const value = object.detail;

    if (value === undefined) {
        return undefined;
    }

    const problem = pathProblem(value);

    if (problem) {
        error(manifestPath, `"detail" ${problem}`);
        return undefined;
    }

    if (!/\.html?$/i.test(value)) {
        error(manifestPath, `"detail" must be an .html file`);
        return undefined;
    }

    const path = join(folder, ...value.split("/"));
    const info = regularFile(path);

    if (!info) {
        error(manifestPath, `"detail" file "${value}" does not exist or is not a regular file`);
        return undefined;
    }

    if (info.size > LIMITS.detailBytes) {
        error(path, `is ${info.size} bytes, the detail file may have at most ${LIMITS.detailBytes} bytes`);
    }

    let html;

    try {
        html = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
    } catch {
        error(path, "is not valid UTF-8");
        return value;
    }

    checkRichText(path, html);
    return value;
}

function regularFile(path) {
    try {
        const info = lstatSync(path);
        return info.isFile() ? info : undefined;
    } catch {
        return undefined;
    }
}

// A heuristic check of the rich-text rules (docs/spec.md, "Detail pages"). The client is the final judge.
function checkRichText(path, source) {
    const html = source.replace(/<!--[\s\S]*?-->/g, "");
    const loadingAttributes = ["src", "srcset", "poster", "data", "background", "action", "formaction", "ping", "manifest", "codebase", "icon"];
    const blockedTags = ["script", "iframe", "frame", "frameset", "object", "embed", "applet", "link", "base", "form"];
    const tagPattern = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    const attributePattern = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    const cssProblems = new Set();
    let tag;

    while ((tag = tagPattern.exec(html)) !== null) {
        const name = tag[1].toLowerCase();

        if (blockedTags.includes(name)) {
            error(path, `<${name}> is not allowed in a detail page`);
        }

        let attribute;
        attributePattern.lastIndex = 0;

        while ((attribute = attributePattern.exec(tag[2])) !== null) {
            const key = attribute[1].toLowerCase();
            const value = (attribute[2] ?? attribute[3] ?? attribute[4] ?? "").trim();

            if (name === "meta" && key === "http-equiv") {
                error(path, `<meta http-equiv> is not allowed (no redirects or refreshes)`);
            } else if (key.startsWith("on")) {
                error(path, `the event handler attribute "${key}" is not allowed (no script runs)`);
            } else if (loadingAttributes.includes(key) && !/^data:/i.test(value)) {
                error(path, `<${name} ${key}="${value}"> loads content from outside; only data: addresses are allowed`);
            } else if (key === "href" && name === "a") {
                if (!/^(https:\/\/|mailto:|#)/i.test(value)) {
                    error(path, `link "${value}" must be an https:, mailto: or #fragment address`);
                }
            } else if (key === "href") {
                error(path, `<${name} href> is not allowed; only <a href> links are`);
            } else if (key === "style") {
                checkCSS(path, value, cssProblems);
            }

            if (/^\s*(javascript|vbscript):/i.test(value)) {
                error(path, `a "${value}" address is not allowed (no script runs)`);
            }
        }
    }

    for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
        checkCSS(path, style[1], cssProblems);
    }
}

function checkCSS(path, css, reported) {
    if (/@import\b/i.test(css) && !reported.has("import")) {
        reported.add("import");
        error(path, "@import is not allowed; the CSS must be inline");
    }

    for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
        const address = match[2].trim();

        if (!/^(data:|#)/i.test(address) && !reported.has(address)) {
            reported.add(address);
            error(path, `url(${address}) loads content from outside; only data: addresses are allowed`);
        }
    }
}

function listFolders(folder) {
    if (!existsSync(folder)) {
        return [];
    }

    const names = [];

    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith(".")) {
            continue;
        }

        if (entry.isDirectory()) {
            names.push(entry.name);
        } else if (!entry.isSymbolicLink()) {
            error(join(folder, entry.name), `only script or flow folders belong in "${show(folder)}"`);
        }
    }

    return names;
}

function checkRoot() {
    const path = join(root, "moodiy-spec.json");

    if (!regularFile(path)) {
        error(path, "is missing; every catalog repository needs it in its root");
        return;
    }

    const manifest = readJSON(path);

    if (!manifest) {
        return;
    }

    checkUnknownFields(path, manifest, ["spec", "name", "description", "homepage"]);

    if (manifest.spec !== 1) {
        error(path, `"spec" must be the number 1 (this validator knows spec version 1)`);
    }

    checkText(path, manifest, "name", { max: LIMITS.nameLength, multiline: false });
    checkText(path, manifest, "description", { max: LIMITS.descriptionLength, multiline: true });
    checkHomepage(path, manifest);
}

// Returns a map of the lowercase path to the real path for the entry and every extra file.
function checkScriptFiles(manifestPath, folder, manifest, detail) {
    const listed = [];
    const seen = new Map();
    const never = new Set(["script.json", detail?.toLowerCase()].filter(Boolean));
    let entry = manifest.entry;

    if (entry === undefined) {
        error(manifestPath, `"entry" is required`);
    } else {
        const problem = pathProblem(entry);

        if (problem) {
            error(manifestPath, `"entry" ${problem}`);
            entry = undefined;
        }
    }

    if (entry !== undefined) {
        listed.push(entry);
        seen.set(entry.toLowerCase(), "entry");

        if (never.has(entry.toLowerCase())) {
            error(manifestPath, `"entry" cannot be "${entry}"; that file is never installed as a script file`);
        }
    }

    if (manifest.files !== undefined) {
        if (!Array.isArray(manifest.files)) {
            error(manifestPath, `"files" must be an array of paths`);
        } else {
            for (const file of manifest.files) {
                const problem = pathProblem(file);

                if (problem) {
                    error(manifestPath, `"files" item ${JSON.stringify(file)} ${problem}`);
                    continue;
                }

                const key = file.toLowerCase();

                if (seen.has(key)) {
                    error(manifestPath, seen.get(key) === "entry" && file === entry
                        ? `"files" repeats the entry "${file}"; the entry is implied`
                        : `"files" lists "${file}" twice (paths are compared without regard to case)`);
                    continue;
                }

                if (never.has(key)) {
                    error(manifestPath, `"files" cannot list "${file}"; that file is never installed as a script file`);
                    continue;
                }

                seen.set(key, "file");
                listed.push(file);
            }
        }
    }

    if (listed.length > LIMITS.maxFiles) {
        error(manifestPath, `lists ${listed.length} files with the entry, at most ${LIMITS.maxFiles} are allowed`);
    }

    let total = 0;
    const present = new Set();

    for (const file of listed) {
        const path = join(folder, ...file.split("/"));
        const info = regularFile(path);

        if (!info) {
            error(manifestPath, `file "${file}" does not exist or is not a regular file`);
            continue;
        }

        present.add(file);
        total += info.size;

        if (info.size > LIMITS.fileBytes) {
            error(path, `is ${info.size} bytes, at most ${LIMITS.fileBytes} are allowed for one file`);
        }
    }

    if (total > LIMITS.totalBytes) {
        error(manifestPath, `the files add up to ${total} bytes, at most ${LIMITS.totalBytes} are allowed`);
    }

    if (entry !== undefined && present.has(entry) && !entry.endsWith(".js")) {
        const head = readFileSync(join(folder, ...entry.split("/"))).subarray(0, 2).toString("latin1");

        if (head !== "#!") {
            error(join(folder, ...entry.split("/")), `is a Unix script ("${entry}" does not end in .js), so it must start with a shebang such as #!/usr/bin/env bash`);
        }
    }

    checkChecksums(manifestPath, folder, manifest, listed, present);
}

function checkChecksums(manifestPath, folder, manifest, listed, present) {
    const checksums = manifest.sha256;

    if (checksums === undefined) {
        return;
    }

    if (!isObject(checksums)) {
        error(manifestPath, `"sha256" must be an object of path to checksum`);
        return;
    }

    for (const [file, expected] of Object.entries(checksums)) {
        if (!listed.includes(file)) {
            error(manifestPath, `"sha256" names "${file}", which is neither the entry nor listed in "files"`);
        } else if (typeof expected !== "string" || !SHA256_PATTERN.test(expected)) {
            error(manifestPath, `"sha256" of "${file}" must be 64 lowercase hex digits`);
        } else if (present.has(file)) {
            const actual = createHash("sha256").update(readFileSync(join(folder, ...file.split("/")))).digest("hex");

            if (actual !== expected) {
                error(manifestPath, `"sha256" of "${file}" does not match the file (the file is ${actual})`);
            }
        }
    }
}

function checkScripts() {
    const ids = new Set();

    for (const name of listFolders(join(root, "scripts"))) {
        const folder = join(root, "scripts", name);
        const path = join(folder, "script.json");

        if (!regularFile(path)) {
            error(folder, "has no script.json");
            continue;
        }

        const manifest = readJSON(path);

        if (!manifest) {
            continue;
        }

        checkUnknownFields(path, manifest, ["id", "name", "version", "description", "detail", "entry", "files", "sha256", "homepage"]);

        if (checkId(path, manifest, name)) {
            if (ids.has(manifest.id)) {
                error(path, `the id "${manifest.id}" is used twice`);
            }

            ids.add(manifest.id);
        }

        checkText(path, manifest, "name", { max: LIMITS.nameLength, multiline: false });
        checkVersion(path, manifest);
        checkText(path, manifest, "description", { max: LIMITS.descriptionLength, multiline: true });
        checkHomepage(path, manifest);

        const detail = checkDetail(path, folder, manifest);
        checkScriptFiles(path, folder, manifest, detail);
    }

    return ids;
}

function checkFlows(scriptIds) {
    const ids = new Set();

    for (const name of listFolders(join(root, "flows"))) {
        const folder = join(root, "flows", name);
        const path = join(folder, "flow.json");

        if (!regularFile(path)) {
            error(folder, "has no flow.json");
            continue;
        }

        const manifest = readJSON(path);

        if (!manifest) {
            continue;
        }

        checkUnknownFields(path, manifest, ["id", "name", "version", "description", "detail", "steps"]);

        if (checkId(path, manifest, name)) {
            if (ids.has(manifest.id)) {
                error(path, `the id "${manifest.id}" is used twice`);
            }

            ids.add(manifest.id);
        }

        checkText(path, manifest, "name", { max: LIMITS.nameLength, multiline: false });
        checkVersion(path, manifest);
        checkText(path, manifest, "description", { max: LIMITS.descriptionLength, multiline: true });
        checkDetail(path, folder, manifest);
        checkSteps(path, manifest, scriptIds);
    }

    return ids;
}

function checkSteps(path, manifest, scriptIds) {
    const steps = manifest.steps;

    if (steps === undefined) {
        error(path, `"steps" is required`);
        return;
    }

    if (!Array.isArray(steps) || steps.length < 1 || steps.length > LIMITS.maxSteps) {
        error(path, `"steps" must be an array of 1 to ${LIMITS.maxSteps} steps`);
        return;
    }

    steps.forEach((step, index) => {
        const where = `step ${index + 1}`;

        if (!isObject(step)) {
            error(path, `${where} must be an object`);
            return;
        }

        checkUnknownFields(path, step, ["script", "abortIfError", "pipeToNext", "args"]);

        if (typeof step.script !== "string" || !ID_PATTERN.test(step.script)) {
            error(path, `${where}: "script" must be the id of a script`);
        } else if (!scriptIds.has(step.script)) {
            error(path, `${where}: "script" is "${step.script}", but this repository has no such script in scripts/`);
        }

        for (const key of ["abortIfError", "pipeToNext"]) {
            if (step[key] !== undefined && typeof step[key] !== "boolean") {
                error(path, `${where}: "${key}" must be true or false`);
            }
        }

        if (step.args !== undefined) {
            checkArgs(path, where, step.args);
        }
    });
}

// Checks the arguments a step declares (docs/spec.md, "Arguments").
function checkArgs(path, where, args) {
    if (!Array.isArray(args)) {
        error(path, `${where}: "args" must be an array of arguments`);
        return;
    }

    if (args.length > LIMITS.maxArgs) {
        error(path, `${where}: has ${args.length} arguments, at most ${LIMITS.maxArgs} are allowed`);
    }

    const names = new Set();

    args.forEach((arg, index) => {
        const label = `${where}, argument ${index + 1}`;

        if (!isObject(arg)) {
            error(path, `${label} must be an object`);
            return;
        }

        checkUnknownFields(path, arg, ["name", "type", "description", "default"]);

        if (typeof arg.name !== "string" || !ARG_NAME_PATTERN.test(arg.name)) {
            error(path, `${label}: "name" is required and must be an identifier (letters, digits and underscores, not starting with a digit, at most 64 characters)`);
        } else if (names.has(arg.name)) {
            error(path, `${label}: the name "${arg.name}" is used twice in this step`);
        } else {
            names.add(arg.name);
        }

        const name = typeof arg.name === "string" ? `${index + 1} ("${arg.name}")` : String(index + 1);

        if (!ARG_TYPES.includes(arg.type)) {
            error(path, `${where}, argument ${name}: "type" is required and must be int, double, bool or string`);
        }

        if (arg.description !== undefined) {
            if (typeof arg.description !== "string") {
                error(path, `${where}, argument ${name}: "description" must be a string`);
            } else if (length(arg.description) > LIMITS.argDescriptionLength) {
                error(path, `${where}, argument ${name}: "description" is ${length(arg.description)} characters, at most ${LIMITS.argDescriptionLength} are allowed`);
            }
        }

        if (arg.default !== undefined) {
            checkArgDefault(path, `${where}, argument ${name}`, arg);
        }
    });
}

function checkArgDefault(path, label, arg) {
    const value = arg.default;

    switch (arg.type) {
        case "int":
            if (typeof value !== "number" || !Number.isSafeInteger(value)) {
                error(path, `${label}: "default" must be a whole number for the type int (${JSON.stringify(value)} is not)`);
            }

            break;
        case "double":
            if (typeof value !== "number" || !Number.isFinite(value)) {
                error(path, `${label}: "default" must be a number for the type double (${JSON.stringify(value)} is not)`);
            }

            break;
        case "bool":
            if (typeof value !== "boolean") {
                error(path, `${label}: "default" must be true or false for the type bool (${JSON.stringify(value)} is not)`);
            }

            break;
        case "string":
            if (typeof value !== "string") {
                error(path, `${label}: "default" must be a string for the type string (${JSON.stringify(value)} is not)`);
            } else if (length(value) > LIMITS.argStringLength) {
                error(path, `${label}: "default" is ${length(value)} characters, at most ${LIMITS.argStringLength} are allowed`);
            }

            break;
        default:
            break;
    }
}

if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    console.error(`ERROR   ${root} is not a folder`);
    process.exit(2);
}

checkNoSymlinks(root);
checkRoot();
const scriptIds = checkScripts();
const flowIds = checkFlows(scriptIds);

for (const line of [...warnings, ...errors]) {
    console.log(line);
}

if (errors.length > 0) {
    console.log(`\nFAILED: ${errors.length} error(s), ${warnings.length} warning(s).`);
    process.exit(1);
}

console.log(`OK: ${scriptIds.size} script(s) and ${flowIds.size} flow(s) are valid${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`);
