import { _decorator, Color, Component, EditBox, EventKeyboard, Input, input, instantiate, isValid, KeyCode, Label, Node, UITransform, Widget } from "cc";
import { BaseUi, VScrollView } from "../../scripts/integration/ui/index";
import { CONSOLE_CANDIDATE_ROW_COUNT, EConsoleLogLevel, IConsoleCommand, IConsoleView } from "./gcore-console-define";
import { gcoreConsole } from "./gocre-console-mgr";

const { ccclass, disallowMultiple, menu, property } = _decorator;

/** Label 的同步排版接口
 * 引擎中 `updateRenderData` 为 protected，运行时可直接调用：传入 true 可立即完成文本排版并回写节点高度
 * 虚拟列表依赖条目高度计算 contentSize 与滚动边界，若高度要等下一帧才生效，贴底位置就会偏掉
 */
interface IForceLabelLayout {
    updateRenderData?(force: boolean): void;
}

/** 控制台视图
 * 负责日志渲染、指令输入、候选检索框与显隐控制，是 `gcore-console.prefab` 根节点上的脚本组件
 * 控制台由 `GCoreConsole` 组件直接实例化，不经过 `gcoreMvc` 管理，因此继承 `BaseUi` 而非 `BaseView`
 * 日志区使用 `VScrollView` 虚拟列表渲染，每条日志对应一个日志条目预制体（`gcore-console-log.prefab`）
 * 未手动绑定引用时，会按预制体默认节点名自动查找：lbl-log（虚拟列表）/ edit / place-candidate / lbl-candidate-N / btn-send / btn-close / btn-clear
 */
@ccclass("GCoreConsoleView")
@menu("GCore/Debug/GCoreConsoleView")
@disallowMultiple(true)
export class GCoreConsoleView extends BaseUi implements IConsoleView {

    /** 回车提交后允许重新聚焦的时间窗（毫秒），用于区分回车失焦与用户主动切换焦点 */
    public static readonly REFOCUS_WINDOW_MS = 300;

    /** 测量不到条目高度时的兜底高度（与日志条目单行高度接近） */
    public static readonly DEFAULT_ITEM_HEIGHT = 40;

    /** 隐藏测量节点的纵向偏移，保证它落在屏幕外不被看到 */
    public static readonly MEASURE_NODE_OFFSET_Y = 100000;

    /** 日志高度缓存的条目上限，超出后整体清空 */
    public static readonly MAX_HEIGHT_CACHE_SIZE = 1000;

    /****************  编辑器绑定  ****************/

    /** 日志虚拟列表 */
    @property({ type: VScrollView, displayName: "日志虚拟列表", tooltip: "承载日志的虚拟滚动列表，留空时按节点名 lbl-log 自动查找" })
    public logVScrollView: VScrollView | null = null;

    /** 指令输入框 */
    @property({ type: EditBox, displayName: "指令输入框", tooltip: "指令输入 EditBox，留空时按节点名 edit 自动查找" })
    public inputEditBox: EditBox | null = null;

    /** 候选检索框 */
    @property({ type: Node, displayName: "候选检索框", tooltip: "展示候选指令的浮层容器，留空时按节点名 place-candidate 自动查找" })
    public candidatePanel: Node | null = null;

    /** 候选项文本（自上而下排列，数量与检索框行数一致） */
    @property({ type: [Label], displayName: "候选项文本", tooltip: "候选指令的逐行 Label，留空时按节点名 lbl-candidate-0/1/2... 自动查找" })
    public candidateLabels: Label[] = [];

    /** 发送按钮 */
    @property({ type: Node, displayName: "发送按钮", tooltip: "留空时按节点名 btn-send 自动查找" })
    public btnSend: Node | null = null;

    /** 关闭按钮 */
    @property({ type: Node, displayName: "关闭按钮", tooltip: "留空时按节点名 btn-close 自动查找" })
    public btnClose: Node | null = null;

    /** 清屏按钮 */
    @property({ type: Node, displayName: "清屏按钮", tooltip: "留空时按节点名 btn-clear 自动查找" })
    public btnClear: Node | null = null;

    /****************  显示配置  ****************/

