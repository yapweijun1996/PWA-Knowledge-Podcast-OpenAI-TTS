# Future content workflow

These are independent follow-up designs, not implemented features. Reordering
segments preserves their IDs and associated audio; the sample episode still
does not claim measured rainfall differences.

## User-defined narrator presets

Allow named local instruction templates without storing keys. Define create,
edit, duplicate and delete behavior, distinguish applying a preset from editing
the project's current instructions, and version the backup format. Verify
project switching, import/export, duplicate names and storage failures. Changing
instructions must mark affected audio stale rather than presenting it as current.

## Claims and sources

Give each claim an explicit source URL, date, review status and classification
such as verified, analysis, hypothetical or unknown. A human review must approve
factual assertions; an AI suggestion cannot silently promote a claim to fact.
Preserve provenance in backups and exports, validate links safely, and provide
accessible editing and review states. Do not insert rainfall measurements until
the underlying station data, time window, units and methodology are verified.
