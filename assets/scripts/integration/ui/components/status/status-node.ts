import { _decorator, CCInteger, Component, Node } from "cc";
import { EDITOR } from "cc/env";

const { ccclass, property, menu, executeInEditMode } = _decorator;

/** 节点状态组件：通过属性绑定多个节点，通过 setStatus 切换节点显隐 */
@ccclass("StatusNode")
@menu("GCore/Status/StatusNode")
@executeInEditMode
export class StatusNode extends Component {

    /** 状态节点列表，数组下标即状态值 */
    @property({ type: [Node], displayName: "状态节点", tooltip: "下标即状态值，setStatus 时仅显示对应节点" })
    public statusNodes: Node[] = [];

    /** 是否允许越界状态，false 时越界抛错且不切换 */
    @property({ displayName: "允许越界", tooltip: "true 时越界状态隐藏所有节点；false 时越界抛错并保持当前状态" })
    public allowOutOfRange: boolean = false;

    /** 初始化默认状态值，编辑器中修改可即时预览 */
    private _defaultStatus: number = 0;

    /** 当前状态值，-1 表示尚未设置 */
    private _status: number = -1;

    /****************  属性访问器  ****************/

    /** 初始化默认状态值，编辑器中修改可即时预览对应状态 */
    @property({ type: CCInteger, displayName: "默认状态", tooltip: "初始化时应用的状态值；编辑器中修改该值可即时预览对应状态" })
    public get defaultStatus(): number {
        return this._defaultStatus;
    }
    public set defaultStatus(value: number) {
        this._defaultStatus = value;
        // 编辑器属性面板改值时即时刷新显示，未绑定状态数据时不做预览
        if (EDITOR && this.statusNodes.length > 0) {
            this._applyStatus(value);
        }
    }

    /****************  生命周期  ****************/

    /** 加载时应用初始化默认状态，编辑器下仅做预览 */
    public onLoad(): void {
        if (this.statusNodes.length === 0) {
            return;
        }
        // 编辑器下只刷新显示，不抛越界错误也不改运行时内部状态
        if (EDITOR) {
            this._applyStatus(this.defaultStatus);
        } else {
            this.setStatus(this.defaultStatus);
        }
    }

    /****************  公共方法  ****************/

    /** 设置当前状态，仅显示对应下标的节点
     * @param status 状态值（数组下标，从 0 开始）
     */
    public setStatus(status: number): void {
        // 不允许越界时保持当前显隐与状态值，直接抛出错误
        if (!this._isValidStatus(status) && !this.allowOutOfRange) {
            throw new Error(`[StatusNode] 状态 ${status} 超出范围 [0, ${this.statusNodes.length - 1}]`);
        }
        this._applyStatus(status);
        this._status = status;
    }

    /** 获取当前状态值
     * @returns 当前状态值，尚未设置时返回 -1
     */
    public getStatus(): number {
        return this._status;
    }

    /****************  私有方法  ****************/

    /** 判断状态值是否可用
     * @param status 状态值
     * @returns 是否为有效状态
     */
    private _isValidStatus(status: number): boolean {
        return Number.isInteger(status) && status >= 0 && status < this.statusNodes.length;
    }

    /** 按状态值刷新节点显隐，越界时隐藏所有节点
     * @param status 状态值
     */
    private _applyStatus(status: number): void {
        // 越界时目标集合为空，等价于隐藏所有节点
        const activeNodes = new Set<Node>();
        if (this._isValidStatus(status)) {
            const target = this.statusNodes[status];
            if (target && target.isValid) {
                activeNodes.add(target);
            }
        }

        for (const node of this.statusNodes) {
            // 跳过编辑器未绑定或已销毁的节点，重复引用按同一目标处理
            if (node && node.isValid) {
                node.active = activeNodes.has(node);
            }
        }
    }

}
