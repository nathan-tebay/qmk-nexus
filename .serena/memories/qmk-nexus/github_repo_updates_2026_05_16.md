# GitHub repo updates (2026-05-16)

Applied requested GitHub-facing repo documentation updates from `/home/ntebay/Downloads/qmk-nexus-github-updates.md`.

Changed:
- README top now includes concise project description, Try It links, Project Status, Screenshots, What It Is, Who This Is For, Core Workflow, Feedback Wanted.
- README links near top: live app `https://qmknexus.tebay.dev`, writeup `https://tebay.dev/projects/qmknexus.html`, issues `https://github.com/nathan-tebay/qmk-nexus/issues`.
- Added real local app screenshots captured from demo workflow under `docs/screenshots/`: `layout-editor.png`, `keymap-editor.png`, `build-screen.png`.
- Added issue templates: `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`.
- Removed em dashes from README copy touched by this task.

Verification:
- Checked required README sections/links exist near top.
- Checked screenshot files and issue template files exist.

Blocked:
- GitHub repo metadata (description, website, topics) was not updated because `gh auth status` reports the active GitHub token for `nathan-tebay` is invalid. Use `gh auth login -h github.com`, then run `gh repo edit nathan-tebay/qmk-nexus --description "Browser-based QMK firmware editor for custom keyboards, visual layouts, matrix wiring, keymaps, features, and firmware builds." --homepage "https://qmknexus.tebay.dev" --add-topic qmk --add-topic keyboard --add-topic firmware --add-topic custom-keyboards --add-topic mechanical-keyboards --add-topic react --add-topic typescript --add-topic fastapi --add-topic qmk-firmware --add-topic keyboard-firmware --add-topic split-keyboard --add-topic ergodox`.