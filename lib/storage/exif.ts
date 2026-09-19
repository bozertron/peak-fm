/**
 * lib/storage/exif.ts — strip GPS EXIF from a photo before it is published.
 *
 * PEAK-209 unit 3 of 6. A seller photographing an item at home must not publish
 * their home address inside the file's metadata, so GPS is removed by default and
 * keeping it is an explicit opt-in the caller has to state in the UI.
 *
 * PURE: bytes in, bytes out. No filesystem, no network, no database, no Clock —
 * which is also what lets this run in the browser (client-side resize/re-encode)
 * and in Node without a second implementation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FORMAT, AS READ FROM REAL IMPLEMENTATIONS (not from memory)
 * ─────────────────────────────────────────────────────────────────────────────
 * JPEG segment walk — bwindels/exif-parser `lib/jpeg.js` `parseSections`
 * (https://github.com/bwindels/exif-parser/blob/072126586f21e973f15c9da5d12db207a0fb6b10/lib/jpeg.js#L4-L24):
 * after SOI (0xFFD8) every marker is 0xFF then a marker byte, and every marker
 * except the standalone ones (0x01 TEM, 0xD0–0xD7 RSTn, 0xD8 SOI, 0xD9 EOI)
 * carries a 2-byte BIG-ENDIAN length that INCLUDES those two length bytes. 0xDA
 * (SOS) is where the walk must stop: the entropy-coded image data after it has no
 * length field, so the only safe move is to copy the remainder verbatim.
 *
 * APP1/Exif payload — `readHeader` in
 * https://github.com/bwindels/exif-parser/blob/072126586f21e973f15c9da5d12db207a0fb6b10/lib/exif.js#L97-L111:
 * the payload starts with the 6 bytes "Exif\0\0", then a TIFF block whose first
 * 2 bytes are the byte-order mark 0x4949 ("II", little-endian) or 0x4D4D ("MM",
 * big-endian). A TIFF read from a file is ALWAYS in the file's byte order — that
 * is why an endianness slip here is silent corruption, and why every offset below
 * is read and written through the order token rather than assumed.
 *
 * IFD layout — piexif `_dict_to_bytes`
 * (https://github.com/hMatoba/piexifjs/blob/2180d60b8cdf638e236e0a6703b7c378bb4f5785/piexif.js#L426-L436)
 * and `_value_to_bytes`
 * (https://github.com/hMatoba/piexifjs/blob/2180d60b8cdf638e236e0a6703b7c378bb4f5785/piexif.js#L332-L425):
 * the TIFF header is 8 bytes (2 byte-order, 2 magic 0x002A, 4 offset to IFD0);
 * an IFD is `u16 count`, then `count` × 12-byte entries (`u16 tag`, `u16 type`,
 * `u32 componentCount`, 4-byte value field), then `u32 offset of the next IFD`
 * (0 = none). A value of 4 bytes or less is stored LEFT-ALIGNED in the 4-byte
 * value field, zero-padded on the right; a larger value is stored elsewhere and
 * the field holds its offset, measured FROM THE START OF THE TIFF HEADER. Every
 * offset in a TIFF block is TIFF-header-relative, which is the whole reason a
 * removal in the middle of the block has to be rebuilt rather than spliced.
 *
 * Pointer tags — exif-parser `ifd0` walk
 * (https://github.com/bwindels/exif-parser/blob/072126586f21e973f15c9da5d12db207a0fb6b10/lib/exif.js#L133-L160)
 * and piexif `fromExif`/`dump`
 * (https://github.com/hMatoba/piexifjs/blob/2180d60b8cdf638e236e0a6703b7c378bb4f5785/piexif.js#L116-L146,
 * https://github.com/hMatoba/piexifjs/blob/2180d60b8cdf638e236e0a6703b7c378bb4f5785/piexif.js#L245-L298):
 *   IFD0       0x8769 LONG[1] -> the Exif sub-IFD
 *   IFD0/IFD1  0x8825 LONG[1] -> the GPS IFD          <-- the tag we remove
 *   Exif IFD   0xA005 LONG[1] -> the Interoperability IFD
 *   IFD1       0x0201 LONG[1] -> offset of the embedded thumbnail's JPEG bytes
 *   IFD1       0x0202 LONG[1] -> length of those bytes
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STRATEGY, AND WHY
 * ─────────────────────────────────────────────────────────────────────────────
 * When GPS is present the APP1 EXIF segment is REBUILT from the retained tags
 * (the ticket's "or rebuild the APP1 segment from the retained tags"): the GPS
 * pointer tag is dropped from every top-level IFD, the whole GPS IFD and its
 * value bytes are never emitted, and every retained tag is re-serialized at a
 * freshly computed offset with the four pointer tags above re-pointed. Deleting
 * GPS bytes without renumbering the rest would leave dangled offsets, and
 * renumbering by hand is exactly where silently corrupt images come from — so the
 * offsets are computed once, in one pass, and nowhere copied from the input.
 *
 * What is NOT touched: every segment before/after the rebuilt APP1 is copied
 * verbatim, including the APP0/JFIF segment and every byte from SOS to the end of
 * the file. When there is no GPS (or `keepGps: true`) the INPUT IS RETURNED
 * UNCHANGED, byte for byte — a no-op must never be a re-encode.
 *
 * Known, deliberate limits (see SPEC GAPS in the builder report):
 *   - StripOffsets/TileOffsets/SubIFDs (0x0111/0x0144/0x014A) hold TIFF-relative
 *     offsets this stripper does not relocate. Rather than emit a file whose
 *     thumbnail strips dangle, it THROWS naming the tag and the offset. That is a
 *     refusal, not a silent failure — a caller that hits it must handle it.
 *   - A JPEG thumbnail embedded in IFD1 could itself carry an APP1/Exif with GPS.
 *     The thumbnail's bytes are preserved here unchanged; re-encoding it is a
 *     product decision (rewrite vs drop the thumbnail), not a guess to make in a
 *     pure byte function.
 *   - A MakerNote (0x927C) is copied byte for byte. Writer-internal offsets that
 *     are relative to the MakerNote itself survive; the rare ones relative to the
 *     TIFF header cannot survive any re-serialization of the block.
 */

