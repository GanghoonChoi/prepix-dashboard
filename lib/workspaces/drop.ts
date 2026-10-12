/**
 * What a drop carried, with folders kept: each file and the folder path it
 * sat under ([] for a file dropped on its own). `dataTransfer.files` alone
 * turns a dropped folder into one unreadable pseudo-file.
 *
 * Read the entries synchronously, inside the drop event — the item list is
 * emptied once the handler returns; the entries stay readable after.
 */
export type DroppedFile = { file: File; path: string[] };

export function dropEntries(data: DataTransfer): (FileSystemEntry | File)[] {
  const items = Array.from(data.items ?? []).filter((item) => item.kind === "file");
  // No entry API (or a synthetic drop): plain files, no folders.
  if (!items.length || typeof items[0].webkitGetAsEntry !== "function")
    return Array.from(data.files);
  return items.map((item) => item.webkitGetAsEntry() ?? item.getAsFile()).filter((e): e is FileSystemEntry | File => !!e);
}

// Finder and Explorer litter folders with these; nobody means to upload them.
const JUNK = /^(\.|Thumbs\.db$|desktop\.ini$)/i;

export async function readDrop(entries: (FileSystemEntry | File)[]): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];
  const walk = async (entry: FileSystemEntry, path: string[]) => {
    if (JUNK.test(entry.name)) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ file, path });
      return;
    }
    if (!entry.isDirectory) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const inside = [...path, entry.name];
    // readEntries answers in batches (100 in Chrome) until an empty one.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child, inside);
    }
  };
  for (const entry of entries) {
    if (entry instanceof File) out.push({ file: entry, path: [] });
    else await walk(entry, []);
  }
  return out;
}

/** Folder paths a drop needs, parents before children ("A", then "A/B"). */
export const pathKey = (path: string[]) => path.join("\0");
export function folderPaths(files: DroppedFile[]): string[][] {
  const seen = new Map<string, string[]>();
  for (const { path } of files)
    for (let depth = 1; depth <= path.length; depth++) {
      const part = path.slice(0, depth);
      seen.set(pathKey(part), part);
    }
  return [...seen.values()].sort((a, b) => a.length - b.length);
}
