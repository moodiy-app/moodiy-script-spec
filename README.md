# Moodiy Script Spec

The official catalog of scripts and script flows for Moodiy, the macOS journaling app, and the specification of the format that any such catalog follows.

- A **script** is a small program that Moodiy runs on an entry after it is saved: JavaScript inside the app, or a Unix script outside it.
- A **flow** is an ordered list of scripts, with options for each step.

This repository holds both, plus the [format description](docs/spec.md), [JSON Schemas](schemas) and a [validator](tools/validate.mjs).



## How Moodiy Uses This Repository

- It is built into Moodiy as the **default catalog**.
- Moodiy never clones it until you open the catalog. Then it makes a `git clone --depth 1` of the default branch over https and lists the scripts and flows for you.
- You choose what to install. Installing a flow also installs the scripts it needs that you do not have yet.
- Moodiy remembers where each item came from (repository, id, version and commit), so it can offer an upgrade when a newer version exists, mark an item you changed locally, and replace it when you ask.
- You can add other repositories with the same layout. Only https addresses are used.

Unix scripts run outside Moodiy's sandbox with your rights. Moodiy warns about them, and shows which files have a checksum. Read a script before you install it.



## Layout

```
moodiy-spec.json          the root file: spec version, name, description
scripts/<id>/script.json  one folder for each script, with its files
flows/<id>/flow.json      one folder for each flow
docs/spec.md              the full format description
schemas/                  JSON Schemas (draft 2020-12) for the three JSON files
tools/validate.mjs        the validator
```

Examples in this repository:

| Item | Kind | Notes |
|---|---|---|
| `scripts/hello` | JavaScript | The smallest script. No checksum, no detail page. |
| `scripts/tags` | JavaScript | Answers with an envelope; reads the optional argument `limit`; detail page and checksum. |
| `scripts/word-count` | JavaScript | Uses the output of the previous step; reads the optional argument `show_files`; detail page and checksum. |
| `scripts/entry-stats` | Unix (bash) | Has an extra file (`lib/json.sh`), a detail page and checksums. |
| `flows/tags-and-count` | Flow | Runs `tags`, then `word-count`, and declares an argument for each step. |



## Add a Script

1. Make `scripts/<id>/` (the id is lowercase letters, digits, `.`, `_` or `-`).
2. Put the entry file in it. `.js` means JavaScript run inside Moodiy; any other name is a Unix script and must start with a shebang.
3. Write `script.json` with `id`, `name`, `version`, `description` and `entry`. List extra files in `files`.
4. Optional: add a `detail.html` (inline CSS only, no scripts, no remote content) and name it in `detail`.
5. Add checksums: `shasum -a 256 <file>` and put the digest in `sha256`.
6. Run the validator.

## Add a Flow

1. Make `flows/<id>/` with a `flow.json`: `id`, `name`, `version`, `description` and `steps`.
2. Each step names the id of a script in this repository's `scripts/` folder. `abortIfError` (default `true`) stops the flow when the step fails, and `pipeToNext` (default `false`) hands the output to the next step.
3. Optional: give a step `args`, named settings (`int`, `double`, `bool` or `string`, with an optional default) that the script reads from `request.args`. The user sets their values in Moodiy, and they are kept when the flow is updated. A script must cope with an argument that is absent.
4. Run the validator.

When you change something, raise the `version`. Moodiy offers an update only for a newer version, not for a changed file under the same one.



## Validate

You need Node 18 or later. There is nothing to install.

```
node tools/validate.mjs
```

It checks the whole repository against the spec and exits with a non-zero status when something is wrong. A GitHub Action runs it on every push and pull request. To check another catalog, pass its folder: `node tools/validate.mjs ../other-catalog`.



## License

[MIT](LICENSE), Copyright (c) 2026 Moodiy contributors.
