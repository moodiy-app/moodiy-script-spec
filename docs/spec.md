# Moodiy Script Spec, Version 1

This document is the normative description of a Moodiy script catalog: a Git repository that lists scripts and script flows for the Moodiy macOS client. The key words MUST, MUST NOT, SHOULD and MAY are used in the usual way.

The format is machine-checked by [`tools/validate.mjs`](../tools/validate.mjs) and described by the JSON Schemas in [`schemas/`](../schemas):

| File | Schema |
|---|---|
| `moodiy-spec.json` | [`moodiy-spec.schema.json`](../schemas/moodiy-spec.schema.json) |
| `scripts/<id>/script.json` | [`script.schema.json`](../schemas/script.schema.json) |
| `flows/<id>/flow.json` | [`flow.schema.json`](../schemas/flow.schema.json) |

A schema cannot see the file system, so the validator also checks the rules that need it (folder names, files, sizes, checksums, flow steps). When the schema and this text disagree, this text wins.

How a script talks to Moodiy once it runs (the request, the result, exit statuses) is not part of this spec. It is the Moodiy Script Protocol, which belongs to the Moodiy app. The one piece that this spec feeds into it is `request.args`, see Arguments.



## Layout

```
moodiy-spec.json              required, the root file
scripts/
  <id>/
    script.json               required, the manifest
    detail.html               optional, shown to people
    <entry>                   required, the file that runs
    <other listed files>      optional
flows/
  <id>/
    flow.json                 required, the manifest
    detail.html               optional, shown to people
```

- `scripts/` and `flows/` are both optional. Every entry in them MUST be a folder; names that start with a dot (`.gitkeep`) are ignored.
- The folder name MUST equal the `id` inside its manifest.
- A script id and a flow id live in different namespaces: a script and a flow may have the same id.
- The repository MUST NOT contain symbolic links anywhere.
- Text files MUST be UTF-8 without a byte order mark. JSON files MUST be a JSON object at the top level.
- A client reads only these files. Anything else in the repository (this `docs/` folder, `tools/`, a `README.md`) is ignored.



## Common Rules

### Identifiers

An `id` matches `^[a-z0-9][a-z0-9._-]{0,63}$`: lowercase letters, digits, dot, underscore and hyphen, starting with a letter or a digit, at most 64 characters. Ids are unique within their kind.

### Text

- `name` is one line, at most 100 characters.
- `description` is plain text, required, at most 500 characters. It is shown as it is: no HTML and no Markdown.
- Lengths count Unicode characters, not bytes.

### Versions

A `version` is a string such as `1.0`, `1.2.3` or `1.0-beta`: one or more numbers separated by dots, and an optional suffix after a hyphen. A JSON number (`1.0`) is accepted too, but a JSON number cannot keep a trailing zero (`1.10` is read as `1.1`), so always write the version as a string.

Versions are compared like this:

1. Split off the suffix at the first hyphen.
2. Compare the dotted numbers one by one as numbers, treating a missing number as 0. So `1.10` is newer than `1.9`, and `1.0` equals `1.0.0`.
3. If the numbers are equal, a version without a suffix is newer than one with a suffix (`1.0` is newer than `1.0-beta`). Two suffixes are compared as text.

### Paths

A path in a manifest (`entry`, `files`, `detail`, and the keys of `sha256`) is relative to the folder of the manifest and:

- uses `/` as the separator, never a backslash;
- does not start or end with `/`, and has no empty segment (`a//b`);
- has no `.` or `..` segment;
- has no control characters and is at most 255 characters long.

Paths are compared without regard to case when looking for duplicates, because macOS volumes are usually case-insensitive.

### Addresses

`homepage` is optional and MUST be an `https` address.

### Unknown fields

A client ignores fields it does not know, so a later 1.x revision can add fields. The validator warns about them, to catch typos such as `sha526`.



## The Root File

`moodiy-spec.json`:

```json
{
  "spec": 1,
  "name": "Moodiy Script Spec",
  "description": "The official catalog of scripts and script flows for Moodiy.",
  "homepage": "https://example.com"
}
```

| Field | Required | Meaning |
|---|---|---|
| `spec` | yes | The spec version. The number `1`. A client refuses a repository whose spec it does not know. |
| `name` | yes | The name of the catalog, one line, at most 100 characters. |
| `description` | yes | Plain text, at most 500 characters. |
| `homepage` | no | An https address. |



## Scripts

A script lives in `scripts/<id>/` and is described by `scripts/<id>/script.json`:

