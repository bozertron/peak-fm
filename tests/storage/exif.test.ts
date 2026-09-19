/**
 * tests/storage/exif.test.ts — PEAK-209 unit 3 of 6, the GPS EXIF stripper.
 *
 * THE FIXTURE IS SYNTHESIZED IN CODE, NOT CHECKED IN AS A BINARY. The ticket asks
 * for one ("an EXIF-bearing fixture photo") but a checked-in JPEG is an opaque
 * blob nobody can audit; here the bytes are built from the format's own rules, so
 * every assertion below can be read against the fixture that produced it:
 *
 *   JPEG   SOI | APP0/JFIF | APP1(Exif\0\0 + TIFF) | SOS | entropy-coded data | EOI
 *   TIFF   header(8) | IFD0[Make, GPS-IFD-pointer] | IFD1[0x0201, 0x0202]
 *          | out-of-line Make | GPS IFD[GPSLatitude RATIONAL[3]] | GPS latitude
 *          | embedded thumbnail
 *
 * The TIFF is built for BOTH byte orders ("II" little-endian and "MM"
 * big-endian) because getting the byte order wrong is the failure mode that
 * produces a silently corrupt image rather than a thrown error — a test that only
 * ever exercises one order cannot see it.
 *
 * WHAT THIS FILE PROVES, and the assertion that proves it:
 *   1. the GPS latitude bytes are present before and absent after  → indexOfSequence
 *   2. the retained Make tag survives WITH A VALID OFFSET            → re-parsed
 *      from the OUTPUT through its own out-of-line pointer, not merely present
 *   3. IFD0's entry count is fixed when the GPS entry is dropped     → 2 → 1
 *   4. the thumbnail survives and 0x0201 still points at it          → bytes
 *      compared at the re-pointed offset
 *   5. the image payload from SOS to EOI survives byte-for-byte      → suffix compare
 *   6. keepGps: true and a no-GPS file are IDENTITY (no re-encode)   → toBe
 *   7. malformed input throws and NAMES the offset                   → toThrow(/offset/)
 *   8. an eXIf PNG chunk is dropped and every retained chunk still verifies its
 *      own length and CRC                                            → CRC check in readPngChunks
 *   9. non-image input is returned unchanged as kind 'other'         → toBe
 */

import { describe, expect, test } from 'vitest'
import { stripExifGps } from '@/lib/storage/exif'

/* ─────────────────────── byte plumbing for the fixture ─────────────────────── */

type Order = 'II' | 'MM'

const TEXT = new TextEncoder()

function u16(order: Order, value: number): Uint8Array {
  return order === 'II'
    ? Uint8Array.from([value & 0xff, (value >>> 8) & 0xff])
    : Uint8Array.from([(value >>> 8) & 0xff, value & 0xff])
}

function u32(order: Order, value: number): Uint8Array {
  return order === 'II'
    ? Uint8Array.from([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ])
    : Uint8Array.from([
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
      ])
}

function join(parts: Uint8Array[]): Uint8Array {
  let length = 0
  for (const part of parts) length += part.length
  const out = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

function readU16(bytes: Uint8Array, offset: number, order: Order): number {
  return order === 'II'
    ? (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0
    : ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0
}

function readU32(bytes: Uint8Array, offset: number, order: Order): number {
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

function writeU16(bytes: Uint8Array, offset: number, value: number, order: Order): void {
  bytes.set(u16(order, value), offset)
}

function writeU32(bytes: Uint8Array, offset: number, value: number, order: Order): void {
  bytes.set(u32(order, value), offset)
}

function writeU32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes.set(u32('MM', value), offset)
}

/** Real subsequence search — assertions on "these bytes are gone" need real bytes. */
function indexOfSequence(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0) return 0
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let matches = true
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        matches = false
        break
      }
    }
    if (matches) return i
  }
  return -1
}

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  return indexOfSequence(haystack, needle) !== -1
}

/** Printable form of an ASCII tag value, so a failure prints "Peak FM" not byte noise. */
function ascii(value: Uint8Array): string {
  let out = ''
  for (const byte of value) out += byte === 0 ? '\\0' : String.fromCharCode(byte)
  return out
}

/* ───────────────────────────── the JPEG fixture ───────────────────────────── */

const MAKE_ASCII = 'Peak FM\u0000'
const THUMBNAIL_BYTES = TEXT.encode('PEAK-THUMBNAIL-JPEG')
const IMAGE_DATA = Uint8Array.from([0x8a, 0x00, 0xff, 0x00, 0x37, 0xc4, 0xd2, 0x11, 0x5e, 0x7f])