/** What a stripping call did. `stripped` is audit-trail information, not a log line. */
export type ExifStripResult = {
  bytes: Uint8Array
  stripped: string[]
  kind: 'jpeg' | 'png' | 'other'
}

type ByteOrder = 'II' | 'MM'

type JpegSpan = {
  marker: number
  /** Offset of the 0xFF that introduces the marker (0 for SOI). */
  start: number
  /** Payload range of a length-bearing segment; empty for standalone markers. */
  payloadStart: number
  payloadEnd: number
}

type TiffEntry = {
  tag: number
  format: number
  count: number
  /** The value bytes exactly as stored: 4-or-fewer inline, longer followed via its offset. */
  value: Uint8Array
  /** TIFF-relative offset of this entry's 12-byte record. */
  recordOffset: number
}

type TiffIfd = {
  /** TIFF-relative offset of the IFD's entry count. */
  offset: number
  entries: TiffEntry[]
  nextOffset: number
}

const TIFF_HEADER_SIZE = 8
const IFD_ENTRY_SIZE = 12
const EXIF_HEADER = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]) // "Exif\0\0"
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const MARKER_SOI = 0xd8
const MARKER_EOI = 0xd9
const MARKER_SOS = 0xda
const MARKER_APP1 = 0xe1

const TAG_JPEG_INTERCHANGE_FORMAT = 0x0201
const TAG_JPEG_INTERCHANGE_FORMAT_LENGTH = 0x0202
const TAG_EXIF_IFD_POINTER = 0x8769
const TAG_GPS_IFD_POINTER = 0x8825
const TAG_INTEROP_IFD_POINTER = 0xa005

/**
 * TIFF value types 1..13 and their widths in bytes. Types outside this table are
 * reserved, so their width is unknowable and the block is refused rather than
 * walked with a guessed stride.
 */
const TYPE_WIDTHS = new Map<number, number>([
  [1, 1], // BYTE
  [2, 1], // ASCII
  [3, 2], // SHORT
  [4, 4], // LONG
  [5, 8], // RATIONAL
  [6, 1], // SBYTE
  [7, 1], // UNDEFINED
  [8, 2], // SSHORT
  [9, 4], // SLONG
  [10, 8], // SRATIONAL
  [11, 4], // FLOAT
  [12, 8], // DOUBLE
  [13, 4], // IFD
])

/**
 * Tags whose stored number is a TIFF-relative offset into the block we are
 * re-serializing. The relocation pass below re-points the four it understands;
 * these are refused loudly instead of being copied into an output where they
 * would point at whatever happens to land there.
 */
