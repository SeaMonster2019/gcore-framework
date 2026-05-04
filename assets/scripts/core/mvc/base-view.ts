import { UiComp } from "../../component/base/yu-comp";
import { BaseCtrl } from "./base-ctrl";
import { BaseModel } from "./base-model";

/** 视图参数 */
export interface IViewParams {
    /** 关闭回调 */
    onClose?: () => void;
}

/** 视图基类，MVC架构中的视图层基类 */
export class BaseView<P extends IViewParams> extends UiComp {

    /** 类型id */
    protected declare _tid: number;
    /** 实例id */
    protected declare _iid: number;
    /** 控制器 */
    protected declare _ctrl: BaseCtrl;
    /** 数据模型 */
    protected declare _model: BaseModel;
    /** 视图参数 */
    protected declare _params: P;

    /** 关闭回调 */
    public declare close: () => void;

    /********************************************
    /** 生命周期 **/
    /********************************************/

    /** 初始化视图
     * @param tid 类型id
     * @param iid 实例id
     * @param baseCtrl 控制器
     * @param baseData 数据模型
     * @param viewParams 视图参数
     */
    public onInit(tid: number, iid: number, baseCtrl: BaseCtrl, baseData: BaseModel, viewParams: P) {
        this._ctrl = baseCtrl;
        this._model = baseData;
        this._tid = tid;
        this._iid = iid;
        this._params = viewParams;
    }

    /** 打开视图回调 */
    public onOpen(): void { }

    /** 刷新视图回调 */
    public onRefresh(): void { }

    /********************************************
    /** 公共方法 **/
    /********************************************/

    /** 获取类型id */
    public getTid(): number {
        return this._tid;
    }

    /** 获取实例id */
    public getIid(): number {
        return this._iid;
    }

    /********************************************
    /** 保护方法 **/
    /********************************************/

    /** 关闭按钮点击事件 */
    protected onBtnClose(): void {
        this.close?.();
    }

}
