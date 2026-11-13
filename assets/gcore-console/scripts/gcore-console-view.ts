import { _decorator, Color, Component, EditBox, EventKeyboard, EventTouch, Input, input, instantiate, isValid, KeyCode, Label, Node, UITransform, Widget } from "cc";
import { VScrollView } from "../../scripts/integration/ui/index";
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
 * 日志区使用 `VScrollView` 虚拟列表渲染，每条日志对应一个日志条目预制体（`gcore-console-log.prefab`）
 * 未手动绑定引用时，会按预制体默认节点名自动查找：lbl-log（虚拟列表）/ edit / place-candidate / lbl-candidate-N
 * 按键约定：上下键仅用于切换候选指令；回车在候选框展开时确认选中项（补全指令名），否则提交执行
 * 按钮约定：所有按钮的点击事件一律在预制体的 Button.clickEvents 中配置（target 指向根节点、handler = btnClick、
 * customEventData = 按钮标识），脚本侧只保留 btnClick 一个字符串分发入口，禁止用 node.on/off 绑定点击事件
 */
@ccclass("GCoreConsoleView")
@menu("GCore/Debug/GCoreConsoleView")
@disallowMultiple(true)
export class GCoreConsoleView extends Component implements IConsoleView {

    /** 回车提交后允许重新聚焦的时间窗（毫秒），用于区分回车失焦与用户主动切换焦点 */
    public static readonly REFOCUS_WINDOW_MS = 300;

    /** 测量不到条目高度时的兜底高度（与日志条目单行高度接近） */
    public static readonly DEFAULT_ITEM_HEIGHT = 40;

    /** 隐藏测量节点的纵向偏移，保证它落在屏幕外不被看到 */
    public static readonly MEASURE_NODE_OFFSET_Y = 100000;

    /** 日志高度缓存的条目上限，超出后整体清空 */
    public static readonly MAX_HEIGHT_CACHE_SIZE = 1000;

    /** 原生键盘事件：上方向键 */
    public static readonly KEY_UP = 38;
    /** 原生键盘事件：下方向键 */
    public static readonly KEY_DOWN = 40;
    /** 原生键盘事件：ESC */
    public static readonly KEY_ESC = 27;

    /** 预制体 Button.clickEvents 中配置的回调组件名（修改预制体时需与此保持一致） */
    public static readonly BTN_COMPONENT = "GCoreConsoleView";
    /** 按钮 clickEvents 的统一回调方法名 */
    public static readonly BTN_HANDLER = "btnClick";
    /** 按钮标识：发送 */
    public static readonly BTN_KEY_SEND = "send";
    /** 按钮标识：关闭 */
    public static readonly BTN_KEY_CLOSE = "close";
    /** 按钮标识：清屏 */
    public static readonly BTN_KEY_CLEAR = "clear";
    /** 按钮标识：上一条历史 */
    public static readonly BTN_KEY_HISTORY_PREV = "history_prev";
    /** 按钮标识：下一条历史 */
    public static readonly BTN_KEY_HISTORY_NEXT = "history_next";

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
    @property({ displayName: "候选常规色", tooltip: "未选中候选项的文本颜色" })
    public candidateNormalColor: Color = new Color(200, 214, 229, 255);

    /** 候选项高亮颜色 */
    @property({ displayName: "候选高亮色", tooltip: "当前选中候选项的文本颜色" })
    public candidateHighlightColor: Color = new Color(255, 216, 102, 255);

    /** 普通日志颜色 */
    @property({ displayName: "普通日志色" })
    public logColor: Color = new Color(200, 214, 229, 255);

    /** 警告日志颜色 */
    @property({ displayName: "警告日志色" })
    public warnColor: Color = new Color(255, 216, 102, 255);

    /** 错误日志颜色 */
    @property({ displayName: "错误日志色" })
    public errorColor: Color = new Color(255, 107, 107, 255);

    /** 系统日志颜色 */
    @property({ displayName: "系统日志色" })
    public systemColor: Color = new Color(126, 231, 255, 255);

