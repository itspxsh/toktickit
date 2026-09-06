export const MAX_ATTACHMENT_SIZE = 5_242_880;
export const ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function hasValidSignature(extension: string, header: Uint8Array): boolean {
  if (extension === ".png") {
    return Array.from(header.subarray(0, 8)).join(",") === "137,80,78,71,13,10,26,10";
  }
  if (extension === ".pdf") return ascii(header.subarray(0, 5)) === "%PDF-";
  if (extension === ".webp") {
    return ascii(header.subarray(0, 4)) === "RIFF" && ascii(header.subarray(8, 12)) === "WEBP";
  }
  return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

async function readHeader(file: File): Promise<Uint8Array | null> {
  const sliced = file.slice(0, 12) as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof sliced.arrayBuffer === "function") {
    return new Uint8Array(await sliced.arrayBuffer());
  }
  if (typeof FileReader === "undefined") return null;
  return await new Promise<Uint8Array | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(sliced);
  });
}

/** Client-side feedback only; the API remains the authoritative validator. */
export async function validateAttachmentFile(file: File): Promise<string | null> {
  if (file.size < 1 || file.size > MAX_ATTACHMENT_SIZE) {
    return "Attachment must be between 1 byte and 5 MiB.";
  }
  const extension = fileExtension(file.name);
  if (!MIME_BY_EXTENSION[extension] || MIME_BY_EXTENSION[extension] !== file.type) {
    return "Attachment type or signature is not supported.";
  }

  const header = await readHeader(file);
  // If the runtime cannot inspect bytes, leave the authoritative check to the
  // server instead of rejecting a file based on unavailable client APIs.
  if (!header) return null;
  return hasValidSignature(extension, header)
    ? null
    : "Attachment type or signature is not supported.";
}
