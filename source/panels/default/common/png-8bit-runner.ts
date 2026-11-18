/**
 * @file png-8bit-runner.ts
 * @description PNG 快速 8bit 转换执行器：扫描非索引色 PNG、按图集类型区分 Spine 安全/普通模式，并调用 png-to-8bit.ts
 */

import { existsSync, openSync, readSync, closeSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import { pngTo8Bit } from './png-to-8bit';
import { resolvePathForExec } from './path-util';
import { LogCallback } from './types';

/** PNG 签名 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG 转换模式 */
export type Png8BitMode = 'spine' | 'plist';

/** 待转换 PNG 信息 */
export interface Png8BitCandidate {
    /** PNG 绝对路径 */
    filePath: string;
    /** 相对工程根目录的路径 */
    relativePath: string;
    /** 转换模式 */
    mode: Png8BitMode;
    /** 命中的配套文件说明 */
    reason: string;
    /** PNG 宽度 */
    width: number;
    /** PNG 高度 */
    height: number;
    /** IHDR 位深 */
    bitDepth: number;
    /** IHDR 颜色类型 */
    colorType: number;
    /** 文件体积（字节） */
    fileSize: number;
}

/** PNG 8bit 转换结果统计 */
export interface Png8BitConvertResult {
    /** 成功数量 */
    success: number;
    /** 失败数量 */
    failed: number;
    /** 转换前总字节数 */
    beforeBytes: number;
    /** 转换后总字节数 */
    afterBytes: number;
}

/** PNG IHDR 信息 */
interface PngHeaderInfo {
    width: number;
    height: number;
    bitDepth: number;
    colorType: number;
}

/**************** 公共核心方法  ****************/

/**
 * 扫描目标文件或文件夹，收集符合转换条件的 PNG
 * @param targetPath 目标文件或文件夹绝对路径
 * @param workspace 工程根目录
 * @returns 待转换 PNG 列表
 */
export function collectPng8BitCandidates(targetPath: string, workspace: string): Png8BitCandidate[] {
    const targetAbs = resolvePathForExec(targetPath, workspace);
    const candidates: Png8BitCandidate[] = [];

    if (!existsSync(targetAbs)) {
        return candidates;
    }

    const targetStat = statSync(targetAbs);

    if (targetStat.isFile()) {
        if (/\.png$/i.test(targetAbs)) {
            const candidate = buildCandidate(targetAbs, workspace);
            if (candidate) candidates.push(candidate);
        }
        return candidates;
    }

    if (targetStat.isDirectory()) {
        scanDirectory(targetAbs, workspace, candidates);
    }

    return candidates.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * 生成预览文本
 * @param candidates 待转换 PNG 列表
 * @returns 预览文本
 */
export function formatPng8BitPreview(candidates: Png8BitCandidate[]): string {
    if (candidates.length === 0) {
        return '未发现需要转换的 PNG。\n条件：非索引色 PNG，且同目录存在同名 .json/.atlas（Spine 安全模式）或同名 .plist（普通模式）。';
    }

    const spineCount = candidates.filter(item => item.mode === 'spine').length;
    const plistCount = candidates.filter(item => item.mode === 'plist').length;
    const lines = [
        `共 ${candidates.length} 张待转换：Spine 安全模式 ${spineCount} 张，普通图集模式 ${plistCount} 张。`,
        '',
    ];

    for (const item of candidates) {
        const modeText = item.mode === 'spine' ? 'Spine安全' : '普通图集';
        const sizeText = `${item.width}x${item.height}`;
        const kbText = (item.fileSize / 1024).toFixed(1);
        lines.push(`[${modeText}] ${item.relativePath} | ${sizeText} | IHDR bitDepth=${item.bitDepth} colorType=${item.colorType} | ${kbText}KB | 命中: ${item.reason}`);
    }

    return lines.join('\n');
}

/**
 * 格式化文件体积
 * @param bytes 字节数
 * @returns 人类可读体积文本
 */
export function formatPng8BitSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 格式化体积变化百分比
 * @param beforeBytes 转换前字节数
 * @param afterBytes 转换后字节数
 * @returns 体积变化文本
 */
export function formatPng8BitReduction(beforeBytes: number, afterBytes: number): string {
    if (beforeBytes <= 0) return '减少 0.0%';
    const percent = (1 - afterBytes / beforeBytes) * 100;
    return percent >= 0
        ? `减少 ${percent.toFixed(1)}%`
        : `增加 ${Math.abs(percent).toFixed(1)}%`;
}

/**
 * 批量执行 8bit 转换
 * @param candidates 待转换 PNG 列表
 * @param workspace 工程根目录
 * @param appendLog 日志回调
 * @returns 转换成功失败数量与体积统计
 */
export async function convertPng8Bit(
    candidates: Png8BitCandidate[],
    workspace: string,
    appendLog: LogCallback
): Promise<Png8BitConvertResult> {
    let success = 0;
    let failed = 0;
    let beforeBytes = 0;
    let afterBytes = 0;

    for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i]!;
        const absPath = resolvePathForExec(item.filePath, workspace);
        const outDir = dirname(absPath);
        const modeText = item.mode === 'spine' ? 'Spine安全' : '普通图集';
        const fileBefore = statSync(absPath).size;

        try {
            await pngTo8Bit(absPath, {
                colors: 256,
                dither: 1,
                output: outDir,
                spineSafe: item.mode === 'spine',
            });
            const fileAfter = statSync(absPath).size;
            success++;
            beforeBytes += fileBefore;
            afterBytes += fileAfter;

            appendLog(
                `[${i + 1}/${candidates.length}] ${modeText} ${item.relativePath} | ${formatPng8BitSize(fileBefore)} → ${formatPng8BitSize(fileAfter)} | ${formatPng8BitReduction(fileBefore, fileAfter)}`,
                'info'
            );
        } catch (e: any) {
            appendLog(`[${i + 1}/${candidates.length}] ${modeText} 转换失败: ${item.relativePath} - ${e?.message ?? String(e)}`, 'error');
            failed++;
        }
    }

    return { success, failed, beforeBytes, afterBytes };
}