const EXIF_HEADER_BYTES = TEXT.encode('Exif\u0000\u0000')

/**
 * TIFF layout, all offsets TIFF-header-relative and every size fixed so the
 * fixture can be written in one pass. IFD0 is 2 entries (Make, GPS pointer) and
 * IFD1 is 2 entries (thumbnail offset, thumbnail length); the GPS IFD holds one
 * GPSLatitude RATIONAL[3] which is 24 bytes and therefore lives out of line.
 */
const IFD0_AT = 8
const IFD0_SIZE = 2 + 2 * 12 + 4 // 30
const IFD1_AT = IFD0_AT + IFD0_SIZE // 38
const IFD1_SIZE = 2 + 2 * 12 + 4 // 30
const MAKE_AT = IFD1_AT + IFD1_SIZE // 68
const GPS_IFD_AT = MAKE_AT + MAKE_ASCII.length // 76
const GPS_IFD_SIZE = 2 + 1 * 12 + 4 // 18
const GPS_LATITUDE_AT = GPS_IFD_AT + GPS_IFD_SIZE // 94
const GPS_LATITUDE_SIZE = 3 * 8 // 24 — three RATIONALs
const THUMBNAIL_AT = GPS_LATITUDE_AT + GPS_LATITUDE_SIZE // 118
const TIFF_LENGTH = THUMBNAIL_AT + THUMBNAIL_BYTES.length // 138

function gpsLatitudeBytes(order: Order): Uint8Array {
  // 49/1, 30/1, 12/1 — the latitude of the Okanagan, and bytes nothing else in
  // the fixture can produce by accident.
  return join([
    u32(order, 49),
    u32(order, 1),
    u32(order, 30),
    u32(order, 1),
    u32(order, 12),
    u32(order, 1),
  ])
}

/** One 12-byte IFD entry: tag, type, component count, 4-byte value field. */
function entryBytes(
  order: Order,
  tag: number,
  format: number,
  count: number,
  valueField: Uint8Array,
): Uint8Array {
  if (valueField.length !== 4)
    throw new Error('test fixture: an entry value field is exactly 4 bytes')
  return join([u16(order, tag), u16(order, format), u32(order, count), valueField])
}

type BuiltTiff = {
  tiff: Uint8Array
  order: Order
  gpsPointerEntry: Uint8Array
  gpsLatitude: Uint8Array
}

function buildExifTiff(order: Order): BuiltTiff {
  const tiff = new Uint8Array(TIFF_LENGTH)
  const gpsLatitude = gpsLatitudeBytes(order)
  const gpsPointerEntry = entryBytes(order, 0x8825, 4, 1, u32(order, GPS_IFD_AT))

  tiff.set(order === 'II' ? Uint8Array.from([0x49, 0x49]) : Uint8Array.from([0x4d, 0x4d]), 0)
  writeU16(tiff, 2, 0x002a, order)
  writeU32(tiff, 4, IFD0_AT, order)

  // IFD0 — camera Make (6+ bytes, so its value lives at MAKE_AT) and the GPS IFD
  // pointer, which is the tag the stripper must remove.
  writeU16(tiff, IFD0_AT, 2, order)
  tiff.set(entryBytes(order, 0x010f, 2, MAKE_ASCII.length, u32(order, MAKE_AT)), IFD0_AT + 2)
  tiff.set(gpsPointerEntry, IFD0_AT + 14)
  writeU32(tiff, IFD0_AT + 2 + 2 * 12, IFD1_AT, order)

  // IFD1 — the thumbnail's IFD: where its JPEG bytes are, and how long they are.
  writeU16(tiff, IFD1_AT, 2, order)
  tiff.set(entryBytes(order, 0x0201, 4, 1, u32(order, THUMBNAIL_AT)), IFD1_AT + 2)
  tiff.set(entryBytes(order, 0x0202, 4, 1, u32(order, THUMBNAIL_BYTES.length)), IFD1_AT + 14)
  writeU32(tiff, IFD1_AT + 2 + 2 * 12, 0, order)

  tiff.set(TEXT.encode(MAKE_ASCII), MAKE_AT)

  // The GPS IFD itself — the whole point of the exercise.
  writeU16(tiff, GPS_IFD_AT, 1, order)
  tiff.set(entryBytes(order, 0x0002, 5, 3, u32(order, GPS_LATITUDE_AT)), GPS_IFD_AT + 2)
  writeU32(tiff, GPS_IFD_AT + 2 + 12, 0, order)
  tiff.set(gpsLatitude, GPS_LATITUDE_AT)

  tiff.set(THUMBNAIL_BYTES, THUMBNAIL_AT)

  return { tiff, order, gpsPointerEntry, gpsLatitude }
}

