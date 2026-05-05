/* eslint-disable vue/one-component-per-file */

import { readFileSync } from 'fs-extra';
import { join } from 'path';
/**
 * @zh 如果希望兼容 3.3 之前的版本可以使用下方的代码
 * @en You can add the code below if you want compatibility with versions prior to 3.3
 */
// Editor.Panel.define = Editor.Panel.define || function(options: any) { return options }

type TabName = 'tab-1' | 'tab-2';

const TAB_IDS: TabName[] = ['tab-1', 'tab-2'];
const UI_STATE_KEY = 'gcore-framework.i18n-tool.state';

const DEFAULT_UI_STATE: UiState = {
    srcRoot: '',
    outRoot: '',
    headerText: 'Key,Chinese,English',
    activeTab: 'tab-1',
};

let memoryUiState: UiState = { ...DEFAULT_UI_STATE };

type UiState = {
    srcRoot: string;
    outRoot: string;
    headerText: string;
    activeTab: TabName;
};

function loadUiState(): UiState {
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(UI_STATE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<UiState>;
                return {
                    srcRoot: parsed.srcRoot ?? DEFAULT_UI_STATE.srcRoot,
                    outRoot: parsed.outRoot ?? DEFAULT_UI_STATE.outRoot,
                    headerText: parsed.headerText ?? DEFAULT_UI_STATE.headerText,
                    activeTab: parsed.activeTab === 'tab-2' ? 'tab-2' : 'tab-1',
                };
            }
        }
    } catch (error) {
        console.warn('[i18n-tool] load state failed', error);
    }

    return { ...memoryUiState };
}

function saveUiState(patch: Partial<UiState>) {
    const current = loadUiState();
    const next = { ...current, ...patch };
    memoryUiState = { ...next };
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
        }
    } catch (error) {
        console.warn('[i18n-tool] save state failed', error);
    }
}

function setupTabSwitcher(panel: any, initialTab: TabName = 'tab-1') {
    const tabButtons = panel.$.tabHeader.querySelectorAll('.tab-btn');
    const tabPanes = panel.$.tabContent.querySelectorAll('.tab-pane');

    const activateTab = (tabId: TabName) => {
        tabButtons.forEach((button: HTMLElement) => button.classList.remove('active'));
        tabPanes.forEach((pane: HTMLElement) => pane.classList.remove('active'));

        const activeButton = panel.$.tabHeader.querySelector(`.tab-btn[data-tab="${tabId}"]`) as HTMLElement | null;
        const activePane = panel.$.tabContent.querySelector(`#${tabId}`) as HTMLElement | null;

        activeButton?.classList.add('active');
        activePane?.classList.add('active');
    };

    tabButtons.forEach((button: HTMLElement) => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab') as TabName | null;
            if (!tabId || !TAB_IDS.includes(tabId)) {
                return;
            }
            activateTab(tabId);
            saveUiState({ activeTab: tabId });
        });
    });

    activateTab(initialTab);
}

