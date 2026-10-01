# Assets

Images a world owns -- portraits now, maps in milestone 4 -- live in the world
folder as `assets/<sha256>.<ext>` (CLAUDE.md, World folder layout). The name is
the hash of the bytes, so the same picture uploaded twice is stored once, and
the export archive already carries `assets/` whole (`worldArchive.ts`).

## Routes

| Route | Who | Notes |
| --- | --- | --- |
| `POST /api/worlds/:id/assets` | Any seated player, via the `x-device-token` header | Body is the **raw file**, with its own `Content-Type`. Returns `201 { name, hash, contentType, size, url }`. No seat: `403`. Unknown world: `404`. Not an acceptable image: `400` |
| `GET /api/worlds/:id/assets/:name` | Anyone who can reach the table | `:name` must be exactly `<64 hex>.<png\|jpg\|webp\|gif>`, anything else is `404`. Served with the right type, `nosniff`, and a one-year `immutable` cache (the name *is* the content) |

An `<img>` tag cannot send the device header, which is why reading is open to
anyone on the table's network (ADR 0007) while writing needs a seat: a stranger
should not be able to fill the GM's disk.

## What is checked

- **Media type:** `image/png`, `image/jpeg`, `image/webp`, `image/gif`. SVG is
  deliberately absent: it can carry script, and nothing here needs it.
- **Content, not just the label:** the first bytes must be that format's
  signature, so a script cannot be uploaded as `image/png`.
- **Empty uploads** are refused. A failed upload leaves nothing behind (the
  body streams to a temporary file that is removed on any error).
- **No size limit**, per CLAUDE.md's Storage section; the body streams to disk
  and is never held in memory.

## Why raw bytes, not multipart

The client already has the `File`, so it can `fetch(url, { method: 'POST',
headers: { 'content-type': file.type, ... }, body: file })`. Multipart would add
a parser dependency and a form-encoding step for a single file per request. If
an upload ever needs metadata beside the file, that is a header or a following
operation, and this can be revisited then.

## Referencing an asset

A document stores the **name** (`<hash>.<ext>`), never a URL: the URL depends on
the world id and where the server is reached from. An actor's `portrait` field
(`actor.md`) holds the name, and the client builds
`/api/worlds/<id>/assets/<name>`.

Nothing deletes an asset yet. An unreferenced file costs disk and nothing else;
a sweep belongs with world export/snapshots housekeeping, not here.
