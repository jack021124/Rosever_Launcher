// 把多个 PNG 合并成一个 Windows .ico 文件（PNG-in-ICO 格式）。
// 用法：node make-ico.mjs <输出.ico> <输入1.png> [输入2.png ...]
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2];
const inputs = process.argv.slice(3);

const images = inputs.map((p) => {
  const data = readFileSync(p);
  // PNG header里第16-19字节是宽度，第20-23字节是高度（大端）
  const w = data.readUInt32BE(16);
  const h = data.readUInt32BE(20);
  return { w, h, data };
});

// ICO 文件头：6 字节
const headerSize = 6;
const dirEntrySize = 16; // 每个图片条目 16 字节
const offsetBase = headerSize + dirEntrySize * images.length;

let dataOffset = offsetBase;
const buf = [];
// ICONDIR (6 bytes): reserved(2)=0, type(2)=1(icon), count(2)
const hdr = Buffer.alloc(headerSize);
hdr.writeUInt16LE(0, 0);
hdr.writeUInt16LE(1, 2);
hdr.writeUInt16LE(images.length, 4);
buf.push(hdr);

// ICONDIRENTRY (16 bytes each)
const entries = [];
for (const img of images) {
  const entry = Buffer.alloc(dirEntrySize);
  entry.writeUInt8(img.w >= 256 ? 0 : img.w, 0); // width (0 = 256)
  entry.writeUInt8(img.h >= 256 ? 0 : img.h, 1); // height
  entry.writeUInt8(0, 2);  // color count (0 = >=256)
  entry.writeUInt8(0, 3);  // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(img.data.length, 8); // image size
  entry.writeUInt32LE(dataOffset, 12); // offset
  entries.push(entry);
  dataOffset += img.data.length;
}

buf.push(...entries);
for (const img of images) buf.push(img.data);

writeFileSync(out, Buffer.concat(buf));
console.log(`生成 ${out}，包含 ${images.length} 个尺寸: ${images.map((i) => `${i.w}x${i.h}`).join(', ')}`);
