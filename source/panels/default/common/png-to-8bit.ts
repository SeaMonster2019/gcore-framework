/**
 * @file png-to-8bit.ts
 * @description 扩展内 PNG 8bit 索引色压缩核心模块，支持 Spine 预乘图集安全模式
 */

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, parse } from 'path';

const sharp = require('sharp') as typeof import('sharp');

/** PNG 32位(RGBA 8位/通道)转 8位索引色压缩配置选项 */
export interface PngTo8BitOptions {
    /** 调色板最大颜色数 (默认: 256，范围 2~256) */
    colors?: number;
    /** Floyd–Steinberg 抖动强度 0~1 (默认: 1) */
    dither?: number;
    /** 输出目录或指定的目标输出文件路径 */
    output?: string | undefined;
    /** 原地覆写时追加的文件名后缀 (默认: "_8bit") */
    suffix?: string | undefined;
    /** Spine 图集安全模式：auto 自动识别，true 强制开启，false 强制关闭 (默认: auto) */
    spineSafe?: SpineSafeMode | undefined;
}

/** Spine 安全模式配置类型 */
export type SpineSafeMode = boolean | 'auto';

/**************** 公共核心方法  ****************/

/**
 * 将单张 PNG（通常为 RGBA 32位真彩）压缩为 8位索引色 PNG
 * @param inputPath 输入 PNG 文件路径
 * @param options 量化配置
 * @returns 最终输出文件路径
 */
export async function pngTo8Bit(inputPath: string, options: PngTo8BitOptions = {}): Promise<string> {
    const parsed = parse(inputPath);
    const colors = Math.min(256, Math.max(2, options.colors ?? 256));
    const dither = Math.min(1, Math.max(0, options.dither ?? 1));
    const spineSafe = options.spineSafe === undefined || options.spineSafe === 'auto'
        ? isSpineAtlasInput(inputPath)
        : options.spineSafe;

    let outputPath = options.output;
    if (!outputPath) {
        const suffix = options.suffix ?? '_8bit';
        outputPath = join(parsed.dir, `${parsed.name}${suffix}${parsed.ext || '.png'}`);
    } else {
        const isDir = (existsSync(outputPath) && lstatSync(outputPath).isDirectory()) || !parse(outputPath).ext;
        if (isDir) {
            if (!existsSync(outputPath)) {
                mkdirSync(outputPath, { recursive: true });
            }
            outputPath = join(outputPath, `${parsed.name}${parsed.ext || '.png'}`);
        }
    }

    const parentDir = dirname(outputPath);
    if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
    }

    // 先读入 Buffer，确保支持同名原地覆写
    let imageBuffer = await sharp(inputPath).png().toBuffer();
    if (spineSafe) {
        // Spine 图集是预乘数据，量化前先还原成直乘数据
        imageBuffer = await unpremultiplyPng(imageBuffer);
    }

    // palette: true 启用索引色量化；colors/dither 控制调色板规模与抖动
    let outBuffer = await sharp(imageBuffer)
        .png({ palette: true, colors, dither })
        .toBuffer();

    if (spineSafe) {
        // 直接修正调色板，避免二次量化再次污染 A=0 的 RGB
        outBuffer = premultiplyIndexedPalette(outBuffer);
    }

    writeFileSync(outputPath, outBuffer);
    return outputPath;
}

/**
 * 批量将目录或文件列表中的 PNG 压缩为 8位索引色
 * @param inputs 文件或目录列表
 * @param options 量化配置
 * @returns 成功输出的文件路径列表
 */
export async function batchPngTo8Bit(inputs: string[], options: PngTo8BitOptions = {}): Promise<string[]> {
    const results: string[] = [];
    const validExtensions = new Set(['.png']);

    for (const input of inputs) {
        if (!existsSync(input)) {
            console.warn(`文件或目录不存在: ${input}`);
            continue;
        }

        const stat = lstatSync(input);
        if (stat.isDirectory()) {
            for (const file of readdirSync(input)) {
                if (validExtensions.has(parse(file).ext.toLowerCase())) {
                    results.push(await pngTo8Bit(join(input, file), options));
                }
            }
        } else {
            results.push(await pngTo8Bit(input, options));
        }
    }

    return results;
}

/**
 * 判断输入文件/目录是否像 Spine 图集
 * @param inputPath PNG 文件或包含 PNG 的目录
 * @returns 是否为 Spine 图集输入
 */
export function isSpineAtlasInput(inputPath: string): boolean {
    if (!existsSync(inputPath)) {
        return false;
    }

    if (lstatSync(inputPath).isDirectory()) {
        return readdirSync(inputPath).some(file => file.toLowerCase().endsWith('.atlas'));
    }

    if (parse(inputPath).ext.toLowerCase() !== '.png') {
        return false;
    }

    const dir = dirname(inputPath);
    const targetName = parse(inputPath).base.toLowerCase();
    const atlasFiles = readdirSync(dir).filter(file => file.toLowerCase().endsWith('.atlas'));

    for (const atlasFile of atlasFiles) {
        if (parse(atlasFile).name.toLowerCase() === parse(inputPath).name.toLowerCase()) {
            return true;
        }
        if (readSpineAtlasPages(join(dir, atlasFile)).some(page => page.toLowerCase() === targetName)) {
            return true;
        }
    }

    return false;
}