    /** 指令回显颜色 */
    @property({ displayName: "回显日志色" })
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
    /** 历史指令浏览下标：0 为最新一条，-1 表示当前不在浏览历史（已回到空输入） */
    private _historyNavIndex: number = -1;
    /** Web 端原生键盘监听（EditBox 聚焦时引擎的全局 KEY_DOWN 收不到按键，需自行监听） */
    private _nativeKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;
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
        // 提交后退出历史浏览状态，下次按上键从最新一条开始
        this._historyNavIndex = -1;
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
        // EditBox 聚焦时 Web 端会把按键交给原生 input，引擎的全局 KEY_DOWN 收不到，
        // 因此再挂一层 DOM 捕获监听兜底（原生平台无 document，自动跳过）
        this._bindNativeKeys();
    }

    /** 解绑输入框与全局按键事件（按钮事件由预制体的 Button.clickEvents 承载，无需解绑） */
    private _unbindEvents(): void {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        this._unbindNativeKeys();
        const editBox = this.inputEditBox;
        if (editBox?.isValid) {
            const editNode = editBox.node;
            editNode.off(EditBox.EventType.EDITING_DID_BEGAN, this._onEditBegan, this);
            editNode.off(EditBox.EventType.TEXT_CHANGED, this._onEditTextChanged, this);
            editNode.off(EditBox.EventType.EDITING_DID_ENDED, this._onEditEnded, this);
            editNode.off(EditBox.EventType.EDITING_RETURN, this._onEditReturn, this);
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

    /** 输入框回车：候选展开时先确认选中项（补全指令名），否则提交输入
     * 用回车而非空格确认，避免"输入空格写参数"与"确认补全"两种语义互相打架
     */
    private _onEditReturn(): void {
        // 已经完整输入了指令名（与选中候选同名）时，回车应当直接执行，而不是再补一次全名
        const selected = this._candidates[this._candidateIndex];
        const typed = (this.inputEditBox?.string ?? "").trim();
        if (selected && selected.name !== typed) {
            this._confirmCandidate();
        } else {
            this._hideCandidates();
            this.submit();
        }
        // 记录回车时刻，用于区分"回车导致的失焦"与"用户主动切换焦点"（补全后同样需要重新聚焦）
        this._lastReturnTime = Date.now();
    }

    /** 输入内容变化：重新检索候选（空格已不再是确认键，仅作为普通字符参与输入） */
    private _onEditTextChanged(editBox: EditBox): void {
        if (this._ignoreTextChange) {
            this._ignoreTextChange = false;
            return;
        }
        // 用户手动输入即退出历史浏览状态
        this._historyNavIndex = -1;
        this._updateCandidates(editBox?.string ?? "");
    }

    /** 全局按键（EditBox 未聚焦时）：上下键与 ESC
     * @param event 键盘事件
     */
    private _onKeyDown(event: EventKeyboard): void {
        if (!this.node.active) {
            return;
        }
        // Web 端按键统一由 DOM 监听处理（引擎的全局 KEY_DOWN 在 Web 端不派发），
        // 这里只在没有 DOM 监听的原生平台生效，避免同一按键被处理两次
        if (this._nativeKeyDownHandler) {
            return;
        }
        switch (event.keyCode) {
            case KeyCode.ARROW_UP:
                this._handleArrowKey(-1);
                break;
            case KeyCode.ARROW_DOWN:
                this._handleArrowKey(1);
                break;
            case KeyCode.ESCAPE:
                this._hideCandidates();
                break;
            default:
                break;
        }
    }

    /** 绑定 Web 端原生键盘监听（捕获阶段，保证在 EditBox 之前拿到按键） */
    private _bindNativeKeys(): void {
        if (typeof document === "undefined" || this._nativeKeyDownHandler) {
            return;
        }
        this._nativeKeyDownHandler = (event: KeyboardEvent) => this._onNativeKeyDown(event);
        document.addEventListener("keydown", this._nativeKeyDownHandler, true);
    }

    /** 解绑 Web 端原生键盘监听 */
    private _unbindNativeKeys(): void {
        if (!this._nativeKeyDownHandler || typeof document === "undefined") {
            return;
        }
        document.removeEventListener("keydown", this._nativeKeyDownHandler, true);
        this._nativeKeyDownHandler = null;
    }

    /** Web 端原生按键：控制台可见时上下键始终归控制台使用
     * 不能要求输入框处于编辑中——点过日志区会自动失焦，此时仍应能翻历史（实测引擎全局 KEY_DOWN 在 Web 端不派发）
     * @param event 原生键盘事件
     */
    private _onNativeKeyDown(event: KeyboardEvent): void {
        if (!this.node.active) {
            return;
        }
        const key = event.key ?? "";
        const code = (event as any).keyCode ?? 0;
        const isUp = key === "ArrowUp" || code === GCoreConsoleView.KEY_UP;
        const isDown = key === "ArrowDown" || code === GCoreConsoleView.KEY_DOWN;
        const isEsc = key === "Escape" || code === GCoreConsoleView.KEY_ESC;
        if (!isUp && !isDown && !isEsc) {
            return;
        }
        if (isEsc) {
            this._hideCandidates();
        } else {
            this._handleArrowKey(isUp ? -1 : 1);
        }
        // 阻止光标随上下键跳动，并避免事件继续冒泡触发重复处理
        event.preventDefault();
        event.stopPropagation();
    }

    /** 处理上下键：仅用于切换候选项，翻历史指令统一交给输入区旁边的上下按钮
     * @param offset -1 为上一项，1 为下一项
     */
    private _handleArrowKey(offset: number): void {
        if (!this.node.active || this._candidates.length === 0) {
            return;
        }
        this._moveCandidate(offset);
    }

    /** 浏览历史指令：上翻到更早一条，下翻到更新一条，越过最新一条后回到空输入
     * @param offset -1 为上（更早），1 为下（更新）
     */
    private _navigateHistory(offset: number): void {
        const history = gcoreConsole.getHistory();
        if (history.length === 0) {
            return;
        }
        if (offset < 0) {
            // 上：向更早的历史移动，已到最早一条则不再变化
            if (this._historyNavIndex >= history.length - 1) {
                return;
            }
            this._historyNavIndex++;
        } else {
            // 下：向更新的历史移动，已在最新一条则回到空输入
            if (this._historyNavIndex < 0) {
                return;
            }
            this._historyNavIndex--;
        }
        const text = this._historyNavIndex < 0 ? "" : history[history.length - 1 - this._historyNavIndex];
        this._setInputText(text);
        // 回填历史不触发检索，保持候选框关闭
        this._hideCandidates();
    }

    /** 以代码方式写入输入框内容，跳过一次文本变化回调
     * @param text 写入的文本
     */
    private _setInputText(text: string): void {
        if (!this.inputEditBox) {
            return;
        }
        this._ignoreTextChange = true;
        this.inputEditBox.string = text;
        // EditBox 可能不派发文本变化，兜底在下一帧复位标志，避免吞掉用户的下一次输入
        this.scheduleOnce(() => {
            this._ignoreTextChange = false;
        }, 0);
    }

    /** 按当前输入重新检索候选，并把选中项重置为第一项
     * @param input 当前输入
     */
    private _updateCandidates(input: string): void {
        if (!this.enableCandidate) {
            this._hideCandidates();
            return;
        }
        const raw = input ?? "";
        const key = raw.trim();
        // 已输入空格说明开始写参数，此时只做普通输入，不再补全指令名（与 cmd 补全行为一致）
        // 输入为空时同样不展示候选
        this._candidates = key && raw.indexOf(" ") < 0
            ? gcoreConsole.matchCommands(key, Math.max(1, Math.floor(this.maxCandidates)))
            : [];
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
        // 回填指令名并补一个空格，方便继续输入参数；回填的文本变化不再触发检索
        this._setInputText(`${command.name} `);
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

    /** 按钮点击统一入口：由按钮组件的 clickEvents 调用，按 customEventData 分发
     * @param event 按钮点击事件（不使用）
     * @param key 按钮标识，取自 clickEvents 的 customEventData
     */
    public btnClick(event?: EventTouch, key?: string): void {
        switch (key) {
            case GCoreConsoleView.BTN_KEY_SEND:
                this.submit();
                break;
            case GCoreConsoleView.BTN_KEY_CLOSE:
                this.setVisible(false);
                break;
            case GCoreConsoleView.BTN_KEY_CLEAR:
                gcoreConsole.clearLogs();
                this.focusInput();
                break;
            case GCoreConsoleView.BTN_KEY_HISTORY_PREV:
                this._fillHistoryByButton(-1);
                break;
            case GCoreConsoleView.BTN_KEY_HISTORY_NEXT:
                this._fillHistoryByButton(1);
                break;
            default:
                break;
        }
    }

    /** 按按钮方向填充历史并把焦点交还输入框，便于直接回车执行
     * @param offset -1 为上一条（更早），1 为下一条（更新）
     */
    private _fillHistoryByButton(offset: number): void {
        this._hideCandidates();
        this._navigateHistory(offset);
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
