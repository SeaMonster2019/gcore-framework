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

function setupTabSwitcher(panel: any) {
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
        });
    });

    activateTab('tab-1');
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
        setupTabSwitcher(this);
    },
    beforeClose() {},
    close() {
        console.log('[gcore-panel]: closed');
    },
});
