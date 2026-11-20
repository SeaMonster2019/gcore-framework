import { instantiate, isValid, Node, screen, UITransform, view } from "cc";
import { gcoreEvent, GCoreEvent } from "../../system/event/index";
import { BaseCtrl } from "./base-ctrl";
import { BaseModel } from "./base-model";
import { IMvcMrgParams, IMvcParams, IViewHandle, IViewParamMap, IViewParams, ViewId, ViewInstantiationAfterCallback, ViewOpenArgs, ViewType } from "./mvc-interface";
import { BaseView } from "./base-view";

/** MVC管理器，负责MVC框架的注册、视图的创建与销毁等核心管理 */
export class MvcMgr {

    /** 初始化参数 */
    private declare _params: IMvcMrgParams;
    /** MVC参数映射表（tid -> IMvcParams） */
    private _paramsMap: Map<number, IMvcParams> = new Map();
    /** 控制器映射表（tid -> BaseCtrl） */
    private _ctrlMap: Map<number, BaseCtrl> = new Map();
    /** 数据模型映射表（tid -> BaseModel） */
    private _modelMap: Map<number, BaseModel> = new Map();
    /** 视图映射表（tid -> 单个View或View数组，多实例时为数组） */
    private _viewMap: Map<number, ViewType | ViewType[]> = new Map();
    /** 正在加载中的视图 Promise 映射表 */
    private _loadingViewMap: Map<number, Promise<IViewHandle>> = new Map();
    /** 实例id自增计数器 */
    private _iid: number = 0;
    /** 框架外注入的「视图实例化并挂载后」回调，可为节点树内的按钮统一绑定事件 */
    private _onInstantiationAfter: ViewInstantiationAfterCallback | null = null;
    /** 已触发过实例化回调的节点集合，保证每个 view 实例无论如何只触发一次 */
    private _instantiatedNodes: WeakSet<Node> = new WeakSet<Node>();

    /****************  初始化  ****************/

    /** 初始化MVC管理器
     * @param params 初始化参数
     */
    public init(params: IMvcMrgParams) {
        this._params = params;

        BaseView.CloseFunc = (tid: number, iid: number) => {
            this.close(tid, iid);
        }

        // 移除旧监听后重新注册，防止重复绑定
        screen.off('window-resize', this._onWindowResize, this);
        screen.on('window-resize', this._onWindowResize, this);
    }

    /**
     * 注入「视图实例化并挂载后」回调（框架外调用）。
     * 每个 view 节点在 instantiate + setParent 后触发一次，无论何种情况同一节点都不会重复触发；
     * 重复调用本方法会覆盖上一个回调。典型用途：为 view 节点树内所有按钮统一绑定点击音效。
     * @param callback 回调函数；传 null 可取消注入
     */
    public setOnInstantiationAfter(callback: ViewInstantiationAfterCallback | null): void {
        this._onInstantiationAfter = callback;
    }

    /** 注册单个MVC模块，创建对应的Model和Ctrl实例
     * @param params MVC参数
     */
    public register(params: IMvcParams) {
        // 将MVC参数存入映射表
        this._paramsMap.set(params.tid, params);
        // 创建数据模型实例并初始化
        const ModelClass = params.ModelType || BaseModel;
        const newModel = new ModelClass(params);
        newModel.onInit();
        this._modelMap.set(params.tid, newModel);
        // 创建控制器实例并初始化（注入数据模型）
        const CtrlClass = params.CtrlType || BaseCtrl;
        const newCtrl = new CtrlClass(params, newModel);
        newCtrl.onInit();
        this._ctrlMap.set(params.tid, newCtrl);
        // 发送注册视图事件
        gcoreEvent.emit(GCoreEvent.MVC_EVENT.REGISTER_VIEW, params.tid, params);
    }

    /** 批量注册MVC模块
     * @param params MVC参数列表
     * @param completeCallback 单个注册完成回调
     */
    public registerAll(params: Array<IMvcParams>, completeCallback?: (tid: number) => void) {
        for (const param of params) {
            this.register(param);
            completeCallback?.(param.tid);
        }
    }

    /****************  视图操作  ****************/

