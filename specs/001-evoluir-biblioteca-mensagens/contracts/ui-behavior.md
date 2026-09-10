# Contract: Observable UI Behavior

## Navigation and roles

- Successful login opens the library for the last valid access or the first active allowed access.
- Collaborators see Library and Overview. They never see administration navigation or direct publish
  controls; message creation/edit/archive actions are labeled as requests.
- Superadministrators additionally see Administration with Messages, Categories, Accesses,
  Requests and Archived content.
- A user with no active access sees a dedicated empty state and a sign-out action.

## Library

- Search is the primary control and matches title, content and tags without case/accent sensitivity.
- Category and sort controls remain visible when results are empty.
- Only active content from the selected access is rendered.
- Card click copies the exact stored content. Interactive child controls do not trigger card copy.
- Clipboard success appears within 1 second. Clipboard failure opens a selectable text fallback with
  instructions and does not claim success.
- Favorite and recent sections omit archived content; restored content may reappear with preserved
  associations.

## Forms and requests

- Required fields show inline errors and retain user input.
- Submit controls become disabled while a request is in flight.
- A retry after an uncertain network response reuses the same idempotency key.
- Collaborator success copy says the proposal was sent for review, never that content was published.
- Rejection requires a visible reason and preserves the published message.

## Archive and restore

- UI uses “Arquivar” and “Restaurar”; no normal-flow control says “Excluir”.
- Archive confirmation names the item and explains that it can be restored.
- A non-empty category archive conflict lists the number of active messages and routes the
  superadministrator to reclassify or archive them.
- Archived items live in a separate administration view and never appear in library search.

## Errors and progress

| Error code | UI behavior |
|------------|-------------|
| `AUTH_REQUIRED` | Clear protected state and return to login with session-expired message. |
| `FORBIDDEN` | Keep current data, close destructive prompt and explain missing permission. |
| `NOT_FOUND` | Close stale detail, refresh affected collection and explain item changed. |
| `CONFLICT` | Keep form/review context, refresh current state and show conflict guidance. |
| `VALIDATION` | Keep form open and focus the first invalid field. |
| `NETWORK` | Keep user input and offer retry. |
| `UNKNOWN` | Keep safe state and show support-oriented generic message. |

## Keyboard and modal focus

- All actions use native controls where possible and have visible focus.
- Enter activates buttons; Space activates buttons without scrolling; tabs follow the documented
  arrow-key pattern when implemented as ARIA tabs.
- Opening a modal moves focus inside it; Tab and Shift+Tab remain within it; Escape closes when safe;
  closing restores focus to the opener.
- Destructive/archival confirmations initially focus the cancel action.
- Every dialog has an accessible name and a visible close or cancel control.

## Responsive and themes

- At 360 CSS pixels, navigation, search, filters, cards, forms and approval actions require no
  horizontal page scrolling.
- Administration tables transform into labeled cards before content becomes unreadable.
- Light and dark themes preserve readable contrast, focus indicators and status meaning without
  relying on color alone.

## Indexing and public shell

- The login shell contains no message content, user names, access names or internal counts.
- HTML metadata and response headers instruct crawlers not to index, follow or archive the site.
- Preview and production deployments expose the same non-indexing policy.
