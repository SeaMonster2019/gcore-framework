"use strict";
/* eslint-disable vue/one-component-per-file */
Object.defineProperty(exports, "__esModule", { value: true });
const msgpack_1 = require("@msgpack/msgpack");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const TAB_IDS = ['tab-1', 'tab-2'];
const UI_STATE_KEY = 'gcore-framework.i18n-tool.state';
const DEFAULT_UI_STATE = {
    srcRoot: '',
    outRoot: '',
    headerText: 'Key,Chinese,English',
    activeTab: 'tab-1',
};
let memoryUiState = Object.assign({}, DEFAULT_UI_STATE);
function loadUiState() {
    var _a, _b, _c;
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(UI_STATE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    srcRoot: (_a = parsed.srcRoot) !== null && _a !== void 0 ? _a : DEFAULT_UI_STATE.srcRoot,
                    outRoot: (_b = parsed.outRoot) !== null && _b !== void 0 ? _b : DEFAULT_UI_STATE.outRoot,
                    headerText: (_c = parsed.headerText) !== null && _c !== void 0 ? _c : DEFAULT_UI_STATE.headerText,
                    activeTab: parsed.activeTab === 'tab-2' ? 'tab-2' : 'tab-1',
                };
            }
        }
    }
    catch (error) {
        console.warn('[i18n-tool] load state failed', error);
    }
    return Object.assign({}, memoryUiState);
}
function saveUiState(patch) {
    const current = loadUiState();
    const next = Object.assign(Object.assign({}, current), patch);
    memoryUiState = Object.assign({}, next);
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
        }
    }
    catch (error) {
        console.warn('[i18n-tool] save state failed', error);
    }
}
function setupTabSwitcher(panel, initialTab = 'tab-1') {
    const tabButtons = panel.$.tabHeader.querySelectorAll('.tab-btn');
    const tabPanes = panel.$.tabContent.querySelectorAll('.tab-pane');
    const activateTab = (tabId) => {
        tabButtons.forEach((button) => button.classList.remove('active'));
        tabPanes.forEach((pane) => pane.classList.remove('active'));
        const activeButton = panel.$.tabHeader.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        const activePane = panel.$.tabContent.querySelector(`#${tabId}`);
        activeButton === null || activeButton === void 0 ? void 0 : activeButton.classList.add('active');
        activePane === null || activePane === void 0 ? void 0 : activePane.classList.add('active');
    };
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (!tabId || !TAB_IDS.includes(tabId)) {
                return;
            }
            activateTab(tabId);
            saveUiState({ activeTab: tabId });
        });
    });
    activateTab(initialTab);
}
function initI18nTool(panel) {
    // require modules
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs-extra');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    // encode imported statically at module top
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Papa = require('papaparse');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');
    const srcBtn = panel.$.tabContent.querySelector('#src-folder-btn');
    const outBtn = panel.$.tabContent.querySelector('#out-folder-btn');
    const srcPathInput = panel.$.tabContent.querySelector('#src-folder-path');
    const outPathInput = panel.$.tabContent.querySelector('#out-folder-path');
    const headerInput = panel.$.tabContent.querySelector('#header-input');
    const dupCheck = panel.$.tabContent.querySelector('#dup-check');
    const processBtn = panel.$.tabContent.querySelector('#process-btn');
    const getEditor = () => globalThis.Editor;
    const statusArea = panel.$.tabContent.querySelector('#status-area');
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
    const pickFolder = async (title, currentPath) => {
        var _a;
        const editor = getEditor();
        if (!((_a = editor === null || editor === void 0 ? void 0 : editor.Dialog) === null || _a === void 0 ? void 0 : _a.select)) {
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
        return result.filePaths[0];
    };
    const updateAndSave = (patch) => {
        const current = loadUiState();
        const next = Object.assign(Object.assign({}, current), patch);
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
    const escapeHtml = (s) => {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
    const appendStatus = (msg, type = 'info') => {
        if (statusArea) {
            const cls = type === 'error' ? 'status-error' : 'status-info';
            statusArea.innerHTML += `<div class="${cls}">${escapeHtml(msg)}</div>`;
            statusArea.scrollTop = statusArea.scrollHeight;
        }
        if (type === 'error') {
            console.error('[i18n-tool]', msg);
        }
        else {
            console.log('[i18n-tool]', msg);
        }
    };
    const removeMsgpackFiles = (dir) => {
        if (!fs.existsSync(dir)) {
            return;
        }
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                removeMsgpackFiles(fullPath);
                continue;
            }
            if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.msgpack') {
                fs.removeSync(fullPath);
            }
        }
    };
    async function parseFile(filePath) {
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
        var _a, _b, _c, _d;
        if (!srcPathInput || !outPathInput || !headerInput) {
            appendStatus('控件未就绪');
            return;
        }
        const headerText = headerInput.value.trim();
        if (!headerText) {
            appendStatus('请填写字段头，例如：Key,Chinese,English');
            return;
        }
        const headers = headerText.split(/\s*[,，]\s*/).map((s) => s.trim()).filter((s) => s.length > 0);
        if (headers.length < 2) {
            appendStatus('字段头至少需包含 key 和一种语言字段');
            return;
        }
        const keyField = headers[0];
        const langFields = headers.slice(1);
        const srcRoot = (srcPathInput === null || srcPathInput === void 0 ? void 0 : srcPathInput.value.trim()) || '';
        const outRoot = (outPathInput === null || outPathInput === void 0 ? void 0 : outPathInput.value.trim()) || '';
        const checkDup = !!(dupCheck === null || dupCheck === void 0 ? void 0 : dupCheck.checked);
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
        const dataFiles = allFiles.filter((f) => ['.csv', '.xlsx', '.xls'].includes(path.extname(f).toLowerCase()));
        if (dataFiles.length === 0) {
            appendStatus('源目录中没有找到 csv 或 xlsx 文件');
            return;
        }
        appendStatus(`发现 ${dataFiles.length} 个源文件`);
        appendStatus(`每个语言将输出 1 个 MessagePack 文件`);
        // aggregate across all files into overall language maps
        const overallLangMaps = {};
        langFields.forEach((lf) => { overallLangMaps[lf] = {}; });
        const duplicatesByLang = {};
        langFields.forEach((lf) => { duplicatesByLang[lf] = new Set(); });
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
                    const row = rows[r];
                    const key = String((_a = row[keyField]) !== null && _a !== void 0 ? _a : '').trim();
                    if (!key)
                        continue;
                    for (let li = 0; li < langFields.length; li++) {
                        const lf = langFields[li];
                        const val = String((_b = row[lf]) !== null && _b !== void 0 ? _b : '');
                        if (checkDup && Object.prototype.hasOwnProperty.call(overallLangMaps[lf], key)) {
                            duplicatesByLang[lf].add(key);
                        }
                        else {
                            overallLangMaps[lf][key] = val;
                        }
                    }
                }
                appendStatus(`解析 ${filename} 完成`);
            }
            catch (err) {
                const em = (_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err);
                appendStatus(`解析 ${filename} 失败: ${em}`);
            }
        }
        // if checkDup enabled, verify duplicates
        if (checkDup) {
            const dupMsgs = [];
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
                appendStatus(`清理旧的 .msgpack 文件 ${langDir}`);
                removeMsgpackFiles(langDir);
                fs.ensureDirSync(langDir);
                const outFile = path.join(langDir, `${lf}.msgpack`);
                const packed = (0, msgpack_1.encode)(overallLangMaps[lf]);
                fs.writeFileSync(outFile, Buffer.from(packed));
                appendStatus(`写入 ${outFile}`);
            }
            catch (err) {
                appendStatus(`写入 ${lf} 失败: ${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : String(err)}`);
            }
        }
        appendStatus('全部完成');
    }
    applyState();
    if (srcBtn) {
        srcBtn.addEventListener('click', async () => {
            var _a;
            try {
                appendStatus('正在打开源文件夹选择框...');
                const folderPath = await pickFolder('选择源文件夹', (srcPathInput === null || srcPathInput === void 0 ? void 0 : srcPathInput.value.trim()) || '');
                if (!folderPath) {
                    appendStatus('未选择源文件夹');
                    return;
                }
                updateAndSave({ srcRoot: folderPath });
                appendStatus(`已选择源文件夹: ${folderPath}`);
            }
            catch (error) {
                appendStatus(`选择源文件夹失败: ${(_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error)}`);
            }
        });
    }
    if (outPathInput) {
        outPathInput.addEventListener('input', () => saveUiState({ outRoot: outPathInput.value.trim() }));
    }
    if (outBtn) {
        outBtn.addEventListener('click', async () => {
            var _a;
            try {
                appendStatus('正在打开输出文件夹选择框...');
                const folderPath = await pickFolder('选择输出文件夹', (outPathInput === null || outPathInput === void 0 ? void 0 : outPathInput.value.trim()) || '');
                if (!folderPath) {
                    appendStatus('未选择输出文件夹');
                    return;
                }
                updateAndSave({ outRoot: folderPath });
                appendStatus(`已选择输出文件夹: ${folderPath}`);
            }
            catch (error) {
                appendStatus(`选择输出文件夹失败: ${(_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error)}`);
            }
        });
    }
    if (headerInput) {
        headerInput.addEventListener('input', () => saveUiState({ headerText: headerInput.value }));
    }
    if (processBtn) {
        processBtn.addEventListener('click', () => {
            var _a;
            // clear status
            if (statusArea)
                statusArea.textContent = '';
            saveUiState({
                srcRoot: (srcPathInput === null || srcPathInput === void 0 ? void 0 : srcPathInput.value.trim()) || '',
                outRoot: (outPathInput === null || outPathInput === void 0 ? void 0 : outPathInput.value.trim()) || '',
                headerText: (_a = headerInput === null || headerInput === void 0 ? void 0 : headerInput.value) !== null && _a !== void 0 ? _a : '',
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
    template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
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
        }
        catch (e) {
            console.error('initI18nTool error', e);
        }
    },
    beforeClose() { },
    close() {
        console.log('[gcore-panel]: closed');
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zb3VyY2UvcGFuZWxzL2RlZmF1bHQvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLCtDQUErQzs7QUFFL0MsOENBQTBDO0FBQzFDLHVDQUF3QztBQUN4QywrQkFBNEI7QUFTNUIsTUFBTSxPQUFPLEdBQWMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDOUMsTUFBTSxZQUFZLEdBQUcsaUNBQWlDLENBQUM7QUFFdkQsTUFBTSxnQkFBZ0IsR0FBWTtJQUM5QixPQUFPLEVBQUUsRUFBRTtJQUNYLE9BQU8sRUFBRSxFQUFFO0lBQ1gsVUFBVSxFQUFFLHFCQUFxQjtJQUNqQyxTQUFTLEVBQUUsT0FBTztDQUNyQixDQUFDO0FBRUYsSUFBSSxhQUFhLHFCQUFpQixnQkFBZ0IsQ0FBRSxDQUFDO0FBU3JELFNBQVMsV0FBVzs7SUFDaEIsSUFBSSxDQUFDO1FBQ0QsSUFBSSxPQUFPLFlBQVksS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUN0QyxNQUFNLEdBQUcsR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQy9DLElBQUksR0FBRyxFQUFFLENBQUM7Z0JBQ04sTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQXFCLENBQUM7Z0JBQ25ELE9BQU87b0JBQ0gsT0FBTyxFQUFFLE1BQUEsTUFBTSxDQUFDLE9BQU8sbUNBQUksZ0JBQWdCLENBQUMsT0FBTztvQkFDbkQsT0FBTyxFQUFFLE1BQUEsTUFBTSxDQUFDLE9BQU8sbUNBQUksZ0JBQWdCLENBQUMsT0FBTztvQkFDbkQsVUFBVSxFQUFFLE1BQUEsTUFBTSxDQUFDLFVBQVUsbUNBQUksZ0JBQWdCLENBQUMsVUFBVTtvQkFDNUQsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9B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SjtJQUNELFFBQVEsRUFBRSxJQUFBLHVCQUFZLEVBQUMsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLDZDQUE2QyxDQUFDLEVBQUUsT0FBTyxDQUFDO0lBQy9GLEtBQUssRUFBRSxJQUFBLHVCQUFZLEVBQUMsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLHlDQUF5QyxDQUFDLEVBQUUsT0FBTyxDQUFDO0lBQ3hGLENBQUMsRUFBRTtRQUNDLFNBQVMsRUFBRSxhQUFhO1FBQ3hCLFVBQVUsRUFBRSxjQUFjO0tBQzdCO0lBQ0QsT0FBTyxFQUFFO1FBQ0wsS0FBSztZQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUN4QyxDQUFDO0tBQ0o7SUFDRCxLQUFLO1FBQ0QsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQztZQUNELFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QixDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNULE9BQU8sQ0FBQyxLQUFLLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsQ0FBQztJQUNMLENBQUM7SUFDRCxXQUFXLEtBQUksQ0FBQztJQUNoQixLQUFLO1FBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSB2dWUvb25lLWNvbXBvbmVudC1wZXItZmlsZSAqL1xyXG5cclxuaW1wb3J0IHsgZW5jb2RlIH0gZnJvbSAnQG1zZ3BhY2svbXNncGFjayc7XHJcbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzLWV4dHJhJztcclxuaW1wb3J0IHsgam9pbiB9IGZyb20gJ3BhdGgnO1xyXG4vKipcclxuICogQHpoIOWmguaenOW4jOacm+WFvOWuuSAzLjMg5LmL5YmN55qE54mI5pys5Y+v5Lul5L2/55So5LiL5pa555qE5Luj56CBXHJcbiAqIEBlbiBZb3UgY2FuIGFkZCB0aGUgY29kZSBiZWxvdyBpZiB5b3Ugd2FudCBjb21wYXRpYmlsaXR5IHdpdGggdmVyc2lvbnMgcHJpb3IgdG8gMy4zXHJcbiAqL1xyXG4vLyBFZGl0b3IuUGFuZWwuZGVmaW5lID0gRWRpdG9yLlBhbmVsLmRlZmluZSB8fCBmdW5jdGlvbihvcHRpb25zOiBhbnkpIHsgcmV0dXJuIG9wdGlvbnMgfVxyXG5cclxudHlwZSBUYWJOYW1lID0gJ3RhYi0xJyB8ICd0YWItMic7XHJcblxyXG5jb25zdCBUQUJfSURTOiBUYWJOYW1lW10gPSBbJ3RhYi0xJywgJ3RhYi0yJ107XHJcbmNvbnN0IFVJX1NUQVRFX0tFWSA9ICdnY29yZS1mcmFtZXdvcmsuaTE4bi10b29sLnN0YXRlJztcclxuXHJcbmNvbnN0IERFRkFVTFRfVUlfU1RBVEU6IFVpU3RhdGUgPSB7XHJcbiAgICBzcmNSb290OiAnJyxcclxuICAgIG91dFJvb3Q6ICcnLFxyXG4gICAgaGVhZGVyVGV4dDogJ0tleSxDaGluZXNlLEVuZ2xpc2gnLFxyXG4gICAgYWN0aXZlVGFiOiAndGFiLTEnLFxyXG59O1xyXG5cclxubGV0IG1lbW9yeVVpU3RhdGU6IFVpU3RhdGUgPSB7IC4uLkRFRkFVTFRfVUlfU1RBVEUgfTtcclxuXHJcbnR5cGUgVWlTdGF0ZSA9IHtcclxuICAgIHNyY1Jvb3Q6IHN0cmluZztcclxuICAgIG91dFJvb3Q6IHN0cmluZztcclxuICAgIGhlYWRlclRleHQ6IHN0cmluZztcclxuICAgIGFjdGl2ZVRhYjogVGFiTmFtZTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIGxvYWRVaVN0YXRlKCk6IFVpU3RhdGUge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICBpZiAodHlwZW9mIGxvY2FsU3RvcmFnZSAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgY29uc3QgcmF3ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oVUlfU1RBVEVfS0VZKTtcclxuICAgICAgICAgICAgaWYgKHJhdykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFBhcnRpYWw8VWlTdGF0ZT47XHJcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHNyY1Jvb3Q6IHBhcnNlZC5zcmNSb290ID8/IERFRkFVTFRfVUlfU1RBVEUuc3JjUm9vdCxcclxuICAgICAgICAgICAgICAgICAgICBvdXRSb290OiBwYXJzZWQub3V0Um9vdCA/PyBERUZBVUxUX1VJX1NUQVRFLm91dFJvb3QsXHJcbiAgICAgICAgICAgICAgICAgICAgaGVhZGVyVGV4dDogcGFyc2VkLmhlYWRlclRleHQgPz8gREVGQVVMVF9VSV9TVEFURS5oZWFkZXJUZXh0LFxyXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZVRhYjogcGFyc2VkLmFjdGl2ZVRhYiA9PT0gJ3RhYi0yJyA/ICd0YWItMicgOiAndGFiLTEnLFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKCdbaTE4bi10b29sXSBsb2FkIHN0YXRlIGZhaWxlZCcsIGVycm9yKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyAuLi5tZW1vcnlVaVN0YXRlIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNhdmVVaVN0YXRlKHBhdGNoOiBQYXJ0aWFsPFVpU3RhdGU+KSB7XHJcbiAgICBjb25zdCBjdXJyZW50ID0gbG9hZFVpU3RhdGUoKTtcclxuICAgIGNvbnN0IG5leHQgPSB7IC4uLmN1cnJlbnQsIC4uLnBhdGNoIH07XHJcbiAgICBtZW1vcnlVaVN0YXRlID0geyAuLi5uZXh0IH07XHJcbiAgICB0cnkge1xyXG4gICAgICAgIGlmICh0eXBlb2YgbG9jYWxTdG9yYWdlICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShVSV9TVEFURV9LRVksIEpTT04uc3RyaW5naWZ5KG5leHQpKTtcclxuICAgICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUud2FybignW2kxOG4tdG9vbF0gc2F2ZSBzdGF0ZSBmYWlsZWQnLCBlcnJvcik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwVGFiU3dpdGNoZXIocGFuZWw6IGFueSwgaW5pdGlhbFRhYjogVGFiTmFtZSA9ICd0YWItMScpIHtcclxuICAgIGNvbnN0IHRhYkJ1dHRvbnMgPSBwYW5lbC4kLnRhYkhlYWRlci5xdWVyeVNlbGVjdG9yQWxsKCcudGFiLWJ0bicpO1xyXG4gICAgY29uc3QgdGFiUGFuZXMgPSBwYW5lbC4kLnRhYkNvbnRlbnQucXVlcnlTZWxlY3RvckFsbCgnLnRhYi1wYW5lJyk7XHJcblxyXG4gICAgY29uc3QgYWN0aXZhdGVUYWIgPSAodGFiSWQ6IFRhYk5hbWUpID0+IHtcclxuICAgICAgICB0YWJCdXR0b25zLmZvckVhY2goKGJ1dHRvbjogSFRNTEVsZW1lbnQpID0+IGJ1dHRvbi5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XHJcbiAgICAgICAgdGFiUGFuZXMuZm9yRWFjaCgocGFuZTogSFRNTEVsZW1lbnQpID0+IHBhbmUuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xyXG5cclxuICAgICAgICBjb25zdCBhY3RpdmVCdXR0b24gPSBwYW5lbC4kLnRhYkhlYWRlci5xdWVyeVNlbGVjdG9yKGAudGFiLWJ0bltkYXRhLXRhYj1cIiR7dGFiSWR9XCJdYCkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZVBhbmUgPSBwYW5lbC4kLnRhYkNvbnRlbnQucXVlcnlTZWxlY3RvcihgIyR7dGFiSWR9YCkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xyXG5cclxuICAgICAgICBhY3RpdmVCdXR0b24/LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xyXG4gICAgICAgIGFjdGl2ZVBhbmU/LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xyXG4gICAgfTtcclxuXHJcbiAgICB0YWJCdXR0b25zLmZvckVhY2goKGJ1dHRvbjogSFRNTEVsZW1lbnQpID0+IHtcclxuICAgICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRhYklkID0gYnV0dG9uLmdldEF0dHJpYnV0ZSgnZGF0YS10YWInKSBhcyBUYWJOYW1lIHwgbnVsbDtcclxuICAgICAgICAgICAgaWYgKCF0YWJJZCB8fCAhVEFCX0lEUy5pbmNsdWRlcyh0YWJJZCkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBhY3RpdmF0ZVRhYih0YWJJZCk7XHJcbiAgICAgICAgICAgIHNhdmVVaVN0YXRlKHsgYWN0aXZlVGFiOiB0YWJJZCB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGFjdGl2YXRlVGFiKGluaXRpYWxUYWIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpbml0STE4blRvb2wocGFuZWw6IGFueSkge1xyXG4gICAgLy8gcmVxdWlyZSBtb2R1bGVzXHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xyXG4gICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcy1leHRyYScpO1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcclxuICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XHJcbiAgICAvLyBlbmNvZGUgaW1wb3J0ZWQgc3RhdGljYWxseSBhdCBtb2R1bGUgdG9wXHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xyXG4gICAgY29uc3QgUGFwYSA9IHJlcXVpcmUoJ3BhcGFwYXJzZScpO1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcclxuICAgIGNvbnN0IFhMU1ggPSByZXF1aXJlKCd4bHN4Jyk7XHJcblxyXG4gICAgY29uc3Qgc3JjQnRuID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNzcmMtZm9sZGVyLWJ0bicpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IG91dEJ0biA9IHBhbmVsLiQudGFiQ29udGVudC5xdWVyeVNlbGVjdG9yKCcjb3V0LWZvbGRlci1idG4nKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XHJcbiAgICBjb25zdCBzcmNQYXRoSW5wdXQgPSBwYW5lbC4kLnRhYkNvbnRlbnQucXVlcnlTZWxlY3RvcignI3NyYy1mb2xkZXItcGF0aCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xyXG4gICAgY29uc3Qgb3V0UGF0aElucHV0ID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNvdXQtZm9sZGVyLXBhdGgnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IGhlYWRlcklucHV0ID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNoZWFkZXItaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IGR1cENoZWNrID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNkdXAtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IHByb2Nlc3NCdG4gPSBwYW5lbC4kLnRhYkNvbnRlbnQucXVlcnlTZWxlY3RvcignI3Byb2Nlc3MtYnRuJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xyXG4gICAgY29uc3QgZ2V0RWRpdG9yID0gKCkgPT4gKGdsb2JhbFRoaXMgYXMgYW55KS5FZGl0b3I7XHJcbiAgICBjb25zdCBzdGF0dXNBcmVhID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNzdGF0dXMtYXJlYScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuXHJcbiAgICBjb25zdCBhcHBseVN0YXRlID0gKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHN0YXRlID0gbG9hZFVpU3RhdGUoKTtcclxuICAgICAgICBpZiAoc3JjUGF0aElucHV0KSB7XHJcbiAgICAgICAgICAgIHNyY1BhdGhJbnB1dC52YWx1ZSA9IHN0YXRlLnNyY1Jvb3Q7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChvdXRQYXRoSW5wdXQpIHtcclxuICAgICAgICAgICAgb3V0UGF0aElucHV0LnZhbHVlID0gc3RhdGUub3V0Um9vdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGhlYWRlcklucHV0KSB7XHJcbiAgICAgICAgICAgIGhlYWRlcklucHV0LnZhbHVlID0gc3RhdGUuaGVhZGVyVGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGR1cENoZWNrKSB7XHJcbiAgICAgICAgICAgIGR1cENoZWNrLmNoZWNrZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgcGlja0ZvbGRlciA9IGFzeW5jICh0aXRsZTogc3RyaW5nLCBjdXJyZW50UGF0aDogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZWRpdG9yID0gZ2V0RWRpdG9yKCk7XHJcbiAgICAgICAgaWYgKCFlZGl0b3I/LkRpYWxvZz8uc2VsZWN0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRWRpdG9yLkRpYWxvZy5zZWxlY3Qg5LiN5Y+v55SoJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBlZGl0b3IuRGlhbG9nLnNlbGVjdCh7XHJcbiAgICAgICAgICAgIHRpdGxlLFxyXG4gICAgICAgICAgICB0eXBlOiAnZGlyZWN0b3J5JyxcclxuICAgICAgICAgICAgcGF0aDogY3VycmVudFBhdGggfHwgdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICBidXR0b246ICfpgInmi6knLFxyXG4gICAgICAgICAgICBtdWx0aTogZmFsc2UsXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5jYW5jZWxlZCB8fCAhcmVzdWx0LmZpbGVQYXRocyB8fCByZXN1bHQuZmlsZVBhdGhzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0LmZpbGVQYXRoc1swXSBhcyBzdHJpbmc7XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IHVwZGF0ZUFuZFNhdmUgPSAocGF0Y2g6IFBhcnRpYWw8VWlTdGF0ZT4pID0+IHtcclxuICAgICAgICBjb25zdCBjdXJyZW50ID0gbG9hZFVpU3RhdGUoKTtcclxuICAgICAgICBjb25zdCBuZXh0ID0geyAuLi5jdXJyZW50LCAuLi5wYXRjaCB9O1xyXG4gICAgICAgIGlmIChzcmNQYXRoSW5wdXQgJiYgdHlwZW9mIG5leHQuc3JjUm9vdCA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgc3JjUGF0aElucHV0LnZhbHVlID0gbmV4dC5zcmNSb290O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAob3V0UGF0aElucHV0ICYmIHR5cGVvZiBuZXh0Lm91dFJvb3QgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIG91dFBhdGhJbnB1dC52YWx1ZSA9IG5leHQub3V0Um9vdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGhlYWRlcklucHV0ICYmIHR5cGVvZiBuZXh0LmhlYWRlclRleHQgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIGhlYWRlcklucHV0LnZhbHVlID0gbmV4dC5oZWFkZXJUZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBzYXZlVWlTdGF0ZShuZXh0KTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgZXNjYXBlSHRtbCA9IChzOiBzdHJpbmcpID0+IHtcclxuICAgICAgICByZXR1cm4gU3RyaW5nKHMpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcclxuICAgICAgICAgICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csICcmIzAzOTsnKTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgYXBwZW5kU3RhdHVzID0gKG1zZzogc3RyaW5nLCB0eXBlOiAnaW5mbycgfCAnZXJyb3InID0gJ2luZm8nKSA9PiB7XHJcbiAgICAgICAgaWYgKHN0YXR1c0FyZWEpIHtcclxuICAgICAgICAgICAgY29uc3QgY2xzID0gdHlwZSA9PT0gJ2Vycm9yJyA/ICdzdGF0dXMtZXJyb3InIDogJ3N0YXR1cy1pbmZvJztcclxuICAgICAgICAgICAgc3RhdHVzQXJlYS5pbm5lckhUTUwgKz0gYDxkaXYgY2xhc3M9XCIke2Nsc31cIj4ke2VzY2FwZUh0bWwobXNnKX08L2Rpdj5gO1xyXG4gICAgICAgICAgICBzdGF0dXNBcmVhLnNjcm9sbFRvcCA9IHN0YXR1c0FyZWEuc2Nyb2xsSGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbaTE4bi10b29sXScsIG1zZyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tpMThuLXRvb2xdJywgbXNnKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IHJlbW92ZU1zZ3BhY2tGaWxlcyA9IChkaXI6IHN0cmluZykgPT4ge1xyXG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhkaXIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGVudHJpZXMgPSBmcy5yZWFkZGlyU3luYyhkaXIsIHsgd2l0aEZpbGVUeXBlczogdHJ1ZSB9KTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVudHJpZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBlbnRyaWVzW2ldO1xyXG4gICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGguam9pbihkaXIsIGVudHJ5Lm5hbWUpO1xyXG4gICAgICAgICAgICBpZiAoZW50cnkuaXNEaXJlY3RvcnkoKSkge1xyXG4gICAgICAgICAgICAgICAgcmVtb3ZlTXNncGFja0ZpbGVzKGZ1bGxQYXRoKTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChlbnRyeS5pc0ZpbGUoKSAmJiBwYXRoLmV4dG5hbWUoZW50cnkubmFtZSkudG9Mb3dlckNhc2UoKSA9PT0gJy5tc2dwYWNrJykge1xyXG4gICAgICAgICAgICAgICAgZnMucmVtb3ZlU3luYyhmdWxsUGF0aCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIHBhcnNlRmlsZShmaWxlUGF0aDogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgZXh0ID0gcGF0aC5leHRuYW1lKGZpbGVQYXRoKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGlmIChleHQgPT09ICcuY3N2Jykge1xyXG4gICAgICAgICAgICBjb25zdCB0eHQgPSBmcy5yZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGY4Jyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IFBhcGEucGFyc2UodHh0LCB7IGhlYWRlcjogdHJ1ZSwgc2tpcEVtcHR5TGluZXM6IHRydWUgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJzZWQuZGF0YTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGV4dCA9PT0gJy54bHN4JyB8fCBleHQgPT09ICcueGxzJykge1xyXG4gICAgICAgICAgICBjb25zdCB3b3JrYm9vayA9IFhMU1gucmVhZEZpbGUoZmlsZVBhdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBzaGVldE5hbWUgPSB3b3JrYm9vay5TaGVldE5hbWVzWzBdO1xyXG4gICAgICAgICAgICBjb25zdCByb3dzID0gWExTWC51dGlscy5zaGVldF90b19qc29uKHdvcmtib29rLlNoZWV0c1tzaGVldE5hbWVdLCB7IGRlZnZhbDogJycgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiByb3dzO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBkb1Byb2Nlc3MoKSB7XHJcbiAgICAgICAgaWYgKCFzcmNQYXRoSW5wdXQgfHwgIW91dFBhdGhJbnB1dCB8fCAhaGVhZGVySW5wdXQpIHtcclxuICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCfmjqfku7bmnKrlsLHnu6onKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGVhZGVyVGV4dCA9IGhlYWRlcklucHV0LnZhbHVlLnRyaW0oKTtcclxuICAgICAgICBpZiAoIWhlYWRlclRleHQpIHtcclxuICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCfor7floavlhpnlrZfmrrXlpLTvvIzkvovlpoLvvJpLZXksQ2hpbmVzZSxFbmdsaXNoJyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgaGVhZGVycyA9IGhlYWRlclRleHQuc3BsaXQoL1xccypbLO+8jF1cXHMqLykubWFwKChzOiBzdHJpbmcpID0+IHMudHJpbSgpKS5maWx0ZXIoKHM6IHN0cmluZykgPT4gcy5sZW5ndGggPiAwKTtcclxuICAgICAgICBpZiAoaGVhZGVycy5sZW5ndGggPCAyKSB7XHJcbiAgICAgICAgICAgIGFwcGVuZFN0YXR1cygn5a2X5q615aS06Iez5bCR6ZyA5YyF5ZCrIGtleSDlkozkuIDnp43or63oqIDlrZfmrrUnKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBrZXlGaWVsZCA9IGhlYWRlcnNbMF07XHJcbiAgICAgICAgY29uc3QgbGFuZ0ZpZWxkcyA9IGhlYWRlcnMuc2xpY2UoMSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNyY1Jvb3QgPSBzcmNQYXRoSW5wdXQ/LnZhbHVlLnRyaW0oKSB8fCAnJztcclxuICAgICAgICBjb25zdCBvdXRSb290ID0gb3V0UGF0aElucHV0Py52YWx1ZS50cmltKCkgfHwgJyc7XHJcbiAgICAgICAgY29uc3QgY2hlY2tEdXAgPSAhIShkdXBDaGVjaz8uY2hlY2tlZCk7XHJcblxyXG4gICAgICAgIGlmICghc3JjUm9vdCkge1xyXG4gICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+ivt+WFiOmAieaLqea6kOaWh+S7tuWkuScpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICghb3V0Um9vdCkge1xyXG4gICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+ivt+WFiOmAieaLqei+k+WHuuaWh+S7tuWkuScpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhcHBlbmRTdGF0dXMoJ+W8gOWni+i9rOaNoicpO1xyXG4gICAgICAgIGFwcGVuZFN0YXR1cyhg5rqQ55uu5b2VOiAke3NyY1Jvb3R9YCk7XHJcbiAgICAgICAgYXBwZW5kU3RhdHVzKGDovpPlh7rnm67lvZU6ICR7b3V0Um9vdH1gKTtcclxuICAgICAgICBhcHBlbmRTdGF0dXMoYOWtl+auteWktDogJHtoZWFkZXJzLmpvaW4oJywnKX1gKTtcclxuXHJcbiAgICAgICAgLy8gbGlzdCBmaWxlcyBpbiBzcmNSb290XHJcbiAgICAgICAgY29uc3QgYWxsRmlsZXMgPSBmcy5yZWFkZGlyU3luYyhzcmNSb290KTtcclxuICAgICAgICBjb25zdCBkYXRhRmlsZXMgPSBhbGxGaWxlcy5maWx0ZXIoKGY6IHN0cmluZykgPT4gWycuY3N2JywgJy54bHN4JywgJy54bHMnXS5pbmNsdWRlcyhwYXRoLmV4dG5hbWUoZikudG9Mb3dlckNhc2UoKSkpO1xyXG4gICAgICAgIGlmIChkYXRhRmlsZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIGFwcGVuZFN0YXR1cygn5rqQ55uu5b2V5Lit5rKh5pyJ5om+5YiwIGNzdiDmiJYgeGxzeCDmlofku7YnKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXBwZW5kU3RhdHVzKGDlj5HnjrAgJHtkYXRhRmlsZXMubGVuZ3RofSDkuKrmupDmlofku7ZgKTtcclxuICAgICAgICBhcHBlbmRTdGF0dXMoYOavj+S4quivreiogOWwhui+k+WHuiAxIOS4qiBNZXNzYWdlUGFjayDmlofku7ZgKTtcclxuXHJcbiAgICAgICAgLy8gYWdncmVnYXRlIGFjcm9zcyBhbGwgZmlsZXMgaW50byBvdmVyYWxsIGxhbmd1YWdlIG1hcHNcclxuICAgICAgICBjb25zdCBvdmVyYWxsTGFuZ01hcHM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIHN0cmluZz4+ID0ge307XHJcbiAgICAgICAgbGFuZ0ZpZWxkcy5mb3JFYWNoKChsZjogc3RyaW5nKSA9PiB7IG92ZXJhbGxMYW5nTWFwc1tsZl0gPSB7fTsgfSk7XHJcbiAgICAgICAgY29uc3QgZHVwbGljYXRlc0J5TGFuZzogUmVjb3JkPHN0cmluZywgU2V0PHN0cmluZz4+ID0ge307XHJcbiAgICAgICAgbGFuZ0ZpZWxkcy5mb3JFYWNoKChsZjogc3RyaW5nKSA9PiB7IGR1cGxpY2F0ZXNCeUxhbmdbbGZdID0gbmV3IFNldCgpOyB9KTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhRmlsZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBkYXRhRmlsZXNbaV07XHJcbiAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5qb2luKHNyY1Jvb3QsIGZpbGVuYW1lKTtcclxuICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDop6PmnpAgJHtmaWxlbmFtZX0gLi4uYCk7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgcGFyc2VGaWxlKGZ1bGxQYXRoKTtcclxuICAgICAgICAgICAgICAgIGlmICghcm93cyB8fCByb3dzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg5paH5Lu2ICR7ZmlsZW5hbWV9IOaXoOaVsOaNru+8jOi3s+i/h2ApO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgcm93cy5sZW5ndGg7IHIrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJvd3Nbcl0gYXMgUmVjb3JkPHN0cmluZywgYW55PjtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBTdHJpbmcocm93W2tleUZpZWxkXSA/PyAnJykudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICgha2V5KSBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBsaSA9IDA7IGxpIDwgbGFuZ0ZpZWxkcy5sZW5ndGg7IGxpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGYgPSBsYW5nRmllbGRzW2xpXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsID0gU3RyaW5nKHJvd1tsZl0gPz8gJycpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2hlY2tEdXAgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG92ZXJhbGxMYW5nTWFwc1tsZl0sIGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR1cGxpY2F0ZXNCeUxhbmdbbGZdLmFkZChrZXkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcmFsbExhbmdNYXBzW2xmXVtrZXldID0gdmFsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg6Kej5p6QICR7ZmlsZW5hbWV9IOWujOaIkGApO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVtID0gKGVyciBhcyBhbnkpPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpO1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDop6PmnpAgJHtmaWxlbmFtZX0g5aSx6LSlOiAke2VtfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBpZiBjaGVja0R1cCBlbmFibGVkLCB2ZXJpZnkgZHVwbGljYXRlc1xyXG4gICAgICAgIGlmIChjaGVja0R1cCkge1xyXG4gICAgICAgICAgICBjb25zdCBkdXBNc2dzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBsaSA9IDA7IGxpIDwgbGFuZ0ZpZWxkcy5sZW5ndGg7IGxpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGxmID0gbGFuZ0ZpZWxkc1tsaV07XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkc2V0ID0gZHVwbGljYXRlc0J5TGFuZ1tsZl07XHJcbiAgICAgICAgICAgICAgICBpZiAoZHNldCAmJiBkc2V0LnNpemUgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZHVwTXNncy5wdXNoKGAke2xmfTogJHtBcnJheS5mcm9tKGRzZXQpLmpvaW4oJywgJyl9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGR1cE1zZ3MubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCflj5HnjrDph43lpI0gS2V577yM5bey5Y+W5raI55Sf5oiQ77yaJywgJ2Vycm9yJyk7XHJcbiAgICAgICAgICAgICAgICBkdXBNc2dzLmZvckVhY2gobSA9PiBhcHBlbmRTdGF0dXMobSwgJ2Vycm9yJykpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBjbGVhciBvbGQgbGFuZ3VhZ2UgZm9sZGVycyBhbmQgd3JpdGUgYSBzaW5nbGUgbXNncGFjayBmaWxlIHBlciBsYW5ndWFnZVxyXG4gICAgICAgIGZvciAobGV0IGxpID0gMDsgbGkgPCBsYW5nRmllbGRzLmxlbmd0aDsgbGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBsZiA9IGxhbmdGaWVsZHNbbGldO1xyXG4gICAgICAgICAgICBjb25zdCBsYW5nRGlyID0gcGF0aC5qb2luKG91dFJvb3QsIGxmKTtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg5riF55CG5pen55qEIC5tc2dwYWNrIOaWh+S7tiAke2xhbmdEaXJ9YCk7XHJcbiAgICAgICAgICAgICAgICByZW1vdmVNc2dwYWNrRmlsZXMobGFuZ0Rpcik7XHJcbiAgICAgICAgICAgICAgICBmcy5lbnN1cmVEaXJTeW5jKGxhbmdEaXIpO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb3V0RmlsZSA9IHBhdGguam9pbihsYW5nRGlyLCBgJHtsZn0ubXNncGFja2ApO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFja2VkID0gZW5jb2RlKG92ZXJhbGxMYW5nTWFwc1tsZl0pO1xyXG4gICAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhvdXRGaWxlLCBCdWZmZXIuZnJvbShwYWNrZWQpKTtcclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg5YaZ5YWlICR7b3V0RmlsZX1gKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICBhcHBlbmRTdGF0dXMoYOWGmeWFpSAke2xmfSDlpLHotKU6ICR7KGVyciBhcyBhbnkpPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhcHBlbmRTdGF0dXMoJ+WFqOmDqOWujOaIkCcpO1xyXG4gICAgfVxyXG5cclxuICAgIGFwcGx5U3RhdGUoKTtcclxuXHJcbiAgICBpZiAoc3JjQnRuKSB7XHJcbiAgICAgICAgc3JjQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCfmraPlnKjmiZPlvIDmupDmlofku7blpLnpgInmi6nmoYYuLi4nKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZvbGRlclBhdGggPSBhd2FpdCBwaWNrRm9sZGVyKCfpgInmi6nmupDmlofku7blpLknLCBzcmNQYXRoSW5wdXQ/LnZhbHVlLnRyaW0oKSB8fCAnJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWZvbGRlclBhdGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+acqumAieaLqea6kOaWh+S7tuWkuScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHVwZGF0ZUFuZFNhdmUoeyBzcmNSb290OiBmb2xkZXJQYXRoIH0pO1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDlt7LpgInmi6nmupDmlofku7blpLk6ICR7Zm9sZGVyUGF0aH1gKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg6YCJ5oup5rqQ5paH5Lu25aS55aSx6LSlOiAkeyhlcnJvciBhcyBhbnkpPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcil9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAob3V0UGF0aElucHV0KSB7XHJcbiAgICAgICAgb3V0UGF0aElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKCkgPT4gc2F2ZVVpU3RhdGUoeyBvdXRSb290OiBvdXRQYXRoSW5wdXQudmFsdWUudHJpbSgpIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAob3V0QnRuKSB7XHJcbiAgICAgICAgb3V0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCfmraPlnKjmiZPlvIDovpPlh7rmlofku7blpLnpgInmi6nmoYYuLi4nKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZvbGRlclBhdGggPSBhd2FpdCBwaWNrRm9sZGVyKCfpgInmi6novpPlh7rmlofku7blpLknLCBvdXRQYXRoSW5wdXQ/LnZhbHVlLnRyaW0oKSB8fCAnJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWZvbGRlclBhdGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+acqumAieaLqei+k+WHuuaWh+S7tuWkuScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHVwZGF0ZUFuZFNhdmUoeyBvdXRSb290OiBmb2xkZXJQYXRoIH0pO1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDlt7LpgInmi6novpPlh7rmlofku7blpLk6ICR7Zm9sZGVyUGF0aH1gKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg6YCJ5oup6L6T5Ye65paH5Lu25aS55aSx6LSlOiAkeyhlcnJvciBhcyBhbnkpPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcil9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoaGVhZGVySW5wdXQpIHtcclxuICAgICAgICBoZWFkZXJJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHNhdmVVaVN0YXRlKHsgaGVhZGVyVGV4dDogaGVhZGVySW5wdXQudmFsdWUgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChwcm9jZXNzQnRuKSB7XHJcbiAgICAgICAgcHJvY2Vzc0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgLy8gY2xlYXIgc3RhdHVzXHJcbiAgICAgICAgICAgIGlmIChzdGF0dXNBcmVhKSBzdGF0dXNBcmVhLnRleHRDb250ZW50ID0gJyc7XHJcbiAgICAgICAgICAgIHNhdmVVaVN0YXRlKHtcclxuICAgICAgICAgICAgICAgIHNyY1Jvb3Q6IHNyY1BhdGhJbnB1dD8udmFsdWUudHJpbSgpIHx8ICcnLFxyXG4gICAgICAgICAgICAgICAgb3V0Um9vdDogb3V0UGF0aElucHV0Py52YWx1ZS50cmltKCkgfHwgJycsXHJcbiAgICAgICAgICAgICAgICBoZWFkZXJUZXh0OiBoZWFkZXJJbnB1dD8udmFsdWUgPz8gJycsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB2b2lkIGRvUHJvY2VzcygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEVkaXRvci5QYW5lbC5kZWZpbmUoe1xyXG4gICAgbGlzdGVuZXJzOiB7XHJcbiAgICAgICAgc2hvdygpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ3Nob3cnKTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGhpZGUoKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdoaWRlJyk7XHJcbiAgICAgICAgfSxcclxuICAgIH0sXHJcbiAgICB0ZW1wbGF0ZTogcmVhZEZpbGVTeW5jKGpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4vc3RhdGljL3RlbXBsYXRlL2RlZmF1bHQvaW5kZXguaHRtbCcpLCAndXRmLTgnKSxcclxuICAgIHN0eWxlOiByZWFkRmlsZVN5bmMoam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9zdGF0aWMvc3R5bGUvZGVmYXVsdC9pbmRleC5jc3MnKSwgJ3V0Zi04JyksXHJcbiAgICAkOiB7XHJcbiAgICAgICAgdGFiSGVhZGVyOiAnLnRhYi1oZWFkZXInLFxyXG4gICAgICAgIHRhYkNvbnRlbnQ6ICcudGFiLWNvbnRlbnQnLFxyXG4gICAgfSxcclxuICAgIG1ldGhvZHM6IHtcclxuICAgICAgICBoZWxsbygpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tnY29yZS1wYW5lbF06IGhlbGxvJyk7XHJcbiAgICAgICAgfSxcclxuICAgIH0sXHJcbiAgICByZWFkeSgpIHtcclxuICAgICAgICBzZXR1cFRhYlN3aXRjaGVyKHRoaXMsIGxvYWRVaVN0YXRlKCkuYWN0aXZlVGFiKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBpbml0STE4blRvb2wodGhpcyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdpbml0STE4blRvb2wgZXJyb3InLCBlKTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG4gICAgYmVmb3JlQ2xvc2UoKSB7fSxcclxuICAgIGNsb3NlKCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbZ2NvcmUtcGFuZWxdOiBjbG9zZWQnKTtcclxuICAgIH0sXHJcbn0pO1xyXG4iXX0=