    /** 打开视图，若为唯一/常驻视图且已有实例则复用，否则创建新实例
     * @typeParam K 视图类型id
     * @param tid 视图类型id
     * @param param 视图参数：若对应参数类型存在必填字段，则此参数必填；否则可省略
     * @returns 视图实例句柄
     */
    public async open<K extends ViewId>(tid: K, ...args: ViewOpenArgs<IViewParamMap[K]>): Promise<IViewHandle> {
        // 根据类型id查找对应的MVC参数
        const mvcParams = this._paramsMap.get(tid);
        if (!mvcParams) {
            throw new Error(`MVC参数不存在: ${tid}`);
        }
        const param = (args[0] ?? {}) as IViewParamMap[K];

        // 唯一/常驻视图全程按单实例处理，复用判断与加载去重共用同一标识
        const singleInstance = !!mvcParams.attribute?.bIsOnly || !!mvcParams.attribute?.bResident;

        // 唯一/常驻视图：已有有效实例则复用，不再创建
        if (singleInstance) {
            const existView = this._getFirstView(this._viewMap.get(tid));
            if (existView && existView.node && isValid(existView.node)) {
                // 若被隐藏则激活；重复 open 仍触发 onShow，供业务刷新数据
                if (!existView.node.active) {
                    existView.node.active = true;
                }
                // 复用实例不会重新 onInit，这里把本次 open 的新参数写回视图，
                // 避免 _params 停留在首次 open 的旧值（如单例 GameMain 复用后关卡回到第 1 关）
                existView.setParams(param);
                existView.onShow();
                return this._createViewHandle(tid, existView);
            }
            // 旧实例节点已失效，清除映射后重新创建
            if (existView) {
                this._viewMap.delete(tid);
            }
        }

        // 唯一/常驻视图正在加载中：复用同一个 Promise，避免并发创建多个实例
        if (singleInstance) {
            const loading = this._loadingViewMap.get(tid);
            if (loading) {
                return loading;
            }
        }

        const openPromise = (async () => {
            try {
                const view = await this._createViewNode(mvcParams, param);
                if (!view) {
                    throw new Error(`视图组件不存在tid:${tid}, 请检查预制体是否正确`);
                }
                this._storeView(tid, view, mvcParams);
                // 发送打开视图事件
                gcoreEvent.emit(GCoreEvent.MVC_EVENT.OPEN_VIEW, tid, view);
                return this._createViewHandle(tid, view);
            } finally {
                // 无论成功失败，都从加载中映射表移除
                if (singleInstance) {
                    this._loadingViewMap.delete(tid);
                }
            }
        })();

        if (singleInstance) {
            this._loadingViewMap.set(tid, openPromise);
        }
        return openPromise;
    }

    /** 关闭视图，默认常驻视图隐藏、非常驻视图销毁；destroy=true 时强制销毁（含常驻视图）
     * @param tid 类型id
     * @param iid 实例id，指定关闭多实例中的某个
     * @param destroy 是否强制销毁，默认false
     */
    public close(tid: number, iid?: number, destroy?: boolean): void {
        const entry = this._viewMap.get(tid);
        if (!entry) return;

        const mvcParams = this._paramsMap.get(tid);
        // 仅常驻视图且未强制销毁时隐藏节点，其余情况均销毁
        const hideOnly = !!mvcParams?.attribute?.bResident && destroy !== true;

        /** 关闭单个视图的内部逻辑 */
        const closeOne = (v: ViewType) => {
            if (!v || !v.node) return;
            if (!isValid(v.node)) return;
            // 发送关闭视图事件
            gcoreEvent.emit(GCoreEvent.MVC_EVENT.CLOSE_VIEW, tid, v);
            if (hideOnly) {
                // 常驻视图仅隐藏节点
                v.node.active = false;
            } else {
                // 非常驻视图或强制销毁时销毁节点
                v.node.destroy();
            }
        };

        // 多实例处理
        if (Array.isArray(entry)) {
            if (typeof iid === 'number') {
                // 指定关闭某个实例
                const idx = entry.findIndex(it => it.getIid() === iid);
                if (idx >= 0) {
                    const v = entry[idx];
                    closeOne(v);
                    if (!hideOnly) {
                        entry.splice(idx, 1);
                    }
                }
            } else {
                // 关闭所有同类型实例
                for (const v of entry) {
                    closeOne(v);
                }
                if (!hideOnly) {
                    this._viewMap.delete(tid);
                }
            }
            // 如果数组清空则删除映射
            if (entry.length === 0) {
                this._viewMap.delete(tid);
            }
            return;
        }

        // 单实例处理
        const v = entry as ViewType;
        // 如果指定了iid但不匹配，跳过
        if (typeof iid === 'number' && v.getIid() !== iid) {
            return;
        }
        closeOne(v);
        // 隐藏时保留映射以便复用，销毁时从映射表移除
        if (!hideOnly) {
            this._viewMap.delete(tid);
        }
    }