    /** 是否显示时间戳 */
    @property({ displayName: "显示时间戳", tooltip: "在每条日志前追加 [hh:mm:ss] 时间戳" })
    public showTimestamp: boolean = false;

    /** 新日志到达后是否自动滚动到底部 */
    @property({ displayName: "自动滚动到底", tooltip: "日志刷新后立即定位到最新一条" })
    public autoScrollToBottom: boolean = true;

    /** 候选检索框最大展示条数 */
    @property({ displayName: "候选最大条数", tooltip: "检索框同时展示的候选指令数量，超出部分不再展示" })
    public maxCandidates: number = CONSOLE_CANDIDATE_ROW_COUNT;

    /** 候选检索框是否启用 */
    @property({ displayName: "启用候选检索", tooltip: "输入时实时模糊检索已注册指令并在检索框中展示" })
    public enableCandidate: boolean = true;

    /** 候选项常规颜色 */
    @property({ type: Color, displayName: "候选常规色", tooltip: "未选中候选项的文本颜色" })
    public candidateNormalColor: Color = new Color(200, 214, 229, 255);

    /** 候选项高亮颜色 */
    @property({ type: Color, displayName: "候选高亮色", tooltip: "当前选中候选项的文本颜色" })
    public candidateHighlightColor: Color = new Color(255, 216, 102, 255);

    /** 普通日志颜色 */
    @property({ type: Color, displayName: "普通日志色" })
    public logColor: Color = new Color(200, 214, 229, 255);

    /** 警告日志颜色 */
    @property({ type: Color, displayName: "警告日志色" })
    public warnColor: Color = new Color(255, 216, 102, 255);

    /** 错误日志颜色 */
    @property({ type: Color, displayName: "错误日志色" })
    public errorColor: Color = new Color(255, 107, 107, 255);

    /** 系统日志颜色 */
    @property({ type: Color, displayName: "系统日志色" })
    public systemColor: Color = new Color(126, 231, 255, 255);

    /** 指令回显颜色 */
    @property({ type: Color, displayName: "回显日志色" })
    public commandColor: Color = new Color(123, 237, 159, 255);

    /****************  运行时状态  ****************/

    /** 当前候选指令列表 */
    private _candidates: IConsoleCommand[] = [];
    /** 当前选中的候选项下标（默认第一项） */
    private _candidateIndex: number = 0;
    /** 输入框是否处于编辑中 */
    private _isEditing: boolean = false;
    /** 代码回填输入框时跳过一次文本变化处理，避免递归触发检索 */
    private _ignoreTextChange: boolean = false;
    /** 虚拟列表是否已完成初始化（其 start 为异步，需延后一帧才能刷新） */
    private _logListReady: boolean = false;
    /** 是否已提示过"未找到虚拟列表"，避免重复刷屏 */
    private _warnedNoList: boolean = false;
    /** 最近一次回车提交的时间戳（毫秒） */
    private _lastReturnTime: number = 0;
    /** 用于离线测量日志高度的隐藏节点（挂在控制台下，位于屏幕外） */
    private _measureNode: Node | null = null;
    /** 隐藏测量节点上的 Label，配置与日志条目预制体完全一致 */
    private _measureLabel: Label | null = null;
    /** 日志文本 -> 条目高度的缓存，避免同一段文本反复排版 */
    private _heightCache: Map<string, number> = new Map();
    /** 高度缓存对应的条目宽度，宽度变化时缓存失效 */
    private _cacheWidth: number = 0;

    /****************  生命周期  ****************/

    /** 组件加载：自动补全引用、绑定事件、绑定列表回调并注册到管理器 */
    protected onLoad(): void {
        this._autoBind();
        this._bindEvents();
        this._bindLogList();

        // 保证管理器已初始化（init 幂等，重复调用无副作用）
        gcoreConsole.init();
        gcoreConsole.setView(this);
        this._hideCandidates();
    }

    /** 节点激活：延后一帧判定列表就绪，等待 VScrollView 完成自身的异步 start */
    protected onEnable(): void {
        this.scheduleOnce(() => this._readyLogList(), 0);
    }

    /** 组件启动：延后一帧判定列表就绪（节点初始即激活时的入口） */
    protected start(): void {
        this.scheduleOnce(() => this._readyLogList(), 0);
    }