const APP0_SEGMENT = join([
  Uint8Array.from([0xff, 0xe0]),
  u16('MM', 16), // length includes itself
  TEXT.encode('JFIF\u0000'),
  Uint8Array.from([0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
])

const SOS_SEGMENT = join([
  Uint8Array.from([0xff, 0xda]),
  u16('MM', 8),
  Uint8Array.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
])

/** Absolute offset of the TIFF block: SOI, APP0, the APP1 marker + length, "Exif\0\0". */
const TIFF_START = 2 + APP0_SEGMENT.length + 2 + 2 + EXIF_HEADER_BYTES.length

type BuiltJpeg = {
  jpeg: Uint8Array
  tiff: Uint8Array
  gpsPointerEntry: Uint8Array
  gpsLatitude: Uint8Array
}

function buildJpegWithGps(order: Order): BuiltJpeg {
  const { tiff, gpsPointerEntry, gpsLatitude } = buildExifTiff(order)
  const jpeg = join([
    Uint8Array.from([0xff, 0xd8]),
    APP0_SEGMENT,
    Uint8Array.from([0xff, 0xe1]),
    u16('MM', 2 + EXIF_HEADER_BYTES.length + tiff.length),
    EXIF_HEADER_BYTES,
    tiff,
    SOS_SEGMENT,
    IMAGE_DATA,
    Uint8Array.from([0xff, 0xd9]),
  ])
  return { jpeg, tiff, gpsPointerEntry, gpsLatitude }
}

function buildJpegWithoutExif(): Uint8Array {
  return join([
    Uint8Array.from([0xff, 0xd8]),
    APP0_SEGMENT,
    SOS_SEGMENT,
    IMAGE_DATA,
    Uint8Array.from([0xff, 0xd9]),
  ])
}

/** A structurally complete JPEG whose APP1 payload begins with "Exif\0\0". */
function buildJpegWithRawExif(tiff: Uint8Array): Uint8Array {
  return join([
    Uint8Array.from([0xff, 0xd8]),
    Uint8Array.from([0xff, 0xe1]),
    u16('MM', 2 + EXIF_HEADER_BYTES.length + tiff.length),
    EXIF_HEADER_BYTES,
    tiff,
    SOS_SEGMENT,
    IMAGE_DATA,
    Uint8Array.from([0xff, 0xd9]),
  ])
}

/**
 * The TIFF block of a JPEG built above, read back through the APP1 length field
 * the file itself declares — so a wrong length written by the stripper is a test
 * failure here rather than something the assertions below never look at.
 *
 * `TIFF_START` is 8 bytes past the start of that length field: 2 marker bytes,
 * 2 length bytes, then the 6 bytes of "Exif\0\0".
 */
function tiffFromJpeg(jpeg: Uint8Array): Uint8Array {
  if (jpeg[TIFF_START - 10] !== 0xff || jpeg[TIFF_START - 9] !== 0xe1) {
    throw new Error(
      'test reader: the segment immediately before the TIFF block is not an APP1 marker',
    )
  }
  const segmentLength = readU16(jpeg, TIFF_START - 8, 'MM')
  return jpeg.subarray(TIFF_START, TIFF_START + segmentLength - 8)
}

/* ─────────────── an independent reader for the OUTPUT EXIF block ─────────────── */

const FORMAT_WIDTHS: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

type ReadTag = { tag: number; format: number; count: number; value: Uint8Array }

/**
 * Walk IFD entries straight out of the format spec: count, then 12-byte records,
 * then a 4-byte next-IFD offset. Values of more than 4 bytes are followed through
 * their offset, which is what makes "the Make tag survived" a statement about a
 * VALID pointer rather than about a byte that happens to still be in the file.
 */
function readIfd(tiff: Uint8Array, ifdOffset: number, order: Order): ReadTag[] {
  const count = readU16(tiff, ifdOffset, order)
  const tags: ReadTag[] = []
  for (let i = 0; i < count; i += 1) {
    const at = ifdOffset + 2 + i * 12
    const tag = readU16(tiff, at, order)
    const format = readU16(tiff, at + 2, order)
    const components = readU32(tiff, at + 4, order)
    const width = FORMAT_WIDTHS[format]
    if (width === undefined)
      throw new Error(`test reader: tag 0x${tag.toString(16)} has unknown type ${format}`)
    const byteLength = width * components
    const value =
      byteLength <= 4
        ? tiff.slice(at + 8, at + 8 + byteLength)
        : tiff.slice(readU32(tiff, at + 8, order), readU32(tiff, at + 8, order) + byteLength)
    tags.push({ tag, format, count: components, value })
  }
  return tags
}

function nextIfd(tiff: Uint8Array, ifdOffset: number, order: Order): number {
  return readU32(tiff, ifdOffset + 2 + readU16(tiff, ifdOffset, order) * 12, order)
}

function tagOf(tags: ReadTag[], tag: number): ReadTag | undefined {
  return tags.find((entry) => entry.tag === tag)
}

/** A 4-byte numeric (LONG) tag value, read from the output block. */
function numberOf(tags: ReadTag[], tag: number, order: Order, label: string): number {
  const found = tagOf(tags, tag)
  if (found === undefined) {
    throw new Error(
      `test reader: the ${label} tag (0x${tag.toString(16)}) is missing from the output EXIF block`,
    )
  }
  if (found.value.length !== 4) {
    throw new Error(
      `test reader: the ${label} tag (0x${tag.toString(16)}) is ${found.value.length} bytes, not a LONG`,
    )
  }
  return readU32(found.value, 0, order)
}

/* ───────────────────────────── the PNG fixture ───────────────────────────── */

/**
 * CRC-32 recomputed bit by bit here (not table-driven, unlike the implementation)
 * so that "the chunk chain still verifies" is an independent check rather than the
 * implementation agreeing with itself.
 */
function crc32Of(typeAndData: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of typeAndData) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (0xedb88320 ^ (crc >>> 1)) >>> 0 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeAndData = join([TEXT.encode(type), data])
  const chunk = new Uint8Array(8 + data.length + 4)
  writeU32BE(chunk, 0, data.length)
  chunk.set(typeAndData, 4)
  writeU32BE(chunk, 8 + data.length, crc32Of(typeAndData))
  return chunk
}

const PNG_IHDR_DATA = Uint8Array.from([
  0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10, 0x08, 0x06, 0x00, 0x00, 0x00,
])
const PNG_IDAT_DATA = Uint8Array.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])