function initI18nTool(panel: any) {
    // require modules
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs-extra');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { encode } = require('@msgpack/msgpack');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Papa = require('papaparse');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');

    const srcBtn = panel.$.tabContent.querySelector('#src-folder-btn') as HTMLButtonElement | null;
    const outBtn = panel.$.tabContent.querySelector('#out-folder-btn') as HTMLButtonElement | null;
    const srcPathInput = panel.$.tabContent.querySelector('#src-folder-path') as HTMLInputElement | null;
    const outPathInput = panel.$.tabContent.querySelector('#out-folder-path') as HTMLInputElement | null;
    const headerInput = panel.$.tabContent.querySelector('#header-input') as HTMLInputElement | null;
    const dupCheck = panel.$.tabContent.querySelector('#dup-check') as HTMLInputElement | null;
    const processBtn = panel.$.tabContent.querySelector('#process-btn') as HTMLButtonElement | null;
    const getEditor = () => (globalThis as any).Editor;
    const statusArea = panel.$.tabContent.querySelector('#status-area') as HTMLElement | null;

    const applyState = () => {
        const state = loadUiState();
        if (srcPathInput) {
            srcPathInput.value = state.srcRoot;
        }
        if (outPathInput) {
            outPathInput.value = state.outRoot;
        }
        if (headerInput) {
            headerInput.value = state.headerText;
        }
        if (dupCheck) {
            dupCheck.checked = true;
        }
    };

    const pickFolder = async (title: string, currentPath: string) => {
        const editor = getEditor();
        if (!editor?.Dialog?.select) {
            throw new Error('Editor.Dialog.select 不可用');
        }

        const result = await editor.Dialog.select({
            title,
            type: 'directory',
            path: currentPath || undefined,
            button: '选择',
            multi: false,
        });

        if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return '';
        }

        return result.filePaths[0] as string;
    };

    const updateAndSave = (patch: Partial<UiState>) => {
        const current = loadUiState();
        const next = { ...current, ...patch };
        if (srcPathInput && typeof next.srcRoot === 'string') {
            srcPathInput.value = next.srcRoot;
        }
        if (outPathInput && typeof next.outRoot === 'string') {
            outPathInput.value = next.outRoot;
        }
        if (headerInput && typeof next.headerText === 'string') {
            headerInput.value = next.headerText;
        }
        saveUiState(next);
    };

    const escapeHtml = (s: string) => {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const appendStatus = (msg: string, type: 'info' | 'error' = 'info') => {
        if (statusArea) {
            const cls = type === 'error' ? 'status-error' : 'status-info';
            statusArea.innerHTML += `<div class="${cls}">${escapeHtml(msg)}</div>`;
            statusArea.scrollTop = statusArea.scrollHeight;
        }
        if (type === 'error') {
            console.error('[i18n-tool]', msg);
        } else {
            console.log('[i18n-tool]', msg);
        }
    };

    async function parseFile(filePath: string) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.csv') {
            const txt = fs.readFileSync(filePath, 'utf8');
            const parsed = Papa.parse(txt, { header: true, skipEmptyLines: true });
            return parsed.data;
        }
        if (ext === '.xlsx' || ext === '.xls') {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
            return rows;
        }
        return null;
    }

    async function doProcess() {
        if (!srcPathInput || !outPathInput || !headerInput) {
            appendStatus('控件未就绪');
            return;
        }

        const headerText = headerInput.value.trim();
        if (!headerText) {
            appendStatus('请填写字段头，例如：Key,Chinese,English');
            return;
        }
        const headers = headerText.split(/\s*[,，]\s*/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        if (headers.length < 2) {
            appendStatus('字段头至少需包含 key 和一种语言字段');
            return;
        }
        const keyField = headers[0];
        const langFields = headers.slice(1);

        const srcRoot = srcPathInput?.value.trim() || '';
        const outRoot = outPathInput?.value.trim() || '';
        const checkDup = !!(dupCheck?.checked);

        if (!srcRoot) {
            appendStatus('请先选择源文件夹');
            return;
        }
        if (!outRoot) {
            appendStatus('请先选择输出文件夹');
            return;
        }

        appendStatus('开始转换');
        appendStatus(`源目录: ${srcRoot}`);
        appendStatus(`输出目录: ${outRoot}`);
        appendStatus(`字段头: ${headers.join(',')}`);

        // list files in srcRoot
        const allFiles = fs.readdirSync(srcRoot);
        const dataFiles = allFiles.filter((f: string) => ['.csv', '.xlsx', '.xls'].includes(path.extname(f).toLowerCase()));
        if (dataFiles.length === 0) {
            appendStatus('源目录中没有找到 csv 或 xlsx 文件');
            return;
        }

        appendStatus(`发现 ${dataFiles.length} 个源文件`);
        appendStatus(`每个语言将输出 1 个 MessagePack 文件`);

        // aggregate across all files into overall language maps
        const overallLangMaps: Record<string, Record<string, string>> = {};
        langFields.forEach((lf: string) => { overallLangMaps[lf] = {}; });
        const duplicatesByLang: Record<string, Set<string>> = {};
        langFields.forEach((lf: string) => { duplicatesByLang[lf] = new Set(); });

        for (let i = 0; i < dataFiles.length; i++) {
            const filename = dataFiles[i];
            const fullPath = path.join(srcRoot, filename);
            appendStatus(`解析 ${filename} ...`);
            try {
                const rows = await parseFile(fullPath);
                if (!rows || rows.length === 0) {
                    appendStatus(`文件 ${filename} 无数据，跳过`);
                    continue;
                }

                for (let r = 0; r < rows.length; r++) {
                    const row = rows[r] as Record<string, any>;
                    const key = String(row[keyField] ?? '').trim();
                    if (!key) continue;
                    for (let li = 0; li < langFields.length; li++) {
                        const lf = langFields[li];
                        const val = String(row[lf] ?? '');
                        if (checkDup && Object.prototype.hasOwnProperty.call(overallLangMaps[lf], key)) {
                            duplicatesByLang[lf].add(key);
                        } else {
                            overallLangMaps[lf][key] = val;
                        }
                    }
                }

                appendStatus(`解析 ${filename} 完成`);
            } catch (err) {
                const em = (err as any)?.message ?? String(err);
                appendStatus(`解析 ${filename} 失败: ${em}`);
            }
        }

        // if checkDup enabled, verify duplicates
        if (checkDup) {
            const dupMsgs: string[] = [];
            for (let li = 0; li < langFields.length; li++) {
                const lf = langFields[li];
                const dset = duplicatesByLang[lf];
                if (dset && dset.size > 0) {
                    dupMsgs.push(`${lf}: ${Array.from(dset).join(', ')}`);
                }
            }
            if (dupMsgs.length > 0) {
                appendStatus('发现重复 Key，已取消生成：', 'error');
                dupMsgs.forEach(m => appendStatus(m, 'error'));
                return;
            }
        }

        // clear old language folders and write a single msgpack file per language
        for (let li = 0; li < langFields.length; li++) {
            const lf = langFields[li];
            const langDir = path.join(outRoot, lf);
            try {
                if (fs.existsSync(langDir)) {
                    appendStatus(`清理旧目录 ${langDir}`);
                    fs.removeSync(langDir);
                }
                fs.ensureDirSync(langDir);
                const outFile = path.join(langDir, `${lf}.msgpack`);
                const packed = encode(overallLangMaps[lf]);
                fs.writeFileSync(outFile, Buffer.from(packed));
                appendStatus(`写入 ${outFile}`);
            } catch (err) {
                appendStatus(`写入 ${lf} 失败: ${(err as any)?.message ?? String(err)}`);
            }
        }

        appendStatus('全部完成');
    }

    applyState();

    if (srcBtn) {
        srcBtn.addEventListener('click', async () => {
            try {
                appendStatus('正在打开源文件夹选择框...');
                const folderPath = await pickFolder('选择源文件夹', srcPathInput?.value.trim() || '');
                if (!folderPath) {
                    appendStatus('未选择源文件夹');
                    return;
                }
                updateAndSave({ srcRoot: folderPath });
                appendStatus(`已选择源文件夹: ${folderPath}`);
            } catch (error) {
                appendStatus(`选择源文件夹失败: ${(error as any)?.message ?? String(error)}`);
            }
        });
    }

    if (outPathInput) {
        outPathInput.addEventListener('input', () => saveUiState({ outRoot: outPathInput.value.trim() }));
    }

    if (outBtn) {
        outBtn.addEventListener('click', async () => {
            try {
                appendStatus('正在打开输出文件夹选择框...');
                const folderPath = await pickFolder('选择输出文件夹', outPathInput?.value.trim() || '');
                if (!folderPath) {
                    appendStatus('未选择输出文件夹');
                    return;
                }
                updateAndSave({ outRoot: folderPath });
                appendStatus(`已选择输出文件夹: ${folderPath}`);
            } catch (error) {
                appendStatus(`选择输出文件夹失败: ${(error as any)?.message ?? String(error)}`);
            }
        });
    }

    if (headerInput) {
        headerInput.addEventListener('input', () => saveUiState({ headerText: headerInput.value }));
    }

    if (processBtn) {
        processBtn.addEventListener('click', () => {
            // clear status
            if (statusArea) statusArea.textContent = '';
            saveUiState({
                srcRoot: srcPathInput?.value.trim() || '',
                outRoot: outPathInput?.value.trim() || '',
                headerText: headerInput?.value ?? '',
            });
            void doProcess();
        });
    }
}

module.exports = Editor.Panel.define({
    listeners: {
        show() {
            console.log('show');
        },
        hide() {
            console.log('hide');
        },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        tabHeader: '.tab-header',
        tabContent: '.tab-content',
    },
    methods: {
        hello() {
            console.log('[gcore-panel]: hello');
        },
    },
    ready() {
        setupTabSwitcher(this, loadUiState().activeTab);
        try {
            initI18nTool(this);
        } catch (e) {
            console.error('initI18nTool error', e);
        }
    },
    beforeClose() {},
    close() {
        console.log('[gcore-panel]: closed');
    },
});