    /** 组件销毁：解绑事件并注销视图 */
    protected onDestroy(): void {
        this._unbindEvents();
        if (isValid(this.logVScrollView)) {
            this.logVScrollView.renderItemFn = null;
            this.logVScrollView.getItemTypeIndexFn = null;
            this.logVScrollView.getItemHeightFn = null;
        }
        // 销毁隐藏测量节点，避免随控制台常驻残留
        if (isValid(this._measureNode) && this._measureNode) {
            this._measureNode.destroy();
        }
        this._measureNode = null;
        this._measureLabel = null;
        this._heightCache.clear();
        if (gcoreConsole.getView() === this) {
            gcoreConsole.setView(null);
        }
    }

    /****************  IConsoleView 实现  ****************/

    /** 日志变化通知，刷新日志显示 */
    public onLogChanged(): void {
        this.refreshLogs();
    }

    /** 设置控制台显隐
     * @param visible 是否显示
     */
    public setVisible(visible: boolean): void {
        if (this.node.active === visible) {
            return;
        }
        this.node.active = visible;
        if (visible) {
            // 跨场景或父级尺寸变化后重新对齐一次，避免 Widget 尚未生效导致布局错位
            this._refreshWidgets();
            // 列表就绪由 onEnable 延后一帧判定，此处不再立即刷新（VScrollView 尚未 start）
            this.focusInput();
        } else {
            this._hideCandidates();
        }
    }

    /** 控制台是否可见 */
    public isVisible(): boolean {
        return this.node.active;
    }

    /** 聚焦到输入框 */
    public focusInput(): void {
        this.inputEditBox?.focus();
    }

    /****************  公共方法  ****************/

    /** 刷新日志列表（条目渲染与高度由虚拟列表自行处理） */
    public refreshLogs(): void {
        const vscroll = this.logVScrollView;
        if (!vscroll) {
            // 只提示一次，避免日志刷新时反复刷屏
            if (!this._warnedNoList) {
                this._warnedNoList = true;
                console.warn(`控制台未找到日志虚拟列表 VScrollView，日志无法输出`);
            }
            return;
        }
        if (!this._logListReady) {
            return;
        }
        // refreshList 只更新条数，条目内容由 renderItemFn 按索引取
        vscroll.refreshList(gcoreConsole.getLogs());
        if (this.autoScrollToBottom) {
            vscroll.flashToBottom();
            // 兜底：列表尺寸或视口尺寸在本帧稍晚才稳定时，下一帧再贴一次底，避免最底部被 mask 裁掉
            this._scheduleKeepBottom();
        }
    }

    /** 安排下一帧再次贴底（重复调用只保留最后一次） */
    private _scheduleKeepBottom(): void {
        this.unschedule(this._keepBottomTick);
        this.scheduleOnce(this._keepBottomTick, 0);
    }

    /** 下一帧重新贴底的回调 */
    private _keepBottomTick = (): void => {
        if (!this._logListReady) {
            return;
        }
        const vscroll = this.logVScrollView;
        if (isValid(vscroll) && vscroll) {
            vscroll.flashToBottom();
        }
    };

    /** 提交输入框中的指令 */
    public submit(): void {
        const editBox = this.inputEditBox;
        if (!editBox) {
            return;
        }
        const input = editBox.string.trim();
        if (!input) {
            return;
        }
        this._hideCandidates();
        editBox.string = "";
        gcoreConsole.exec(input);
    }

    /****************  私有方法：日志列表  ****************/

    /** 绑定虚拟列表回调
     * 必须在 VScrollView 的 start 之前调用：它在 start 中校验 getItemTypeIndexFn，缺失则直接报错且不渲染任何条目
     */
    private _bindLogList(): void {
        const vscroll = this.logVScrollView;
        if (!vscroll) {
            console.warn(`控制台未找到日志虚拟列表 VScrollView，请确认预制体内挂有该组件`);
            return;
        }
        // 日志条目数量可能很多，关闭渲染分层避免每条 Label 都挂 Sorting2D
        vscroll.onOffSortLayer(false);
        // 不等大小模式下必须提供 getItemHeightFn：
        // 否则组件只会用条目预制体的初始高度（单行）当作所有条目的高度，换行后的真实高度要等条目渲染完才回填，
        // 会导致 contentSize 与滚动边界持续变化——滚动位置不会重新钳制，贴底时最底部被 mask 裁掉
        vscroll.getItemHeightFn = (index: number) => this._measureLogHeight(index);
        vscroll.getItemTypeIndexFn = () => 0;
        vscroll.renderItemFn = (node: Node, index: number) => this._renderLogItem(node, index);
    }

