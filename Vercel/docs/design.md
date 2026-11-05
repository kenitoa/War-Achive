# Archive reading room

The presentation uses ivory paper surfaces (#eeece7), graphite cabinetry (#25262b), and muted champagne brass (#cdb58d), serif titles, and monospaced catalogue numbers. Search and source evidence remain the central actions. Previously removed marketing headings and participation banners stay removed.

- `app/archive-theme.css` defines tokens and responsive presentation after the structural stylesheet.
- War dossiers, contextual timelines, and reading guides share the same catalogue cards, numbered chapters, source lists, and responsive reading layouts. See `docs/editorial.md` for source and publication boundaries.
- Record details use a single white document column: sans-serif title, 16–17px body, compact media fallback, and a bibliographic table. Original filenames and identifiers are preserved in a disclosure, citations, and the publication; recognized filename extensions and trailing DPLA/NARA packaging are removed only from display titles. Unknown source dates are shown as unknown, with the raw supplied value retained in the original metadata disclosure.
- The shelf is a three-pane workspace on desktop: collections, compact saved-record list, and one selected-record editor. Lists and detail regions scroll independently within a viewport-sized workspace. Mobile stacks the same regions. Backup/sync and comparison use disclosures; storage recovery remains immediately visible on corruption. Unsaved drafts survive switching records within the page and are saved only through the explicit save button. No storage format or synchronization contract changes.
- The homepage finding aid lists actual published wars and linked record counts. Counts may overlap when a record belongs to multiple wars.
- Generic document silhouettes are decorative placeholders, not historical artifacts. Existing media permission and attribution checks remain authoritative.
- No new fonts are downloaded. Serif and monospaced stacks use locally available fonts, with system fallbacks.
- Verify keyboard search, archive filtering, record source links, shelf persistence, finding-aid links, and mobile navigation after changes.
- No new dependencies, environment variables, public API changes, or database migrations are needed.
- Roll back the homepage and theme stylesheet together to restore the preceding presentation.

Palette: body text #28282b, secondary text #68635e, light-surface accent #795f38. Dark-surface text uses separate light tokens; champagne is reserved for controls and small details.

Shared finish layer: catalogue and guide cards, source panels, dictionary cards, pagination, account/request forms and policy pages use ivory surfaces, brass controls and restrained green accents. Preserve compact war index, six-record pagination, document details and shelf workspace. Removed copy stays removed. Roll back by removing the final shared finish CSS layer. No data or API changes.