    /** 关闭所有视图
     * @param destroy 是否销毁
     * @param excludeTids 排除的tid列表，这些视图不会被关闭
     */
    public closeAll(destroy: boolean, excludeTids?: number[]): void {
        // 收集所有已打开的视图tid
        const allTids = Array.from(this._viewMap.keys());
        // 遍历关闭所有视图
        for (const tid of allTids) {
            if (!excludeTids || excludeTids.indexOf(tid) === -1) {
                this.close(tid, undefined, destroy);
            }
        }
    }

    /****************  数据查询  ****************/

    /** 获取视图实例
     * @typeParam T 视图类型
     * @param tid 类型id
     * @param iid 实例id（多实例时指定具体实例，不传则返回首个）
     * @returns 视图组件
     */
    public getView<T extends ViewType>(tid: number, iid?: number): T {
        const entry = this._viewMap.get(tid);
        if (!entry) return null as any;
        if (Array.isArray(entry)) {
            if (typeof iid === 'number') {
                // 按实例id查找
                return entry.find(v => v.getIid() === iid) as unknown as T || null as any;
            }
            // 返回数组中第一个
            return entry[0] as unknown as T;
        }
        return entry as unknown as T;
    }

    /** 获取指定类型的所有视图实例
     * @param tid 类型id
     * @returns 视图列表
     */
    public getViews(tid: number): Array<ViewType> {
        const entry = this._viewMap.get(tid);
        if (!entry) return [];
        if (Array.isArray(entry)) return entry;
        return [entry];
    }

    /** 获取数据模型
     * @typeParam T 数据模型类型
     * @param type 类型id或模型类
     * @returns 数据模型实例
     */
    public getModel<T extends BaseModel>(type: number | (new (...args: any[]) => T)): T {
        if (typeof type === 'number') {
            // 按类型id查找
            return this._modelMap.get(type) as T;
        } else {
            // 按类类型遍历查找
            for (const [, value] of this._modelMap) {
                if (value instanceof type) {
                    return value;
                }
            }
        }
        throw new Error(`数据模型不存在: ${type.name}`);
    }

    /** 获取控制器
     * @typeParam T 控制器类型
     * @param type 类型id或控制器类
     * @returns 控制器实例
     */
    public getCtrl<T extends BaseCtrl>(type: number | (new (...args: any[]) => T)): T {
        if (typeof type === 'number') {
            // 按类型id查找
            return this._ctrlMap.get(type) as T;
        } else {
            // 按类类型遍历查找
            for (const [, value] of this._ctrlMap) {
                if (value instanceof type) {
                    return value;
                }
            }
        }
        throw new Error(`控制器不存在: ${type.name}`);
    }

    /****************  私有方法  ****************/

    /** 触发「视图实例化并挂载后」回调：按节点去重，同一实例无论如何只触发一次 */
    private _notifyInstantiationAfter(node: Node, mvcParams: IMvcParams): void {
        if (!this._onInstantiationAfter || this._instantiatedNodes.has(node)) return;
        this._instantiatedNodes.add(node);
        try {
            this._onInstantiationAfter(node, mvcParams);
        } catch (error) {
            console.error(`[MvcMgr] onInstantiationAfter 回调执行失败: ${mvcParams.prefabName}`, error);
        }
    }

    /** 取映射表中的首个视图实例，兼容单实例与多实例数组两种存储形式
     * @param entry 视图映射表条目
     * @returns 首个视图实例，无实例时返回null
     */
    private _getFirstView(entry: ViewType | ViewType[] | undefined): ViewType | null {
        if (!entry) return null;
        return Array.isArray(entry) ? (entry[0] ?? null) : entry;
    }

    /** 将视图实例写入映射表：允许多实例时保存为数组，否则覆盖单实例
     * @param tid 视图类型id
     * @param view 视图实例
     * @param mvcParams MVC参数
     */
    private _storeView(tid: number, view: ViewType, mvcParams: IMvcParams): void {
        const allowMulti = !mvcParams.attribute?.bIsOnly && !mvcParams.attribute?.bResident;
        if (!allowMulti) {
            this._viewMap.set(tid, view);
            return;
        }
        const entry = this._viewMap.get(tid);
        if (!entry) {
            this._viewMap.set(tid, [view]);
        } else if (Array.isArray(entry)) {
            entry.push(view);
        } else {
            // 将原有单实例转为数组
            this._viewMap.set(tid, [entry, view]);
        }
    }