type BuiltPng = { png: Uint8Array; exifTiff: Uint8Array }

function buildPngWithExif(): BuiltPng {
  const exifTiff = buildExifTiff('II').tiff
  return {
    exifTiff,
    png: join([
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', PNG_IHDR_DATA),
      pngChunk('eXIf', exifTiff),
      pngChunk('IDAT', PNG_IDAT_DATA),
      pngChunk('IEND', new Uint8Array(0)),
    ]),
  }
}

function buildPngWithoutExif(): Uint8Array {
  return join([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', PNG_IHDR_DATA),
    pngChunk('IDAT', PNG_IDAT_DATA),
    pngChunk('IEND', new Uint8Array(0)),
  ])
}

/** Walks the chunk chain, recomputing each CRC — a corrupt chain throws. */
function readPngChunks(png: Uint8Array): Array<{ type: string; data: Uint8Array }> {
  const chunks: Array<{ type: string; data: Uint8Array }> = []
  let cursor = 8
  while (cursor < png.length) {
    const length = readU32(png, cursor, 'MM')
    const type = String.fromCharCode(
      png[cursor + 4],
      png[cursor + 5],
      png[cursor + 6],
      png[cursor + 7],
    )
    const data = png.subarray(cursor + 8, cursor + 8 + length)
    const declared = readU32(png, cursor + 8 + length, 'MM')
    const actual = crc32Of(png.subarray(cursor + 4, cursor + 8 + length))
    if (declared !== actual) {
      throw new Error(
        `test reader: chunk "${type}" CRC is 0x${declared.toString(16)} but hashes to 0x${actual.toString(16)}`,
      )
    }
    chunks.push({ type, data })
    cursor += 8 + length + 4
  }
  return chunks
}

/* ───────────────────────────────── the tests ───────────────────────────────── */

