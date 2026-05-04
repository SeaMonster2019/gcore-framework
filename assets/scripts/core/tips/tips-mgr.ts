import { instantiate, Node, Prefab } from "cc";
import { DialogBox, IDialogBoxParams } from "../../component/tips/dialog-box";

/** 对话框组件 */
class DialogBoxComp {

    /** 父节点 */
    private declare _parentNode: Node;
    /** 对话框节点 */
    private declare _dialogBox: DialogBox;
    /** 对话框预制体 */
    private declare _dialogBoxPrefab: Prefab;

    /** 构造函数 */
    constructor(parent: Node, prefab: Prefab) {
        this._parentNode = parent;
        this._dialogBoxPrefab = prefab;
    }

    /** 显示对话框
     * @param title 标题
     * @param content 内容
     * @param onSureCallback 确定回调
     * @param onCancelCallback 取消回调
     */
    public showDialogBox(params: IDialogBoxParams): void {
        if (!this._checkValidity(params)) {
            return;
        }
        this._initDialogBox();

        const oldOnSureCallback = params.onSureCallback;
        const oldOnCancelCallback = params.onCancelCallback;
        params.onSureCallback = () => {
            oldOnSureCallback?.();
            this.hideDialogBox();
        };
        params.onCancelCallback = () => {
            oldOnCancelCallback?.();
            this.hideDialogBox();
        };

        this._dialogBox?.setParams(params);
        if (this._dialogBox) {
            this._dialogBox.node.active = true;
        }
    }

    /** 异步显示对话框 */
    public async showDialogBoxAsync(params: IDialogBoxParams): Promise<boolean> {
        if (!params) return false;
        return new Promise<boolean>((resolve) => {
            const oldOnSureCallback = params.onSureCallback;
            const oldOnCancelCallback = params.onCancelCallback;
            params.onSureCallback = () => {
                oldOnSureCallback?.();
                resolve(true);
            };
            params.onCancelCallback = () => {
                oldOnCancelCallback?.();
                resolve(false);
            };
            this.showDialogBox(params);
        });
    }

    /** 检查合法化 */
    private _checkValidity(params: IDialogBoxParams): boolean {

        if (!params) {
            console.error("DialogBoxParams不能为空");
            return false;
        }

        if (!this._getIsAvailable()) {
            console.error("DialogBoxComp不可用");
            return false;
        }

        return true;
    }

    /** 初始化对话框 */
    private _initDialogBox(): void {
        if (!this._dialogBox) {
            const p = instantiate(this._dialogBoxPrefab!)?.getComponent(DialogBox);
            if (!p) {
                console.error("对话框预制体缺少DialogBox组件");
                return;
            }
            this._dialogBox = p;
            this._dialogBox.node.parent = this._parentNode;
            this._dialogBox.node.setPosition(0, 0, 0);
        }
    }

    /** 是否可用 */
    private _getIsAvailable(): boolean {
        return !!this._parentNode && !!this._dialogBoxPrefab;
    }

    /** 隐藏对话框 */
    public hideDialogBox(): void {
        if (!this._dialogBox) { return; }
        this._dialogBox.node.active = false;
    }

}

/** 提示管理器 */
export class TipsMgr {

    /** 对话框组件 */
    private declare _dialogBoxComp: DialogBoxComp;

    /** 初始化 */
    public init(dialogBoxParent: Node, dialogBoxPrefab: Prefab): void {
        this._dialogBoxComp = new DialogBoxComp(dialogBoxParent, dialogBoxPrefab);
    }

    /** 对话框 */
    public get dialogBox(): DialogBoxComp {
        return this._dialogBoxComp;
    }

}