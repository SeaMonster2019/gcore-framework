import { _decorator, assetManager, Canvas, Component, director, EventKeyboard, Input, input, instantiate, isValid, KeyCode, Layers, Node, Prefab, RenderRoot2D, UITransform, view, Widget } from "cc";
import { DEBUG, EDITOR } from "cc/env";
import { GCoreConsoleView } from "./gcore-console-view";
import { gcoreConsole } from "./gocre-console-mgr";

const { ccclass, disallowMultiple, executeInEditMode, menu, property } = _decorator;

/** 控制台挂载组件
 * 挂在场景任意节点上即可使用：按固定 uuid 自动绑定控制台预制体，实例化后挂到跨场景常驻宿主节点上并置顶显示
 * 常驻宿主（__GCore_Console_Host__）位于场景根层级并携带 RenderRoot2D，切换场景时不会被销毁也不需要重建
 * 编辑器模式下会在组件加载时按 uuid 自动绑定预制体引用，保存场景后引用随场景固化，运行时无需任何路径配置
 * 预制体获取优先级：已绑定引用 > 全局默认预制体（GCoreConsole.setDefaultPrefab）> 按 uuid 加载
 */
@ccclass("GCoreConsole")
@menu("GCore/Debug/GCoreConsole")
@disallowMultiple(true)
@executeInEditMode(true)
export class GCoreConsole extends Component {

    /** 跨场景常驻宿主节点名 */
    public static readonly HOST_NODE_NAME = "__GCore_Console_Host__";
    /** 控制台实例节点名 */
    public static readonly CONSOLE_NODE_NAME = "__GCore_Console__";
    /** 控制台预制体的固定 uuid（db://gcore-framework/gcore-console/gcore-console.prefab），用于编辑器与运行时自动绑定 */
    public static readonly PREFAB_UUID = "49af8cd4-b6be-442a-bd46-1622362ded09";
    /** 控制台预制体的压缩 uuid。编辑器（非预览）环境下 bundle 配置不会对 uuid 做解码，需用它兜底查询 */
    public static readonly PREFAB_UUID_COMPACT = "49af8zUtr5EKr1GFiI2Le0J";

    /** 全局默认控制台预制体，游戏可在任意时机注入，之后所有 GCoreConsole 组件共用 */
    private static _defaultPrefab: Prefab | null = null;
    /** 全局常驻宿主节点（保证同一时刻只有一个） */
    private static _globalHost: Node | null = null;
    /** 全局控制台实例节点（跨场景复用，避免重复创建） */
    private static _globalConsoleNode: Node | null = null;
    /** 全局快捷键是否已注册（快捷键不与单个组件生命周期绑定，保证换场景后仍可用） */
    private static _hotKeyInited: boolean = false;
    /** 全局快捷键回调，用于注销时精确定位 */
    private static _hotKeyHandler: ((event: EventKeyboard) => void) | null = null;

    /****************  编辑器绑定  ****************/

    /** 控制台预制体 */
    @property({ type: Prefab, displayName: "控制台预制体", tooltip: "留空时按固定 uuid 自动绑定（编辑器模式下完成绑定后保存场景即可固化引用）" })
    private consolePrefab: Prefab | null = null;

    /** 挂载父节点 */
    @property({ type: Node, displayName: "挂载父节点", tooltip: "仅在不跨场景常驻时生效：控制台实例挂到该节点下，留空时挂到组件所在节点" })
    private declare root: Node;

    /****************  运行配置  ****************/

    /** 启动后是否立即显示控制台 */
    @property({ displayName: "启动即显示", tooltip: "首次创建后是否立即显示控制台（跨场景复用的实例沿用上次的显隐状态）" })
    private autoShow: boolean = false;

    /** 日志最大保留条数 */
    @property({ displayName: "日志上限", tooltip: "控制台缓存的最大日志条数" })
    private maxLogCount: number = 800;

    /** 是否接管 console 输出 */
    @property({ displayName: "接管Console", tooltip: "将 console.log/warn/error 的输出同步到控制台" })
    private captureConsole: boolean = true;

    /** 是否开启快捷键（反引号 `）开关控制台 */
    @property({ displayName: "开启快捷键", tooltip: "按下反引号键切换控制台显隐，注册一次后跨场景持续生效" })
    private enableHotKey: boolean = true;

    /** 是否跨场景常驻 */
    @property({ displayName: "跨场景常驻", tooltip: "开启后控制台实例挂到常驻宿主节点上，切换场景不销毁也不重建" })
    private persistAcrossScene: boolean = true;

