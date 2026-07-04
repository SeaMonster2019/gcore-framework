import { Canvas, Node, Prefab } from "cc";
import { ConfigMgr } from "@gcore/res";
import { FsmMgr } from "@gcore/utils";
import { I18nMgr } from "@gcore/ui";
import { MvcMgr } from "@gcore/mvc";
import { ResLoadMgr } from "@gcore/res";
import { StorageMgr } from "@gcore/storage";
import { WindowMgr } from "@gcore/ui";

/** GCore初始化参数 */
export interface IGCoreInitParams {
    /** UI根节点 */
    uiRoot: Node;
    /** 主画布 */
    mainCanvas: Canvas;
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
    /** 配置管理器 */
    private _configMgr: ConfigMgr = new ConfigMgr();
    /** 多语言管理器 */
    private _i18nMgr: I18nMgr = new I18nMgr();
    /** 持久化管理器 */
    private _storageMgr: StorageMgr = new StorageMgr();

    /** MVC管理器 */
    public get mvc(): MvcMgr {
        return this._mvcMgr;
    }
    /** 资源加载管理器 */
    public get res(): ResLoadMgr {
        return this._resMgr;
    }
    /** 游戏状态管理器 */
    public get gfs(): FsmMgr {
        return this._gfsmMgr;
    }
    /** 窗口管理器 */
    public get window(): WindowMgr {
        return this._windowMgr;
    }
    /** 配置系统 */
    public get config(): ConfigMgr {
        return this._configMgr;
    }
    /** 多语言管理器 */
    public get i18n(): I18nMgr {
        return this._i18nMgr;
    }
    /** 持久化管理器 */
    public get storage(): StorageMgr {
        return this._storageMgr;
    }

    /** 初始化 */
    public init(initParams: IGCoreInitParams): void {
        //初始化MVC管理器
        this._mvcMgr.init({
            root: initParams.uiRoot,
            viewPrefabFunc: (prefab: string, pack: string) => {
                return this._resMgr.loadRes<Prefab>(prefab, pack);
            },
            viewPrefabReleaseFunc: (prefab: string, pack: string) => {
                this._resMgr.releaseRes(prefab, pack);
            }
        });
        //初始化资源管理器
        this._resMgr.init();
        //初始化窗口管理器
        this._windowMgr.init();
        //初始化存档管理器
        this._configMgr.init();
        //初始化多语言管理器
        this._i18nMgr.init();
        //初始化持久化管理器
        this._storageMgr.init();
    }
}

/** GCore全局实例 */
export const gcore = new GCore();
