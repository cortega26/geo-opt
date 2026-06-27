# geo-opt CLI Reference

## Synopsis

```
geo-opt [command] [options] <file...>
```

## Global options

| Option            | Short | Description                          |
| ----------------- | ----- | ------------------------------------ |
| `--help`          | `-h`  | Show help text and exit              |
| `--version`       | `-V`  | Print version number and exit        |
| `--config <path>` | `-c`  | Path to geo_config.json              |
| `--format <type>` | `-f`  | Output: `text`, `json`, or `summary` |
| `--no-branding`   |       | Suppress Tooltician branding         |
| `--recursive`     | `-r`  | Recurse into directories             |

## Commands

### `audit`

Analyze content files and print GEO scores.

```
geo-opt audit [options] <file...>
```

**Examples:**

```bash
geo-opt audit article.md
geo-opt audit -r docs/
geo-opt audit -f json post.md > report.json
```

### `inject`

Insert GEO metadata into HTML files. Modifies files in place unless
`--dry-run` is passed.

```
geo-opt inject [options] <file...>
```

### `config`

Manage Tooltician license and preferences.

```
geo-opt config set reminders false
geo-opt config show
```

## Exit codes

| Code | Meaning                      |
| ---- | ---------------------------- |
| 0    | Success                      |
| 1    | File not found or read error |
| 2    | Configuration error          |
| 3    | License validation failed    |

## Environment variables

| Variable                    | Purpose                       |
| --------------------------- | ----------------------------- |
| `GEO_OPT_LICENSE_KEY`       | Pro license key               |
| `GEO_OPT_STATE_DIR`         | Override state directory      |
| `GEO_OPT_DISABLE_REMINDERS` | Suppress engagement reminders |
