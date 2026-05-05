"use strict";
/* eslint-disable vue/one-component-per-file */
Object.defineProperty(exports, "__esModule", { value: true });
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { encode } = require('@msgpack/msgpack');
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
                if (fs.existsSync(langDir)) {
                    appendStatus(`清理旧目录 ${langDir}`);
                    fs.removeSync(langDir);
                }
                fs.ensureDirSync(langDir);
                const outFile = path.join(langDir, `${lf}.msgpack`);
                const packed = encode(overallLangMaps[lf]);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zb3VyY2UvcGFuZWxzL2RlZmF1bHQvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLCtDQUErQzs7QUFFL0MsdUNBQXdDO0FBQ3hDLCtCQUE0QjtBQVM1QixNQUFNLE9BQU8sR0FBYyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztBQUM5QyxNQUFNLFlBQVksR0FBRyxpQ0FBaUMsQ0FBQztBQUV2RCxNQUFNLGdCQUFnQixHQUFZO0lBQzlCLE9BQU8sRUFBRSxFQUFFO0lBQ1gsT0FBTyxFQUFFLEVBQUU7SUFDWCxVQUFVLEVBQUUscUJBQXFCO0lBQ2pDLFNBQVMsRUFBRSxPQUFPO0NBQ3JCLENBQUM7QUFFRixJQUFJLGFBQWEscUJBQWlCLGdCQUFnQixDQUFFLENBQUM7QUFTckQsU0FBUyxXQUFXOztJQUNoQixJQUFJLENBQUM7UUFDRCxJQUFJLE9BQU8sWUFBWSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQ3RDLE1BQU0sR0FBRyxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDL0MsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDTixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBcUIsQ0FBQztnQkFDbkQsT0FBTztvQkFDSCxPQUFPLEVBQUUsTUFBQSxNQUFNLENBQUMsT0FBTyxtQ0FBSSxnQkFBZ0IsQ0FBQyxPQUFPO29CQUNuRCxPQUFPLEVBQUUsTUFBQSxNQUFNLENBQUMsT0FBTyxtQ0FBSSxnQkFBZ0IsQ0FBQyxPQUFPO29CQUNuRCxVQUFVLEVBQUUsTUFBQSxNQUFNLENBQUMsVUFBVSxtQ0FBSSxnQkFBZ0IsQ0FBQyxVQUFVO29CQUM1RCxTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVMsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTztpQkFDOUQsQ0FB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QUFDLHVCQUF1QixDQUFDLENBQUM7SUFDekMsQ0FBQztDQUNKLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIGVzbGludC1kaXNhYmxlIHZ1ZS9vbmUtY29tcG9uZW50LXBlci1maWxlICovXHJcblxyXG5pbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tICdmcy1leHRyYSc7XHJcbmltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcclxuLyoqXHJcbiAqIEB6aCDlpoLmnpzluIzmnJvlhbzlrrkgMy4zIOS5i+WJjeeahOeJiOacrOWPr+S7peS9v+eUqOS4i+aWueeahOS7o+eggVxyXG4gKiBAZW4gWW91IGNhbiBhZGQgdGhlIGNvZGUgYmVsb3cgaWYgeW91IHdhbnQgY29tcGF0aWJpbGl0eSB3aXRoIHZlcnNpb25zIHByaW9yIHRvIDMuM1xyXG4gKi9cclxuLy8gRWRpdG9yLlBhbmVsLmRlZmluZSA9IEVkaXRvci5QYW5lbC5kZWZpbmUgfHwgZnVuY3Rpb24ob3B0aW9uczogYW55KSB7IHJldHVybiBvcHRpb25zIH1cclxuXHJcbnR5cGUgVGFiTmFtZSA9ICd0YWItMScgfCAndGFiLTInO1xyXG5cclxuY29uc3QgVEFCX0lEUzogVGFiTmFtZVtdID0gWyd0YWItMScsICd0YWItMiddO1xyXG5jb25zdCBVSV9TVEFURV9LRVkgPSAnZ2NvcmUtZnJhbWV3b3JrLmkxOG4tdG9vbC5zdGF0ZSc7XHJcblxyXG5jb25zdCBERUZBVUxUX1VJX1NUQVRFOiBVaVN0YXRlID0ge1xyXG4gICAgc3JjUm9vdDogJycsXHJcbiAgICBvdXRSb290OiAnJyxcclxuICAgIGhlYWRlclRleHQ6ICdLZXksQ2hpbmVzZSxFbmdsaXNoJyxcclxuICAgIGFjdGl2ZVRhYjogJ3RhYi0xJyxcclxufTtcclxuXHJcbmxldCBtZW1vcnlVaVN0YXRlOiBVaVN0YXRlID0geyAuLi5ERUZBVUxUX1VJX1NUQVRFIH07XHJcblxyXG50eXBlIFVpU3RhdGUgPSB7XHJcbiAgICBzcmNSb290OiBzdHJpbmc7XHJcbiAgICBvdXRSb290OiBzdHJpbmc7XHJcbiAgICBoZWFkZXJUZXh0OiBzdHJpbmc7XHJcbiAgICBhY3RpdmVUYWI6IFRhYk5hbWU7XHJcbn07XHJcblxyXG5mdW5jdGlvbiBsb2FkVWlTdGF0ZSgpOiBVaVN0YXRlIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBsb2NhbFN0b3JhZ2UgIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFVJX1NUQVRFX0tFWSk7XHJcbiAgICAgICAgICAgIGlmIChyYXcpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBQYXJ0aWFsPFVpU3RhdGU+O1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgICAgICBzcmNSb290OiBwYXJzZWQuc3JjUm9vdCA/PyBERUZBVUxUX1VJX1NUQVRFLnNyY1Jvb3QsXHJcbiAgICAgICAgICAgICAgICAgICAgb3V0Um9vdDogcGFyc2VkLm91dFJvb3QgPz8gREVGQVVMVF9VSV9TVEFURS5vdXRSb290LFxyXG4gICAgICAgICAgICAgICAgICAgIGhlYWRlclRleHQ6IHBhcnNlZC5oZWFkZXJUZXh0ID8/IERFRkFVTFRfVUlfU1RBVEUuaGVhZGVyVGV4dCxcclxuICAgICAgICAgICAgICAgICAgICBhY3RpdmVUYWI6IHBhcnNlZC5hY3RpdmVUYWIgPT09ICd0YWItMicgPyAndGFiLTInIDogJ3RhYi0xJyxcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUud2FybignW2kxOG4tdG9vbF0gbG9hZCBzdGF0ZSBmYWlsZWQnLCBlcnJvcik7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHsgLi4ubWVtb3J5VWlTdGF0ZSB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzYXZlVWlTdGF0ZShwYXRjaDogUGFydGlhbDxVaVN0YXRlPikge1xyXG4gICAgY29uc3QgY3VycmVudCA9IGxvYWRVaVN0YXRlKCk7XHJcbiAgICBjb25zdCBuZXh0ID0geyAuLi5jdXJyZW50LCAuLi5wYXRjaCB9O1xyXG4gICAgbWVtb3J5VWlTdGF0ZSA9IHsgLi4ubmV4dCB9O1xyXG4gICAgdHJ5IHtcclxuICAgICAgICBpZiAodHlwZW9mIGxvY2FsU3RvcmFnZSAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oVUlfU1RBVEVfS0VZLCBKU09OLnN0cmluZ2lmeShuZXh0KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oJ1tpMThuLXRvb2xdIHNhdmUgc3RhdGUgZmFpbGVkJywgZXJyb3IpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFRhYlN3aXRjaGVyKHBhbmVsOiBhbnksIGluaXRpYWxUYWI6IFRhYk5hbWUgPSAndGFiLTEnKSB7XHJcbiAgICBjb25zdCB0YWJCdXR0b25zID0gcGFuZWwuJC50YWJIZWFkZXIucXVlcnlTZWxlY3RvckFsbCgnLnRhYi1idG4nKTtcclxuICAgIGNvbnN0IHRhYlBhbmVzID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItcGFuZScpO1xyXG5cclxuICAgIGNvbnN0IGFjdGl2YXRlVGFiID0gKHRhYklkOiBUYWJOYW1lKSA9PiB7XHJcbiAgICAgICAgdGFiQnV0dG9ucy5mb3JFYWNoKChidXR0b246IEhUTUxFbGVtZW50KSA9PiBidXR0b24uY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xyXG4gICAgICAgIHRhYlBhbmVzLmZvckVhY2goKHBhbmU6IEhUTUxFbGVtZW50KSA9PiBwYW5lLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcclxuXHJcbiAgICAgICAgY29uc3QgYWN0aXZlQnV0dG9uID0gcGFuZWwuJC50YWJIZWFkZXIucXVlcnlTZWxlY3RvcihgLnRhYi1idG5bZGF0YS10YWI9XCIke3RhYklkfVwiXWApIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICAgICAgICBjb25zdCBhY3RpdmVQYW5lID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoYCMke3RhYklkfWApIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuXHJcbiAgICAgICAgYWN0aXZlQnV0dG9uPy5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcclxuICAgICAgICBhY3RpdmVQYW5lPy5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcclxuICAgIH07XHJcblxyXG4gICAgdGFiQnV0dG9ucy5mb3JFYWNoKChidXR0b246IEhUTUxFbGVtZW50KSA9PiB7XHJcbiAgICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0YWJJZCA9IGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFiJykgYXMgVGFiTmFtZSB8IG51bGw7XHJcbiAgICAgICAgICAgIGlmICghdGFiSWQgfHwgIVRBQl9JRFMuaW5jbHVkZXModGFiSWQpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYWN0aXZhdGVUYWIodGFiSWQpO1xyXG4gICAgICAgICAgICBzYXZlVWlTdGF0ZSh7IGFjdGl2ZVRhYjogdGFiSWQgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBhY3RpdmF0ZVRhYihpbml0aWFsVGFiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaW5pdEkxOG5Ub29sKHBhbmVsOiBhbnkpIHtcclxuICAgIC8vIHJlcXVpcmUgbW9kdWxlc1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcclxuICAgIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMtZXh0cmEnKTtcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdmFyLXJlcXVpcmVzXHJcbiAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcclxuICAgIGNvbnN0IHsgZW5jb2RlIH0gPSByZXF1aXJlKCdAbXNncGFjay9tc2dwYWNrJyk7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xyXG4gICAgY29uc3QgUGFwYSA9IHJlcXVpcmUoJ3BhcGFwYXJzZScpO1xyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby12YXItcmVxdWlyZXNcclxuICAgIGNvbnN0IFhMU1ggPSByZXF1aXJlKCd4bHN4Jyk7XHJcblxyXG4gICAgY29uc3Qgc3JjQnRuID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNzcmMtZm9sZGVyLWJ0bicpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IG91dEJ0biA9IHBhbmVsLiQudGFiQ29udGVudC5xdWVyeVNlbGVjdG9yKCcjb3V0LWZvbGRlci1idG4nKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XHJcbiAgICBjb25zdCBzcmNQYXRoSW5wdXQgPSBwYW5lbC4kLnRhYkNvbnRlbnQucXVlcnlTZWxlY3RvcignI3NyYy1mb2xkZXItcGF0aCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xyXG4gICAgY29uc3Qgb3V0UGF0aElucHV0ID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNvdXQtZm9sZGVyLXBhdGgnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IGhlYWRlcklucHV0ID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNoZWFkZXItaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IGR1cENoZWNrID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNkdXAtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcclxuICAgIGNvbnN0IHByb2Nlc3NCdG4gPSBwYW5lbC4kLnRhYkNvbnRlbnQucXVlcnlTZWxlY3RvcignI3Byb2Nlc3MtYnRuJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xyXG4gICAgY29uc3QgZ2V0RWRpdG9yID0gKCkgPT4gKGdsb2JhbFRoaXMgYXMgYW55KS5FZGl0b3I7XHJcbiAgICBjb25zdCBzdGF0dXNBcmVhID0gcGFuZWwuJC50YWJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNzdGF0dXMtYXJlYScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuXHJcbiAgICBjb25zdCBhcHBseVN0YXRlID0gKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHN0YXRlID0gbG9hZFVpU3RhdGUoKTtcclxuICAgICAgICBpZiAoc3JjUGF0aElucHV0KSB7XHJcbiAgICAgICAgICAgIHNyY1BhdGhJbnB1dC52YWx1ZSA9IHN0YXRlLnNyY1Jvb3Q7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChvdXRQYXRoSW5wdXQpIHtcclxuICAgICAgICAgICAgb3V0UGF0aElucHV0LnZhbHVlID0gc3RhdGUub3V0Um9vdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGhlYWRlcklucHV0KSB7XHJcbiAgICAgICAgICAgIGhlYWRlcklucHV0LnZhbHVlID0gc3RhdGUuaGVhZGVyVGV4dDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGR1cENoZWNrKSB7XHJcbiAgICAgICAgICAgIGR1cENoZWNrLmNoZWNrZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgcGlja0ZvbGRlciA9IGFzeW5jICh0aXRsZTogc3RyaW5nLCBjdXJyZW50UGF0aDogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZWRpdG9yID0gZ2V0RWRpdG9yKCk7XHJcbiAgICAgICAgaWYgKCFlZGl0b3I/LkRpYWxvZz8uc2VsZWN0KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRWRpdG9yLkRpYWxvZy5zZWxlY3Qg5LiN5Y+v55SoJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBlZGl0b3IuRGlhbG9nLnNlbGVjdCh7XHJcbiAgICAgICAgICAgIHRpdGxlLFxyXG4gICAgICAgICAgICB0eXBlOiAnZGlyZWN0b3J5JyxcclxuICAgICAgICAgICAgcGF0aDogY3VycmVudFBhdGggfHwgdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICBidXR0b246ICfpgInmi6knLFxyXG4gICAgICAgICAgICBtdWx0aTogZmFsc2UsXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5jYW5jZWxlZCB8fCAhcmVzdWx0LmZpbGVQYXRocyB8fCByZXN1bHQuZmlsZVBhdGhzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm4gJyc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0LmZpbGVQYXRoc1swXSBhcyBzdHJpbmc7XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IHVwZGF0ZUFuZFNhdmUgPSAocGF0Y2g6IFBhcnRpYWw8VWlTdGF0ZT4pID0+IHtcclxuICAgICAgICBjb25zdCBjdXJyZW50ID0gbG9hZFVpU3RhdGUoKTtcclxuICAgICAgICBjb25zdCBuZXh0ID0geyAuLi5jdXJyZW50LCAuLi5wYXRjaCB9O1xyXG4gICAgICAgIGlmIChzcmNQYXRoSW5wdXQgJiYgdHlwZW9mIG5leHQuc3JjUm9vdCA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgc3JjUGF0aElucHV0LnZhbHVlID0gbmV4dC5zcmNSb290O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAob3V0UGF0aElucHV0ICYmIHR5cGVvZiBuZXh0Lm91dFJvb3QgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIG91dFBhdGhJbnB1dC52YWx1ZSA9IG5leHQub3V0Um9vdDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGhlYWRlcklucHV0ICYmIHR5cGVvZiBuZXh0LmhlYWRlclRleHQgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgIGhlYWRlcklucHV0LnZhbHVlID0gbmV4dC5oZWFkZXJUZXh0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBzYXZlVWlTdGF0ZShuZXh0KTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgZXNjYXBlSHRtbCA9IChzOiBzdHJpbmcpID0+IHtcclxuICAgICAgICByZXR1cm4gU3RyaW5nKHMpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcclxuICAgICAgICAgICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csICcmIzAzOTsnKTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgYXBwZW5kU3RhdHVzID0gKG1zZzogc3RyaW5nLCB0eXBlOiAnaW5mbycgfCAnZXJyb3InID0gJ2luZm8nKSA9PiB7XHJcbiAgICAgICAgaWYgKHN0YXR1c0FyZWEpIHtcclxuICAgICAgICAgICAgY29uc3QgY2xzID0gdHlwZSA9PT0gJ2Vycm9yJyA/ICdzdGF0dXMtZXJyb3InIDogJ3N0YXR1cy1pbmZvJztcclxuICAgICAgICAgICAgc3RhdHVzQXJlYS5pbm5lckhUTUwgKz0gYDxkaXYgY2xhc3M9XCIke2Nsc31cIj4ke2VzY2FwZUh0bWwobXNnKX08L2Rpdj5gO1xyXG4gICAgICAgICAgICBzdGF0dXNBcmVhLnNjcm9sbFRvcCA9IHN0YXR1c0FyZWEuc2Nyb2xsSGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbaTE4bi10b29sXScsIG1zZyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tpMThuLXRvb2xdJywgbXNnKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIHBhcnNlRmlsZShmaWxlUGF0aDogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgZXh0ID0gcGF0aC5leHRuYW1lKGZpbGVQYXRoKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGlmIChleHQgPT09ICcuY3N2Jykge1xyXG4gICAgICAgICAgICBjb25zdCB0eHQgPSBmcy5yZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGY4Jyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IFBhcGEucGFyc2UodHh0LCB7IGhlYWRlcjogdHJ1ZSwgc2tpcEVtcHR5TGluZXM6IHRydWUgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJzZWQuZGF0YTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGV4dCA9PT0gJy54bHN4JyB8fCBleHQgPT09ICcueGxzJykge1xyXG4gICAgICAgICAgICBjb25zdCB3b3JrYm9vayA9IFhMU1gucmVhZEZpbGUoZmlsZVBhdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBzaGVldE5hbWUgPSB3b3JrYm9vay5TaGVldE5hbWVzWzBdO1xyXG4gICAgICAgICAgICBjb25zdCByb3dzID0gWExTWC51dGlscy5zaGVldF90b19qc29uKHdvcmtib29rLlNoZWV0c1tzaGVldE5hbWVdLCB7IGRlZnZhbDogJycgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiByb3dzO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBkb1Byb2Nlc3MoKSB7XHJcbiAgICAgICAgaWYgKCFzcmNQYXRoSW5wdXQgfHwgIW91dFBhdGhJbnB1dCB8fCAhaGVhZGVySW5wdXQpIHtcclxuICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCfmjqfku7bmnKrlsLHnu6onKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGVhZGVyVGV4dCA9IGhlYWRlcklucHV0LnZhbHVlLnRyaW0oKTtcclxuICAgICAgICBpZiAoIWhlYWRlclRleHQpIHtcclxuICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCfor7floavlhpnlrZfmrrXlpLTvvIzkvovlpoLvvJpLZXksQ2hpbmVzZSxFbmdsaXNoJyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgaGVhZGVycyA9IGhlYWRlclRleHQuc3BsaXQoL1xccypbLO+8jF1cXHMqLykubWFwKChzOiBzdHJpbmcpID0+IHMudHJpbSgpKS5maWx0ZXIoKHM6IHN0cmluZykgPT4gcy5sZW5ndGggPiAwKTtcclxuICAgICAgICBpZiAoaGVhZGVycy5sZW5ndGggPCAyKSB7XHJcbiAgICAgICAgICAgIGFwcGVuZFN0YXR1cygn5a2X5q615aS06Iez5bCR6ZyA5YyF5ZCrIGtleSDlkozkuIDnp43or63oqIDlrZfmrrUnKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBrZXlGaWVsZCA9IGhlYWRlcnNbMF07XHJcbiAgICAgICAgY29uc3QgbGFuZ0ZpZWxkcyA9IGhlYWRlcnMuc2xpY2UoMSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNyY1Jvb3QgPSBzcmNQYXRoSW5wdXQ/LnZhbHVlLnRyaW0oKSB8fCAnJztcclxuICAgICAgICBjb25zdCBvdXRSb290ID0gb3V0UGF0aElucHV0Py52YWx1ZS50cmltKCkgfHwgJyc7XHJcbiAgICAgICAgY29uc3QgY2hlY2tEdXAgPSAhIShkdXBDaGVjaz8uY2hlY2tlZCk7XHJcblxyXG4gICAgICAgIGlmICghc3JjUm9vdCkge1xyXG4gICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+ivt+WFiOmAieaLqea6kOaWh+S7tuWkuScpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICghb3V0Um9vdCkge1xyXG4gICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+ivt+WFiOmAieaLqei+k+WHuuaWh+S7tuWkuScpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhcHBlbmRTdGF0dXMoJ+W8gOWni+i9rOaNoicpO1xyXG4gICAgICAgIGFwcGVuZFN0YXR1cyhg5rqQ55uu5b2VOiAke3NyY1Jvb3R9YCk7XHJcbiAgICAgICAgYXBwZW5kU3RhdHVzKGDovpPlh7rnm67lvZU6ICR7b3V0Um9vdH1gKTtcclxuICAgICAgICBhcHBlbmRTdGF0dXMoYOWtl+auteWktDogJHtoZWFkZXJzLmpvaW4oJywnKX1gKTtcclxuXHJcbiAgICAgICAgLy8gbGlzdCBmaWxlcyBpbiBzcmNSb290XHJcbiAgICAgICAgY29uc3QgYWxsRmlsZXMgPSBmcy5yZWFkZGlyU3luYyhzcmNSb290KTtcclxuICAgICAgICBjb25zdCBkYXRhRmlsZXMgPSBhbGxGaWxlcy5maWx0ZXIoKGY6IHN0cmluZykgPT4gWycuY3N2JywgJy54bHN4JywgJy54bHMnXS5pbmNsdWRlcyhwYXRoLmV4dG5hbWUoZikudG9Mb3dlckNhc2UoKSkpO1xyXG4gICAgICAgIGlmIChkYXRhRmlsZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIGFwcGVuZFN0YXR1cygn5rqQ55uu5b2V5Lit5rKh5pyJ5om+5YiwIGNzdiDmiJYgeGxzeCDmlofku7YnKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXBwZW5kU3RhdHVzKGDlj5HnjrAgJHtkYXRhRmlsZXMubGVuZ3RofSDkuKrmupDmlofku7ZgKTtcclxuICAgICAgICBhcHBlbmRTdGF0dXMoYOavj+S4quivreiogOWwhui+k+WHuiAxIOS4qiBNZXNzYWdlUGFjayDmlofku7ZgKTtcclxuXHJcbiAgICAgICAgLy8gYWdncmVnYXRlIGFjcm9zcyBhbGwgZmlsZXMgaW50byBvdmVyYWxsIGxhbmd1YWdlIG1hcHNcclxuICAgICAgICBjb25zdCBvdmVyYWxsTGFuZ01hcHM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIHN0cmluZz4+ID0ge307XHJcbiAgICAgICAgbGFuZ0ZpZWxkcy5mb3JFYWNoKChsZjogc3RyaW5nKSA9PiB7IG92ZXJhbGxMYW5nTWFwc1tsZl0gPSB7fTsgfSk7XHJcbiAgICAgICAgY29uc3QgZHVwbGljYXRlc0J5TGFuZzogUmVjb3JkPHN0cmluZywgU2V0PHN0cmluZz4+ID0ge307XHJcbiAgICAgICAgbGFuZ0ZpZWxkcy5mb3JFYWNoKChsZjogc3RyaW5nKSA9PiB7IGR1cGxpY2F0ZXNCeUxhbmdbbGZdID0gbmV3IFNldCgpOyB9KTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhRmlsZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBkYXRhRmlsZXNbaV07XHJcbiAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5qb2luKHNyY1Jvb3QsIGZpbGVuYW1lKTtcclxuICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDop6PmnpAgJHtmaWxlbmFtZX0gLi4uYCk7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgcGFyc2VGaWxlKGZ1bGxQYXRoKTtcclxuICAgICAgICAgICAgICAgIGlmICghcm93cyB8fCByb3dzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg5paH5Lu2ICR7ZmlsZW5hbWV9IOaXoOaVsOaNru+8jOi3s+i/h2ApO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgcm93cy5sZW5ndGg7IHIrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJvd3Nbcl0gYXMgUmVjb3JkPHN0cmluZywgYW55PjtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBTdHJpbmcocm93W2tleUZpZWxkXSA/PyAnJykudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICgha2V5KSBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBsaSA9IDA7IGxpIDwgbGFuZ0ZpZWxkcy5sZW5ndGg7IGxpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGYgPSBsYW5nRmllbGRzW2xpXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsID0gU3RyaW5nKHJvd1tsZl0gPz8gJycpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2hlY2tEdXAgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG92ZXJhbGxMYW5nTWFwc1tsZl0sIGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR1cGxpY2F0ZXNCeUxhbmdbbGZdLmFkZChrZXkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcmFsbExhbmdNYXBzW2xmXVtrZXldID0gdmFsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg6Kej5p6QICR7ZmlsZW5hbWV9IOWujOaIkGApO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVtID0gKGVyciBhcyBhbnkpPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpO1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDop6PmnpAgJHtmaWxlbmFtZX0g5aSx6LSlOiAke2VtfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBpZiBjaGVja0R1cCBlbmFibGVkLCB2ZXJpZnkgZHVwbGljYXRlc1xyXG4gICAgICAgIGlmIChjaGVja0R1cCkge1xyXG4gICAgICAgICAgICBjb25zdCBkdXBNc2dzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBsaSA9IDA7IGxpIDwgbGFuZ0ZpZWxkcy5sZW5ndGg7IGxpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGxmID0gbGFuZ0ZpZWxkc1tsaV07XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkc2V0ID0gZHVwbGljYXRlc0J5TGFuZ1tsZl07XHJcbiAgICAgICAgICAgICAgICBpZiAoZHNldCAmJiBkc2V0LnNpemUgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZHVwTXNncy5wdXNoKGAke2xmfTogJHtBcnJheS5mcm9tKGRzZXQpLmpvaW4oJywgJyl9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGR1cE1zZ3MubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCflj5HnjrDph43lpI0gS2V577yM5bey5Y+W5raI55Sf5oiQ77yaJywgJ2Vycm9yJyk7XHJcbiAgICAgICAgICAgICAgICBkdXBNc2dzLmZvckVhY2gobSA9PiBhcHBlbmRTdGF0dXMobSwgJ2Vycm9yJykpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBjbGVhciBvbGQgbGFuZ3VhZ2UgZm9sZGVycyBhbmQgd3JpdGUgYSBzaW5nbGUgbXNncGFjayBmaWxlIHBlciBsYW5ndWFnZVxyXG4gICAgICAgIGZvciAobGV0IGxpID0gMDsgbGkgPCBsYW5nRmllbGRzLmxlbmd0aDsgbGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBsZiA9IGxhbmdGaWVsZHNbbGldO1xyXG4gICAgICAgICAgICBjb25zdCBsYW5nRGlyID0gcGF0aC5qb2luKG91dFJvb3QsIGxmKTtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGlmIChmcy5leGlzdHNTeW5jKGxhbmdEaXIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDmuIXnkIbml6fnm67lvZUgJHtsYW5nRGlyfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIGZzLnJlbW92ZVN5bmMobGFuZ0Rpcik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBmcy5lbnN1cmVEaXJTeW5jKGxhbmdEaXIpO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb3V0RmlsZSA9IHBhdGguam9pbihsYW5nRGlyLCBgJHtsZn0ubXNncGFja2ApO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFja2VkID0gZW5jb2RlKG92ZXJhbGxMYW5nTWFwc1tsZl0pO1xyXG4gICAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhvdXRGaWxlLCBCdWZmZXIuZnJvbShwYWNrZWQpKTtcclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg5YaZ5YWlICR7b3V0RmlsZX1gKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICBhcHBlbmRTdGF0dXMoYOWGmeWFpSAke2xmfSDlpLHotKU6ICR7KGVyciBhcyBhbnkpPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhcHBlbmRTdGF0dXMoJ+WFqOmDqOWujOaIkCcpO1xyXG4gICAgfVxyXG5cclxuICAgIGFwcGx5U3RhdGUoKTtcclxuXHJcbiAgICBpZiAoc3JjQnRuKSB7XHJcbiAgICAgICAgc3JjQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCfmraPlnKjmiZPlvIDmupDmlofku7blpLnpgInmi6nmoYYuLi4nKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZvbGRlclBhdGggPSBhd2FpdCBwaWNrRm9sZGVyKCfpgInmi6nmupDmlofku7blpLknLCBzcmNQYXRoSW5wdXQ/LnZhbHVlLnRyaW0oKSB8fCAnJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWZvbGRlclBhdGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+acqumAieaLqea6kOaWh+S7tuWkuScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHVwZGF0ZUFuZFNhdmUoeyBzcmNSb290OiBmb2xkZXJQYXRoIH0pO1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDlt7LpgInmi6nmupDmlofku7blpLk6ICR7Zm9sZGVyUGF0aH1gKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg6YCJ5oup5rqQ5paH5Lu25aS55aSx6LSlOiAkeyhlcnJvciBhcyBhbnkpPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcil9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAob3V0UGF0aElucHV0KSB7XHJcbiAgICAgICAgb3V0UGF0aElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKCkgPT4gc2F2ZVVpU3RhdGUoeyBvdXRSb290OiBvdXRQYXRoSW5wdXQudmFsdWUudHJpbSgpIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAob3V0QnRuKSB7XHJcbiAgICAgICAgb3V0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKCfmraPlnKjmiZPlvIDovpPlh7rmlofku7blpLnpgInmi6nmoYYuLi4nKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZvbGRlclBhdGggPSBhd2FpdCBwaWNrRm9sZGVyKCfpgInmi6novpPlh7rmlofku7blpLknLCBvdXRQYXRoSW5wdXQ/LnZhbHVlLnRyaW0oKSB8fCAnJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWZvbGRlclBhdGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBhcHBlbmRTdGF0dXMoJ+acqumAieaLqei+k+WHuuaWh+S7tuWkuScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHVwZGF0ZUFuZFNhdmUoeyBvdXRSb290OiBmb2xkZXJQYXRoIH0pO1xyXG4gICAgICAgICAgICAgICAgYXBwZW5kU3RhdHVzKGDlt7LpgInmi6novpPlh7rmlofku7blpLk6ICR7Zm9sZGVyUGF0aH1gKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGFwcGVuZFN0YXR1cyhg6YCJ5oup6L6T5Ye65paH5Lu25aS55aSx6LSlOiAkeyhlcnJvciBhcyBhbnkpPy5tZXNzYWdlID8/IFN0cmluZyhlcnJvcil9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoaGVhZGVySW5wdXQpIHtcclxuICAgICAgICBoZWFkZXJJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHNhdmVVaVN0YXRlKHsgaGVhZGVyVGV4dDogaGVhZGVySW5wdXQudmFsdWUgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChwcm9jZXNzQnRuKSB7XHJcbiAgICAgICAgcHJvY2Vzc0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgLy8gY2xlYXIgc3RhdHVzXHJcbiAgICAgICAgICAgIGlmIChzdGF0dXNBcmVhKSBzdGF0dXNBcmVhLnRleHRDb250ZW50ID0gJyc7XHJcbiAgICAgICAgICAgIHNhdmVVaVN0YXRlKHtcclxuICAgICAgICAgICAgICAgIHNyY1Jvb3Q6IHNyY1BhdGhJbnB1dD8udmFsdWUudHJpbSgpIHx8ICcnLFxyXG4gICAgICAgICAgICAgICAgb3V0Um9vdDogb3V0UGF0aElucHV0Py52YWx1ZS50cmltKCkgfHwgJycsXHJcbiAgICAgICAgICAgICAgICBoZWFkZXJUZXh0OiBoZWFkZXJJbnB1dD8udmFsdWUgPz8gJycsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB2b2lkIGRvUHJvY2VzcygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEVkaXRvci5QYW5lbC5kZWZpbmUoe1xyXG4gICAgbGlzdGVuZXJzOiB7XHJcbiAgICAgICAgc2hvdygpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ3Nob3cnKTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGhpZGUoKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdoaWRlJyk7XHJcbiAgICAgICAgfSxcclxuICAgIH0sXHJcbiAgICB0ZW1wbGF0ZTogcmVhZEZpbGVTeW5jKGpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4vc3RhdGljL3RlbXBsYXRlL2RlZmF1bHQvaW5kZXguaHRtbCcpLCAndXRmLTgnKSxcclxuICAgIHN0eWxlOiByZWFkRmlsZVN5bmMoam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9zdGF0aWMvc3R5bGUvZGVmYXVsdC9pbmRleC5jc3MnKSwgJ3V0Zi04JyksXHJcbiAgICAkOiB7XHJcbiAgICAgICAgdGFiSGVhZGVyOiAnLnRhYi1oZWFkZXInLFxyXG4gICAgICAgIHRhYkNvbnRlbnQ6ICcudGFiLWNvbnRlbnQnLFxyXG4gICAgfSxcclxuICAgIG1ldGhvZHM6IHtcclxuICAgICAgICBoZWxsbygpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tnY29yZS1wYW5lbF06IGhlbGxvJyk7XHJcbiAgICAgICAgfSxcclxuICAgIH0sXHJcbiAgICByZWFkeSgpIHtcclxuICAgICAgICBzZXR1cFRhYlN3aXRjaGVyKHRoaXMsIGxvYWRVaVN0YXRlKCkuYWN0aXZlVGFiKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBpbml0STE4blRvb2wodGhpcyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdpbml0STE4blRvb2wgZXJyb3InLCBlKTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG4gICAgYmVmb3JlQ2xvc2UoKSB7fSxcclxuICAgIGNsb3NlKCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdbZ2NvcmUtcGFuZWxdOiBjbG9zZWQnKTtcclxuICAgIH0sXHJcbn0pO1xyXG4iXX0=