```json
{
  "id": "word-count",
  "name": "Word Count",
  "version": "1.0",
  "description": "Counts the words of the entry body.",
  "detail": "detail.html",
  "entry": "word-count.js",
  "files": ["lib/helpers.js"],
  "sha256": { "word-count.js": "<64 lowercase hex digits>" },
  "homepage": "https://example.com"
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | See Identifiers. Equal to the folder name. |
| `name` | yes | One line, at most 100 characters. |
| `version` | yes | See Versions. |
| `description` | yes | Plain text, at most 500 characters. |
| `entry` | yes | The path of the file that runs. |
| `files` | no | Extra files to install next to the entry. |
| `detail` | no | The path of an HTML file for people. See Detail Pages. |
| `sha256` | no | Checksums, a map from path to digest. |
| `homepage` | no | An https address. |



### Entry and Kind

The extension of `entry` decides the kind of the script:

- `.js` (exactly, in lowercase): a **JavaScript** script. Moodiy runs it inside the app. It has no access to the network, files or other programs.
- Anything else: a **Unix** script. It is run outside the sandbox of Moodiy, with the rights of the user, so it can do whatever the user can do. It MUST start with a shebang (`#!/usr/bin/env bash`). A Node script therefore must not be named `.js`: name it `export` or `export.mjs`.

The client warns about a Unix script more strongly than about a JavaScript one.



### Files

- Only the entry and the files in `files` are installed. Other files in the folder are not. `script.json` and the detail file are never installed as script files, so `entry` and `files` MUST NOT name them.
- The entry is implied. It MUST NOT be repeated in `files`.
- `files` has no duplicates (compared without regard to case). The entry and `files` together have at most 100 files.
- Each file is at most 5 MB, and all files together at most 20 MB.
- Every listed file MUST exist and MUST be a regular file.
- A Unix script finds its extra files next to itself (for example `$(dirname "$0")/lib/helpers.sh`). The folder structure of the paths is kept when installing.



### Checksums

`sha256` maps a path to the lowercase hexadecimal SHA-256 digest (64 digits) of that file. It MAY name the entry and any file in `files`, and nothing else. It does not have to cover every file, but a file without a checksum is shown to the user as **unverified**. The client checks each listed checksum after downloading and refuses a file that does not match.

To get a digest: `shasum -a 256 path/to/file`. Every change to a file changes its digest, so update `sha256` in the same commit.



## Flows

A flow lives in `flows/<id>/` and is described by `flows/<id>/flow.json`:

