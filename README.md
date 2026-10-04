# GitHub Terminal Fetch

A terminal window types a fetch command and prints a neofetch-style panel for your GitHub profile: a pixel chameleon, who you are, what you are building and your streaks. Then it paints your contribution graph week by week, under a tmux status bar.

![Terminal Fetch](https://raw.githubusercontent.com/Kameleon21/gh-terminal-fetch/main/terminal.svg)

The output is a single animated SVG, about 70 KB. It uses only CSS animation, so it plays inside a GitHub README.

## Add to Your Profile

1. Create `.github/workflows/terminal.yml` in your profile repository (`USERNAME/USERNAME`):

```yaml
name: Generate Terminal Fetch

on:
  schedule:
    - cron: "0 0 * * *" # Daily at midnight
  workflow_dispatch: # Manual trigger

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: Kameleon21/gh-terminal-fetch@main
        with: # all optional, defaults come from your GitHub profile
          host: dublin
          role: Software Engineer @ Acme
          location: Dublin, Ireland
          stack: Java, Go, TypeScript
          building: oku, tokenlens, tmux-claude
          command: oku fetch kameleon21

      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: Update terminal fetch
          file_pattern: terminal.svg
```

2. Add to your `README.md`:

```markdown
![Terminal Fetch](https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_USERNAME/main/terminal.svg)
```

3. Manually trigger the workflow once, or wait for the daily run.

## Options

Every input is optional. Leave one out and it is filled in from your GitHub profile.

| Input          | Description                                                          | Default                            |
| -------------- | -------------------------------------------------------------------- | ---------------------------------- |
| `username`     | GitHub username                                                      | Repository owner                   |
| `output`       | Output file path                                                     | `terminal.svg`                     |
| `host`         | Host in the prompt (`user@host`); the user is your first name        | Your username                      |
| `role`         | Role line; text after `@` is highlighted                             | First part of your bio, or company |
| `location`     | Location line, also shown short in the status bar                    | Profile location                   |
| `stack`        | Comma-separated languages or tools                                   | Languages of your recent repos     |
| `building`     | Comma-separated projects; the first two also name the tmux windows   | Pinned repos                       |
| `command`      | Command typed into the terminal                                      | `fetch <username>`                 |
| `github_token` | Token used to read your profile and contribution calendar            | `github.token`                     |

Long values are truncated to fit the window.

## Run Locally

Requires [Bun](https://bun.sh). It uses `GITHUB_TOKEN` if set, otherwise your `gh` CLI login.

```bash
bun src/cli.ts --username YOUR_USERNAME --output terminal.svg
bun src/cli.ts --username YOUR_USERNAME --role "Software Engineer @ Acme" --stack "Go, Rust"
```

To check individual frames, `bun scripts/preview.ts terminal.svg 4 8 12` renders PNGs at those seconds with headless Chrome.

## Inspired By

- [neofetch](https://github.com/dylanaraps/neofetch)
- [gh-kameleon](https://github.com/Kameleon21/gh-kameleon)
- [gh-space-shooter](https://github.com/czl9707/gh-space-shooter)
