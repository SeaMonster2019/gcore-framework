import { _decorator, Canvas, Component, EventHandler, isValid, Node, Prefab } from "cc";
import { EventTarget } from "./event/index";
import { gcoreMvc } from "./mvc/index";
import { gcoreRes, gcoreConfig } from "./res/index";
import { gcoreStorage } from "./storage/index";
import { gcoreI18n } from "./i18n/index";

const { property, ccclass, menu } = _decorator;

/** GCore初始化组件 */
@ccclass("GCoreInit")
@menu("GCore/GCoreInit")
export class GCoreInit extends Component {

    /** 根节点 */
    @property({ type: Node, displayName: `根节点`, tooltip: `用于挂载所有UI界面的根节点，作为UI层级的父节点` })
    private declare root: Node;
    /** 主画布 */
    @property({ type: Canvas, displayName: `主画布`, tooltip: `主UI画布组件，用于自适应屏幕大小` })
    private declare mainCanvas: Canvas;
    /** 游戏开始函数 */
    @property({ type: EventHandler, displayName: '游戏开始函数', tooltip: '游戏开始函数，用于在游戏开始时调用，不用生命周期函数是为了防止初始化顺序错误' })
    private gameHandler: EventHandler = new EventHandler();

    /** 加载 */
    protected onLoad(): void {
        this._init();
    }

    /** 初始化 */
    private _init(): void {
        // 静态注入事件系统的失效校验函数，彻底解除事件系统模块对 cc 的物理导入依赖
        EventTarget.isValidChecker = isValid;

        // 按顺序自主初始化各模块单例
        gcoreStorage.init();
        gcoreRes.init();
        gcoreConfig.init();
        gcoreI18n.init();
        gcoreMvc.init({
            root: this.root,
            viewPrefabFunc: (prefab: string, pack: string) => {
                return gcoreRes.loadRes<Prefab>(prefab, pack);
            },
            viewPrefabReleaseFunc: (prefab: string, pack: string) => {
                gcoreRes.releaseRes(prefab, pack);
            }
        });

        EventHandler.emitEvents([this.gameHandler], null);
    }

}
