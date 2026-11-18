/**
 * @file tools-panel.ts
 * @description 小工具集合分面板控制器，提供 .meta 无效文件扫描清理、预制体/场景图集引用自动修复等辅助工具
 */

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { bindPickerBtn, queryElement } from '../common/dom-util';
import { escapeHtml, normalizePathForStorage, resolvePathForExec } from '../common/path-util';
import {
    collectPng8BitCandidates,
    convertPng8Bit,
    formatPng8BitPreview,
    formatPng8BitReduction,
    formatPng8BitSize,
} from '../common/png-8bit-runner';
import { StorageMgr } from '../common/storage-mgr';
import { PanelContext } from '../common/types';

/** 图集索引信息 */
interface AtlasFrameInfo {
    atlasUuid: string;
    atlasName: string;
    atlasRelPath: string;
    atlasType: 'plist' | 'auto-atlas';
}

/** 精灵未绑定检测结果 */
interface SpriteUnboundResult {
    filePath: string;
    relativePath: string;
    nodeName: string;
    nodePath: string;
    nodeId: number | null;
    reason: string;
}

export class ToolsPanel {
    private context: PanelContext;

    // 工具 1：.meta 清理控制节点
    private metaCleanDirInp: HTMLInputElement | null = null;
    private metaCleanDirBtn: HTMLButtonElement | null = null;
    private cleanMetaBtn: HTMLButtonElement | null = null;

    // 工具 2：图集引用修复控制节点
    private atlasTargetLocInp: HTMLInputElement | null = null;
    private atlasTargetCurrentBtn: HTMLButtonElement | null = null;
    private atlasTargetFileBtn: HTMLButtonElement | null = null;
    private atlasTargetDirBtn: HTMLButtonElement | null = null;
    private previewFixAtlasBtn: HTMLButtonElement | null = null;
    private fixAtlasBtn: HTMLButtonElement | null = null;

    // 工具 3：PNG 快速 8bit 转换控制节点
    private png8bitTargetInp: HTMLInputElement | null = null;
    private png8bitFileBtn: HTMLButtonElement | null = null;
    private png8bitDirBtn: HTMLButtonElement | null = null;
    private previewPng8bitBtn: HTMLButtonElement | null = null;
    private runPng8bitBtn: HTMLButtonElement | null = null;

    // 工具 4：精灵图集缺失检测控制节点
    private spriteUnboundTargetInp: HTMLInputElement | null = null;
    private spriteUnboundCheckFileBtn: HTMLButtonElement | null = null;
    private spriteUnboundCheckDirBtn: HTMLButtonElement | null = null;
    private scanSpriteUnboundBtn: HTMLButtonElement | null = null;
    private clearSpriteUnboundResultBtn: HTMLButtonElement | null = null;
    private spriteUnboundResultBox: HTMLElement | null = null;
    private spriteUnboundResults: SpriteUnboundResult[] = [];

    constructor(context: PanelContext) {
        this.context = context;
    }