/**************** 私有辅助方法  ****************/

/**
 * 读取 Spine .atlas 中声明的页面 PNG 文件名
 * @param atlasPath .atlas 文件路径
 * @returns 页面 PNG 文件名列表
 */
function readSpineAtlasPages(atlasPath: string): string[] {
    try {
        const pages: string[] = [];
        const lines = readFileSync(atlasPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
            if (!line.trim() || /^\s/.test(line) || line.includes(':')) {
                continue;
            }
            const page = parse(line.trim()).base;
            if (page) {
                pages.push(page);
            }
        }
        return pages;
    } catch {
        return [];
    }
}

/**
 * 将预乘 Alpha PNG 还原为直乘 Alpha PNG，供 libimagequant 量化使用
 * @param pngBuffer 原始 PNG Buffer
 * @returns 直乘 Alpha PNG Buffer
 */
async function unpremultiplyPng(pngBuffer: Buffer): Promise<Buffer> {
    const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3]!;
        if (alpha === 0) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            continue;
        }
        if (alpha === 255) {
            continue;
        }
        const factor = 255 / alpha;
        data[i] = Math.min(255, Math.round(data[i]! * factor));
        data[i + 1] = Math.min(255, Math.round(data[i + 1]! * factor));
        data[i + 2] = Math.min(255, Math.round(data[i + 2]! * factor));
    }

    return sharp(data, {
        raw: { width: info.width, height: info.height, channels: 4 },
    }).png().toBuffer();
}

/** PNG Chunk 信息 */
interface PngChunkInfo {
    /** Chunk 起始偏移 */
    offset: number;
    /** Chunk 类型 */
    type: string;
    /** Chunk 数据 */
    data: Buffer;
    /** CRC 字段偏移 */
    crcOffset: number;
}

/**
 * 解析 PNG 的 Chunk 列表
 * @param pngBuffer PNG Buffer
 * @returns Chunk 列表
 */
function readPngChunks(pngBuffer: Buffer): PngChunkInfo[] {
    const chunks: PngChunkInfo[] = [];
    let offset = 8;

    while (offset + 12 <= pngBuffer.length) {
        const length = pngBuffer.readUInt32BE(offset);
        const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const crcOffset = dataStart + length;
        chunks.push({
            offset,
            type,
            data: pngBuffer.subarray(dataStart, crcOffset),
            crcOffset,
        });
        offset = crcOffset + 4;
        if (type === 'IEND') {
            break;
        }
    }

    return chunks;
}

/**
 * 按 tRNS Alpha 重新预乘索引 PNG 的 PLTE 调色板
 * @param pngBuffer 索引色 PNG Buffer
 * @returns 修正后的 PNG Buffer
 */
function premultiplyIndexedPalette(pngBuffer: Buffer): Buffer {
    const chunks = readPngChunks(pngBuffer);
    const plte = chunks.find(chunk => chunk.type === 'PLTE');
    if (!plte) {
        return pngBuffer;
    }
    const trns = chunks.find(chunk => chunk.type === 'tRNS');

    const outBuffer = Buffer.from(pngBuffer);
    const palette = Buffer.from(plte.data);
    const colorCount = Math.floor(palette.length / 3);

    for (let i = 0; i < colorCount; i++) {
        const alpha = trns && i < trns.data.length ? trns.data[i]! : 255;
        const r = palette[i * 3]!;
        const g = palette[i * 3 + 1]!;
        const b = palette[i * 3 + 2]!;
        palette[i * 3] = Math.round(r * alpha / 255);
        palette[i * 3 + 1] = Math.round(g * alpha / 255);
        palette[i * 3 + 2] = Math.round(b * alpha / 255);
    }

    palette.copy(outBuffer, plte.offset + 8);
    const crc = crc32(Buffer.concat([Buffer.from('PLTE', 'ascii'), palette]));
    outBuffer.writeUInt32BE(crc, plte.crcOffset);
    return outBuffer;
}

/**
 * 计算 PNG Chunk 所需的 CRC32
 * @param buffer 待校验 Buffer
 * @returns CRC32 数值
 */
function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** CRC32 查表 */
const CRC32_TABLE = createCrc32Table();

/**
 * 创建 CRC32 查表
 * @returns CRC32 查表
 */
function createCrc32Table(): Uint32Array {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let value = n;
        for (let k = 0; k < 8; k++) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[n] = value >>> 0;
    }
    return table;
}
