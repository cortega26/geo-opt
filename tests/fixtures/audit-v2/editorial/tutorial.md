# How to Set Up Continuous GEO Auditing in GitHub Actions

Running GEO audits manually is fine when you have one page. When you have
a hundred, you need automation. This tutorial shows you how to add GEO
scoring to your CI pipeline so every PR gets a content quality report.

## Prerequisites

- A GitHub repository with markdown or HTML content.
- Node.js 18 or later.
- A GeoOpt API key (free tier works for up to 100 audits per hour).

## Step 1: Install the GeoOpt CLI

Add the package to your project:

```bash
npm install --save-dev geo-opt
```

Verify the installation:

```bash
npx geo-opt --version
# Expected: 2.1.0
```

## Step 2: Create a configuration file

Create `geo_config.json` in your project root:

```json
{
  "limits": {
    "max_pronoun_density": 0.06
  },
  "acronyms": {
    "GEO": "Generative Engine Optimization",
    "CI": "Continuous Integration"
  },
  "ignore": ["node_modules", ".git", "dist"],
  "extensions": [".md", ".html"]
}
```

Store your API key as a GitHub secret named `GEO_OPT_LICENSE_KEY`.

## Step 3: Create the workflow

Create `.github/workflows/geo-audit.yml`:

```yaml
name: GEO Content Audit

on:
  pull_request:
    paths:
      - "content/**"
      - "docs/**"

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Run GEO audit
        env:
          GEO_OPT_LICENSE_KEY: ${{ secrets.GEO_OPT_LICENSE_KEY }}
        run: |
          npx geo-opt audit -r content/ -f json > geo-report.json

      - name: Check minimum score
        run: |
          SCORE=$(node -e "const r=require('./geo-report.json'); \
            console.log(r.perFile?.[0]?.score ?? 0)")
          if [ "$SCORE" -lt 50 ]; then
            echo "GEO score $SCORE is below threshold of 50"
            exit 1
          fi

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: geo-report
          path: geo-report.json
```

## Step 4: Make the check required

In your repository settings, under **Branches → Branch protection rules**,
add `GEO Content Audit` as a required status check.

## Step 5: Interpret the results

When a PR triggers the workflow, you'll see the GEO report in the Actions
tab. The report breaks down scores across five dimensions: structure,
statistics, quotations, citations, and clarity. Use the recommendations
section to guide content improvements.

## Next steps

- [Set up batch auditing for multiple content directories](https://geoopt.example.com/docs/batch)
- [Configure custom acronym dictionaries per project](https://geoopt.example.com/docs/config)
- [Enable profile-aware v2 scoring](https://geoopt.example.com/docs/model-v2)