    /** 是否自适应画布尺寸 */
    @property({ displayName: "自适应画布", tooltip: "将控制台尺寸拉伸到当前场景的画布（或可见区域）大小" })
    private autoAdaptation: boolean = true;

    /** 正式包是否可用 */
    @property({ displayName: "正式包可用", tooltip: "关闭时，非 DEBUG 构建下不会创建控制台" })
    private enableInRelease: boolean = true;

    /** 控制台视图实例 */
    private _view: GCoreConsoleView | null = null;

    /****************  静态接口  ****************/

    /** 设置全局默认控制台预制体，实现"挂载即用"的自动绑定
     * @param prefab 控制台预制体，传 null 清除
     */
    public static setDefaultPrefab(prefab: Prefab | null): void {
        GCoreConsole._defaultPrefab = prefab;
    }

    /** 获取全局默认控制台预制体 */
    public static getDefaultPrefab(): Prefab | null {
        return GCoreConsole._defaultPrefab;
    }

    /** 获取全局常驻宿主节点 */
    public static getGlobalHost(): Node | null {
        return GCoreConsole._globalHost;
    }

    /** 获取全局控制台实例节点 */
    public static getGlobalConsoleNode(): Node | null {
        return GCoreConsole._globalConsoleNode;
    }

    /****************  生命周期  ****************/

    /** 组件加载：编辑器模式下仅按 uuid 自动绑定预制体，运行模式下创建（或复用）控制台实例 */
    protected onLoad(): void {
        // 编辑器模式：只做引用绑定，不创建实例也不注册快捷键，避免污染编辑中的场景
        if (EDITOR) {
            this._autoBindPrefabInEditor();
            return;
        }

        if (!DEBUG && !this.enableInRelease) {
            console.log(`%c 控制台已在非 DEBUG 构建中禁用`, "color: rgb(62, 184, 32);");
            return;
        }

        gcoreConsole.init({
            maxLogCount: this.maxLogCount,
            captureConsole: this.captureConsole,
        });

        this._createConsole().catch((error) => {
            console.error(`控制台创建失败：${error}`);
        });
    }

    /** 组件销毁：解绑本地引用，常驻模式下保留控制台实例给后续场景 */
    protected onDestroy(): void {
        const host = GCoreConsole._globalHost;
        if (isValid(host)) {
            host.off(Node.EventType.SCENE_CHANGED_FOR_PERSISTS, this._onSceneChangedForPersists, this);
        }
        // 非常驻模式下控制台跟随组件一起销毁；常驻模式需显式调用 destroyConsole
        if (!this.persistAcrossScene) {
            this.destroyConsole();
        }
        this._view = null;
    }

    /****************  公共方法  ****************/

    /** 显示控制台 */
    public open(): void {
        if (isValid(this._view)) {
            this._view.setVisible(true);
        }
    }

    /** 隐藏控制台 */
    public close(): void {
        if (isValid(this._view)) {
            this._view.setVisible(false);
        }
    }

    /** 切换控制台显隐 */
    public toggle(): void {
        if (!isValid(this._view)) {
            return;
        }
        this._view.setVisible(!this._view.isVisible());
    }

    /** 控制台是否已显示 */
    public isOpen(): boolean {
        return isValid(this._view) && this._view.isVisible();
    }

    /** 获取控制台视图实例 */
    public getView(): GCoreConsoleView | null {
        return isValid(this._view) ? this._view : null;
    }

    /** 销毁控制台实例与常驻宿主，并注销全局快捷键 */
    public destroyConsole(): void {
        const node = GCoreConsole._globalConsoleNode;
        if (isValid(node)) {
            node.destroy();
        }
        const host = GCoreConsole._globalHost;
        if (isValid(host)) {
            director.removePersistRootNode(host);
            host.destroy();
        }
        GCoreConsole._globalConsoleNode = null;
        GCoreConsole._globalHost = null;
        GCoreConsole._unregisterHotKey();
        this._view = null;
    }

    /****************  私有方法  ****************/