const UNRELOCATABLE_OFFSET_TAGS = new Map<number, string>([
  [0x0111, 'StripOffsets'],
  [0x0144, 'TileOffsets'],
  [0x014a, 'SubIFDs'],
])

function hex8(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0')
}

function hex16(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, '0')
}

function hex32(value: number): string {
  return value.toString(16).toUpperCase().padStart(8, '0')
}

function readU16(bytes: Uint8Array, offset: number, order: ByteOrder): number {
  return order === 'II'
    ? (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0
    : ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0
}

function readU32(bytes: Uint8Array, offset: number, order: ByteOrder): number {
  return order === 'II'
    ? (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
        0
    : ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
        0
}

function writeU16(bytes: Uint8Array, offset: number, value: number, order: ByteOrder): void {
  if (order === 'II') {
    bytes[offset] = value & 0xff
    bytes[offset + 1] = (value >>> 8) & 0xff
  } else {
    bytes[offset] = (value >>> 8) & 0xff
    bytes[offset + 1] = value & 0xff
  }
}

function writeU32(bytes: Uint8Array, offset: number, value: number, order: ByteOrder): void {
  if (order === 'II') {
    bytes[offset] = value & 0xff
    bytes[offset + 1] = (value >>> 8) & 0xff
    bytes[offset + 2] = (value >>> 16) & 0xff
    bytes[offset + 3] = (value >>> 24) & 0xff
  } else {
    bytes[offset] = (value >>> 24) & 0xff
    bytes[offset + 1] = (value >>> 16) & 0xff
    bytes[offset + 2] = (value >>> 8) & 0xff
    bytes[offset + 3] = value & 0xff
  }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const part of parts) total += part.length
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/**
 * CRC-32 (the PNG/zlib polynomial 0xEDB88320), table built once.
 *
 * Written out rather than taken from `node:zlib` on purpose: this module is also
 * the client-side half of the upload path, and a Node builtin would make it
 * un-importable in the browser bundle.
 */
const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff
  for (let i = start; i < end; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function startsWithBytes(bytes: Uint8Array, offset: number, prefix: Uint8Array): boolean {
  if (offset + prefix.length > bytes.length) return false
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[offset + i] !== prefix[i]) return false
  }
  return true
}

export function stripExifGps(bytes: Uint8Array, options: { keepGps: boolean }): ExifStripResult {
  const kind = detectImageKind(bytes)

  // Keeping GPS is an explicit opt-in, and an opt-in call is not a
  // strip-and-re-add: the caller gets its own bytes back untouched so the
  // "GPS retained" note in the UI is telling the truth about what was stored.
  if (options.keepGps) return { bytes, stripped: [], kind }
  if (kind === 'other') return { bytes, stripped: [], kind }

  const result = kind === 'jpeg' ? stripGpsFromJpeg(bytes) : stripGpsFromPng(bytes)
  return { bytes: result.bytes, stripped: result.stripped, kind }
}

function detectImageKind(bytes: Uint8Array): 'jpeg' | 'png' | 'other' {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === MARKER_SOI) return 'jpeg'
  if (startsWithBytes(bytes, 0, PNG_SIGNATURE)) return 'png'
  return 'other'
}

/* ───────────────────────────── JPEG ───────────────────────────── */

/**
 * Walk the JPEG segment chain up to (and including) SOS.
 *
 * Stops at SOS on purpose: everything after it is entropy-coded data in which
 * `0xFF 0x00` is a stuffed zero from the image itself, so treating it as markers
 * would "discover" segments that are not there.
 */