    /**
     * 初始化小工具分面板节点与事件监听
     */
    public init(): void {
        const { panel, workspace, appendLog, setAllButtonsDisabled } = this.context;
        const state = StorageMgr.loadState(workspace);

        // ==================== 工具 1：.meta 清理 ====================
        this.metaCleanDirInp = (panel.$ && panel.$.metaCleanDir) || queryElement<HTMLInputElement>(panel, '#meta-clean-dir');
        this.metaCleanDirBtn = (panel.$ && panel.$.metaCleanDirBtn) || queryElement<HTMLButtonElement>(panel, '#meta-clean-dir-btn');
        this.cleanMetaBtn = (panel.$ && panel.$.cleanMetaBtn) || queryElement<HTMLButtonElement>(panel, '#clean-meta-btn');

        if (this.metaCleanDirInp) this.metaCleanDirInp.value = state.metaCleanDir || '';

        if (this.metaCleanDirInp) {
            this.metaCleanDirInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.metaCleanDirInp!.value, workspace);
                StorageMgr.saveState({ metaCleanDir: val }, workspace);
            });
        }

        bindPickerBtn(
            this.metaCleanDirBtn,
            this.metaCleanDirInp,
            '选择需要清理 .meta 文件的目标文件夹',
            'directory',
            workspace,
            (val) => StorageMgr.saveState({ metaCleanDir: val }, workspace),
            appendLog
        );

        if (this.cleanMetaBtn) {
            this.cleanMetaBtn.addEventListener('click', () => {
                setAllButtonsDisabled(true);
                try {
                    this.executeMetaClean();
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        // ==================== 工具 2：预制体/场景图集引用自动修复 ====================
        this.atlasTargetLocInp = (panel.$ && panel.$.atlasTargetLoc) || queryElement<HTMLInputElement>(panel, '#atlas-target-loc');
        this.atlasTargetCurrentBtn = (panel.$ && panel.$.atlasTargetCurrentBtn) || queryElement<HTMLButtonElement>(panel, '#atlas-target-current-btn');
        this.atlasTargetFileBtn = (panel.$ && panel.$.atlasTargetFileBtn) || queryElement<HTMLButtonElement>(panel, '#atlas-target-file-btn');
        this.atlasTargetDirBtn = (panel.$ && panel.$.atlasTargetDirBtn) || queryElement<HTMLButtonElement>(panel, '#atlas-target-dir-btn');
        this.previewFixAtlasBtn = (panel.$ && panel.$.previewFixAtlasBtn) || queryElement<HTMLButtonElement>(panel, '#preview-fix-atlas-btn');
        this.fixAtlasBtn = (panel.$ && panel.$.fixAtlasBtn) || queryElement<HTMLButtonElement>(panel, '#fix-atlas-btn');

        if (this.atlasTargetLocInp) this.atlasTargetLocInp.value = state.atlasTargetLocation || '';

        if (this.atlasTargetLocInp) {
            this.atlasTargetLocInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.atlasTargetLocInp!.value, workspace);
                StorageMgr.saveState({ atlasTargetLocation: val }, workspace);
            });
        }

        if (this.atlasTargetCurrentBtn) {
            this.atlasTargetCurrentBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.selectCurrentEditingAsset();
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        bindPickerBtn(
            this.atlasTargetFileBtn,
            this.atlasTargetLocInp,
            '选择目标预制体或场景文件 (.prefab / .scene)',
            'file',
            workspace,
            (val) => StorageMgr.saveState({ atlasTargetLocation: val }, workspace),
            appendLog,
            [
                { name: 'Prefab / Scene (*.prefab, *.scene)', extensions: ['prefab', 'scene', 'PREFAB', 'SCENE'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        bindPickerBtn(
            this.atlasTargetDirBtn,
            this.atlasTargetLocInp,
            '选择包含预制体或场景的目标文件夹',
            'directory',
            workspace,
            (val) => StorageMgr.saveState({ atlasTargetLocation: val }, workspace),
            appendLog
        );

        if (this.previewFixAtlasBtn) {
            this.previewFixAtlasBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.executeAtlasReferenceFix(true);
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        if (this.fixAtlasBtn) {
            this.fixAtlasBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.executeAtlasReferenceFix(false);
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        // ==================== 工具 3：PNG 快速 8bit 转换 ====================
        this.png8bitTargetInp = (panel.$ && panel.$.png8bitTarget) || queryElement<HTMLInputElement>(panel, '#png-8bit-target');
        this.png8bitFileBtn = (panel.$ && panel.$.png8bitFileBtn) || queryElement<HTMLButtonElement>(panel, '#png-8bit-file-btn');
        this.png8bitDirBtn = (panel.$ && panel.$.png8bitDirBtn) || queryElement<HTMLButtonElement>(panel, '#png-8bit-dir-btn');
        this.previewPng8bitBtn = (panel.$ && panel.$.previewPng8bitBtn) || queryElement<HTMLButtonElement>(panel, '#preview-png-8bit-btn');
        this.runPng8bitBtn = (panel.$ && panel.$.runPng8bitBtn) || queryElement<HTMLButtonElement>(panel, '#run-png-8bit-btn');

        if (this.png8bitTargetInp) this.png8bitTargetInp.value = state.png8bitTarget || '';

        if (this.png8bitTargetInp) {
            this.png8bitTargetInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.png8bitTargetInp!.value, workspace);
                StorageMgr.saveState({ png8bitTarget: val }, workspace);
            });
        }

        bindPickerBtn(
            this.png8bitFileBtn,
            this.png8bitTargetInp,
            '选择需要转换的 PNG 文件',
            'file',
            workspace,
            (val) => StorageMgr.saveState({ png8bitTarget: val }, workspace),
            appendLog,
            [
                { name: 'PNG (*.png)', extensions: ['png', 'PNG'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        bindPickerBtn(
            this.png8bitDirBtn,
            this.png8bitTargetInp,
            '选择包含 PNG 的目标文件夹（递归扫描）',
            'directory',
            workspace,
            (val) => StorageMgr.saveState({ png8bitTarget: val }, workspace),
            appendLog
        );

        if (this.previewPng8bitBtn) {
            this.previewPng8bitBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.executePng8Bit(true);
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        if (this.runPng8bitBtn) {
            this.runPng8bitBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.executePng8Bit(false);
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        // ==================== 工具 4：精灵图集缺失检测 ====================
        this.spriteUnboundTargetInp = (panel.$ && panel.$.spriteUnboundTarget) || queryElement<HTMLInputElement>(panel, '#sprite-unbound-target');
        this.spriteUnboundCheckFileBtn = (panel.$ && panel.$.spriteUnboundFileBtn) || queryElement<HTMLButtonElement>(panel, '#sprite-unbound-file-btn');
        this.spriteUnboundCheckDirBtn = (panel.$ && panel.$.spriteUnboundDirBtn) || queryElement<HTMLButtonElement>(panel, '#sprite-unbound-dir-btn');
        this.scanSpriteUnboundBtn = (panel.$ && panel.$.scanSpriteUnboundBtn) || queryElement<HTMLButtonElement>(panel, '#scan-sprite-unbound-btn');
        this.clearSpriteUnboundResultBtn = (panel.$ && panel.$.clearSpriteUnboundResultBtn) || queryElement<HTMLButtonElement>(panel, '#clear-sprite-unbound-result-btn');
        this.spriteUnboundResultBox = (panel.$ && panel.$.spriteUnboundResultBox) || queryElement<HTMLElement>(panel, '#sprite-unbound-result-box');

        if (this.spriteUnboundTargetInp) this.spriteUnboundTargetInp.value = state.spriteUnboundTarget || '';

        if (this.spriteUnboundTargetInp) {
            this.spriteUnboundTargetInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.spriteUnboundTargetInp!.value, workspace);
                StorageMgr.saveState({ spriteUnboundTarget: val }, workspace);
            });
        }

        bindPickerBtn(
            this.spriteUnboundCheckFileBtn,
            this.spriteUnboundTargetInp,
            '选择目标预制体或场景文件 (.prefab / .scene)',
            'file',
            workspace,
            (val) => StorageMgr.saveState({ spriteUnboundTarget: val }, workspace),
            appendLog,
            [
                { name: 'Prefab / Scene (*.prefab, *.scene)', extensions: ['prefab', 'scene', 'PREFAB', 'SCENE'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        bindPickerBtn(
            this.spriteUnboundCheckDirBtn,
            this.spriteUnboundTargetInp,
            '选择包含预制体或场景的目标文件夹',
            'directory',
            workspace,
            (val) => StorageMgr.saveState({ spriteUnboundTarget: val }, workspace),
            appendLog
        );

        if (this.scanSpriteUnboundBtn) {
            this.scanSpriteUnboundBtn.addEventListener('click', () => {
                setAllButtonsDisabled(true);
                try {
                    this.executeSpriteUnboundCheck();
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        if (this.clearSpriteUnboundResultBtn) {
            this.clearSpriteUnboundResultBtn.addEventListener('click', () => {
                this.spriteUnboundResults = [];
                this.renderSpriteUnboundResults();
                appendLog('已清空精灵图集缺失检测结果。', 'info');
            });
        }

        this.renderSpriteUnboundResults();
    }

    /**
     * 自动查询当前处于打开/编辑模式下的场景 (.scene) 或预制体 (.prefab) 路径并填入输入框
     */
    private async selectCurrentEditingAsset(): Promise<void> {
        const { workspace, appendLog } = this.context;
        appendLog('正在查询 Cocos 编辑器当前打开的场景/预制体文件...', 'info');

        let targetUuid: string | null = null;
        let diagInfo = '';

        try {
            if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
                const res: any = await Editor.Message.request('scene', 'execute-scene-script', {
                    name: 'gcore-framework',
                    method: 'getCurrentEditingAssetUuid',
                    args: [],
                });
                if (res && res.uuid) {
                    targetUuid = res.uuid;
                } else if (res && res.error) {
                    diagInfo = res.error;
                }
            }
        } catch (e: any) {
            console.warn('[ToolsPanel] 查询场景脚本当前编辑 UUID 异常:', e);
        }

        if (!targetUuid) {
            try {
                if (typeof Editor !== 'undefined' && Editor.Selection && typeof Editor.Selection.getSelected === 'function') {
                    const selectedAssets = Editor.Selection.getSelected('asset');
                    if (selectedAssets && selectedAssets.length > 0) {
                        for (const sUuid of selectedAssets) {
                            const info: any = await Editor.Message.request('asset-db', 'query-asset-info', sUuid);
                            if (info && info.url && (info.url.endsWith('.prefab') || info.url.endsWith('.scene'))) {
                                targetUuid = sUuid;
                                appendLog(`[自动感知] 检测到在资源管理器中选中了预制体/场景: ${info.url}`, 'info');
                                break;
                            }
                        }
                    }
                }
            } catch (e: any) {
                console.warn('[ToolsPanel] Selection fallback 查询异常:', e);
            }
        }

        if (targetUuid) {
            try {
                let assetUrl = '';
                if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
                    const info: any = await Editor.Message.request('asset-db', 'query-asset-info', targetUuid);
                    if (info && info.url) {
                        assetUrl = info.url;
                    } else {
                        const urlRes = await Editor.Message.request('asset-db', 'query-url', targetUuid);
                        assetUrl = urlRes || '';
                    }
                }

                if (assetUrl) {
                    let cleanRel = assetUrl.replace(/^db:\/\//, '').replace(/^assets\//, '');
                    cleanRel = 'assets/' + cleanRel;

                    if (this.atlasTargetLocInp) {
                        this.atlasTargetLocInp.value = cleanRel;
                    }
                    StorageMgr.saveState({ atlasTargetLocation: cleanRel }, workspace);
                    appendLog(`[定位成功] 已自动选中当前打开/选中的资源文件: ${cleanRel}`, 'success');
                    return;
                }
            } catch (e) {
                appendLog(`根据 UUID 查询资源真实路径失败: ${targetUuid}`, 'error');
            }
        }

        if (diagInfo) {
            appendLog(`[信息] 场景诊断提示: ${diagInfo}`, 'info');
        }
        appendLog('未能自动获取到当前打开的场景/预制体路径。请在资源管理器中单击选中目标 .prefab/.scene 文件，或使用“选择文件”按钮。', 'error');
    }

    /**
     * 工具 1：扫描并清理指定目录下找不到对应文件/文件夹的残留 .meta 文件
     */
    private executeMetaClean(): void {
        const { workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);
        const targetDirRel = (this.metaCleanDirInp && this.metaCleanDirInp.value.trim()) || state.metaCleanDir;
        if (!targetDirRel) {
            appendLog(`[.meta 清理失败] 请先选择或输入需要清理的目标文件夹路径`, 'error');
            return;
        }
        const targetDirAbs = targetDirRel.startsWith(workspace) ? targetDirRel : join(workspace, targetDirRel);

        if (!existsSync(targetDirAbs)) {
            appendLog(`[.meta 清理失败] 目标目录不存在: ${targetDirRel}`, 'error');
            return;
        }

        appendLog(`=== 开始扫描并清理无效 .meta 文件 [${targetDirRel}] ===`, 'info');

        let scannedMetaCount = 0;
        let deletedMetaCount = 0;

        const scanAndClean = (currentDir: string) => {
            if (!existsSync(currentDir)) return;

            let entries: any[] = [];
            try {
                entries = readdirSync(currentDir, { withFileTypes: true });
            } catch (e) {
                return;
            }

            for (const entry of entries) {
                const fullPath = join(currentDir, entry.name.toString());

                if (entry.isDirectory()) {
                    scanAndClean(fullPath);
                }

                if (entry.isFile() && entry.name.toString().endsWith('.meta')) {
                    scannedMetaCount++;
                    const targetPath = fullPath.slice(0, -5);
                    if (!existsSync(targetPath)) {
                        try {
                            unlinkSync(fullPath);
                            deletedMetaCount++;
                            const relMetaPath = relative(workspace, fullPath);
                            appendLog(`[已清理] 删除残留无效 meta: ${relMetaPath}`, 'info');
                        } catch (err: any) {
                            appendLog(`[清理失败] 删除 ${fullPath} 异常: ${err?.message ?? String(err)}`, 'error');
                        }
                    }
                }
            }
        };

        scanAndClean(targetDirAbs);

        if (deletedMetaCount === 0) {
            appendLog(`扫描完成：共检索 ${scannedMetaCount} 个 .meta 文件，未发现任何残留无效的 .meta 文件。`, 'success');
        } else {
            appendLog(`=== 清理完成 === 共检索 ${scannedMetaCount} 个 .meta 文件，成功自动删除 ${deletedMetaCount} 个残留无效 .meta 文件！`, 'success');
        }
    }

    /**
     * 构建项目中所有图集与图片帧 UUID 的索引字典
     * @returns Map<SpriteFrameUuid, AtlasFrameInfo>
     */
    private buildAtlasIndex(): {
        frameMap: Map<string, AtlasFrameInfo>;
        atlasCount: number;
        spriteFrameUuids: Set<string>;
        atlasUuids: Set<string>;
    } {
        const { workspace, appendLog } = this.context;
        const assetsDir = join(workspace, 'assets');
        const frameMap = new Map<string, AtlasFrameInfo>();
        const spriteFrameUuids = new Set<string>();
        const atlasUuids = new Set<string>();

        if (!existsSync(assetsDir)) {
            return { frameMap, atlasCount: 0, spriteFrameUuids, atlasUuids };
        }

        // 收集所有图集 meta 与图片 meta 文件
        const pacMetaPaths: string[] = [];
        const plistMetaPaths: string[] = [];
        const imageMetaPaths: string[] = [];

        const scanAtlasMetas = (dir: string) => {
            if (!existsSync(dir)) return;
            let entries: any[] = [];
            try {
                entries = readdirSync(dir, { withFileTypes: true });
            } catch (e) {
                return;
            }

            for (const entry of entries) {
                const fullPath = join(dir, entry.name.toString());
                if (entry.isDirectory()) {
                    scanAtlasMetas(fullPath);
                } else if (entry.isFile()) {
                    const name = entry.name.toString();
                    if (name.endsWith('.pac.meta')) {
                        pacMetaPaths.push(fullPath);
                    } else if (name.endsWith('.plist.meta')) {
                        plistMetaPaths.push(fullPath);
                    } else if (/\.(png|jpe?g|webp|tga)\.meta$/i.test(name)) {
                        imageMetaPaths.push(fullPath);
                    }
                }
            }
        };

        scanAtlasMetas(assetsDir);

        // 先建立所有 SpriteFrame UUID 集合，包含散图与图集内图片
        for (const metaPath of imageMetaPaths) {
            try {
                const metaJson = JSON.parse(readFileSync(metaPath, 'utf-8'));
                if (metaJson.importer !== 'image' || !metaJson.subMetas) continue;
                for (const subKey of Object.keys(metaJson.subMetas)) {
                    const sub = metaJson.subMetas[subKey];
                    if (sub && sub.importer === 'sprite-frame' && sub.uuid) {
                        spriteFrameUuids.add(sub.uuid);
                    }
                }
            } catch (_) {}
        }

        let atlasCount = 0;

        // 1. 处理 .plist 普通图集 (importer: sprite-atlas)
        for (const metaPath of plistMetaPaths) {
            try {
                const metaJson = JSON.parse(readFileSync(metaPath, 'utf-8'));
                if (metaJson.importer !== 'sprite-atlas') continue;

                const atlasUuid = metaJson.uuid;
                const plistPath = metaPath.slice(0, -5);
                const atlasRelPath = relative(workspace, plistPath).replace(/\\/g, '/');
                const atlasName = plistPath.split(/[\\/]/).pop() || '';

                atlasCount++;
                atlasUuids.add(atlasUuid);

                if (metaJson.subMetas && typeof metaJson.subMetas === 'object') {
                    for (const subKey of Object.keys(metaJson.subMetas)) {
                        const sub = metaJson.subMetas[subKey];
                        if (sub && sub.importer === 'sprite-frame' && sub.uuid) {
                            spriteFrameUuids.add(sub.uuid);
                            frameMap.set(sub.uuid, {
                                atlasUuid,
                                atlasName,
                                atlasRelPath,
                                atlasType: 'plist',
                            });
                        }
                    }
                }
            } catch (e: any) {
                appendLog(`[警告] 读取 plist 图集 meta 异常 (${metaPath}): ${e?.message ?? String(e)}`, 'error');
            }
        }

        // 2. 处理 .pac 自动图集 (importer: auto-atlas)
        for (const metaPath of pacMetaPaths) {
            try {
                const metaJson = JSON.parse(readFileSync(metaPath, 'utf-8'));
                if (metaJson.importer !== 'auto-atlas') continue;

                const atlasUuid = metaJson.uuid;
                const pacPath = metaPath.slice(0, -5);
                const atlasRelPath = relative(workspace, pacPath).replace(/\\/g, '/');
                const atlasName = pacPath.split(/[\\/]/).pop() || '';
                const pacDir = dirname(pacPath);

                atlasCount++;
                atlasUuids.add(atlasUuid);

                // 递归扫描该目录及其子目录下的所有图片散图
                const scanPacFrames = (subDir: string) => {
                    if (!existsSync(subDir)) return;
                    let entries: any[] = [];
                    try {
                        entries = readdirSync(subDir, { withFileTypes: true });
                    } catch (e) {
                        return;
                    }

                    for (const entry of entries) {
                        const fullPath = join(subDir, entry.name.toString());
                        if (entry.isDirectory()) {
                            // 检查目标子目录自身内部是否包含独立的 .pac 自动图集（若有则由该子图集独立管理，避免越界）
                            let childHasPac = false;
                            try {
                                const childEntries = readdirSync(fullPath);
                                childHasPac = childEntries.some((f) => f.endsWith('.pac'));
                            } catch (_) {}

                            if (!childHasPac) {
                                scanPacFrames(fullPath);
                            }
                        } else if (entry.isFile()) {
                            const name = entry.name.toString();
                            if (name.endsWith('.png.meta') || name.endsWith('.jpg.meta') || name.endsWith('.jpeg.meta') || name.endsWith('.webp.meta')) {
                                try {
                                    const imgMeta = JSON.parse(readFileSync(fullPath, 'utf-8'));
                                    if (imgMeta.importer === 'image' && imgMeta.subMetas) {
                                        for (const subKey of Object.keys(imgMeta.subMetas)) {
                                            const sub = imgMeta.subMetas[subKey];
                                            // 必须是 sprite-frame 且 packable 不为 false
                                            if (sub && sub.importer === 'sprite-frame' && sub.uuid) {
                                                if (sub.userData && sub.userData.packable === false) {
                                                    continue;
                                                }
                                                spriteFrameUuids.add(sub.uuid);
                                                frameMap.set(sub.uuid, {
                                                    atlasUuid,
                                                    atlasName,
                                                    atlasRelPath,
                                                    atlasType: 'auto-atlas',
                                                });
                                            }
                                        }
                                    }
                                } catch (_) {}
                            }
                        }
                    }
                };

                scanPacFrames(pacDir);
            } catch (e: any) {
                appendLog(`[警告] 读取 auto-atlas meta 异常 (${metaPath}): ${e?.message ?? String(e)}`, 'error');
            }
        }

        return { frameMap, atlasCount, spriteFrameUuids, atlasUuids };
    }

    /**
     * 工具 2：扫描并批量修复预制体/场景中的 Sprite 图集绑定
     * @param isPreview 是否仅预览不实际修改
     */
    private async executeAtlasReferenceFix(isPreview: boolean): Promise<void> {
        const { workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);
        const targetLocRel = (this.atlasTargetLocInp && this.atlasTargetLocInp.value.trim()) || state.atlasTargetLocation;

        if (!targetLocRel) {
            appendLog('[图集修复失败] 请先选择目标预制体/场景文件或文件夹路径。', 'error');
            return;
        }

        const absTargetLoc = targetLocRel.startsWith(workspace) ? targetLocRel : join(workspace, targetLocRel);
        if (!existsSync(absTargetLoc)) {
            appendLog(`[图集修复失败] 目标路径不存在: ${targetLocRel}`, 'error');
            return;
        }

        appendLog(`=== ${isPreview ? '【预览检测】' : '【开始修复】'} 预制体/场景图集引用 ===`, 'info');
        appendLog(`目标位置: ${targetLocRel}`, 'info');

        // 1. 构建全项目图集索引字典
        appendLog('正在建立项目图集与图片帧索引字典 (包含 .pac 与 .plist)...', 'info');
        const { frameMap, atlasCount } = this.buildAtlasIndex();
        appendLog(`图集索引构建完成：扫描到 ${atlasCount} 个图集，映射了 ${frameMap.size} 个 SpriteFrame 资源。`, 'info');

        // 2. 收集需要处理的 .prefab 与 .scene 文件
        const filesToProcess: string[] = [];
        const stat = statSync(absTargetLoc);

        if (stat.isFile()) {
            if (absTargetLoc.endsWith('.prefab') || absTargetLoc.endsWith('.scene')) {
                filesToProcess.push(absTargetLoc);
            } else {
                appendLog(`[图集修复失败] 选中的不是有效的 .prefab 或 .scene 文件: ${targetLocRel}`, 'error');
                return;
            }
        } else if (stat.isDirectory()) {
            const collectFiles = (dir: string) => {
                let entries: any[] = [];
                try {
                    entries = readdirSync(dir, { withFileTypes: true });
                } catch (e) {
                    return;
                }

                for (const entry of entries) {
                    const fullPath = join(dir, entry.name.toString());
                    if (entry.isDirectory()) {
                        collectFiles(fullPath);
                    } else if (entry.isFile()) {
                        const name = entry.name.toString();
                        if (name.endsWith('.prefab') || name.endsWith('.scene')) {
                            filesToProcess.push(fullPath);
                        }
                    }
                }
            };
            collectFiles(absTargetLoc);
        }

        if (filesToProcess.length === 0) {
            appendLog('未检索到任何 .prefab 或 .scene 文件，操作终止。', 'error');
            return;
        }

        appendLog(`扫描目标文件数量: ${filesToProcess.length}`, 'info');

        let totalModifiedFiles = 0;
        let totalFixedComponents = 0;
        let totalSkippedUnderscoreComponents = 0;
        let totalSkippedNestedComponents = 0;

        for (const filePath of filesToProcess) {
            const relFilePath = relative(workspace, filePath).replace(/\\/g, '/');

            let contentStr = '';
            try {
                contentStr = readFileSync(filePath, 'utf-8');
            } catch (err: any) {
                appendLog(`读取文件失败: ${relFilePath} - ${err?.message ?? String(err)}`, 'error');
                continue;
            }

            let jsonArr: any[] = [];
            try {
                jsonArr = JSON.parse(contentStr);
                if (!Array.isArray(jsonArr)) {
                    continue;
                }
            } catch (err: any) {
                appendLog(`解析 JSON 失败: ${relFilePath} - ${err?.message ?? String(err)}`, 'error');
                continue;
            }

            // 建立节点索引，并识别出所有外部嵌套预制体的根节点 ID
            const nodeNameMap = new Map<number, string>();
            const externalPrefabRootIds = new Set<number>();

            for (let i = 0; i < jsonArr.length; i++) {
                const obj = jsonArr[i];
                if (obj && obj.__type__ === 'cc.Node') {
                    if (typeof obj._name === 'string') {
                        nodeNameMap.set(i, obj._name);
                    }
                    const pInfoId = obj._prefab && typeof obj._prefab.__id__ === 'number' ? obj._prefab.__id__ : null;
                    const pInfo = pInfoId !== null ? jsonArr[pInfoId] : null;
                    if (pInfo && pInfo.asset && pInfo.asset.__uuid__) {
                        externalPrefabRootIds.add(i);
                    }
                }
            }

            let fileModified = false;
            let fileFixedCount = 0;

            for (const item of jsonArr) {
                if (!item || item.__type__ !== 'cc.Sprite') {
                    continue;
                }

                // 获取所属节点名称与对象
                const nodeId = item.node && typeof item.node.__id__ === 'number' ? item.node.__id__ : null;
                const node = nodeId !== null ? jsonArr[nodeId] : null;
                const nodeName = nodeId !== null && nodeNameMap.has(nodeId) ? (nodeNameMap.get(nodeId) as string) : '';

                // 规则 1：如果节点名以 "_" 开头，用户明确指定不需要绑定图集，跳过
                if (nodeName.startsWith('_')) {
                    totalSkippedUnderscoreComponents++;
                    continue;
                }

                // 规则 2：【嵌套预制体安全守卫】跳过属于外部嵌套预制体的原生内部节点，防止破坏反序列化与覆写机制
                if (node) {
                    const pInfoId = node._prefab && typeof node._prefab.__id__ === 'number' ? node._prefab.__id__ : null;
                    const pInfo = pInfoId !== null ? jsonArr[pInfoId] : null;
                    const isMounted = !!(node.__editorExtras__ && node.__editorExtras__.mountedRoot);

                    let isNestedInternalNode = false;
                    if (pInfo && !isMounted) {
                        if (pInfo.asset && pInfo.asset.__uuid__) {
                            isNestedInternalNode = true;
                        } else if (pInfo.instance) {
                            isNestedInternalNode = true;
                        } else if (pInfo.root && typeof pInfo.root.__id__ === 'number' && externalPrefabRootIds.has(pInfo.root.__id__)) {
                            isNestedInternalNode = true;
                        }
                    }

                    if (isNestedInternalNode) {
                        totalSkippedNestedComponents++;
                        continue;
                    }
                }

                // 规则 2：检查精灵是否绑定了图片帧
                const spriteFrameObj = item._spriteFrame;
                if (!spriteFrameObj || typeof spriteFrameObj !== 'object') {
                    continue;
                }
                const frameUuid = spriteFrameObj.__uuid__;
                if (!frameUuid || typeof frameUuid !== 'string') {
                    continue;
                }

                // 规则 3：检查是否已经绑定了图集
                const atlasObj = item._atlas;
                const hasAtlas = atlasObj && typeof atlasObj === 'object' && atlasObj.__uuid__;
                if (hasAtlas) {
                    continue; // 已经绑定了图集，无需修复
                }

                // 规则 4：检查图片帧 UUID 是否属于某个已知图集
                const matchedAtlas = frameMap.get(frameUuid);
                if (!matchedAtlas) {
                    continue; // 该散图本身就不在任何图集中
                }

                // 命中需要修复的目标
                fileFixedCount++;
                totalFixedComponents++;
                fileModified = true;

                if (isPreview) {
                    const assetName = relFilePath.split(/[/\\\\]/).pop() || relFilePath;
                    appendLog(`[待修复] 【预制体/场景: ${assetName}】 -> 节点: [${nodeName || `ID:${nodeId}`}] | 引用图片帧 (${frameUuid.slice(0, 8)}...) 缺失图集绑定 -> 推荐图集: [${matchedAtlas.atlasName}]`, 'error');
                } else {
                    item._atlas = {
                        __uuid__: matchedAtlas.atlasUuid,
                        __expectedType__: 'cc.SpriteAtlas',
                    };
                    const assetName = relFilePath.split(/[/\\\\]/).pop() || relFilePath;
                    appendLog(`[已修复] 【预制体/场景: ${assetName}】 -> 节点: [${nodeName || `ID:${nodeId}`}] -> 成功绑定图集: [${matchedAtlas.atlasName}]`, 'info');
                }
            }

            if (fileModified) {
                totalModifiedFiles++;
                if (!isPreview) {
                    try {
                        writeFileSync(filePath, JSON.stringify(jsonArr, null, 2), 'utf-8');

                        if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
                            Editor.Message.request('asset-db', 'refresh-asset', `db://${relFilePath}`).catch(() => {});
                        }
                    } catch (err: any) {
                        appendLog(`写入文件失败: ${relFilePath} - ${err?.message ?? String(err)}`, 'error');
                    }
                }
            }
        }

        // 输出总结报告
        appendLog('----------------------------------------------------', 'info');
        const skipDetail = `(已安全跳过嵌套预制体内部原生节点 ${totalSkippedNestedComponents} 处，跳过 "_" 开头节点 ${totalSkippedUnderscoreComponents} 处)`;
        if (isPreview) {
            if (totalFixedComponents === 0) {
                appendLog(`【检测结果】共检索 ${filesToProcess.length} 个文件，未发现任何缺失图集绑定的 Sprite 组件 ${skipDetail}。`, 'success');
            } else {
                appendLog(`【检测结果】共扫描 ${filesToProcess.length} 个预制体/场景，发现 ${totalModifiedFiles} 个文件中的 ${totalFixedComponents} 处 Sprite 组件缺少图集绑定 ${skipDetail}。点击“开始批量修复图集引用”即可一键完成修复！`, 'info');
            }
        } else {
            if (totalFixedComponents === 0) {
                appendLog(`=== 修复完成 === 共检索 ${filesToProcess.length} 个文件，未发现需要修复的 Sprite 组件 ${skipDetail}。`, 'info');
            } else {
                appendLog(`=== 修复完成 === 共扫描 ${filesToProcess.length} 个预制体/场景，成功修改 ${totalModifiedFiles} 个文件，累计为 ${totalFixedComponents} 处 Sprite 组件补齐了图集绑定 ${skipDetail}！`, 'success');
            }
        }
    }

    /**
     * 工具 3：预览或批量执行 PNG 快速 8bit 转换
     * @param isPreview 是否仅预览不实际转换
     */
    private async executePng8Bit(isPreview: boolean): Promise<void> {
        const { workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);
        const targetRel = (this.png8bitTargetInp && this.png8bitTargetInp.value.trim()) || state.png8bitTarget;

        if (!targetRel) {
            appendLog('[PNG 8bit 转换失败] 请先选择或输入目标 PNG 文件或文件夹路径', 'error');
            return;
        }

        const targetAbs = resolvePathForExec(targetRel, workspace);
        if (!existsSync(targetAbs)) {
            appendLog(`[PNG 8bit 转换失败] 目标路径不存在: ${targetRel}`, 'error');
            return;
        }

        let candidates;
        try {
            candidates = collectPng8BitCandidates(targetAbs, workspace);
        } catch (e: any) {
            appendLog(`[PNG 8bit 扫描失败] ${e?.message ?? String(e)}`, 'error');
            return;
        }

        const previewText = formatPng8BitPreview(candidates);

        appendLog(`=== PNG 快速 8bit ${isPreview ? '预览' : '转换'} [${targetRel}] ===`, 'info');
        appendLog(previewText);

        if (candidates.length === 0) {
            if (!isPreview) {
                appendLog('未发现符合条件的 PNG，转换终止。', 'error');
            }
            return;
        }

        if (isPreview) {
            appendLog('预览完成，未修改任何文件。', 'success');
            return;
        }

        const result = await convertPng8Bit(candidates, workspace, appendLog);
        appendLog(
            `=== 转换完成 === 成功 ${result.success} 张，失败 ${result.failed} 张`,
            result.failed > 0 ? 'error' : 'success'
        );
        appendLog(
            `体积统计：${formatPng8BitSize(result.beforeBytes)} → ${formatPng8BitSize(result.afterBytes)}，${formatPng8BitReduction(result.beforeBytes, result.afterBytes)}，节省 ${formatPng8BitSize(Math.max(0, result.beforeBytes - result.afterBytes))}`,
            'info'
        );
    }

    /**
     * 工具 4：检测预制体/场景中未绑定 SpriteFrame 的精灵组件
     */
    private executeSpriteUnboundCheck(): void {
        const { workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);
        const targetRel = (this.spriteUnboundTargetInp && this.spriteUnboundTargetInp.value.trim()) || state.spriteUnboundTarget;

        if (!targetRel) {
            appendLog('[精灵未绑定检测失败] 请先选择目标预制体/场景文件或文件夹路径。', 'error');
            return;
        }

        const targetAbs = resolvePathForExec(targetRel, workspace);
        if (!existsSync(targetAbs)) {
            appendLog(`[精灵未绑定检测失败] 目标路径不存在: ${targetRel}`, 'error');
            return;
        }

        this.spriteUnboundResults = [];
        this.renderSpriteUnboundResults();

        appendLog('=== 精灵未绑定检测 ===', 'info');

        const filesToProcess: string[] = [];
        const stat = statSync(targetAbs);
        if (stat.isFile()) {
            if (/\.(prefab|scene)$/i.test(targetAbs)) {
                filesToProcess.push(targetAbs);
            } else {
                appendLog(`[精灵未绑定检测失败] 选中的不是有效的 .prefab 或 .scene 文件: ${targetRel}`, 'error');
                return;
            }
        } else {
            const collectFiles = (dir: string) => {
                let entries: any[] = [];
                try {
                    entries = readdirSync(dir, { withFileTypes: true });
                } catch (_) {
                    return;
                }
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name.toString());
                    if (entry.isDirectory()) {
                        collectFiles(fullPath);
                    } else if (entry.isFile() && /\.(prefab|scene)$/i.test(entry.name.toString())) {
                        filesToProcess.push(fullPath);
                    }
                }
            };
            collectFiles(targetAbs);
        }

        if (filesToProcess.length === 0) {
            appendLog('未检索到任何 .prefab 或 .scene 文件，检测终止。', 'error');
            return;
        }

        let skippedUnderscore = 0;
        let skippedNested = 0;
        let spriteCount = 0;

        for (const filePath of filesToProcess) {
            const relFilePath = relative(workspace, filePath).replace(/\\/g, '/');
            let jsonArr: any[] = [];
            try {
                jsonArr = JSON.parse(readFileSync(filePath, 'utf-8'));
                if (!Array.isArray(jsonArr)) continue;
            } catch (err: any) {
                appendLog(`读取或解析失败: ${relFilePath} - ${err?.message ?? String(err)}`, 'error');
                continue;
            }

            const nodeNameMap = new Map<number, string>();
            const externalPrefabRootIds = new Set<number>();
            for (let i = 0; i < jsonArr.length; i++) {
                const obj = jsonArr[i];
                if (obj && obj.__type__ === 'cc.Node') {
                    if (typeof obj._name === 'string') nodeNameMap.set(i, obj._name);
                    const pInfoId = obj._prefab && typeof obj._prefab.__id__ === 'number' ? obj._prefab.__id__ : null;
                    const pInfo = pInfoId !== null ? jsonArr[pInfoId] : null;
                    if (pInfo && pInfo.asset && pInfo.asset.__uuid__) externalPrefabRootIds.add(i);
                }
            }

            const buildNodePath = (nodeId: number | null): string => {
                const names: string[] = [];
                const visited = new Set<number>();
                let currentId = nodeId;
                while (currentId !== null && jsonArr[currentId] && !visited.has(currentId)) {
                    visited.add(currentId);
                    const nodeObj = jsonArr[currentId];
                    names.unshift(typeof nodeObj._name === 'string' ? nodeObj._name : `ID:${currentId}`);
                    const parentId = nodeObj._parent && typeof nodeObj._parent.__id__ === 'number' ? nodeObj._parent.__id__ : null;
                    currentId = parentId;
                }
                return names.join('/');
            };

            for (const item of jsonArr) {
                if (!item || item.__type__ !== 'cc.Sprite') continue;
                spriteCount++;

                const nodeId = item.node && typeof item.node.__id__ === 'number' ? item.node.__id__ : null;
                const node = nodeId !== null ? jsonArr[nodeId] : null;
                const nodeName = nodeId !== null && nodeNameMap.has(nodeId) ? (nodeNameMap.get(nodeId) as string) : '';

                if (nodeName.startsWith('_')) {
                    skippedUnderscore++;
                    continue;
                }

                if (node) {
                    const pInfoId = node._prefab && typeof node._prefab.__id__ === 'number' ? node._prefab.__id__ : null;
                    const pInfo = pInfoId !== null ? jsonArr[pInfoId] : null;
                    const isMounted = !!(node.__editorExtras__ && node.__editorExtras__.mountedRoot);
                    let isNestedInternalNode = false;
                    if (pInfo && !isMounted) {
                        if (pInfo.asset && pInfo.asset.__uuid__) {
                            isNestedInternalNode = true;
                        } else if (pInfo.instance) {
                            isNestedInternalNode = true;
                        } else if (pInfo.root && typeof pInfo.root.__id__ === 'number' && externalPrefabRootIds.has(pInfo.root.__id__)) {
                            isNestedInternalNode = true;
                        }
                    }
                    if (isNestedInternalNode) {
                        skippedNested++;
                        continue;
                    }
                }

                const spriteFrame = item._spriteFrame;
                const hasFrame = !!spriteFrame && (
                    (typeof spriteFrame === 'string' && spriteFrame.length > 0) ||
                    (typeof spriteFrame === 'object' && !!spriteFrame.__uuid__)
                );
                if (hasFrame) continue;

                this.spriteUnboundResults.push({
                    filePath,
                    relativePath: relFilePath,
                    nodeName: nodeName || `ID:${nodeId}`,
                    nodePath: buildNodePath(nodeId),
                    nodeId,
                    reason: '未绑定 SpriteFrame',
                });
            }
        }

        this.renderSpriteUnboundResults();
        appendLog('----------------------------------------------------', 'info');
        appendLog(
            `检测完成：扫描 ${filesToProcess.length} 个文件、${spriteCount} 个 Sprite 组件，发现 ${this.spriteUnboundResults.length} 处未绑定 SpriteFrame；跳过下划线节点 ${skippedUnderscore} 处、嵌套预制体内部节点 ${skippedNested} 处。点击结果项可打开资源并选中对应节点。`,
            this.spriteUnboundResults.length > 0 ? 'error' : 'success'
        );
    }

    /**
     * 渲染精灵未绑定检测结果列表
     */
    private renderSpriteUnboundResults(): void {
        const box = this.spriteUnboundResultBox;
        if (!box) return;

        box.innerHTML = '';
        if (this.spriteUnboundResults.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'atlas-result-empty';
            empty.textContent = '暂无检测结果。点击“开始检测未绑定精灵”后在此查看。';
            box.appendChild(empty);
            return;
        }

        this.spriteUnboundResults.forEach((item, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'atlas-result-item';
            btn.title = '点击打开预制体/场景并选中对应节点';
            btn.innerHTML =
                `<span class="atlas-result-index">${index + 1}</span>` +
                `<span class="atlas-result-main">${escapeHtml(item.relativePath)}</span>` +
                `<span class="atlas-result-sub">节点路径: ${escapeHtml(item.nodePath)} | ${escapeHtml(item.reason)}</span>`;
            btn.addEventListener('click', () => {
                this.openSpriteUnboundResult(item);
            });
            box.appendChild(btn);
        });
    }

    /**
     * 打开检测结果对应的预制体/场景并选中节点
     * @param item 检测结果
     */
    private async openSpriteUnboundResult(item: SpriteUnboundResult): Promise<void> {
        const { appendLog } = this.context;
        const url = `db://${item.relativePath.replace(/\\/g, '/')}`;
        try {
            if (typeof Editor === 'undefined' || !Editor.Message || !Editor.Message.request) {
                appendLog('Editor.Message.request 不可用，无法打开资源。', 'error');
                return;
            }

            await Editor.Message.request('asset-db', 'open-asset', url);
            await this.sleep(250);

            let nodes: Array<{ uuid: string; name: string; path: string }> = [];
            for (let attempt = 0; attempt < 5; attempt++) {
                try {
                    const tree: any = await Editor.Message.request('scene', 'query-node-tree');
                    nodes = this.flattenSceneNodes(tree);
                    if (nodes.length > 0) break;
                } catch (_) {}
                await this.sleep(200);
            }

            const matched = nodes.find(node => node.path === item.nodePath) || nodes.find(node => node.name === item.nodeName);
            const selection = (Editor as any).Selection;
            if (matched && matched.uuid && selection && typeof selection.select === 'function') {
                if (typeof selection.clear === 'function') selection.clear('node');
                selection.select('node', matched.uuid);
                appendLog(`已打开并选中节点: ${item.nodePath} (${url})`, 'info');
            } else {
                appendLog(`已打开资源，但未能定位节点 ${item.nodePath}: ${url}`, 'info');
            }
        } catch (e: any) {
            appendLog(`打开或选中失败: ${url} - ${e?.message ?? String(e)}`, 'error');
        }
    }

    /**
     * 将 query-node-tree 返回值展平为可匹配的节点列表
     * @param value query-node-tree 返回值
     * @param parentPath 父节点路径
     * @param result 输出列表
     * @returns 节点列表
     */
    private flattenSceneNodes(
        value: any,
        parentPath: string = '',
        result: Array<{ uuid: string; name: string; path: string }> = []
    ): Array<{ uuid: string; name: string; path: string }> {
        if (!value) return result;
        if (Array.isArray(value)) {
            for (const child of value) this.flattenSceneNodes(child, parentPath, result);
            return result;
        }
        if (typeof value !== 'object') return result;

        const name = value.name || value.displayName || '';
        const path = value.path || (name ? (parentPath ? `${parentPath}/${name}` : name) : parentPath);
        if (value.uuid && name) {
            result.push({ uuid: value.uuid, name, path });
        }

        const children = value.children || value.nodes || value.child;
        if (Array.isArray(children)) {
            for (const child of children) this.flattenSceneNodes(child, path, result);
        }
        return result;
    }

    /**
     * 等待指定毫秒数
     * @param ms 毫秒
     * @returns Promise
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}