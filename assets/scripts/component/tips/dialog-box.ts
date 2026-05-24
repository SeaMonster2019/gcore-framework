import { _decorator, Component, Label } from "cc";
import { glog } from "../../log/glog";
const { property, ccclass, menu } = _decorator;

/** 对话框参数 */
export interface IDialogBoxParams {
    /** 标题 */
    title: string;
    /** 内容 */
    content: string;
    /** 确定回调 */
    onSureCallback?: () => void;
    /** 取消回调 */
    onCancelCallback?: () => void;
    /** 是否显示取消 */
    showCancel?: boolean;
}

/** 对话框 */
@ccclass(`DialogBox`)
@menu("GCore/tips/DialogBox")
export class DialogBox extends Component {

    /** 标题 */
    @property({ type: Label, displayName: "标题", tooltip: "标题" })
    private declare title: Label;
    /** 内容 */
    @property({ type: Label, displayName: "内容", tooltip: "内容" })
    private declare content: Label;

    /** 确定回调 */
    private declare _onSureCallback: () => void;
    /** 取消回调 */
    private declare _onCancelCallback: () => void;

    /** 按下确定 */
    protected onClickSure(): void {
        this._onSureCallback?.();
    }

    /** 按下取消 */
    protected onClickCancel(): void {
        this._onCancelCallback?.();
    }

    /** 设置参数 */
    public setParams(params: IDialogBoxParams): void {

        if (!params) {
            glog.error('DialogBox.setParams()，参数不能为空');
            return;
        }

        this.title.string = params.title;
        this.content.string = params.content;
        this._onSureCallback = params.onSureCallback ?? (() => { });
        this._onCancelCallback = params.onCancelCallback ?? (() => { });
    }

    /** 清空参数 */
    public clearParams(): void {
        this._onSureCallback = () => { };
        this._onCancelCallback = () => { };
        this.title.string = ``;
        this.content.string = ``;
    }

}