function walkJpeg(bytes: Uint8Array): JpegSpan[] {
  const spans: JpegSpan[] = [{ marker: MARKER_SOI, start: 0, payloadStart: 2, payloadEnd: 2 }]
  let cursor = 2

  while (cursor < bytes.length) {
    if (bytes[cursor] !== 0xff) {
      throw new Error(
        `exif: expected a JPEG marker (0xFF) at offset ${cursor}, found 0x${hex8(bytes[cursor])}`,
      )
    }
    const markerStart = cursor
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1
    if (cursor >= bytes.length) {
      throw new Error(
        `exif: the JPEG ends at offset ${bytes.length} inside the marker prefix that starts at offset ${markerStart}`,
      )
    }
    const marker = bytes[cursor]
    cursor += 1

    if (marker === 0x00) {
      throw new Error(
        `exif: found a stuffed 0x00 byte at offset ${cursor - 1}, which is only legal inside entropy-coded data (after SOS)`,
      )
    }

    if (marker === MARKER_SOS) {
      if (cursor + 2 > bytes.length) {
        throw new Error(`exif: the start-of-scan header at offset ${markerStart} is truncated`)
      }
      const length = readU16(bytes, cursor, 'MM')
      if (length < 2 || cursor + length > bytes.length) {
        throw new Error(
          `exif: the start-of-scan segment at offset ${markerStart} declares length ${length}, which does not fit the ${bytes.length}-byte file`,
        )
      }
      spans.push({
        marker,
        start: markerStart,
        payloadStart: cursor + 2,
        payloadEnd: cursor + length,
      })
      return spans
    }

    const standalone =
      marker === MARKER_EOI || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
    if (standalone) {
      spans.push({ marker, start: markerStart, payloadStart: cursor, payloadEnd: cursor })
      if (marker === MARKER_EOI) return spans
      continue
    }

    if (cursor + 2 > bytes.length) {
      throw new Error(
        `exif: the JPEG segment 0xFF${hex8(marker)} at offset ${markerStart} is truncated before its length field`,
      )
    }
    const length = readU16(bytes, cursor, 'MM')
    if (length < 2) {
      throw new Error(
        `exif: the JPEG segment 0xFF${hex8(marker)} at offset ${markerStart} declares length ${length}, which is smaller than the length field itself`,
      )
    }
    if (cursor + length > bytes.length) {
      throw new Error(
        `exif: the JPEG segment 0xFF${hex8(marker)} at offset ${markerStart} declares length ${length} but only ${bytes.length - cursor} bytes remain`,
      )
    }
    spans.push({
      marker,
      start: markerStart,
      payloadStart: cursor + 2,
      payloadEnd: cursor + length,
    })
    cursor += length
  }

  throw new Error(
    `exif: the JPEG ends at offset ${bytes.length} without a start-of-scan or end-of-image marker`,
  )
}

function stripGpsFromJpeg(bytes: Uint8Array): { bytes: Uint8Array; stripped: string[] } {
  const spans = walkJpeg(bytes)
  const parts: Uint8Array[] = []
  let strippedGps = false

  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i]
    // Everything from this marker up to the next one belongs to this span; the
    // final span runs to the end of the file so trailing bytes are never lost.
    const end = i + 1 < spans.length ? spans[i + 1].start : bytes.length

    if (span.marker !== MARKER_APP1) {
      parts.push(bytes.subarray(span.start, end))
      continue
    }

    const payload = bytes.subarray(span.payloadStart, span.payloadEnd)
    if (!startsWithBytes(payload, 0, EXIF_HEADER)) {
      // Not an Exif APP1 (XMP and friends use APP1 too) — copy it verbatim.
      parts.push(bytes.subarray(span.start, end))
      continue
    }

    const tiff = payload.subarray(EXIF_HEADER.length)
    const rebuilt = stripGpsFromTiff(tiff, span.payloadStart + EXIF_HEADER.length)
    if (rebuilt === null) {
      parts.push(bytes.subarray(span.start, end))
      continue
    }
    parts.push(buildApp1Segment(rebuilt))
    strippedGps = true
  }

  if (!strippedGps) return { bytes, stripped: [] }
  return { bytes: concatBytes(parts), stripped: ['GPS'] }
}

function buildApp1Segment(tiff: Uint8Array): Uint8Array {
  const segmentLength = 2 + EXIF_HEADER.length + tiff.length
  if (segmentLength > 0xffff) {
    throw new Error(
      `exif: the rebuilt EXIF segment would be ${segmentLength} bytes, which does not fit a JPEG segment (65535 max)`,
    )
  }
  const out = new Uint8Array(2 + segmentLength)
  out[0] = 0xff
  out[1] = MARKER_APP1
  writeU16(out, 2, segmentLength, 'MM')
  out.set(EXIF_HEADER, 4)
  out.set(tiff, 4 + EXIF_HEADER.length)
  return out
}

/**
 * Rebuild a TIFF block without its GPS IFD.
 *
 * Returns `null` when the block carries no GPS pointer tag at all, which is the
 * caller's signal to hand back the ORIGINAL bytes rather than a re-serialized
 * copy of them.
 */