    /** 取指定日志的展示文本（前缀 + 正文）
     * @param index 日志索引
     * @returns 展示文本，索引无效时返回空串
     */
    private _logItemText(index: number): string {
        const item = gcoreConsole.getLogs()[index];
        if (!item) {
            return "";
        }
        return `${this._formatPrefix(item)}${item.text}`;
    }

    /** 日志区视口宽度，决定条目文本的换行宽度
     * @returns 视口宽度，取不到时返回 0
     */
    private _logViewportWidth(): number {
        const viewportUIT = this.logVScrollView?.node.getComponent(UITransform);
        return viewportUIT ? viewportUIT.width : 0;
    }

    /** 测量指定日志的条目高度
     * 用隐藏 Label 同步排版得到精确高度并缓存，保证列表一开始就能拿到正确高度
     * @param index 日志索引
     * @returns 该条目渲染后的高度
     */
    private _measureLogHeight(index: number): number {
        const text = this._logItemText(index);
        if (!text) {
            return GCoreConsoleView.DEFAULT_ITEM_HEIGHT;
        }
        // 视口宽度变化（分辨率/布局变化）会让换行结果改变，此时缓存必须失效
        const width = this._logViewportWidth();
        if (width > 0 && width !== this._cacheWidth) {
            this._heightCache.clear();
            this._cacheWidth = width;
        }
        const cached = this._heightCache.get(text);
        if (cached !== undefined) {
            return cached;
        }
        const label = this._ensureMeasureLabel(width);
        if (!label) {
            return GCoreConsoleView.DEFAULT_ITEM_HEIGHT;
        }
        label.string = text;
        this._forceLabelLayout(label);
        const labelUIT = label.node.getComponent(UITransform);
        const height = labelUIT && labelUIT.height > 0 ? labelUIT.height : GCoreConsoleView.DEFAULT_ITEM_HEIGHT;
        // 控制台常驻，缓存按文本累积，超过上限直接整体清空，避免长时间运行后无限增长
        if (this._heightCache.size >= GCoreConsoleView.MAX_HEIGHT_CACHE_SIZE) {
            this._heightCache.clear();
        }
        this._heightCache.set(text, height);
        return height;
    }

    /** 确保隐藏测量节点已创建，并同步当前条目宽度
     * @param width 条目宽度
     * @returns 测量用的 Label，创建失败时返回 null
     */
    private _ensureMeasureLabel(width: number): Label | null {
        if (isValid(this._measureLabel) && this._measureLabel) {
            this._applyMeasureWidth(width);
            return this._measureLabel;
        }
        const vscroll = this.logVScrollView;
        if (!vscroll) {
            return null;
        }
        // 复用日志条目预制体，保证字号、行高、换行等配置与真实条目一致
        const templates = vscroll.itemPrefabs ?? [];
        const template = templates.length > 0 ? templates[0] : null;
        if (!template) {
            return null;
        }
        const node = instantiate(template);
        node.name = "__console_log_measure__";
        node.parent = this.node;
        node.setPosition(0, GCoreConsoleView.MEASURE_NODE_OFFSET_Y);
        node.active = true;
        this._measureNode = node;
        this._measureLabel = node.getComponent(Label) ?? node.getComponentInChildren(Label);
        this._applyMeasureWidth(width);
        return this._measureLabel;
    }

    /** 把测量节点的宽度同步为条目宽度
     * @param width 条目宽度
     */
    private _applyMeasureWidth(width: number): void {
        if (width <= 0 || !this._measureLabel) {
            return;
        }
        const uit = this._measureLabel.node.getComponent(UITransform);
        if (uit) {
            uit.setContentSize(width, uit.height);
        }
    }

    /** 强制 Label 立即完成排版，使节点高度当场生效
     * @param label 目标 Label
     */
    private _forceLabelLayout(label: Label): void {
        const target = label as unknown as IForceLabelLayout;
        if (typeof target.updateRenderData === "function") {
            target.updateRenderData(true);
        }
    }

