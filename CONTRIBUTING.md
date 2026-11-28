# Contributing

Thanks for helping. The process is short on purpose.

## 1. Comment first
Open an issue, or comment on an existing one, describing what you want to change and how.
Wait for a maintainer to reply before you write code. This avoids work on changes we can't accept.

## 2. Get the code
Fork the repository, then clone your fork. The default branch is `develop`:

    git clone https://github.com/YOUR-USERNAME/artist-commission-tracker.git
    cd artist-commission-tracker
    git remote add upstream https://github.com/OWNER/artist-commission-tracker.git
    git switch -c fix/some-short-description

## 3. Make the change
- Keep it small: one issue per pull request.
- Add or update tests when behavior changes.
- Never commit secrets, `.env` files, personal data, or screenshots of real client chats.
- Run the tests before you push (see "Tests" in the README).

## 4. Open a pull request into `develop`
- Describe what and why, and include `Closes #123` (the issue number).
- CI must pass: extension tests, backend tests, dashboard build, and the linked-issue check.
- A maintainer reviews. Maintainers merge `develop` into `main` to release.

## Commit messages
Short and imperative, for example: `Fix price detection for "total" lines`.

## Security problems
Do not open a public issue. See SECURITY.md.