import { _decorator, Canvas, Component, EventHandler, JsonAsset, Node, Prefab } from "cc";
import { gcore, IGCoreInitParams } from "./gcore";
const { property, ccclass, menu } = _decorator;

/** GCore初始化组件 */
@ccclass("GCoreInit")
@menu("GCore/GCoreInit")
export class GCoreInit extends Component {

    /** 根节点 */
    @property({ type: Node, displayName: `根节点`, tooltip: `用于挂载所有UI界面的根节点，作为UI层级的父节点` })
    private declare root: Node;
    /** 对话框节点 */
    @property({ type: Node, displayName: `对话框节点`, tooltip: `用于承载所有弹出对话框的父节点，所有弹窗都会挂在此节点下` })
    private declare dialogBoxNode: Node;
    /** 主画布 */
    @property({ type: Canvas, displayName: `主画布`, tooltip: `主UI画布组件，用于自适应屏幕大小` })
    private declare mainCanvas: Canvas;
    /** 对话框预制体 */
    @property({ type: Prefab, displayName: '对话框预制体', tooltip: '对话框预制体，用于加载对话框' })
    private declare dialogBoxPrefab: Prefab;
    /** 游戏开始函数 */
    @property({ type: EventHandler, displayName: '游戏开始函数', tooltip: '游戏开始函数，用于在游戏开始时调用，不用生命周期函数是为了防止初始化顺序错误' })
    private gameHandler: EventHandler = new EventHandler();

    /** 加载 */
    protected onLoad(): void {
        this._init();
    }

    /** 初始化 */
    private _init(): void {

        const params: IGCoreInitParams = {
            uiRoot: this.root,
            dialogBoxParent: this.dialogBoxNode,
            mainCanvas: this.mainCanvas,
            dialogBoxPrefab: this.dialogBoxPrefab,
        };

        gcore.init(params);
        EventHandler.emitEvents([this.gameHandler], null);

    }

}