    /** 标记虚拟列表已就绪并刷新一次
     * 由 onEnable / start 延后一帧调用，确保 VScrollView 的异步 start 已完成
     */
    private _readyLogList(): void {
        if (!this.logVScrollView || this._logListReady) {
            return;
        }
        this._logListReady = true;
        // 还没有任何日志时补一条就绪提示，便于确认日志区是否工作
        if (gcoreConsole.getLogs().length === 0) {
            gcoreConsole.log(`控制台已就绪，输入 help 查看可用指令`, EConsoleLogLevel.System);
        }
        this.refreshLogs();
    }

    /** 渲染单条日志条目
     * @param node 条目节点（日志条目预制体实例）
     * @param index 日志索引
     */
    private _renderLogItem(node: Node, index: number): void {
        const logs = gcoreConsole.getLogs();
        const item = logs[index];
        if (!item) {
            return;
        }
        const label = node.getComponent(Label);
        if (!label) {
            return;
        }
        // 先确定宽度再写文本：Label 为 RESIZE_HEIGHT，会按最新宽度换行并回写节点高度
        const uit = node.getComponent(UITransform);
        const viewportUIT = this.logVScrollView?.node.getComponent(UITransform);
        if (uit && viewportUIT) {
            uit.setContentSize(viewportUIT.width, uit.height);
        }
        label.string = `${this._formatPrefix(item)}${item.text}`;
        // 立即排版：让节点高度与 getItemHeightFn 给出的高度一致，避免列表用"上一帧的旧高度"定位条目
        this._forceLabelLayout(label);
        label.color = this._levelColor(item.level);
    }

