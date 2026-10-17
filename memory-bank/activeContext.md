# Active Context: Permalinks, Header Cleanup & Screen Height Optimization

## Active Focus
Implemented user-requested layout and navigation enhancements:
- **Permalinks (`/chat/[owner]/[repo]`)**: Added dynamic App Router route allowing users to visit and bookmark favorite repositories directly via URLs like `/chat/hoytnix/return` (with auto-resolution from GitHub API if not already in store).
- **Header Cleanup**: Removed the capability pills (`App Router Cartography • Server Component Graph • In-Memory Unix VFS • Gemini 4 Argon`) from the top header.
- **Screen Height & Scroll Optimization**: Locked app root, workspace, and chat containers to `h-screen flex flex-col overflow-hidden` with dedicated inner scrolling (`overflow-y-auto`) for messages and grids, preventing unnecessary document-level huge scroll bars.
