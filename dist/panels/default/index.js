"use strict";
/* eslint-disable vue/one-component-per-file */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const msgpack_1 = __importDefault(require("@msgpack/msgpack"));
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
        var _a, _b, _c, _d, _e, _f, _g;
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
                if (fs.existsSync(langDir)) {
                    appendStatus(`清理旧目录 ${langDir}`);
                    fs.removeSync(langDir);
                }
                fs.ensureDirSync(langDir);
                const outFile = path.join(langDir, `${lf}.msgpack`);
                const encodeFn = (_f = (_d = msgpack_1.default.encode) !== null && _d !== void 0 ? _d : (_e = msgpack_1.default.default) === null || _e === void 0 ? void 0 : _e.encode) !== null && _f !== void 0 ? _f : msgpack_1.default;
                const packed = encodeFn(overallLangMaps[lf]);
                fs.writeFileSync(outFile, Buffer.from(packed));
                appendStatus(`写入 ${outFile}`);
            }
            catch (err) {
                appendStatus(`写入 ${lf} 失败: ${(_g = err === null || err === void 0 ? void 0 : err.message) !== null && _g !== void 0 ? _g : String(err)}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zb3VyY2UvcGFuZWxzL2RlZmF1bHQvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLCtDQUErQzs7Ozs7QUFFL0MsdUNBQXdDO0FBQ3hDLCtCQUE0QjtBQUM1QiwrREFBdUM7QUFTdkMsTUFBTSxPQUFPLEdBQWMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDOUMsTUFBTSxZQUFZLEdBQUcsaUNBQWlDLENBQUM7QUFFdkQsTUFBTSxnQkFBZ0IsR0FBWTtJQUM5QixPQUFPLEVBQUUsRUFBRTtJQUNYLE9BQU8sRUFBRSxFQUFFO0lBQ1gsVUFBVSxFQUFFLHFCQUFxQjtJQUNqQyxTQUFTLEVBQUUsT0FBTztDQUNyQixDQUFDO0FBRUYsSUFBSSxhQUFhLHFCQUFpQixnQkFBZ0IsQ0FBRSxDQUFDO0FBU3JELFNBQVMsV0FBVzs7SUFDaEIsSUFBSSxDQUFDO1FBQ0QsSUFBSSxPQUFPLFlBQVksS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUN0QyxNQUFNLEdBQUcsR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQy9DLElBQUksR0FBRyxFQUFFLENBQUM7Z0JBQ04sTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQXFCLENBQUM7Z0JBQ25ELE9BQU87b0JBQ0gsT0FBTyxFQUFFLE1BQUEsTUFBTSxDQUFDLE9BQU8sbUNBQUksZ0JBQWdCLENBQUMsT0FBTztvQkFDbkQsT0FBTyxFQUFFLE1BQUEsTUFBTSxDQUFDLE9BQU8sbUNBQUksZ0JBQWdCLENBQUMsT0FBTztvQkFDbkQsVUFBVSxFQUFFLE1BQUEsTUFBTSxDQUFDLFVBQVUsbUNBQUksZ0JBQWdCLENBQUMsVUFBVTtvQkFDNUQsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFD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QUNMLENBQUM7SUFDRCxXQUFXLEtBQUksQ0FBQztJQUNoQixLQUFLO1FBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSB2dWUvb25lLWNvbXBvbmVudC1wZXItZmlsZSAqL1xyXG5cclxuaW1wb3J0IHsgcmVhZEZpbGVTeW5jIH0gZnJvbSAnZnMtZXh0cmEnO1xyXG5pbXBvcnQgeyBqb2luIH0gZnJvbSAncGF0aCc7XHJcbmltcG9ydCBtc2dwYWNrIGZyb20gJ0Btc2dwYWNrL21zZ3BhY2snO1xyXG4vKipcclxuICogQHpoIOWmguaenOW4jOacm+WFvOWuuSAzLjMg5LmL5YmN55qE54mI5pys5Y+v5Lul5L2/55So5LiL5pa555qE5Luj56CBXHJcbiAqIEBlbiBZb3UgY2FuIGFkZCB0aGUgY29kZSBiZWxvdyBpZiB5b3Ugd2FudCBjb21wYXRpYmlsaXR5IHdpdGggdmVyc2lvbnMgcHJpb3IgdG8gMy4zXHJcbiAqL1xyXG4vLyBFZGl0b3IuUGFuZWwuZGVmaW5lID0gRWRpdG9yLlBhbmVsLmRlZmluZSB8fCBmdW5jdGlvbihvcHRpb25zOiBhbnkpIHsgcmV0dXJuIG9wdGlvbnMgfVxyXG5cclxudHlwZSBUYWJOYW1lID0gJ3RhYi0xJyB8ICd0YWItMic7XHJcblxyXG5jb25zdCBUQUJfSURTOiBUYWJOYW1lW10gPSBbJ3RhYi0xJywgJ3RhYi0yJ107XHJcbmNvbnN0IFVJX1NUQVRFX0tFWSA9ICdnY29yZS1mcmFtZXdvcmsuaTE4bi10b29sLnN0YXRlJztcclxuXHJcbmNvbnN0IERFRkFVTFRfVUlfU1RBVEU6IFVpU3RhdGUgPSB7XHJcbiAgICBzcmNSb290OiAnJyxcclxuICAgIG91dFJvb3Q6ICcnLFxyXG4gICAgaGVhZGVyVGV4dDogJ0tleSxDaGluZXNlLEVuZ2xpc2gnLFxyXG4gICAgYWN0aXZlVGFiOiAndGFiLTEnLFxyXG59O1xyXG5cclxubGV0IG1lbW9yeVVpU3RhdGU6IFVpU3RhdGUgPSB7IC4uLkRFRkFVTFRfVUlfU1RBVEUgfTtcclxuXHJcbnR5cGUgVWlTdGF0ZSA9IHtcclxuICAgIHNyY1Jvb3Q6IHN0cmluZztcclxuICAgIG91dFJvb3Q6IHN0cmluZztcclxuICAgIGhlYWRlclRleHQ6IHN0cmluZztcclxuICAgIGFjdGl2ZVRhYjogVGFiTmFtZTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIGxvYWRVaVN0YXRlKCk6IFVpU3RhdGUge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICBpZiAodHlwZW9mIGxvY2FsU3RvcmFnZSAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgY29uc3QgcmF3ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oVUlfU1RBVEVfS0VZKTtcclxuICAgICAgICAgICAgaWYgKHJhdykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFBhcnRpYWw8VWlTdGF0ZT47XHJcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHNyY1Jvb3Q6IHBhcnNlZC5zcmNSb290ID8/IERFRkFVTFRfVUlfU1RBVEUuc3JjUm9vdCxcclxuICAgICAgICAgICAgICAgICAgICBvdXRSb290OiBwYXJzZWQub3V0Um9vdCA/PyBERUZBVUxUX1VJX1NUQVRFLm91dFJvb3QsXHJcbiAgICAgICAgICAgICAgICAgICAgaGVhZGVyVGV4dDogcGFyc2VkLmhlYWRlclRleHQgPz8gREVGQVVMVF9VSV9TVEFURS5oZWFkZXJUZXh0LFxyXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZVRhYjogcGFyc2VkLmFjdGl2ZVRhYiA9PT0gJ3RhYi0yJyA/ICd0YWItMicgOiAndGFiLTEnLFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKCdbaTE4bi10b29sXSBsb2FkIHN0YXRlIGZhaWxlZCcsIGVycm9yKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyAuLi5tZW1vcnlVaVN0YXRlIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNhdmVVaVN0YXRlKHBhdGNoOiBQYXJ0aWFsPFVpU3RhdGU+KSB7XHJcbiAgICBjb25zdCBjdXJyZW50ID0gbG9hZFVpU3RhdGUoKTtcclxuICAgIGNvbnN0IG5leHQgPSB7IC4uLmN1cnJlbnQsIC4uLnBhdGNoIH07XHJcbiAgICBtZW1vcnlVaVN0YXRlID0geyAuLi5uZXh0IH07XHJcbiAgICB0cnkge1xyXG4gICAgICAgIGlmICh0eXBlb2YgbG9jYWxTdG9yYWdlICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShVSV9TVEFURV9LRVksIEpTT04uc3RyaW5naWZ5KG5leHQpKTtcclxuICAgICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUud2FybignW2kxOG4tdG9vbF0gc2F2ZSBzdGF0ZSBmYWlsZWQnLCBlcnJvcik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwVGFiU3dpdGNoZXIocGFuZWw6IGFueSwgaW5pdGlhbFRhYjogVGFiTmFtZSA9ICd0YWItMScpIHtcclxuICAgIGNvbnN0IHRhYkJ1dHRvbnMgPSBwYW5lbC4kLnRhYkhlYWRlci5xdWVyeVNlbGVjdG9yQWxsKCcudGFiLWJ0bicpO1xyXG4gICAgY29uc3QgdGFiUGFuZXMgPSBwYW5lbC4kLnRhYkNvbnRlbnQucXVlcnlTZWxlY3RvckFsbCgnLnRhYi1wYW5lJyk7XHJcblxyXG4gICAgY29uc3QgYWN0aXZhdGVUYWIgPSAodGFiSWQ6IFRhYk5hbWUpID0+IHtcclxuICAgICAgICB0YWJCdXR0b25zLmZvckVhY2goKGJ1dHRvbjogSFRNTEVsZW1lbnQpID0+IGJ1dHRvbi5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XHJcbiAgICAgICAgdGFiUGFuZXMuZm9yRWFjaCgocGFuZTogSFRNTEVsZW1lbnQpID0+IHBhbmUuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xyXG5cclxuICAgICAgICBjb25zdCBhY3RpdmVCdXR0b24gPSBwYW5lbC4kLnRhYkhlYWRlci5xdWVyeVNlbGVjdG9yKGAudGFiLWJ0bltkYXRhLXRhYj1cIiR7dGFiSWR9XCJdYCkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZVBhbmUgPSBwYW5lbC4kLnRhYkNvbnRlbnQucXVlcnlTZWxlY3RvcihgIyR7dGFiSWR9YCkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xyXG5cclxuICAgICAgICBhY3RpdmVCdXR0b24/LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xyXG4gICAgICAgIGFjdGl2ZVBhbmU/LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xyXG4gICAgfTtcclxuXHJcbiAgICB0YWJCdXR0b25zLmZvckVhY2goKGJ1dHRvbjogSFRNTEVsZW1lbnQpID0+IHtcclxuICAgICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRhYklkID0gYnV0dG9uLmdldEF0dHJpYnV0ZSgnZGF0YS10YWInKSBhcyBUYWJOYW1lIHwgbnVsbDtcclxuICAgICAgICAgICAgaWYgKCF0YWJJZCB8fCAhVEFCX0lEUy5pbmNsdWRlcyh0YWJJZCkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBhY3RpdmF0ZVRhYih0YWJJZCk7XHJcbiAgICAgICAgICAgIHNhdmVVaVN0YXRlKHsgYWN0aXZlVGFiOiB0YWJJZCB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGFjdGl2YXRlVGFiKGluaXRpYWxUYWIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpbml0STE4blRvb2wocGFuZWw6IGFueSkge1xyXG4gICAgLy8gcmVxdWlyZSBtb2R1bGVzXHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xyXG4gICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcy1leHRyYScpO1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcclxuICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XHJcbiAgICAvLyBlbmNvZGUgaW1wb3J0ZWQgc3RhdGljYWxseSBhdCBtb2R1bGUgdG9wXHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xyXG4gICAgY29uc3QgUGFwYSA9IHJlcXVpcmUoJ3BhcGFwYXJzZScpO1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcclxuICAgIGNvbnN0IFhMU1ggPSByZXF1aXJlKCd4bHN4Jyk7XHJcblxyXG4gICAgY29uc3Qgc3JjQnRuID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNzcmMtZm9sZGVyLWJ0bicpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IG91dEJ0biA9IHBhbmVsLiQudGFiQ29udGVudC5xdWVyeVNlbGVjdG9yKCcjb3V0LWZvbGRlci1idG4nKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XHJcbiAgICBjb25zdCBzcmNQYXRoSW5wdXQgPSBwYW5lbC4kLnRhYkNvbnRlbnQucXVlcnlTZWxlY3RvcignI3NyYy1mb2xkZXItcGF0aCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xyXG4gICAgY29uc3Qgb3V0UGF0aElucHV0ID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNvdXQtZm9sZGVyLXBhdGgnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IGhlYWRlcklucHV0ID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNoZWFkZXItaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IGR1cENoZWNrID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNkdXAtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IHByb2Nlc3NCdG4gPSBwYW5lbC4kLnRhYkNvbnRlbnQucXVlcnlTZWxlY3RvcignI3Byb2Nlc3MtYnRuJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xyXG4gICAgY29uc3QgZ2V0RWRpdG9yID0gKCkgPT4gKGdsb2JhbFRoaXMgYXMgYW55KS5FZGl0b3I7XHJcbiAgICBjb25zdCBzdGF0dXNBcmVhID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNzdGF0dXMtYXJlYScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuXHJcbiAgICBjb25zdCBhcHBseVN0YXRlID0gKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHN0YXRlID0gbG9hZFVpU3RhdGUoKTtcclxuICAgICAgICBpZiAoc3JjUGF0aElucHV0KSB7XHJcbiAgICAgICAgICAgIHNyY1BhdGhJbnB1dC52YWx1ZSA9IHN0YXRlLnNyY1Jvb3Q7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChvdXRQYXRoSW5wdXQpIHtcclxuICAgICAgICAgICAgb3V0UGF0aElucHV0LnZhbHVlID0gc3RhdGUub3V0Um9vdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGhlYWRlcklucHV0KSB7XHJcbiAgICAgICAgICAgIGhlYWRlcklucHV0LnZhbHVlID0gc3RhdGUuaGVhZGVyVGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGR1cENoZWNrKSB7XHJcbiAgICAgICAgICAgIGR1cENoZWNrLmNoZWNrZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgcGlja0ZvbGRlciA9IGFzeW5jICh0aXRsZTogc3RyaW5nLCBjdXJyZW50UGF0aDogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZWRpdG9yID0gZ2V0RWRpdG9yKCk7XHJcbiAgICAgICAgaWYgKCFlZGl0b3I/LkRpYWxvZz8uc2VsZWN0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRWRpdG9yLkRpYWxvZy5zZWxlY3Qg5LiN5Y+v55SoJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBlZGl0b3IuRGlhbG9nLnNlbGVjdCh7XHJcbiAgICAgICAgICAgIHRpdGxlLFxyXG4gICAgICAgICAgICB0eXBlOiAnZGlyZWN0b3J5JyxcclxuICAgICAgICAgICAgcGF0aDogY3VycmVudFBhdGggfHwgdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICBidXR0b246ICfpgInmi6knLFxyXG4gICAgICAgICAgICBtdWx0aTogZmFsc2UsXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5jYW5jZWxlZCB8fCAhcmVzdWx0LmZpbGVQYXRocyB8fCByZXN1bHQuZmlsZVBhdGhzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0LmZpbGVQYXRoc1swXSBhcyBzdHJpbmc7XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IHVwZGF0ZUFuZFNhdmUgPSAocGF0Y2g6IFBhcnRpYWw8VWlTdGF0ZT4pID0+IHtcclxuICAgICAgICBjb25zdCBjdXJyZW50ID0gbG9hZFVpU3RhdGUoKTtcclxuICAgICAgICBjb25zdCBuZXh0ID0geyAuLi5jdXJyZW50LCAuLi5wYXRjaCB9O1xyXG4gICAgICAgIGlmIChzcmNQYXRoSW5wdXQgJiYgdHlwZW9mIG5leHQuc3JjUm9vdCA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgc3JjUGF0aElucHV0LnZhbHVlID0gbmV4dC5zcmNSb290O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAob3V0UGF0aElucHV0ICYmIHR5cGVvZiBuZXh0Lm91dFJvb3QgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIG91dFBhdGhJbnB1dC52YWx1ZSA9IG5leHQub3V0Um9vdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGhlYWRlcklucHV0ICYmIHR5cGVvZiBuZXh0LmhlYWRlclRleHQgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIGhlYWRlcklucHV0LnZhbHVlID0gbmV4dC5oZWFkZXJUZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBzYXZlVWlTdGF0ZShuZXh0KTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgZXNjYXBlSHRtbCA9IChzOiBzdHJpbmcpID0+IHtcclxuICAgICAgICByZXR1cm4gU3RyaW5nKHMpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcclxuICAgICAgICAgICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csICcmIzAzOTsnKTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgYXBwZW5kU3RhdHVzID0gKG1zZzogc3RyaW5nLCB0eXBlOiAnaW5mbycgfCAnZXJyb3InID0gJ2luZm8nKSA9PiB7XHJcbiAgICAgICAgaWYgKHN0YXR1c0FyZWEpIHtcclxuICAgICAgICAgICAgY29uc3QgY2xzID0gdHlwZSA9PT0gJ2Vycm9yJyA/ICdzdGF0dXMtZXJyb3InIDogJ3N0YXR1cy1pbmZvJztcclxuICAgICAgICAgICAgc3RhdHVzQXJlYS5pbm5lckhUTUwgKz0gYDxkaXYgY2xhc3M9XCIke2Nsc31cIj4ke2VzY2FwZUh0bWwobXNnKX08L2Rpdj5gO1xyXG4gICAgICAgICAgICBzdGF0dXNBcmVhLnNjcm9sbFRvcCA9IHN0YXR1c0FyZWEuc2Nyb2xsSGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbaTE4bi10b29sXScsIG1zZyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tpMThuLXRvb2xdJywgbXNnKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIHBhcnNlRmlsZShmaWxlUGF0aDogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgZXh0ID0gcGF0aC5leHRuYW1lKGZpbGVQYXRoKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGlmIChleHQgPT09ICcuY3N2Jykge1xyXG4gICAgICAgICAgICBjb25zdCB0eHQgPSBmcy5yZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGY4Jyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IFBhcGEucGFyc2UodHh0LCB7IGhlYWRlcjogdHJ1ZSwgc2tpcEVtcHR5TGluZXM6IHRydWUgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJzZWQuZGF0YTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGV4dCA9PT0gJy54bHN4JyB8fCBleHQgPT09ICcueGxzJykge1xyXG4gICAgICAgICAgICBjb25zdCB3b3JrYm9vayA9IFhMU1gucmVhZEZpbGUoZmlsZVBhdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBzaGVldE5hbWUgPSB3b3JrYm9vay5TaGVldE5hbWVzWzBdO1xyXG4gICAgICAgICAgICBjb25zdCByb3dzID0gWExTWC51dGlscy5zaGVldF90b19qc29uKHdvcmtib29rLlNoZWV0c1tzaGVldE5hbWVdLCB7IGRlZnZhbDogJycgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiByb3dzO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBkb1Byb2Nlc3MoKSB7XHJcbiAgICAgICAgaWYgKCFzcmNQYXRoSW5wdXQgfHwgIW91dFBhdGhJbnB1dCB8fCAhaGVhZGVySW5wdXQpIHtcclxuICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCfmjqfku7bmnKrlsLHnu6onKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGVhZGVyVGV4dCA9IGhlYWRlcklucHV0LnZhbHVlLnRyaW0oKTtcclxuICAgICAgICBpZiAoIWhlYWRlclRleHQpIHtcclxuICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCfor7floavlhpnlrZfmrrXlpLTvvIzkvovlpoLvvJpLZXksQ2hpbmVzZSxFbmdsaXNoJyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgaGVhZGVycyA9IGhlYWRlclRleHQuc3BsaXQoL1xccypbLO+8jF1cXHMqLykubWFwKChzOiBzdHJpbmcpID0+IHMudHJpbSgpKS5maWx0ZXIoKHM6IHN0cmluZykgPT4gcy5sZW5ndGggPiAwKTtcclxuICAgICAgICBpZiAoaGVhZGVycy5sZW5ndGggPCAyKSB7XHJcbiAgICAgICAgICAgIGFwcGVuZFN0YXR1cygn5a2X5q615aS06Iez5bCR6ZyA5YyF5ZCrIGtleSDlkozkuIDnp43or63oqIDlrZfmrrUnKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBrZXlGaWVsZCA9IGhlYWRlcnNbMF07XHJcbiAgICAgICAgY29uc3QgbGFuZ0ZpZWxkcyA9IGhlYWRlcnMuc2xpY2UoMSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNyY1Jvb3QgPSBzcmNQYXRoSW5wdXQ/LnZhbHVlLnRyaW0oKSB8fCAnJztcclxuICAgICAgICBjb25zdCBvdXRSb290ID0gb3V0UGF0aElucHV0Py52YWx1ZS50cmltKCkgfHwgJyc7XHJcbiAgICAgICAgY29uc3QgY2hlY2tEdXAgPSAhIShkdXBDaGVjaz8uY2hlY2tlZCk7XHJcblxyXG4gICAgICAgIGlmICghc3JjUm9vdCkge1xyXG4gICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+ivt+WFiOmAieaLqea6kOaWh+S7tuWkuScpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICghb3V0Um9vdCkge1xyXG4gICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+ivt+WFiOmAieaLqei+k+WHuuaWh+S7tuWkuScpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhcHBlbmRTdGF0dXMoJ+W8gOWni+i9rOaNoicpO1xyXG4gICAgICAgIGFwcGVuZFN0YXR1cyhg5rqQ55uu5b2VOiAke3NyY1Jvb3R9YCk7XHJcbiAgICAgICAgYXBwZW5kU3RhdHVzKGDovpPlh7rnm67lvZU6ICR7b3V0Um9vdH1gKTtcclxuICAgICAgICBhcHBlbmRTdGF0dXMoYOWtl+auteWktDogJHtoZWFkZXJzLmpvaW4oJywnKX1gKTtcclxuXHJcbiAgICAgICAgLy8gbGlzdCBmaWxlcyBpbiBzcmNSb290XHJcbiAgICAgICAgY29uc3QgYWxsRmlsZXMgPSBmcy5yZWFkZGlyU3luYyhzcmNSb290KTtcclxuICAgICAgICBjb25zdCBkYXRhRmlsZXMgPSBhbGxGaWxlcy5maWx0ZXIoKGY6IHN0cmluZykgPT4gWycuY3N2JywgJy54bHN4JywgJy54bHMnXS5pbmNsdWRlcyhwYXRoLmV4dG5hbWUoZikudG9Mb3dlckNhc2UoKSkpO1xyXG4gICAgICAgIGlmIChkYXRhRmlsZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIGFwcGVuZFN0YXR1cygn5rqQ55uu5b2V5Lit5rKh5pyJ5om+5YiwIGNzdiDmiJYgeGxzeCDmlofku7YnKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXBwZW5kU3RhdHVzKGDlj5HnjrAgJHtkYXRhRmlsZXMubGVuZ3RofSDkuKrmupDmlofku7ZgKTtcclxuICAgICAgICBhcHBlbmRTdGF0dXMoYOavj+S4quivreiogOWwhui+k+WHuiAxIOS4qiBNZXNzYWdlUGFjayDmlofku7ZgKTtcclxuXHJcbiAgICAgICAgLy8gYWdncmVnYXRlIGFjcm9zcyBhbGwgZmlsZXMgaW50byBvdmVyYWxsIGxhbmd1YWdlIG1hcHNcclxuICAgICAgICBjb25zdCBvdmVyYWxsTGFuZ01hcHM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIHN0cmluZz4+ID0ge307XHJcbiAgICAgICAgbGFuZ0ZpZWxkcy5mb3JFYWNoKChsZjogc3RyaW5nKSA9PiB7IG92ZXJhbGxMYW5nTWFwc1tsZl0gPSB7fTsgfSk7XHJcbiAgICAgICAgY29uc3QgZHVwbGljYXRlc0J5TGFuZzogUmVjb3JkPHN0cmluZywgU2V0PHN0cmluZz4+ID0ge307XHJcbiAgICAgICAgbGFuZ0ZpZWxkcy5mb3JFYWNoKChsZjogc3RyaW5nKSA9PiB7IGR1cGxpY2F0ZXNCeUxhbmdbbGZdID0gbmV3IFNldCgpOyB9KTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhRmlsZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBkYXRhRmlsZXNbaV07XHJcbiAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5qb2luKHNyY1Jvb3QsIGZpbGVuYW1lKTtcclxuICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDop6PmnpAgJHtmaWxlbmFtZX0gLi4uYCk7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgcGFyc2VGaWxlKGZ1bGxQYXRoKTtcclxuICAgICAgICAgICAgICAgIGlmICghcm93cyB8fCByb3dzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg5paH5Lu2ICR7ZmlsZW5hbWV9IOaXoOaVsOaNru+8jOi3s+i/h2ApO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgcm93cy5sZW5ndGg7IHIrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJvd3Nbcl0gYXMgUmVjb3JkPHN0cmluZywgYW55PjtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBTdHJpbmcocm93W2tleUZpZWxkXSA/PyAnJykudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICgha2V5KSBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBsaSA9IDA7IGxpIDwgbGFuZ0ZpZWxkcy5sZW5ndGg7IGxpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGYgPSBsYW5nRmllbGRzW2xpXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsID0gU3RyaW5nKHJvd1tsZl0gPz8gJycpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2hlY2tEdXAgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG92ZXJhbGxMYW5nTWFwc1tsZl0sIGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR1cGxpY2F0ZXNCeUxhbmdbbGZdLmFkZChrZXkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcmFsbExhbmdNYXBzW2xmXVtrZXldID0gdmFsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg6Kej5p6QICR7ZmlsZW5hbWV9IOWujOaIkGApO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVtID0gKGVyciBhcyBhbnkpPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpO1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDop6PmnpAgJHtmaWxlbmFtZX0g5aSx6LSlOiAke2VtfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBpZiBjaGVja0R1cCBlbmFibGVkLCB2ZXJpZnkgZHVwbGljYXRlc1xyXG4gICAgICAgIGlmIChjaGVja0R1cCkge1xyXG4gICAgICAgICAgICBjb25zdCBkdXBNc2dzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBsaSA9IDA7IGxpIDwgbGFuZ0ZpZWxkcy5sZW5ndGg7IGxpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGxmID0gbGFuZ0ZpZWxkc1tsaV07XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkc2V0ID0gZHVwbGljYXRlc0J5TGFuZ1tsZl07XHJcbiAgICAgICAgICAgICAgICBpZiAoZHNldCAmJiBkc2V0LnNpemUgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZHVwTXNncy5wdXNoKGAke2xmfTogJHtBcnJheS5mcm9tKGRzZXQpLmpvaW4oJywgJyl9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGR1cE1zZ3MubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCflj5HnjrDph43lpI0gS2V577yM5bey5Y+W5raI55Sf5oiQ77yaJywgJ2Vycm9yJyk7XHJcbiAgICAgICAgICAgICAgICBkdXBNc2dzLmZvckVhY2gobSA9PiBhcHBlbmRTdGF0dXMobSwgJ2Vycm9yJykpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBjbGVhciBvbGQgbGFuZ3VhZ2UgZm9sZGVycyBhbmQgd3JpdGUgYSBzaW5nbGUgbXNncGFjayBmaWxlIHBlciBsYW5ndWFnZVxyXG4gICAgICAgIGZvciAobGV0IGxpID0gMDsgbGkgPCBsYW5nRmllbGRzLmxlbmd0aDsgbGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBsZiA9IGxhbmdGaWVsZHNbbGldO1xyXG4gICAgICAgICAgICBjb25zdCBsYW5nRGlyID0gcGF0aC5qb2luKG91dFJvb3QsIGxmKTtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGlmIChmcy5leGlzdHNTeW5jKGxhbmdEaXIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDmuIXnkIbml6fnm67lvZUgJHtsYW5nRGlyfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIGZzLnJlbW92ZVN5bmMobGFuZ0Rpcik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBmcy5lbnN1cmVEaXJTeW5jKGxhbmdEaXIpO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb3V0RmlsZSA9IHBhdGguam9pbihsYW5nRGlyLCBgJHtsZn0ubXNncGFja2ApO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZW5jb2RlRm4gPSAobXNncGFjayBhcyBhbnkpLmVuY29kZSA/PyAobXNncGFjayBhcyBhbnkpLmRlZmF1bHQ/LmVuY29kZSA/PyAobXNncGFjayBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFja2VkID0gZW5jb2RlRm4ob3ZlcmFsbExhbmdNYXBzW2xmXSk7XHJcbiAgICAgICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKG91dEZpbGUsIEJ1ZmZlci5mcm9tKHBhY2tlZCkpO1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDlhpnlhaUgJHtvdXRGaWxlfWApO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg5YaZ5YWlICR7bGZ9IOWksei0pTogJHsoZXJyIGFzIGFueSk/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycil9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGFwcGVuZFN0YXR1cygn5YWo6YOo5a6M5oiQJyk7XHJcbiAgICB9XHJcblxyXG4gICAgYXBwbHlTdGF0ZSgpO1xyXG5cclxuICAgIGlmIChzcmNCdG4pIHtcclxuICAgICAgICBzcmNCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+ato+WcqOaJk+W8gOa6kOaWh+S7tuWkuemAieaLqeahhi4uLicpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZm9sZGVyUGF0aCA9IGF3YWl0IHBpY2tGb2xkZXIoJ+mAieaLqea6kOaWh+S7tuWkuScsIHNyY1BhdGhJbnB1dD8udmFsdWUudHJpbSgpIHx8ICcnKTtcclxuICAgICAgICAgICAgICAgIGlmICghZm9sZGVyUGF0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cygn5pyq6YCJ5oup5rqQ5paH5Lu25aS5Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdXBkYXRlQW5kU2F2ZSh7IHNyY1Jvb3Q6IGZvbGRlclBhdGggfSk7XHJcbiAgICAgICAgICAgICAgICBhcHBlbmRTdGF0dXMoYOW3sumAieaLqea6kOaWh+S7tuWkuTogJHtmb2xkZXJQYXRofWApO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDpgInmi6nmupDmlofku7blpLnlpLHotKU6ICR7KGVycm9yIGFzIGFueSk/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKX1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChvdXRQYXRoSW5wdXQpIHtcclxuICAgICAgICBvdXRQYXRoSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiBzYXZlVWlTdGF0ZSh7IG91dFJvb3Q6IG91dFBhdGhJbnB1dC52YWx1ZS50cmltKCkgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChvdXRCdG4pIHtcclxuICAgICAgICBvdXRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+ato+WcqOaJk+W8gOi+k+WHuuaWh+S7tuWkuemAieaLqeahhi4uLicpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZm9sZGVyUGF0aCA9IGF3YWl0IHBpY2tGb2xkZXIoJ+mAieaLqei+k+WHuuaWh+S7tuWkuScsIG91dFBhdGhJbnB1dD8udmFsdWUudHJpbSgpIHx8ICcnKTtcclxuICAgICAgICAgICAgICAgIGlmICghZm9sZGVyUGF0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cygn5pyq6YCJ5oup6L6T5Ye65paH5Lu25aS5Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdXBkYXRlQW5kU2F2ZSh7IG91dFJvb3Q6IGZvbGRlclBhdGggfSk7XHJcbiAgICAgICAgICAgICAgICBhcHBlbmRTdGF0dXMoYOW3sumAieaLqei+k+WHuuaWh+S7tuWkuTogJHtmb2xkZXJQYXRofWApO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDpgInmi6novpPlh7rmlofku7blpLnlpLHotKU6ICR7KGVycm9yIGFzIGFueSk/Lm1lc3NhZ2UgPz8gU3RyaW5nKGVycm9yKX1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChoZWFkZXJJbnB1dCkge1xyXG4gICAgICAgIGhlYWRlcklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKCkgPT4gc2F2ZVVpU3RhdGUoeyBoZWFkZXJUZXh0OiBoZWFkZXJJbnB1dC52YWx1ZSB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHByb2Nlc3NCdG4pIHtcclxuICAgICAgICBwcm9jZXNzQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICAvLyBjbGVhciBzdGF0dXNcclxuICAgICAgICAgICAgaWYgKHN0YXR1c0FyZWEpIHN0YXR1c0FyZWEudGV4dENvbnRlbnQgPSAnJztcclxuICAgICAgICAgICAgc2F2ZVVpU3RhdGUoe1xyXG4gICAgICAgICAgICAgICAgc3JjUm9vdDogc3JjUGF0aElucHV0Py52YWx1ZS50cmltKCkgfHwgJycsXHJcbiAgICAgICAgICAgICAgICBvdXRSb290OiBvdXRQYXRoSW5wdXQ/LnZhbHVlLnRyaW0oKSB8fCAnJyxcclxuICAgICAgICAgICAgICAgIGhlYWRlclRleHQ6IGhlYWRlcklucHV0Py52YWx1ZSA/PyAnJyxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHZvaWQgZG9Qcm9jZXNzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRWRpdG9yLlBhbmVsLmRlZmluZSh7XHJcbiAgICBsaXN0ZW5lcnM6IHtcclxuICAgICAgICBzaG93KCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnc2hvdycpO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaGlkZSgpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ2hpZGUnKTtcclxuICAgICAgICB9LFxyXG4gICAgfSxcclxuICAgIHRlbXBsYXRlOiByZWFkRmlsZVN5bmMoam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9zdGF0aWMvdGVtcGxhdGUvZGVmYXVsdC9pbmRleC5odG1sJyksICd1dGYtOCcpLFxyXG4gICAgc3R5bGU6IHJlYWRGaWxlU3luYyhqb2luKF9fZGlybmFtZSwgJy4uLy4uLy4uL3N0YXRpYy9zdHlsZS9kZWZhdWx0L2luZGV4LmNzcycpLCAndXRmLTgnKSxcclxuICAgICQ6IHtcclxuICAgICAgICB0YWJIZWFkZXI6ICcudGFiLWhlYWRlcicsXHJcbiAgICAgICAgdGFiQ29udGVudDogJy50YWItY29udGVudCcsXHJcbiAgICB9LFxyXG4gICAgbWV0aG9kczoge1xyXG4gICAgICAgIGhlbGxvKCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW2djb3JlLXBhbmVsXTogaGVsbG8nKTtcclxuICAgICAgICB9LFxyXG4gICAgfSxcclxuICAgIHJlYWR5KCkge1xyXG4gICAgICAgIHNldHVwVGFiU3dpdGNoZXIodGhpcywgbG9hZFVpU3RhdGUoKS5hY3RpdmVUYWIpO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGluaXRJMThuVG9vbCh0aGlzKTtcclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ2luaXRJMThuVG9vbCBlcnJvcicsIGUpO1xyXG4gICAgICAgIH1cclxuICAgIH0sXHJcbiAgICBiZWZvcmVDbG9zZSgpIHt9LFxyXG4gICAgY2xvc2UoKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1tnY29yZS1wYW5lbF06IGNsb3NlZCcpO1xyXG4gICAgfSxcclxufSk7XHJcbiJdfQ==