describe('stripExifGps — JPEG', () => {
  for (const order of ['II', 'MM'] as const) {
    describe(`byte order ${order}`, () => {
      test('removes the GPS IFD and its data while every retained tag stays valid', () => {
        const { jpeg, tiff, gpsLatitude } = buildJpegWithGps(order)

        // PRE-CONDITION: the fixture really does carry the GPS data and the
        // pointer tag. Without this the absence assertions below prove nothing.
        expect(contains(tiff, gpsLatitude)).toBe(true)
        expect(contains(tiff, entryBytes(order, 0x8825, 4, 1, u32(order, GPS_IFD_AT)))).toBe(true)
        expect(readU16(tiff, IFD0_AT, order)).toBe(2)

        const result = stripExifGps(jpeg, { keepGps: false })

        expect(result.kind).toBe('jpeg')
        expect(result.stripped).toEqual(['GPS'])
        expect(result.bytes).not.toBe(jpeg)

        const out = tiffFromJpeg(result.bytes)

        // 1. the GPS latitude bytes are GONE — the real bytes, searched for.
        expect(contains(out, gpsLatitude)).toBe(false)
        // ...and so is the pointer tag that made them reachable.
        expect(contains(out, entryBytes(order, 0x8825, 4, 1, u32(order, GPS_IFD_AT)))).toBe(false)
        expect(readIfd(out, IFD0_AT, order).map((entry) => entry.tag)).toEqual([0x010f])

        // 3. the IFD0 entry count was fixed, not left claiming a dropped entry.
        expect(readU16(out, IFD0_AT, order)).toBe(1)
        expect(out.length).toBeLessThan(tiff.length)

        // 2. the Make tag survived AND its out-of-line pointer is still valid:
        //    readIfd follows the offset the stripper wrote, so a stale offset is a
        //    failure here rather than a byte that merely happens to be present.
        const make = tagOf(readIfd(out, IFD0_AT, order), 0x010f)
        expect(make).toBeDefined()
        expect(ascii(make?.value ?? new Uint8Array())).toBe('Peak FM\\0')

        // 4. IFD1 still exists, its thumbnail pointer is re-pointed at the real
        //    thumbnail bytes, and its length tag still describes them.
        const ifd1 = nextIfd(out, IFD0_AT, order)
        expect(ifd1).toBeGreaterThan(0)
        const ifd1Tags = readIfd(out, ifd1, order)
        const thumbnailOffset = numberOf(ifd1Tags, 0x0201, order, 'JPEGInterchangeFormat')
        expect(out.slice(thumbnailOffset, thumbnailOffset + THUMBNAIL_BYTES.length)).toEqual(
          THUMBNAIL_BYTES,
        )
        expect(numberOf(ifd1Tags, 0x0202, order, 'JPEGInterchangeFormatLength')).toBe(
          THUMBNAIL_BYTES.length,
        )

        // 5. SOI still opens the file, the JFIF APP0 segment is untouched, and
        //    everything from SOS through EOI survived byte-for-byte.
        expect(result.bytes[0]).toBe(0xff)
        expect(result.bytes[1]).toBe(0xd8)
        expect(contains(result.bytes, APP0_SEGMENT)).toBe(true)
        const tail = join([SOS_SEGMENT, IMAGE_DATA, Uint8Array.from([0xff, 0xd9])])
        expect(result.bytes.slice(result.bytes.length - tail.length)).toEqual(tail)
      })

      test('is idempotent — a second pass finds no GPS and returns the same bytes', () => {
        const { jpeg } = buildJpegWithGps(order)

        const once = stripExifGps(jpeg, { keepGps: false })
        const twice = stripExifGps(once.bytes, { keepGps: false })

        expect(twice.stripped).toEqual([])
        expect(twice.bytes).toEqual(once.bytes)
      })
    })
  }

  test('keepGps: true returns the input untouched and strips nothing', () => {
    const { jpeg, gpsLatitude } = buildJpegWithGps('II')

    const result = stripExifGps(jpeg, { keepGps: true })

    expect(result.kind).toBe('jpeg')
    expect(result.bytes).toBe(jpeg)
    expect(result.stripped).toEqual([])
    expect(contains(result.bytes, gpsLatitude)).toBe(true)
  })

  test('a JPEG with no APP1 segment is returned unchanged', () => {
    const jpeg = buildJpegWithoutExif()

    const result = stripExifGps(jpeg, { keepGps: false })

    expect(result.kind).toBe('jpeg')
    expect(result.bytes).toBe(jpeg)
    expect(result.stripped).toEqual([])
  })

  test('an APP1 segment with reserved value types throws rather than guessing a stride', () => {
    // IFD0 with one entry whose type is 0 ("reserved"), which has no width.
    const tiff = new Uint8Array(8 + 2 + 12 + 4)
    tiff.set(Uint8Array.from([0x49, 0x49]), 0)
    writeU16(tiff, 2, 0x002a, 'II')
    writeU32(tiff, 4, 8, 'II')
    writeU16(tiff, 8, 1, 'II')
    tiff.set(entryBytes('II', 0x010f, 0, 4, u32('II', 0)), 10)
    writeU32(tiff, 22, 0, 'II')

    expect(() => stripExifGps(buildJpegWithRawExif(tiff), { keepGps: false })).toThrow(
      /reserved value type 0/,
    )
  })

  test('an unreadable TIFF byte-order mark throws and names the offset', () => {
    const tiff = Uint8Array.from([0x58, 0x58, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08])

    expect(() => stripExifGps(buildJpegWithRawExif(tiff), { keepGps: false })).toThrow(
      /byte-order mark at TIFF offset 0 is 0x5858/,
    )
  })

  test('an IFD0 pointer past the end of the block throws and names the offset it failed at', () => {
    const tiff = Uint8Array.from([0x49, 0x49, 0x2a, 0x00, 0xff, 0xff, 0xff, 0x7f])

    expect(() => stripExifGps(buildJpegWithRawExif(tiff), { keepGps: false })).toThrow(
      /IFD entry count at TIFF offset 2147483647/,
    )
  })
})