    /** 创建或复用控制台实例 */
    private async _createConsole(): Promise<void> {
        // 已存在跨场景实例时直接复用，避免每个场景重复创建
        if (isValid(GCoreConsole._globalConsoleNode)) {
            this._bindExisting(GCoreConsole._globalConsoleNode!);
            return;
        }

        const prefab = await this._resolvePrefab();
        if (!prefab) {
            console.error(`控制台预制体获取失败：uuid=${GCoreConsole.PREFAB_UUID}，请在编辑器中打开该场景完成自动绑定并保存场景，或手动拖拽预制体`);
            return;
        }
        if (!isValid(this.node)) {
            return;
        }

        const node = instantiate(prefab);
        node.name = GCoreConsole.CONSOLE_NODE_NAME;

        if (this.persistAcrossScene) {
            // 挂到常驻宿主上：宿主自身保持在场景根层级，因此换场景不会连带销毁控制台
            const host = this._ensureHost();
            node.setParent(host);
            node.setSiblingIndex(host.children.length - 1);
        } else {
            const root = isValid(this.root) ? this.root : this.node;
            node.setParent(root);
            node.setSiblingIndex(root.children.length - 1);
        }

        const consoleView = node.getComponent(GCoreConsoleView);
        if (!consoleView) {
            console.error(`控制台预制体根节点缺少 GCoreConsoleView 组件`);
            node.destroy();
            return;
        }

        this._view = consoleView;
        GCoreConsole._globalConsoleNode = node;

        this._syncLayout();
        if (this.enableHotKey) {
            GCoreConsole._registerHotKey();
        }
        consoleView.setVisible(this.autoShow);
    }

    /** 复用已存在的控制台实例（换场景后重新绑定引用）
     * @param node 已存在的控制台节点
     */
    private _bindExisting(node: Node): void {
        const consoleView = node.getComponent(GCoreConsoleView);
        if (!consoleView) {
            return;
        }
        this._view = consoleView;
        this._listenHost();
        // 复用实例沿用上次的显隐状态，不再套用本组件的启动即显示
        this._syncLayout();
        if (this.enableHotKey) {
            GCoreConsole._registerHotKey();
        }
    }

    /** 获取或创建跨场景常驻宿主节点
     * @returns 常驻宿主节点
     */
    private _ensureHost(): Node {
        if (isValid(GCoreConsole._globalHost)) {
            return GCoreConsole._globalHost!;
        }
        const scene = director.getScene();
        if (!scene) {
            throw new Error(`当前场景不存在，无法创建控制台常驻宿主`);
        }

        const host = new Node(GCoreConsole.HOST_NODE_NAME);
        host.layer = Layers.Enum.UI_2D;
        // 常驻节点必须位于层级根节点，否则 addPersistRootNode 不会生效
        host.setParent(scene);
        // RenderRoot2D 提供独立的 2D 渲染根，使控制台脱离场景 Canvas 也能被 UI 相机渲染
        host.addComponent(RenderRoot2D);
        host.addComponent(UITransform);
        director.addPersistRootNode(host);

        GCoreConsole._globalHost = host;
        this._listenHost();
        return host;
    }

    /** 监听常驻宿主的场景切换通知，先移除再注册避免重复监听 */
    private _listenHost(): void {
        const host = GCoreConsole._globalHost;
        if (!isValid(host)) {
            return;
        }
        host.off(Node.EventType.SCENE_CHANGED_FOR_PERSISTS, this._onSceneChangedForPersists, this);
        // 切换场景后会触发该事件，此时按新场景的画布重新适配
        host.on(Node.EventType.SCENE_CHANGED_FOR_PERSISTS, this._onSceneChangedForPersists, this);
    }

    /** 切换场景回调，重新适配新场景画布 */
    private _onSceneChangedForPersists(): void {
        this._syncLayout();
    }

    /** 同步控制台的尺寸与位置：常驻模式对齐当前场景画布，非常驻模式对齐挂载父节点 */
    private _syncLayout(): void {
        const consoleView = this._view;
        if (!isValid(consoleView) || !this.autoAdaptation) {
            return;
        }
        const uit = consoleView.node.getComponent(UITransform);
        if (!uit) {
            return;
        }

        const host = GCoreConsole._globalHost;
        if (this.persistAcrossScene && isValid(host)) {
            const rect = this._resolveCanvasRect();
            const hostUIT = host.getComponent(UITransform);
            if (hostUIT) {
                hostUIT.setContentSize(rect.width, rect.height);
            }
            host.setWorldPosition(rect.x, rect.y, 0);
            uit.setContentSize(rect.width, rect.height);
            // 宿主与控制台处于同一坐标系原点，实例相对偏移保持为零
            consoleView.node.setPosition(0, 0, 0);
            this._refreshWidgets(host);
            return;
        }

        // 非常驻模式：跟随挂载父节点的尺寸
        const parentUIT = consoleView.node.parent?.getComponent(UITransform);
        if (parentUIT) {
            uit.setContentSize(parentUIT.width, parentUIT.height);
        }
        this._refreshWidgets(consoleView.node);
    }

