import { IMvcParams } from "./mvc-interface";

/** 基础模型，MVC架构中的数据层基类 */
export class BaseModel {

    /** 类型id */
    private _tid: number;
    /** 类型id */
    public get tid(): number {
        return this._tid;
    }

    /********************************************
    /** 生命周期 **/
    /********************************************/

    /** 构造函数
     * @param mvcParam MVC参数
     */
    constructor(mvcParam: IMvcParams) {
        this._tid = mvcParam.tid;
    }

    /** 初始化 */
    public onInit() { }

    /** 销毁 */
    public onDestroy() { }

}