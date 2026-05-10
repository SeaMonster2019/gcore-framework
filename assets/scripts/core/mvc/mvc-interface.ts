import { BaseCtrl } from "./base-ctrl";
import { BaseModel } from "./base-model";
import { BaseView, IViewParams } from "./base-view";

/** 视图类型别名，表示通用的BaseView实例 */
export type ViewType = BaseView<IViewParams>;

/** MVC视图ID到打开参数的映射，可在业务工程中通过模块扩展补充具体视图参数类型 */
export interface IViewParamMap {
    [tid: number]: IViewParams;
}

/** MVC视图ID，从IViewParamMap中提取有效的数字键 */
export type ViewId = keyof IViewParamMap & number;

/** 根据视图参数是否存在必填字段，决定open时参数是否必填
 * @typeParam P 视图参数类型
 */
export type ViewOpenArgs<P extends IViewParams> = {} extends P ? [param?: P] : [param: P];

/** 视图打开后返回的轻量句柄，避免调用方直接依赖具体View实现 */
export interface IViewHandle {
    /** 类型id */
    readonly tid: number;
    /** 实例id */
    readonly iid: number;
    /** 关闭当前视图实例
     * @param destroy 是否销毁节点
     */
    close(destroy?: boolean): void;
}

/** MVC注册参数，定义一个完整的MVC模块配置 */
export interface IMvcParams {
    /** 类型id，唯一标识一个MVC模块 */
    tid: number;
    /** 预制体路径名 */
    prefabName: string;
    /** 预制体所属资源包名 */
    packName: string;
    /** 层级，用于控制视图的渲染层级 */
    layer: number;
    /** 控制器构造函数 */
    CtrlType: new (...args: any[]) => BaseCtrl;
    /** 数据模型构造函数 */
    ModelType: new (...args: any[]) => BaseModel;
    /** 视图构造函数 */
    ViewType: new (...args: any[]) => ViewType;
    /** 视图属性配置 */
    attribute: IViewAttribute;
}

/** 视图属性配置，控制视图的实例策略与适配行为 */
export interface IViewAttribute {
    /** 优先度，同层级下优先度越高越优先渲染 */
    priority?: number;
    /** 是否唯一实例，为true时重复open会复用已有实例 */
    bIsOnly?: boolean;
    /** 是否常驻节点，close时仅隐藏而非销毁（常驻节点必须设置为唯一） */
    bResident?: boolean;
    /** 是否适配屏幕，为true时视图会自动适配可见区域大小 */
    bIsdaptation?: boolean;
}