function stripGpsFromTiff(tiff: Uint8Array, fileOffset: number): Uint8Array | null {
  // A function DECLARATION with an explicit `never` return, not an arrow assigned
  // to a const: TypeScript only narrows control flow after a never-returning call
  // when the callee is declared this way, and that narrowing is what lets every
  // `fail(...)` below stand in for an assignment it provably cannot reach.
  function fail(detail: string): never {
    throw new Error(`exif: ${detail} (TIFF block starts at file offset ${fileOffset})`)
  }

  if (tiff.length < TIFF_HEADER_SIZE) {
    fail(
      `the EXIF block holds only ${tiff.length} bytes, which is shorter than the 8-byte TIFF header`,
    )
  }

  const orderMark = (tiff[0] << 8) | tiff[1]
  let order: ByteOrder
  if (orderMark === 0x4949) order = 'II'
  else if (orderMark === 0x4d4d) order = 'MM'
  else
    fail(
      `the byte-order mark at TIFF offset 0 is 0x${hex16(orderMark)}, expected 0x4949 ("II") or 0x4D4D ("MM")`,
    )

  if (readU16(tiff, 2, order) !== 0x2a) {
    fail(
      `the TIFF magic number at TIFF offset 2 is 0x${hex16(readU16(tiff, 2, order))}, expected 0x002A`,
    )
  }

  const u16 = (offset: number): number => readU16(tiff, offset, order)
  const u32 = (offset: number): number => readU32(tiff, offset, order)

  const need = (offset: number, size: number, what: string): void => {
    if (offset < 0 || size < 0 || offset + size > tiff.length) {
      fail(
        `${what} needs bytes [${offset}, ${offset + size}) but the EXIF block is only ${tiff.length} bytes long`,
      )
    }
  }

  const ifdCache = new Map<number, TiffIfd>()

  const parseIfd = (offset: number): TiffIfd => {
    const cached = ifdCache.get(offset)
    if (cached !== undefined) return cached

    need(offset, 2, `the IFD entry count at TIFF offset ${offset}`)
    const count = u16(offset)
    const nextOffsetAt = offset + 2 + count * IFD_ENTRY_SIZE
    need(
      offset + 2,
      count * IFD_ENTRY_SIZE + 4,
      `the IFD with ${count} entries at TIFF offset ${offset}`,
    )

    const entries: TiffEntry[] = []
    for (let i = 0; i < count; i += 1) {
      const recordOffset = offset + 2 + i * IFD_ENTRY_SIZE
      const tag = u16(recordOffset)
      const format = u16(recordOffset + 2)
      const components = u32(recordOffset + 4)

      const width = TYPE_WIDTHS.get(format)
      if (width === undefined) {
        fail(
          `tag 0x${hex16(tag)} at TIFF offset ${recordOffset} uses reserved value type ${format}, whose width is unknown`,
        )
      }
      const byteLength = width * components
      if (!Number.isSafeInteger(byteLength) || byteLength > tiff.length) {
        fail(
          `tag 0x${hex16(tag)} at TIFF offset ${recordOffset} claims ${components} values of type ${format} (${byteLength} bytes), which cannot fit the ${tiff.length}-byte EXIF block`,
        )
      }

      let value: Uint8Array
      if (byteLength <= 4) {
        // 4 bytes or fewer live IN the entry, left-aligned and zero-padded.
        value = tiff.slice(recordOffset + 8, recordOffset + 8 + byteLength)
      } else {
        const valueOffset = u32(recordOffset + 8)
        need(
          valueOffset,
          byteLength,
          `the value of tag 0x${hex16(tag)} at TIFF offset ${recordOffset}`,
        )
        value = tiff.slice(valueOffset, valueOffset + byteLength)
      }
      entries.push({ tag, format, count: components, value, recordOffset })
    }

    const ifd: TiffIfd = { offset, entries, nextOffset: u32(nextOffsetAt) }
    ifdCache.set(offset, ifd)
    return ifd
  }

  const ifd0Offset = u32(4)
  if (ifd0Offset === 0) {
    fail('the TIFF header points IFD0 at TIFF offset 0, so there is no IFD to walk')
  }

  // IFD0, then IFD1 (the thumbnail's IFD), then whatever the chain leads to.
  // Every one of them is a top-level IFD, so every one of them may carry the GPS
  // pointer tag and every one is checked.
  const chain: TiffIfd[] = []
  const visited = new Set<number>()
  let cursor = ifd0Offset
  while (cursor !== 0) {
    if (visited.has(cursor)) fail(`the IFD chain loops back to TIFF offset ${cursor}`)
    if (chain.length >= 8) {
      fail(
        `the IFD chain starting at TIFF offset ${ifd0Offset} is longer than 8 IFDs, which is not a JPEG EXIF structure`,
      )
    }
    visited.add(cursor)
    const ifd = parseIfd(cursor)
    chain.push(ifd)
    cursor = ifd.nextOffset
  }

  const hasGps = chain.some((ifd) => ifd.entries.some((entry) => entry.tag === TAG_GPS_IFD_POINTER))
  if (!hasGps) return null

  const dropGps = (entries: TiffEntry[]): TiffEntry[] =>
    entries.filter((entry) => entry.tag !== TAG_GPS_IFD_POINTER)

  /** Read a tag whose stored number is a TIFF-relative offset. */
  const offsetValue = (entry: TiffEntry, what: string): number => {
    if (entry.count !== 1 || (entry.format !== 4 && entry.format !== 3)) {
      fail(
        `${what} at TIFF offset ${entry.recordOffset} has value type ${entry.format} and count ${entry.count}; expected a single LONG (type 4) or SHORT (type 3) offset, so it cannot be re-pointed safely`,
      )
    }
    const target = entry.format === 4 ? u32(entry.recordOffset + 8) : u16(entry.recordOffset + 8)
    if (target === 0)
      fail(
        `${what} at TIFF offset ${entry.recordOffset} is 0, which points at the TIFF header rather than an IFD`,
      )
    return target
  }

  for (let i = 1; i < chain.length; i += 1) {
    for (const entry of chain[i].entries) {
      if (entry.tag === TAG_EXIF_IFD_POINTER) {
        fail(
          `IFD${i} at TIFF offset ${chain[i].offset} carries an Exif IFD pointer (tag 0x8769), which only IFD0 may do`,
        )
      }
    }
  }

  const exifPointer = chain[0].entries.find((entry) => entry.tag === TAG_EXIF_IFD_POINTER)
  const exifIfd = exifPointer
    ? parseIfd(offsetValue(exifPointer, 'the Exif IFD pointer (tag 0x8769) in IFD0'))
    : null

  const interopPointer = exifIfd?.entries.find((entry) => entry.tag === TAG_INTEROP_IFD_POINTER)
  const interopIfd = interopPointer
    ? parseIfd(offsetValue(interopPointer, 'the Interoperability IFD pointer (tag 0xA005)'))
    : null

  // The embedded thumbnail is stored outside the IFDs and pointed at by 0x0201,
  // so it has to be carried across and re-pointed like any other out-of-line value.
  let thumbnail: Uint8Array | null = null
  let thumbnailIfd: TiffIfd | null = null
  for (const ifd of chain) {
    const pointer = ifd.entries.find((entry) => entry.tag === TAG_JPEG_INTERCHANGE_FORMAT)
    if (pointer === undefined) continue
    if (thumbnailIfd !== null) {
      fail(
        `both the IFD at TIFF offset ${thumbnailIfd.offset} and the IFD at TIFF offset ${ifd.offset} carry a JPEGInterchangeFormat (tag 0x0201) pointer`,
      )
    }
    const lengthEntry = ifd.entries.find(
      (entry) => entry.tag === TAG_JPEG_INTERCHANGE_FORMAT_LENGTH,
    )
    if (lengthEntry === undefined) {
      fail(
        `the IFD at TIFF offset ${ifd.offset} carries JPEGInterchangeFormat (tag 0x0201) without JPEGInterchangeFormatLength (tag 0x0202), so the thumbnail length is unknown`,
      )
    }
    const start = offsetValue(pointer, 'JPEGInterchangeFormat (tag 0x0201)')
    const length = offsetValue(lengthEntry, 'JPEGInterchangeFormatLength (tag 0x0202)')
    need(start, length, `the embedded thumbnail pointed at by tag 0x0201`)
    thumbnail = tiff.slice(start, start + length)
    thumbnailIfd = ifd
  }

  type Block = { ifd: TiffIfd; entries: TiffEntry[]; offset: number }
  const blocks: Block[] = chain.map((ifd) => ({ ifd, entries: dropGps(ifd.entries), offset: 0 }))
  const chainCount = blocks.length
  const exifBlockIndex =
    exifIfd === null
      ? -1
      : blocks.push({ ifd: exifIfd, entries: dropGps(exifIfd.entries), offset: 0 }) - 1
  const interopBlockIndex =
    interopIfd === null
      ? -1
      : blocks.push({ ifd: interopIfd, entries: dropGps(interopIfd.entries), offset: 0 }) - 1

  const allEntries: TiffEntry[] = blocks.flatMap((block) => block.entries)
  for (const entry of allEntries) {
    const name = UNRELOCATABLE_OFFSET_TAGS.get(entry.tag)
    if (name !== undefined) {
      fail(
        `tag 0x${hex16(entry.tag)} (${name}) at TIFF offset ${entry.recordOffset} stores a TIFF-relative offset this stripper cannot relocate, and emitting it unrelocated would leave it dangling`,
      )
    }
  }

  // Layout: TIFF header, the IFD blocks (chain first, then the sub-IFDs), then the
  // out-of-line values, then the thumbnail. Every offset below is computed from
  // these sizes — none is inherited from the input.
  let cursorOffset = TIFF_HEADER_SIZE
  for (const block of blocks) {
    block.offset = cursorOffset
    cursorOffset += 2 + block.entries.length * IFD_ENTRY_SIZE + 4
  }

  const blobOffsets = new Map<TiffEntry, number>()
  for (const block of blocks) {
    for (const entry of block.entries) {
      if (entry.value.length <= 4) continue
      if (cursorOffset % 2 !== 0) cursorOffset += 1
      blobOffsets.set(entry, cursorOffset)
      cursorOffset += entry.value.length
    }
  }

  let thumbnailOffset = -1
  if (thumbnail !== null) {
    if (cursorOffset % 2 !== 0) cursorOffset += 1
    thumbnailOffset = cursorOffset
    cursorOffset += thumbnail.length
  }

  const out = new Uint8Array(cursorOffset)

  if (order === 'II') {
    out[0] = 0x49
    out[1] = 0x49
  } else {
    out[0] = 0x4d
    out[1] = 0x4d
  }
  writeU16(out, 2, 0x2a, order)
  writeU32(out, 4, TIFF_HEADER_SIZE, order)

  const fieldOffsets = new Map<TiffEntry, number>()
  for (let b = 0; b < blocks.length; b += 1) {
    const block = blocks[b]
    writeU16(out, block.offset, block.entries.length, order)
    for (let i = 0; i < block.entries.length; i += 1) {
      const entry = block.entries[i]
      const fieldOffset = block.offset + 2 + i * IFD_ENTRY_SIZE
      fieldOffsets.set(entry, fieldOffset)
      writeU16(out, fieldOffset, entry.tag, order)
      writeU16(out, fieldOffset + 2, entry.format, order)
      writeU32(out, fieldOffset + 4, entry.count, order)
      if (entry.value.length <= 4) {
        // `out` is zero-filled, so writing the value left-aligned leaves the
        // required zero padding in place.
        out.set(entry.value, fieldOffset + 8)
      } else {
        const blobOffset = blobOffsets.get(entry)
        if (blobOffset === undefined) {
          fail(
            `tag 0x${hex16(entry.tag)} at TIFF offset ${entry.recordOffset} was not given a value offset`,
          )
        }
        writeU32(out, fieldOffset + 8, blobOffset, order)
        out.set(entry.value, blobOffset)
      }
    }
    // Sub-IFDs have no successor, so only the chain's IFDs link onwards.
    const nextBlock = b + 1 < chainCount ? blocks[b + 1].offset : 0
    writeU32(out, block.offset + 2 + block.entries.length * IFD_ENTRY_SIZE, nextBlock, order)
  }

  const patchOffset = (entry: TiffEntry, value: number, what: string): void => {
    const fieldOffset = fieldOffsets.get(entry)
    if (fieldOffset === undefined)
      fail(`${what} at TIFF offset ${entry.recordOffset} was never written`)
    if (entry.format === 4 && entry.count === 1) {
      writeU32(out, fieldOffset + 8, value, order)
      return
    }
    if (entry.format === 3 && entry.count === 1) {
      if (value > 0xffff) {
        fail(
          `${what} must move to TIFF offset ${value}, which does not fit the SHORT (type 3) value the source file used`,
        )
      }
      writeU16(out, fieldOffset + 8, value, order)
      return
    }
    fail(
      `${what} has value type ${entry.format} and count ${entry.count}, so it cannot be re-pointed`,
    )
  }

  if (thumbnail !== null && thumbnailOffset >= 0) {
    // The thumbnail is not an entry value: it is a byte range pointed at by
    // tag 0x0201, so it has to be copied to its new home explicitly.
    out.set(thumbnail, thumbnailOffset)
  }

  if (exifPointer !== undefined) {
    if (exifBlockIndex < 0)
      fail('the Exif IFD pointer (tag 0x8769) was parsed but its IFD block was never planned')
    patchOffset(exifPointer, blocks[exifBlockIndex].offset, 'the Exif IFD pointer (tag 0x8769)')
  }
  if (interopPointer !== undefined) {
    if (interopBlockIndex < 0) {
      fail(
        'the Interoperability IFD pointer (tag 0xA005) was parsed but its IFD block was never planned',
      )
    }
    patchOffset(
      interopPointer,
      blocks[interopBlockIndex].offset,
      'the Interoperability IFD pointer (tag 0xA005)',
    )
  }
  if (thumbnailIfd !== null) {
    const pointer = thumbnailIfd.entries.find((entry) => entry.tag === TAG_JPEG_INTERCHANGE_FORMAT)
    if (pointer === undefined) {
      fail(
        `the IFD at TIFF offset ${thumbnailIfd.offset} lost its JPEGInterchangeFormat (tag 0x0201) pointer`,
      )
    }
    if (thumbnailOffset < 0) {
      fail(
        `the thumbnail of the IFD at TIFF offset ${thumbnailIfd.offset} was never given a new offset`,
      )
    }
    patchOffset(pointer, thumbnailOffset, 'JPEGInterchangeFormat (tag 0x0201)')
  }

  return out
}

