# GYMTRACK

GYMTRACK is a responsive gymnastics training journal and community workspace, implemented as a static HTML/CSS/JavaScript website.

## Run it

Open `index.html` in a modern browser or serve the repository with any static web host. No build step, server, third-party account, or database setup is required.

## Working features

- Dashboard with live totals, a daily motivational message, recent practice, tracked skills, posts, and saved videos.
- Practice journal with create, edit, delete, dates, duration, skills, strength/flexibility minutes, and notes.
- Skill tracker for Floor, Beam, Bars, Vault, Tumbling, and Flexibility, with four progress states and visual progress indicators.
- Goals with editable completion percentage and one-click 10% progress updates.
- YouTube video library with URL validation, thumbnails, categories, and an embedded player.
- Articles with topics, create/edit/delete, and a readable article view.
- Community posts with types, likes, and comments.
- Statistics computed from actual saved practice and skill records, with weekly/monthly activity charts.
- Calendar showing logged training days and the practice details for a selected date.
- Search across skills, videos, articles, and posts.

## Data and privacy

The site saves records in this browser's `localStorage` under `gymtrack-v1`; data remains after refresh and is not sent to a server. This build does not provide sign-in, cloud synchronization, or cross-device sharing. Clearing site data or changing browsers/devices can remove or hide these records, so do not treat browser storage as a backup. Community posts, likes, and comments are local to the same browser profile. Use the same browser profile to continue your journal.

No example user records are preloaded: dashboard numbers, charts, calendar marks, and feed content are derived from information the user actually adds. The motivational messages are built-in copy, not user records.