```json
{
  "id": "tags-and-count",
  "name": "Tags and Count",
  "version": "1.0",
  "description": "Lists the tags of a saved entry, then counts its words.",
  "detail": "detail.html",
  "steps": [
    {
      "script": "tags",
      "abortIfError": true,
      "pipeToNext": true,
      "args": [
        { "name": "limit", "description": "How many tags to keep (0 keeps all)", "type": "int", "default": 5 }
      ]
    },
    { "script": "word-count" }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `id`, `name`, `version`, `description`, `detail` | see above | The same rules as for a script. |
| `steps` | yes | The steps, in running order. At least 1 and at most 50. |

A step is an object:

| Field | Required | Default | Meaning |
|---|---|---|---|
| `script` | yes | | The id of a script in the `scripts/` folder of **the same repository**. The same script MAY appear in several steps. |
| `abortIfError` | no | `true` | Stop the flow if this step fails. |
| `pipeToNext` | no | `false` | Hand the output of this step to the next step. |
| `args` | no | none | The arguments of the step. See Arguments. At most 20. |

`abortIfError` and `pipeToNext` mirror the options of a step in the Moodiy flow editor.

A flow does not carry any files, and it does not refer to other repositories. Both would make installing it unpredictable.



### Arguments

A step can declare **arguments**: named settings that Moodiy hands to the script of the step in every run, in `request.args`. The repository declares them; the user sets their values in Moodiy.

```json
{
  "script": "tags",
  "pipeToNext": true,
  "args": [
    { "name": "limit", "description": "How many tags to keep", "type": "int", "default": 5 },
    { "name": "verbose", "type": "bool" },
    { "name": "label", "type": "string", "default": "hi" }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | An identifier that matches `^[A-Za-z_][A-Za-z0-9_]*$`, at most 64 characters. Unique within the step. The same name MAY be used in other steps. |
| `type` | yes | One of `int`, `bool` or `string`. |
| `description` | no | Plain text, at most 200 characters. It tells the user what the setting does. |
| `default` | no | The value used when the user has not set one. It MUST be a JSON value of the declared type, see below. |

- `int`: a whole JSON number. `1.5` is not an int.
- `bool`: `true` or `false`.
- `string`: a string of at most 4096 characters.
- A step has at most 20 arguments.
- Other keys in an argument are ignored by clients, and the validator warns about them.

**What the script gets.** The request of the Moodiy Script Protocol has an optional `args` object next to `entry`, `run` and `previous`. It maps each name to its value, written as a JSON number, boolean or string. The protocol stays at version 1. The key is omitted for a step without arguments.

```json
{ "protocol": 1, "trigger": "save", "entry": { "...": "..." }, "args": { "limit": 5, "label": "hi" } }
```

The value of an argument is the value the user set, or else the `default`. When there is neither, the argument is simply absent from `args` (here `verbose`), so a script MUST read `args` defensively: `args` itself can be missing, and so can every name in it. A script that is run with no arguments at all SHOULD still do something sensible.

**What is read-only.** The definitions (names, types, descriptions, defaults) come from the repository. Moodiy shows them but does not let the user change them. Only the values are the user's.

**Updating.** When the flow is updated to a newer version, the values the user set are kept, matched by argument name and type:

- A step of the new version is matched with the step of the old version that uses the same script and has most of the same arguments. A script may appear in several steps, so the arguments are what tell these steps apart.
- Within a matched step, a value stays when the argument has the same name and the same type.
- A value is dropped when its argument was removed or its type changed. The default applies again.
- The values of the user do not make a flow "modified" (see Installing and Updating).

Because the definitions are part of the flow, adding, removing or changing an argument is a change of the flow: raise the `version` of the flow.



### Relationships

Relationships are written nowhere else. A client derives "this flow uses these scripts" and "this script is used by these flows" from `steps`. Do not add a `used-by` or `requires` field.



## Detail Pages

`detail` is an HTML file that tells people more than `description` can: what the script does, what it needs, what it changes. It is a self-contained fragment or page, at most 200 KB (204,800 bytes), UTF-8.

The client shows it without running anything, so:

- **No script runs.** `<script>`, event handler attributes (`onclick` and the like) and `javascript:` addresses have no effect, and the validator rejects them.
- **No remote content.** A detail page MUST NOT load anything from the network or from files: no `<img src="https://...">`, no stylesheet link, no `@import`, no `url(https://...)`, no fonts, frames, objects or forms. Images are allowed only as `data:` addresses. Put the CSS inline, in a `<style>` element or a `style` attribute.
- **Links open in the browser.** A link (`<a href>`) MUST use `https:`, `mailto:` or a `#fragment`. The client opens it in the default browser, never inside the page.
- `<base>` and `<meta http-equiv>` are not allowed.

The validator checks these rules with a simple scan. It cannot be complete, and the client has the last word: it ignores or removes what it does not allow.

Keep the page short and neutral. Use the page to name every file a Unix script reads or writes, and any program it calls.



## Installing and Updating

These rules describe what a conforming client does.

**Source.** A catalog is a Git repository reached over `https`. The client downloads it with a shallow clone of the default branch (`git clone --depth 1`). Other protocols (`git://`, `ssh`, `http`, `file`) are not used. The clone is made when the user asks for it, not before.

**Reading.** The client lists the repository from the root file, `scripts/*/script.json` and `flows/*/flow.json`. An item whose manifest is invalid is skipped, and does not stop the other items from being listed.

**Installing a script.** The client copies the entry and the listed files, checks the listed checksums, and tells the user which files are unverified. It remembers where the script came from: the repository address, the `id`, the `version` and the commit of the clone.

**Installing a flow.** The client first installs the scripts that the flow needs and that are not installed yet. Then it makes the flow, once, with the steps and options from `flow.json`, and remembers the repository, `id`, `version` and commit of the flow. Scripts that are already installed are used as they are; installing the flow does not replace them.

**Updating the catalog.** Updating a repository means a fresh shallow clone of the default branch. Nothing is merged and no history is kept.

**Offering upgrades.** What decides whether an upgrade is offered is the `version` (see Versions): an installed item is upgradable when the catalog has a newer version of the same repository and `id`. A changed file under the **same version is not an update**. Change the version whenever a file, a step or an option changes in a way that users should get.

**Local changes.** Because the client remembers the commit and the checksums of what it installed, it can mark an item that the user has changed locally, and it will not overwrite such an item without asking. The user may override it on request. The values that the user gives to the arguments of a flow are settings, not changes: they do not mark the flow as modified, and an upgrade keeps them as described in Arguments.

**Other catalogs.** Users can add other repositories that use this layout. Items are identified by the repository address together with the `id`, so two repositories can use the same id without clashing.



## Checking a Catalog

```
node tools/validate.mjs [repository-folder]
```

The validator checks that:

- the root file exists, `spec` is 1 and the fields follow the rules above;
- every folder in `scripts/` and `flows/` has a manifest, the folder name equals the `id`, and ids are unique;
- required fields are present and the text, version, address and path rules hold, including the limits;
- every listed file exists, is a regular file and is within the size limits, a Unix entry starts with a shebang, and the checksums match;
- detail files exist, are within the size limit, and follow the rich-text rules;
- every flow step names a script that exists in the same repository;
- the arguments of a step follow the rules above: valid and unique names, a known type, a description within the limit, a default of the declared type, and at most 20 arguments;
- there are no symbolic links.

It prints one line for each problem and exits with `1` if there is an error. Warnings (unknown fields, including in a step or an argument, and a numeric version) do not change the exit status.