    /** 创建视图节点，加载预制体并实例化
     * @param mvcParams MVC参数
     * @param viewParams 视图参数
     * @returns 视图组件或null
     */
    private async _createViewNode(mvcParams: IMvcParams, viewParams?: IViewParams): Promise<ViewType | null> {

        // 通过加载函数获取Prefab资源
        const prefab = await this._params.viewPrefabFunc(mvcParams.prefabName, mvcParams.packName);

        if (!prefab) {
            console.error(`预制体不存在: ${mvcParams.prefabName}, tid:${mvcParams.tid}, 请检查预制体是否正确`);
            return null;
        }

        // 实例化预制体，挂载前完成屏幕适配，确保 onEnable 时节点尺寸已正确
        const newNode = instantiate(prefab);
        if (mvcParams.attribute?.bIsdaptation) {
            this._adaptation(newNode);
        }
        newNode.setParent(this._params.root);

        // 视图已实例化并挂载：触发框架外注入的回调（每个节点仅一次），
        // 供外部为节点树内的按钮统一绑定事件。置于 _initViewNode 之前，
        // 此时尚无动态子按钮，避免后续动态创建的格子按钮被重复绑定。
        this._notifyInstantiationAfter(newNode, mvcParams);

        // 初始化View组件
        const view = this._initViewNode(newNode, mvcParams, viewParams);
        if (!view) {
            console.error(`视图组件不存在tid:${mvcParams.tid}, 请检查预制体是否正确`);
            newNode.destroy();
            return null;
        }

        return view;
    }

    /** 初始化视图组件并绑定控制器、数据模型和参数
     * @param newNode 新节点
     * @param mvcParams MVC参数
     * @param viewParams 视图参数
     * @returns 视图组件或null
     */
    private _initViewNode(newNode: Node, mvcParams: IMvcParams, viewParams?: IViewParams): ViewType | null {
        // 从节点上获取视图组件
        const view = newNode.getComponent(mvcParams.ViewType);

        // 如果没有获取到视图组件，报错并返回
        if (!view) {
            console.error(`视图组件不存在tid:${mvcParams.tid}, 请检查预制体是否正确`);
            return null;
        }

        const tid = mvcParams.tid;

        // 获取已注册的控制器和数据模型
        const ctrl = this._ctrlMap.get(tid);
        const model = this._modelMap.get(tid);
        if (!ctrl || !model) {
            console.error(`控制器或数据模型不存在tid:${mvcParams.tid}, 请检查控制器或数据模型是否正确`);
            return null;
        }

        // 初始化视图，注入tid、iid、控制器、数据模型和参数
        view.onInit(tid, this._getIid(), ctrl, model, viewParams || {});

        // 依次触发视图打开和显示回调
        view.onOpen();
        view.onShow();

        return view;
    }

    /** 创建视图句柄，封装tid、iid和close方法
     * @param tid 类型id
     * @param view 视图实例
     * @returns 视图实例句柄
     */
    private _createViewHandle(tid: number, view: ViewType): IViewHandle {
        const iid = view.getIid();
        return {
            tid,
            iid,
            close: (destroy?: boolean) => {
                this.close(tid, iid, destroy);
            },
        };
    }

    /** 窗口大小改变回调，对需要适配的视图重新适配 */
    private _onWindowResize() {
        for (const [tid, entry] of this._viewMap) {
            const param = this._paramsMap.get(tid);
            // 跳过不需要适配的视图
            if (!param || !param.attribute?.bIsdaptation) continue;

            if (Array.isArray(entry)) {
                // 多实例遍历适配
                for (const v of entry) {
                    if (!v || !v.node) continue;
                    if (!isValid(v.node)) continue;
                    this._adaptation(v.node);
                }
            } else {
                // 单实例适配
                const v = entry as ViewType;
                if (!v || !v.node) continue;
                if (!isValid(v.node)) continue;
                this._adaptation(v.node);
            }
        }
    }

    /** 根据可见区域适配节点大小
     * @param node 需要适配的节点
     */
    private _adaptation(node: Node) {
        const uit = node.getComponent(UITransform);
        if (!uit) {
            return;
        }
        // 获取当前可见区域大小并设置节点尺寸
        const visibleSize = view.getVisibleSize();
        uit.setContentSize(visibleSize.width, visibleSize.height);
    }

    /** 获取自增的实例id
     * @returns 新的实例id
     */
    private _getIid(): number {
        return this._iid++;
    }
}

// GCore 全局 MVC 管理器单例（定义于此，避免与 index.ts 桶文件形成循环依赖）
export const gcoreMvc = new MvcMgr();