/* ───────────────────────────── PNG ───────────────────────────── */

type PngChunk = { type: string; start: number; end: number }

/**
 * Walk the PNG chunk chain, validating the length and the CRC of every chunk on
 * the way. Dropping a chunk is a pure splice precisely BECAUSE each chunk's CRC
 * covers only its own type and data: the retained chunks keep the length and CRC
 * they were written with, so there is no chain to patch — but that is only a
 * guarantee if the chain we splice was consistent to begin with.
 */
function readPngChunks(bytes: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = []
  let cursor = PNG_SIGNATURE.length

  while (cursor < bytes.length) {
    if (cursor + 8 > bytes.length) {
      throw new Error(
        `exif: the PNG chunk header at offset ${cursor} runs past the end of the ${bytes.length}-byte file`,
      )
    }
    const length = readU32(bytes, cursor, 'MM')
    const type = String.fromCharCode(
      bytes[cursor + 4],
      bytes[cursor + 5],
      bytes[cursor + 6],
      bytes[cursor + 7],
    )
    if (!/^[A-Za-z]{4}$/.test(type)) {
      throw new Error(
        `exif: the PNG chunk at offset ${cursor} has type "${type}", which is not four ASCII letters`,
      )
    }
    const end = cursor + 8 + length + 4
    if (end > bytes.length) {
      throw new Error(
        `exif: the PNG chunk "${type}" at offset ${cursor} declares ${length} bytes of data, which runs past the end of the ${bytes.length}-byte file`,
      )
    }
    const declaredCrc = readU32(bytes, cursor + 8 + length, 'MM')
    const actualCrc = crc32(bytes, cursor + 4, cursor + 8 + length)
    if (declaredCrc !== actualCrc) {
      throw new Error(
        `exif: the PNG chunk "${type}" at offset ${cursor} declares CRC 0x${hex32(declaredCrc)} but its bytes hash to 0x${hex32(actualCrc)}`,
      )
    }
    chunks.push({ type, start: cursor, end })

    cursor = end
    if (type === 'IEND') break
  }

  const last = chunks[chunks.length - 1]
  if (last === undefined || last.type !== 'IEND') {
    throw new Error(`exif: the PNG data ends at offset ${cursor} without an IEND chunk`)
  }
  if (last.end !== bytes.length) {
    throw new Error(
      `exif: the PNG has ${bytes.length - last.end} bytes after its IEND chunk at offset ${last.end}`,
    )
  }
  return chunks
}

function stripGpsFromPng(bytes: Uint8Array): { bytes: Uint8Array; stripped: string[] } {
  const chunks = readPngChunks(bytes)
  const exifChunks = chunks.filter((chunk) => chunk.type === 'eXIf')
  if (exifChunks.length === 0) return { bytes, stripped: [] }

  const kept = [
    // The 8-byte signature is not one of the chunks, so dropping a chunk never
    // touches it — it is copied explicitly rather than reconstructed.
    bytes.subarray(0, PNG_SIGNATURE.length),
    ...chunks
      .filter((chunk) => chunk.type !== 'eXIf')
      .map((chunk) => bytes.subarray(chunk.start, chunk.end)),
  ]
  return { bytes: concatBytes(kept), stripped: ['exif'] }
}