    /** 生成单条日志的前缀（时间戳 + 级别标记）
     * @param item 日志项
     * @returns 前缀文本
     */
    private _formatPrefix(item: { level: EConsoleLogLevel, time: number }): string {
        let prefix = "";
        if (this.showTimestamp) {
            const date = new Date(item.time);
            const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`);
            prefix += `[${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}]`;
        }
        switch (item.level) {
            case EConsoleLogLevel.Warn:
                prefix += "[W]";
                break;
            case EConsoleLogLevel.Error:
                prefix += "[E]";
                break;
            case EConsoleLogLevel.System:
                prefix += "[S]";
                break;
            case EConsoleLogLevel.Command:
                prefix += "> ";
                break;
            default:
                break;
        }
        return prefix;
    }

    /** 按日志级别取文本颜色
     * @param level 日志级别
     * @returns 文本颜色
     */
    private _levelColor(level: EConsoleLogLevel): Color {
        switch (level) {
            case EConsoleLogLevel.Warn:
                return this.warnColor;
            case EConsoleLogLevel.Error:
                return this.errorColor;
            case EConsoleLogLevel.System:
                return this.systemColor;
            case EConsoleLogLevel.Command:
                return this.commandColor;
            default:
                return this.logColor;
        }
    }

    /****************  私有方法：引用与事件  ****************/

    /** 自动补全未绑定的节点/组件引用 */
    private _autoBind(): void {
        // 优先按组件类型查找，避免节点改名或结构调整后绑定失效
        if (!this.logVScrollView) {
            this.logVScrollView = this.node.getComponentInChildren(VScrollView);
        }
        if (!this.logVScrollView) {
            this.logVScrollView = this._findComponent("lbl-log", VScrollView) ?? this._findComponent("scroll-log", VScrollView);
        }
        if (!this.inputEditBox) {
            this.inputEditBox = this._findComponent("edit", EditBox);
        }
        if (!this.candidatePanel) {
            this.candidatePanel = this._findNode("place-candidate");
        }
        if (!this.candidateLabels.length) {
            const rows = Math.max(1, Math.floor(this.maxCandidates));
            for (let i = 0; i < rows; i++) {
                const label = this._findComponent(`lbl-candidate-${i}`, Label);
                if (!label) {
                    break;
                }
                this.candidateLabels.push(label);
            }
        }
        if (!this.btnSend) {
            this.btnSend = this._findNode("btn-send");
        }
        if (!this.btnClose) {
            this.btnClose = this._findNode("btn-close");
        }
        if (!this.btnClear) {
            this.btnClear = this._findNode("btn-clear");
        }
    }

    /** 安全查找子节点，未找到时返回 null（不抛异常）
     * @param name 节点名
     * @returns 节点或 null
     */
    private _findNode(name: string): Node | null {
        const queue: Node[] = [this.node];
        let index = 0;
        while (index < queue.length) {
            const current = queue[index++];
            if (current.name === name) {
                return current;
            }
            for (const child of current.children) {
                queue.push(child);
            }
        }
        return null;
    }

    /** 安全查找子节点上的组件，未找到时返回 null
     * @param name 节点名
     * @param comp 组件类型
     * @returns 组件或 null
     */
    private _findComponent<T extends Component>(name: string, comp: new () => T): T | null {
        const node = this._findNode(name);
        if (!node) {
            return null;
        }
        return node.getComponent(comp);
    }

    /** 绑定输入框、按钮与全局按键事件 */
    private _bindEvents(): void {
        if (this.inputEditBox) {
            const editNode = this.inputEditBox.node;
            editNode.on(EditBox.EventType.EDITING_DID_BEGAN, this._onEditBegan, this);
            editNode.on(EditBox.EventType.TEXT_CHANGED, this._onEditTextChanged, this);
            editNode.on(EditBox.EventType.EDITING_DID_ENDED, this._onEditEnded, this);
            editNode.on(EditBox.EventType.EDITING_RETURN, this._onEditReturn, this);
        }
        // EditBox 不派发方向键事件，上下切换候选项需要监听全局键盘
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        this.btnSend?.on(Node.EventType.TOUCH_END, this._onBtnSend, this);
        this.btnClose?.on(Node.EventType.TOUCH_END, this._onBtnClose, this);
        this.btnClear?.on(Node.EventType.TOUCH_END, this._onBtnClear, this);
    }

    /** 解绑输入框、按钮与全局按键事件 */
    private _unbindEvents(): void {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        const editBox = this.inputEditBox;
        if (editBox?.isValid) {
            const editNode = editBox.node;
            editNode.off(EditBox.EventType.EDITING_DID_BEGAN, this._onEditBegan, this);
            editNode.off(EditBox.EventType.TEXT_CHANGED, this._onEditTextChanged, this);
            editNode.off(EditBox.EventType.EDITING_DID_ENDED, this._onEditEnded, this);
            editNode.off(EditBox.EventType.EDITING_RETURN, this._onEditReturn, this);
        }
        if (this.btnSend?.isValid) {
            this.btnSend.off(Node.EventType.TOUCH_END, this._onBtnSend, this);
        }
        if (this.btnClose?.isValid) {
            this.btnClose.off(Node.EventType.TOUCH_END, this._onBtnClose, this);
        }
        if (this.btnClear?.isValid) {
            this.btnClear.off(Node.EventType.TOUCH_END, this._onBtnClear, this);
        }
    }

    /****************  私有方法：候选检索框  ****************/

    /** 输入框开始编辑 */
    private _onEditBegan(): void {
        this._isEditing = true;
    }

    /** 输入框结束编辑 */
    private _onEditEnded(): void {
        this._isEditing = false;
        this._hideCandidates();
        // 回车提交会让输入框失焦（并收起键盘），这里重新聚焦以便连续输入指令
        // 只有紧跟在回车之后的失焦才重新聚焦，避免抢走用户主动切换到其它控件的焦点
        if (Date.now() - this._lastReturnTime <= GCoreConsoleView.REFOCUS_WINDOW_MS) {
            this._lastReturnTime = 0;
            this.scheduleOnce(() => {
                if (this.node.active && isValid(this.inputEditBox)) {
                    this.inputEditBox.focus();
                }
            }, 0);
        }
    }

    /** 输入框回车提交 */
    private _onEditReturn(): void {
        this.submit();
        // 记录回车时刻，用于区分"回车导致的失焦"与"用户主动切换焦点"
        this._lastReturnTime = Date.now();
    }

    /** 输入内容变化：按空格确认选中项，其余情况重新检索候选
     * @param editBox 输入框组件
     */
    private _onEditTextChanged(editBox: EditBox): void {
        if (this._ignoreTextChange) {
            this._ignoreTextChange = false;
            return;
        }
        const text = editBox?.string ?? "";
        // 空格作为"选中并回填"的确认键，输入末尾出现空格即确认当前选中项
        if (text.endsWith(" ")) {
            this._confirmCandidate();
            return;
        }
        this._updateCandidates(text);
    }

    /** 全局按键：上下切换候选项，ESC 关闭检索框
     * @param event 键盘事件
     */
    private _onKeyDown(event: EventKeyboard): void {
        if (!this.node.active || !this._isEditing || this._candidates.length === 0) {
            return;
        }
        switch (event.keyCode) {
            case KeyCode.ARROW_UP:
                this._moveCandidate(-1);
                break;
            case KeyCode.ARROW_DOWN:
                this._moveCandidate(1);
                break;
            case KeyCode.ESCAPE:
                this._hideCandidates();
                break;
            default:
                break;
        }
    }

    /** 按当前输入重新检索候选，并把选中项重置为第一项
     * @param input 当前输入
     */
    private _updateCandidates(input: string): void {
        if (!this.enableCandidate) {
            this._hideCandidates();
            return;
        }
        const key = (input ?? "").trim();
        // 输入为空时不再展示候选
        this._candidates = key ? gcoreConsole.matchCommands(key, Math.max(1, Math.floor(this.maxCandidates))) : [];
        // 每次输入新内容都把选中项调整为第一项
        this._candidateIndex = 0;
        this._refreshCandidatePanel();
    }

    /** 移动选中项（循环移动）
     * @param offset 移动偏移量，正为向下、负为向上
     */
    private _moveCandidate(offset: number): void {
        if (this._candidates.length === 0) {
            return;
        }
        const count = this._candidates.length;
        this._candidateIndex = (this._candidateIndex + offset + count) % count;
        this._refreshCandidatePanel();
    }

    /** 确认当前选中项，把完整指令名回填到输入框 */
    private _confirmCandidate(): void {
        if (this._candidates.length === 0) {
            return;
        }
        const command = this._candidates[this._candidateIndex];
        if (!command) {
            return;
        }
        this._hideCandidates();
        if (!this.inputEditBox) {
            return;
        }
        // 回填指令名并补一个空格，方便继续输入参数；回填的文本变化不再触发检索
        this._ignoreTextChange = true;
        this.inputEditBox.string = `${command.name} `;
        this.scheduleOnce(() => {
            this._ignoreTextChange = false;
        }, 0);
    }

    /** 关闭候选检索框并清空候选 */
    private _hideCandidates(): void {
        this._candidates.length = 0;
        this._candidateIndex = 0;
        this._refreshCandidatePanel();
    }

    /** 刷新候选检索框的显示内容与高亮项 */
    private _refreshCandidatePanel(): void {
        const panel = this.candidatePanel;
        const showing = this._candidates.length > 0;
        if (panel) {
            panel.active = showing;
        }
        for (let i = 0; i < this.candidateLabels.length; i++) {
            const label = this.candidateLabels[i];
            if (!label) {
                continue;
            }
            const command = this._candidates[i];
            const visible = showing && !!command;
            label.node.active = visible;
            if (!visible) {
                continue;
            }
            // 选中的候选项加箭头标记并使用高亮色，其余使用常规色
            const selected = i === this._candidateIndex;
            label.string = `${selected ? "> " : "  "}${command.name}  ${command.desc ?? ""}`;
            label.color = selected ? this.candidateHighlightColor : this.candidateNormalColor;
        }
    }

    /****************  私有方法：按钮  ****************/

    /** 点击发送按钮 */
    private _onBtnSend(): void {
        this.submit();
    }

    /** 点击关闭按钮，隐藏控制台 */
    private _onBtnClose(): void {
        this.setVisible(false);
    }

    /** 点击清屏按钮 */
    private _onBtnClear(): void {
        gcoreConsole.clearLogs();
        this.focusInput();
    }

    /** 立即刷新自身及子节点的 Widget 对齐
     * 尺寸或父级发生变化后，Widget 默认要等到下一帧才生效，这里主动触发以保证布局即时正确
     */
    private _refreshWidgets(): void {
        for (const widget of this.node.getComponentsInChildren(Widget)) {
            widget.updateAlignment();
        }
    }
}
