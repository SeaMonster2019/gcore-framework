import { Canvas, Node, Prefab } from "cc";
import { MvcMgr } from "./core/mvc/mvc-mgr";
import { FsmMgr as FsmMgr } from "./core/fsm/fsm-mgr";
import { WindowMgr } from "./core/window/window-mgr";
import { ResLoadMgr } from "./core/res-load/res-load-mgr";
import { TipsMgr } from "./core/tips/tips-mgr";
import { ConfigMgr } from "./core/config/config-mgr";
import { I18nMgr } from "./core/i18n/i18n-mgr";

/** GCore初始化参数 */
export interface IGCoreInitParams {
    /** UI根节点 */
    uiRoot: Node;
    /** 主画布 */
    mainCanvas: Canvas;
    /** 对话框父节点 */
    dialogBoxParent: Node;
    /** 对话框预制体 */
    dialogBoxPrefab: Prefab;
}

/** GCore核心 */
class GCore {

    /** MVC管理器 */
    private _mvcMgr: MvcMgr = new MvcMgr();
    /** 资源管理器 */
    private _resMgr: ResLoadMgr = new ResLoadMgr();
    /** 游戏状态管理器 */
    private _gfsmMgr: FsmMgr = new FsmMgr();
    /** 窗口管理器 */
    private _windowMgr: WindowMgr = new WindowMgr();
    /** 提示管理器 */
    private _tipsMgr: TipsMgr = new TipsMgr();
    /** 配置管理器 */
    private _configMgr: ConfigMgr = new ConfigMgr();
    /** 多语言管理器 */
    private _i18nMgr: I18nMgr = new I18nMgr();

    /** MVC管理器 */
    public get mvcMgr(): MvcMgr {
        return this._mvcMgr;
    }
    /** 资源加载管理器 */
    public get resMgr(): ResLoadMgr {
        return this._resMgr;
    }
    /** 游戏状态管理器 */
    public get gfsmMgr(): FsmMgr {
        return this._gfsmMgr;
    }
    /** 窗口管理器 */
    public get windowMgr(): WindowMgr {
        return this._windowMgr;
    }
    /** 提示管理器 */
    public get tipsMgr(): TipsMgr {
        return this._tipsMgr;
    }
    /** 配置系统 */
    public get configMgr(): ConfigMgr {
        return this._configMgr;
    }
    /** 多语言管理器 */
    public get i18nMgr(): I18nMgr {
        return this._i18nMgr;
    }

    /** 初始化 */
    public init(initParams: IGCoreInitParams): void {
        //初始化MVC管理器
        this._mvcMgr.init({
            root: initParams.uiRoot,
            viewPrefabFunc: (prefab: string, pack: string) => {
                return this._resMgr.loadRes<Prefab>(prefab, pack);
            }
        });
        //初始化资源管理器
        this._resMgr.init();
        //初始化窗口管理器
        this._windowMgr.init();
        //初始化提示管理器
        this._tipsMgr.init(initParams.dialogBoxParent, initParams.dialogBoxPrefab);
        //初始化存档管理器
        this._configMgr.init();
        //初始化多语言管理器
        this._i18nMgr.init();
    }
}

/** GCore全局实例 */
export const gcore = new GCore();
