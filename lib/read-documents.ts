import { inflateRawSync } from "node:zlib"
import path from "node:path"

export type ReadBlockInput = { id: string; order: number; type: "HEADING" | "PARAGRAPH"; text: string; sectionId?: string; sectionTitle?: string; headingLevel?: number; startOffset: number; endOffset: number }

function unzipEntries(buffer: Buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error("This file is not a valid EPUB archive.")
  const count = buffer.readUInt16LE(eocd + 10), directory = buffer.readUInt32LE(eocd + 16)
  const entries = new Map<string, Buffer>()
  let totalExpandedBytes = 0, offset = directory
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("This file has an invalid EPUB directory.")
    const method = buffer.readUInt16LE(offset + 10), compressedSize = buffer.readUInt32LE(offset + 20), expandedSize = buffer.readUInt32LE(offset + 24)
    if (expandedSize > 40 * 1024 * 1024 || totalExpandedBytes + expandedSize > 100 * 1024 * 1024) throw new Error("This EPUB expands beyond the supported size limit.")
    totalExpandedBytes += expandedSize
    const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32), localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength), localName = buffer.readUInt16LE(localOffset + 26), localExtra = buffer.readUInt16LE(localOffset + 28), start = localOffset + 30 + localName + localExtra
    const data = buffer.subarray(start, start + compressedSize)
    if (method === 0) entries.set(name, data)
    else if (method === 8) entries.set(name, inflateRawSync(data))
    else throw new Error("This EPUB uses an unsupported compression method.")
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function decodeXml(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ").trim() }
function epubPath(base: string, href: string) { return path.posix.normalize(path.posix.join(base, decodeURIComponent(href.split("#")[0]))) }

export function extractEpubDocument(buffer: Buffer, documentId: string) {
  const entries = unzipEntries(buffer), container = entries.get("META-INF/container.xml")?.toString("utf8"), opfPath = container?.match(/full-path="([^"]+)"/)?.[1], opf = opfPath ? entries.get(opfPath)?.toString("utf8") : undefined
  if (!opf || !opfPath) throw new Error("The EPUB package document was not found.")
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : ""
  const metadataXml = opf.match(/<metadata\b[^>]*>([\s\S]*?)<\/metadata>/i)?.[1] ?? opf
  const metadataValue = (tag: string) => decodeXml(metadataXml.match(new RegExp(`<(?:dc:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:dc:)?${tag}\\s*>`, "i"))?.[1] ?? "")
  const manifestItems = [...opf.matchAll(/<item\b([^>]+)\/?\s*>/g)].map(match => {
    const attrs = match[1]
    const attribute = (name: string) => attrs.match(new RegExp(`\\b${name}="([^"]+)"`, "i"))?.[1] ?? ""
    return { id: attribute("id"), href: attribute("href"), mediaType: attribute("media-type"), properties: attribute("properties") }
  })
  const manifest = new Map(manifestItems.map(item => [item.id, item.href]))
  const coverId = opf.match(/<meta\b[^>]*name="cover"[^>]*content="([^"]+)"/i)?.[1]
  const coverItem = manifestItems.find(item => item.properties.split(/\s+/).includes("cover-image")) ?? manifestItems.find(item => item.id === coverId)
  const coverBytes = coverItem?.href ? entries.get(epubPath(base, coverItem.href)) : undefined
  const identifierValues = [...metadataXml.matchAll(/<(?:dc:)?identifier\b([^>]*)>([\s\S]*?)<\/(?:dc:)?identifier\s*>/gi)]
  const isbn = identifierValues.map(match => decodeXml(match[2])).find(value => /(?:97[89][\d\s-]{10,}|\d[\d\s-]{8,}[\dXx])/.test(value))?.replace(/[^\dXx]/g, "")
  const rows: {type:"HEADING"|"PARAGRAPH"; text:string; sectionId:string; sectionTitle?:string; headingLevel?:number}[] = []
  for (const item of opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"[^>]*\/?\s*>/g)) {
    const href = manifest.get(item[1]); if (!href) continue
    const html = entries.get(epubPath(base, href))?.toString("utf8"); if (!html) continue
    const sectionId = `section-${rows.filter(row => row.type === "HEADING").length + 1}`
    for (const element of html.matchAll(/<(h[1-6]|p)\b[^>]*>[\s\S]*?<\/\1>/gi)) {
      const text = decodeXml(element[0]); if (!text) continue
      const heading = element[1].toLowerCase().startsWith("h")
      rows.push({ type: heading ? "HEADING" : "PARAGRAPH", text, sectionId, ...(heading ? { sectionTitle: text, headingLevel: Number(element[1][1]) } : {}) })
    }
  }
  if (!rows.length) throw new Error("No readable text found in this EPUB.")
  let offset = 0
  const blocks = rows.map((row, order) => { const startOffset = offset; offset += row.text.length; const block = { id: `${documentId}:block:${order + 1}`, order, ...row, startOffset, endOffset: offset }; offset++; return block })
  const metadata = { title: metadataValue("title"), author: metadataValue("creator"), description: metadataValue("description"), publisher: metadataValue("publisher"), publishedDate: metadataValue("date"), isbn, language: metadataValue("language"), blockCount: rows.length, extraction: "epub-package" }
  const coverMime = coverItem?.mediaType || "image/jpeg"
  const cover = coverBytes && ["image/jpeg", "image/png", "image/webp"].includes(coverMime) ? { data: coverBytes, mimeType: coverMime } : null
  return { blocks, text: rows.map(row => row.text).join("\n\n"), metadata, cover }
}