/**************** 私有辅助方法  ****************/

/**
 * 递归扫描目录中的 PNG
 * @param dir 当前目录
 * @param workspace 工程根目录
 * @param candidates 结果列表
 */
function scanDirectory(dir: string, workspace: string, candidates: Png8BitCandidate[]): void {
    let entries: any[] = [];
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch (_) {
        return;
    }

    for (const entry of entries) {
        const fullPath = join(dir, entry.name.toString());
        if (entry.isDirectory()) {
            scanDirectory(fullPath, workspace, candidates);
        } else if (entry.isFile() && /\.png$/i.test(entry.name.toString())) {
            const candidate = buildCandidate(fullPath, workspace);
            if (candidate) candidates.push(candidate);
        }
    }
}

/**
 * 构建单个 PNG 的候选信息，不符合条件时返回 null
 * @param filePath PNG 绝对路径
 * @param workspace 工程根目录
 * @returns 候选信息或 null
 */
function buildCandidate(filePath: string, workspace: string): Png8BitCandidate | null {
    const header = readPngHeader(filePath);
    if (!header) {
        return null;
    }

    // colorType=3 为索引色 PNG，已经是 8bit/调色板图，直接跳过
    if (header.colorType === 3) {
        return null;
    }

    const dir = dirname(filePath);
    const baseName = basename(filePath).replace(/\.png$/i, '');
    const matched: string[] = [];

    if (existsSync(join(dir, `${baseName}.json`))) matched.push('.json');
    if (existsSync(join(dir, `${baseName}.atlas`))) matched.push('.atlas');

    let mode: Png8BitMode | null = null;
    if (matched.length > 0) {
        mode = 'spine';
    } else if (existsSync(join(dir, `${baseName}.plist`))) {
        mode = 'plist';
        matched.push('.plist');
    }

    if (!mode) {
        return null;
    }

    return {
        filePath: resolve(filePath),
        relativePath: relative(workspace, filePath).replace(/\\/g, '/'),
        mode,
        reason: matched.join(' / '),
        width: header.width,
        height: header.height,
        bitDepth: header.bitDepth,
        colorType: header.colorType,
        fileSize: statSync(filePath).size,
    };
}

/**
 * 读取 PNG 的 IHDR 信息
 * @param filePath PNG 路径
 * @returns IHDR 信息或 null
 */
function readPngHeader(filePath: string): PngHeaderInfo | null {
    let fd: number | null = null;
    try {
        fd = openSync(filePath, 'r');
        const buffer = Buffer.alloc(29);
        const bytesRead = readSync(fd, buffer, 0, 29, 0);
        if (bytesRead < 29) return null;
        if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
        if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;

        return {
            width: buffer.readUInt32BE(16),
            height: buffer.readUInt32BE(20),
            bitDepth: buffer[24]!,
            colorType: buffer[25]!,
        };
    } catch (_) {
        return null;
    } finally {
        if (fd !== null) {
            try {
                closeSync(fd);
            } catch (_) {}
        }
    }
}
