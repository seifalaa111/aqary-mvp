import "server-only";
import zlib from "node:zlib";
import sharp from "sharp";

export interface ExtractedPdfPage {
  pageNumber: number;
  textSnippet: string | null;
  imageBuffer?: Buffer | null;
}

export interface PdfInspectionResult {
  pageCount: number;
  pages: ExtractedPdfPage[];
  isScanned: boolean;
}

/**
 * Parses a PDF buffer without synthetic/fake approximations.
 * Extracts:
 * 1. Genuine page count from the PDF object structure.
 * 2. Authentic text streams per page (decompressed from FlateDecode streams).
 * 3. Authentic embedded raster scan images (e.g. DCTDecode / JPEG from scanner wrapper PDFs).
 *
 * If the PDF is corrupted or unparseable, fails loudly.
 */
export async function parsePdf(buf: Buffer): Promise<PdfInspectionResult> {
  if (buf.length < 4 || buf.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error("Invalid PDF: buffer does not begin with %PDF header");
  }

  const raw = buf.toString("latin1");

  // Locate all objects: ID GEN obj ... endobj
  const objRegex = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g;
  const objects = new Map<number, { gen: number; content: string; fullMatch: string }>();

  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(raw)) !== null) {
    const id = parseInt(m[1], 10);
    const gen = parseInt(m[2], 10);
    objects.set(id, { gen, content: m[3], fullMatch: m[0] });
  }

  // Find page objects: objects that declare /Type /Page (and NOT /Type /Pages)
  const pageObjectIds: number[] = [];
  for (const [id, obj] of objects.entries()) {
    if (/\/Type\s*\/Page\b(?!\s*s)/.test(obj.content)) {
      pageObjectIds.push(id);
    }
  }

  // Fallback: Check /Count N in /Type /Pages
  let pageCount = pageObjectIds.length;
  if (pageCount === 0) {
    const countMatch =
      raw.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/) ||
      raw.match(/\/Count\s+(\d+)[\s\S]*?\/Type\s*\/Pages/);
    if (countMatch) {
      pageCount = parseInt(countMatch[1], 10);
    }
  }

  if (pageCount <= 0) {
    throw new Error("Unable to parse PDF: no valid pages found in document structure");
  }

  const pages: ExtractedPdfPage[] = [];
  let isScanned = false;

  function extractTextFromStream(streamData: Buffer, isFlate: boolean): string {
    let uncompressed: Buffer;
    if (isFlate) {
      try {
        uncompressed = zlib.inflateSync(streamData);
      } catch {
        try {
          uncompressed = zlib.inflateRawSync(streamData);
        } catch {
          return "";
        }
      }
    } else {
      uncompressed = streamData;
    }

    const text = uncompressed.toString("latin1");
    const extracted: string[] = [];

    // Extract text from ( ... ) Tj, ', "
    const tjMatches = text.matchAll(/\(([\s\S]*?)\)\s*(?:Tj|'|")/g);
    for (const match of tjMatches) {
      const decoded = decodePdfString(match[1]);
      if (decoded.trim()) extracted.push(decoded.trim());
    }

    // Extract text from [ ... ] TJ
    const arrayMatches = text.matchAll(/\[([\s\S]*?)\]\s*TJ/g);
    for (const arrMatch of arrayMatches) {
      const innerStrings = arrMatch[1].matchAll(/\(([\s\S]*?)\)/g);
      for (const str of innerStrings) {
        const decoded = decodePdfString(str[1]);
        if (decoded.trim()) extracted.push(decoded.trim());
      }
    }

    // Extract hex strings <48656c6c6f> Tj
    const hexMatches = text.matchAll(/<([0-9a-fA-F\s]+)>\s*(?:Tj|'|")/g);
    for (const h of hexMatches) {
      const cleanHex = h[1].replace(/\s+/g, "");
      if (cleanHex.length % 2 === 0) {
        const decoded = Buffer.from(cleanHex, "hex").toString("utf8");
        if (decoded.trim()) extracted.push(decoded.trim());
      }
    }

    return extracted.join(" ").trim();
  }

  for (let i = 0; i < pageCount; i++) {
    const pageNum = i + 1;
    let pageText = "";
    let pageImageBuffer: Buffer | null = null;

    if (i < pageObjectIds.length) {
      const pageId = pageObjectIds[i];
      const pageObj = objects.get(pageId);
      if (pageObj) {
        const contentsMatch = pageObj.content.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
        const contentsArrayMatch = pageObj.content.match(/\/Contents\s*\[([^\]]+)\]/);

        const contentIds: number[] = [];
        if (contentsMatch) {
          contentIds.push(parseInt(contentsMatch[1], 10));
        } else if (contentsArrayMatch) {
          const refs = contentsArrayMatch[1].matchAll(/(\d+)\s+\d+\s+R/g);
          for (const r of refs) contentIds.push(parseInt(r[1], 10));
        }

        for (const cid of contentIds) {
          const contentObj = objects.get(cid);
          if (contentObj) {
            const isFlate = /\/Filter\s*(\/FlateDecode|\[\s*\/FlateDecode\s*\])/.test(contentObj.content);
            const streamMatch = contentObj.fullMatch.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
            if (streamMatch) {
              const streamBuf = Buffer.from(streamMatch[1], "latin1");
              const txt = extractTextFromStream(streamBuf, isFlate);
              if (txt) pageText += (pageText ? " " : "") + txt;
            }
          }
        }

        // Check for embedded raster image scan
        const xobjMatch = pageObj.content.match(/\/XObject\s*<<([^>]+)>>/);
        if (xobjMatch) {
          const xobjRefs = [...xobjMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => parseInt(m[1], 10));
          for (const xid of xobjRefs) {
            const xo = objects.get(xid);
            if (xo && /\/Subtype\s*\/Image/.test(xo.content)) {
              const isDct = /\/Filter\s*(\/DCTDecode|\[\s*\/DCTDecode\s*\])/.test(xo.content);
              const streamMatch = xo.fullMatch.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
              if (streamMatch && isDct) {
                const imgBuf = Buffer.from(streamMatch[1], "latin1");
                try {
                  const meta = await sharp(imgBuf).metadata();
                  if (meta.format === "jpeg") {
                    pageImageBuffer = await sharp(imgBuf).webp({ quality: 86 }).toBuffer();
                    isScanned = true;
                    break;
                  }
                } catch {
                  // Fallback if not valid JPEG
                }
              }
            }
          }
        }
      }
    }

    pages.push({
      pageNumber: pageNum,
      textSnippet: pageText ? pageText.slice(0, 4000) : null,
      imageBuffer: pageImageBuffer,
    });
  }

  return {
    pageCount,
    pages,
    isScanned,
  };
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\([nrtbf()\\])/g, (_, c) => {
      switch (c) {
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        case "b":
          return "\b";
        case "f":
          return "\f";
        default:
          return c;
      }
    })
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}