describe('stripExifGps — PNG', () => {
  test('drops the eXIf chunk and leaves the rest of the chunk chain verifying', () => {
    const { png, exifTiff } = buildPngWithExif()
    expect(contains(png, TEXT.encode('eXIf'))).toBe(true)

    const result = stripExifGps(png, { keepGps: false })

    expect(result.kind).toBe('png')
    expect(result.stripped).toEqual(['exif'])
    expect(result.bytes).not.toBe(png)
    expect(contains(result.bytes, TEXT.encode('eXIf'))).toBe(false)
    expect(contains(result.bytes, exifTiff)).toBe(false)
    expect(contains(result.bytes, buildExifTiff('II').gpsLatitude)).toBe(false)

    // Every retained chunk still carries its own correct length and CRC, which is
    // what "repair the chunk length/CRC chain" has to mean for a pure splice.
    const chunks = readPngChunks(result.bytes)
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    expect(chunks[0]?.data).toEqual(PNG_IHDR_DATA)
    expect(chunks[1]?.data).toEqual(PNG_IDAT_DATA)
    expect(chunks[2]?.data.length).toBe(0)
  })

  test('a PNG with no eXIf chunk is returned unchanged', () => {
    const png = buildPngWithoutExif()

    const result = stripExifGps(png, { keepGps: false })

    expect(result.kind).toBe('png')
    expect(result.bytes).toBe(png)
    expect(result.stripped).toEqual([])
  })

  test('keepGps: true returns an eXIf bearing PNG untouched', () => {
    const { png, exifTiff } = buildPngWithExif()

    const result = stripExifGps(png, { keepGps: true })

    expect(result.bytes).toBe(png)
    expect(result.stripped).toEqual([])
    expect(contains(result.bytes, exifTiff)).toBe(true)
  })

  test('a PNG whose chunk CRC does not match its bytes throws and names the chunk', () => {
    const { png } = buildPngWithExif()
    const exifTypeAt = indexOfSequence(png, TEXT.encode('eXIf'))
    expect(exifTypeAt).toBeGreaterThan(0)
    const corrupted = png.slice()
    // Flip one byte of the eXIf DATA and leave the stored CRC alone, so the chunk
    // no longer matches its own CRC.
    corrupted[exifTypeAt + 4 + 5] ^= 0xff

    expect(() => stripExifGps(corrupted, { keepGps: false })).toThrow(
      new RegExp(`chunk "eXIf" at offset ${exifTypeAt - 4}`),
    )
  })
})

describe('stripExifGps — input that is not a JPEG or a PNG', () => {
  test('returns kind "other" with the bytes unchanged', () => {
    const text = TEXT.encode('this is not an image at all')

    const result = stripExifGps(text, { keepGps: false })

    expect(result.kind).toBe('other')
    expect(result.bytes).toBe(text)
    expect(result.stripped).toEqual([])
  })

  test('returns kind "other" for empty input', () => {
    const empty = new Uint8Array(0)

    const result = stripExifGps(empty, { keepGps: false })

    expect(result.kind).toBe('other')
    expect(result.bytes).toBe(empty)
    expect(result.stripped).toEqual([])
  })
})
