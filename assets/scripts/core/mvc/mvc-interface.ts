import { BaseCtrl } from "./base-ctrl";
import { BaseModel } from "./base-model";
import { BaseView, IViewParams } from "./base-view";

/** 视图类型别名 */
export type ViewType = BaseView<IViewParams>;

/** MVC参数 */
export interface IMvcParams {
    /** 类型id */
    tid: number;
    /** 预制体名字 */
    prefabName: string;
    /** 预制体包名 */
    packName: string;
    /** 层级 */
    layer: number;
    /** 控制器 */
    CtrlType: new (...args: any[]) => BaseCtrl;
    /** 数据 */
    ModelType: new (...args: any[]) => BaseModel;
    /** 视图 */
    ViewType: new (...args: any[]) => ViewType;
    /** 属性 */
    attribute: IViewAttribute;
}

/** MVC属性 */
export interface IViewAttribute {
    /** 优先度-同层级下优先度越高越优先渲染 */
    priority?: number;
    /** 是否唯一 */
    bIsOnly?: boolean;
    /** 是否常驻节点（close时只是隐藏，常驻节点必须是唯一） */
    bResident?: boolean;
    /** 是否适配 */
    bIsdaptation?: boolean;
}

