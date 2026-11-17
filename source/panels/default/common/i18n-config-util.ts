/**
 * @file i18n-config-util.ts
 * @description 多语言配置解析工具：从 luban.conf 的 schema 元配置中解析实际使用的多语言 CSV 源文件
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import { parseCsvRows } from './csv-util';

/** Luban 多语言表的标准输出名 */
const LANGUAGE_OUTPUT_NAME = 'gL10n';

/** 解析 luban.conf：Luban 允许数组/对象末尾的多余逗号，标准 JSON.parse 不接受 */
function parseLubanConf(text: string): any {
    return JSON.parse(text.replace(/^\uFEFF/, '').replace(/,\s*([}\]])/g, '$1'));
}

export class I18nConfigUtil {

    /**
     * 从 luban.conf 中解析出所有多语言 CSV 源文件路径
     * @param workspace 工作区根目录
     * @param confFile luban.conf 路径（相对工作区或绝对路径）
     * @returns CSV 源文件绝对路径列表
     */
    public static resolveCsvFiles(workspace: string, confFile: string): string[] {
        if (!workspace) {
            return [];
        }
        // 未配置时回落到项目标准位置，兼容旧工程
        const cleanConfFile = confFile && confFile.trim() ? confFile.trim() : 'design/配置/多语言/luban.conf';

        const confPath = isAbsolute(cleanConfFile) ? cleanConfFile : join(workspace, cleanConfFile);
        if (!existsSync(confPath)) {
            return [];
        }

        try {
            const conf = parseLubanConf(readFileSync(confPath, 'utf-8'));
            const confDir = dirname(confPath);
            const rawDataDir = typeof conf.dataDir === 'string' ? conf.dataDir.trim() : '';
            const dataDir = rawDataDir
                ? (isAbsolute(rawDataDir) ? rawDataDir : join(confDir, rawDataDir))
                : confDir;

            const schemaFiles: any[] = Array.isArray(conf.schemaFiles) ? conf.schemaFiles : [];
            const schemaNames: string[] = [];
            const csvFiles: string[] = [];

            for (const schema of schemaFiles) {
                const schemaName = typeof schema === 'string' ? schema : schema?.fileName;
                if (typeof schemaName !== 'string' || !schemaName.trim()) {
                    continue;
                }
                const cleanSchemaName = schemaName.trim();
                schemaNames.push(cleanSchemaName);

                // schema 文件名可能相对 conf 目录，也可能相对 dataDir，按存在性依次尝试
                const schemaCandidates = [confDir, dataDir]
                    .map((base) => isAbsolute(cleanSchemaName) ? cleanSchemaName : join(base, cleanSchemaName));
                const schemaPath = schemaCandidates.find((candidate) => existsSync(candidate));
                if (!schemaPath) {
                    continue;
                }

                const rows = parseCsvRows(readFileSync(schemaPath, 'utf-8'));
                let varLineIndex = -1;
                for (let i = 0; i < Math.min(rows.length, 10); i++) {
                    if ((rows[i][0] ?? '').trim().startsWith('##var')) {
                        varLineIndex = i;
                        break;
                    }
                }
                if (varLineIndex === -1) {
                    continue;
                }

                const header = rows[varLineIndex].map((col) => col.trim());
                const inputIndex = header.indexOf('input');
                const outputIndex = header.indexOf('output');
                const groupIndex = header.indexOf('group');
                if (inputIndex === -1) {
                    continue;
                }

                for (let i = varLineIndex + 1; i < rows.length; i++) {
                    const row = rows[i];
                    if ((row[0] ?? '').trim().startsWith('##')) {
                        continue;
                    }
                    // 仅接受多语言表：带语言分组列或输出名为 gL10n
                    const isLanguageTable = groupIndex !== -1 || (row[outputIndex] ?? '').trim() === LANGUAGE_OUTPUT_NAME;
                    if (!isLanguageTable) {
                        continue;
                    }

                    const inputs = (row[inputIndex] ?? '').trim();
                    if (!inputs) {
                        continue;
                    }
                    for (const item of inputs.split(',')) {
                        const csvName = item.trim().replace(/^"|"$/g, '');
                        if (!csvName || !csvName.toLowerCase().endsWith('.csv')) {
                            continue;
                        }
                        const csvPath = isAbsolute(csvName) ? csvName : join(dataDir, csvName);
                        if (existsSync(csvPath) && !csvFiles.includes(csvPath)) {
                            csvFiles.push(csvPath);
                        }
                    }
                }
            }

            if (csvFiles.length > 0) {
                return csvFiles;
            }

            // 兜底：元配置未声明 input 时，扫描数据目录，排除 schema 文件本身
            if (existsSync(dataDir)) {
                return readdirSync(dataDir)
                    .filter((file) => file.toLowerCase().endsWith('.csv') && !schemaNames.includes(file))
                    .map((file) => join(dataDir, file));
            }
        } catch (e) {
            return [];
        }
        return [];
    }
}