    /** 计算当前场景画布的世界中心与尺寸，优先取场景内 Canvas，其次退化为可见区域
     * @returns 画布矩形信息
     */
    private _resolveCanvasRect(): { x: number, y: number, width: number, height: number } {
        const canvas = director.getScene()?.getComponentInChildren(Canvas);
        if (canvas) {
            const uit = canvas.getComponent(UITransform);
            const pos = canvas.node.worldPosition;
            if (uit) {
                return { x: pos.x, y: pos.y, width: uit.width, height: uit.height };
            }
        }
        const size = view.getVisibleSize();
        return { x: size.width / 2, y: size.height / 2, width: size.width, height: size.height };
    }

    /** 立即刷新指定节点及其子节点的 Widget 对齐，避免尺寸变化后要等到下一帧才生效
     * @param node 根节点
     */
    private _refreshWidgets(node: Node | null): void {
        if (!isValid(node)) {
            return;
        }
        for (const widget of node.getComponentsInChildren(Widget)) {
            widget.updateAlignment();
        }
    }

    /** 按优先级获取控制台预制体：已绑定引用 > 全局默认预制体 > 按 uuid 加载
     * @returns 预制体或 null
     */
    private async _resolvePrefab(): Promise<Prefab | null> {
        if (this.consolePrefab) {
            return this.consolePrefab;
        }
        if (GCoreConsole._defaultPrefab) {
            this.consolePrefab = GCoreConsole._defaultPrefab;
            return this.consolePrefab;
        }
        // 场景未固化引用时（例如代码动态挂载组件），仍按同一 uuid 兜底加载
        const prefab = await this._loadPrefabByUuid();
        if (prefab) {
            this.consolePrefab = prefab;
        }
        return prefab;
    }

    /** 按固定 uuid 加载控制台预制体：优先完整 uuid，编辑器环境下再退化为压缩 uuid
     * @returns 预制体或 null
     */
    private async _loadPrefabByUuid(): Promise<Prefab | null> {
        const prefab = await this._tryLoadPrefab(GCoreConsole.PREFAB_UUID);
        if (prefab) {
            return prefab;
        }
        return this._tryLoadPrefab(GCoreConsole.PREFAB_UUID_COMPACT);
    }

    /** 按指定 uuid 加载控制台预制体，加载成功后写入全局默认避免重复加载
     * @param uuid 资源 uuid（完整或压缩格式）
     * @returns 预制体或 null
     */
    private _tryLoadPrefab(uuid: string): Promise<Prefab | null> {
        return new Promise<Prefab | null>((resolve) => {
            assetManager.loadAny<Prefab>(uuid, (err, prefab) => {
                if (err || !prefab) {
                    resolve(null);
                    return;
                }
                GCoreConsole.setDefaultPrefab(prefab);
                resolve(prefab);
            });
        });
    }

    /** 编辑器模式下按 uuid 自动绑定预制体引用，绑定结果会随场景保存一起固化 */
    private _autoBindPrefabInEditor(): void {
        if (this.consolePrefab) {
            return;
        }
        this._loadPrefabByUuid().then((prefab) => {
            if (!prefab || !isValid(this.node)) {
                console.warn(`控制台预制体自动绑定失败，可手动拖拽预制体：uuid=${GCoreConsole.PREFAB_UUID}`);
                return;
            }
            this.consolePrefab = prefab;
            console.log(`%c 控制台预制体已按 uuid 自动绑定：${GCoreConsole.PREFAB_UUID}`, "color: rgb(62, 184, 32);");
        });
    }

    /****************  全局快捷键  ****************/

    /** 注册全局快捷键（与组件生命周期解耦，保证换场景后依然可用） */
    private static _registerHotKey(): void {
        if (GCoreConsole._hotKeyInited) {
            return;
        }
        GCoreConsole._hotKeyInited = true;
        GCoreConsole._hotKeyHandler = (event: EventKeyboard) => {
            if (event.keyCode !== KeyCode.BACK_QUOTE) {
                return;
            }
            gcoreConsole.toggle();
        };
        input.on(Input.EventType.KEY_DOWN, GCoreConsole._hotKeyHandler);
    }

    /** 注销全局快捷键 */
    private static _unregisterHotKey(): void {
        if (!GCoreConsole._hotKeyInited || !GCoreConsole._hotKeyHandler) {
            return;
        }
        input.off(Input.EventType.KEY_DOWN, GCoreConsole._hotKeyHandler);
        GCoreConsole._hotKeyHandler = null;
        GCoreConsole._hotKeyInited = false;
    }
}
