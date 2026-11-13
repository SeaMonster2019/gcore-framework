import { _decorator, CCInteger, Component, Node } from "cc";
import { EDITOR } from "cc/env";

const { ccclass, property, menu, executeInEditMode } = _decorator;

/** 单个状态的节点分组，承载第二维节点数组（Cocos 属性检查器不支持 Node[][]） */
@ccclass("StatusNodeGroup")
export class StatusNodeGroup {

    /** 该状态下需要同时显示的节点 */
    @property({ type: [Node], displayName: "节点列表", tooltip: "该状态下同时 active 的节点" })
    public nodes: Node[] = [];

}

/** 节点分组状态组件：每个状态可绑定多个节点，切换时整组同时显示 */
@ccclass("StatusNodeList")
@menu("GCore/Status/StatusNodeList")
@executeInEditMode
export class StatusNodeList extends Component {

    /** 状态分组列表，数组下标即状态值 */
    @property({ type: [StatusNodeGroup], displayName: "状态分组", tooltip: "下标即状态值，每组可绑定多个同时 active 的节点" })
    public statusNodeGroups: StatusNodeGroup[] = [];

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
        if (EDITOR && this.statusNodeGroups.length > 0) {
            this._applyStatus(value);
        }
    }

    /****************  生命周期  ****************/

    /** 加载时应用初始化默认状态，编辑器下仅做预览 */
    public onLoad(): void {
        if (this.statusNodeGroups.length === 0) {
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

    /** 设置当前状态，仅显示对应分组内的全部节点
     * @param status 状态值（分组下标，从 0 开始）
     */
    public setStatus(status: number): void {
        // 不允许越界时保持当前显隐与状态值，直接抛出错误
        if (!this._isValidStatus(status) && !this.allowOutOfRange) {
            throw new Error(`[StatusNodeList] 状态 ${status} 超出范围 [0, ${this.statusNodeGroups.length - 1}]`);
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
        return Number.isInteger(status) && status >= 0 && status < this.statusNodeGroups.length;
    }

    /** 按状态值刷新全部分组节点显隐，越界时隐藏所有节点
     * @param status 状态值
     */
    private _applyStatus(status: number): void {
        // 先收集目标分组的节点，越界时目标集合为空，等价于所有节点隐藏
        const activeNodes = new Set<Node>();
        const targetGroup = this._isValidStatus(status) ? this.statusNodeGroups[status] : null;
        for (const node of targetGroup?.nodes ?? []) {
            if (node && node.isValid) {
                activeNodes.add(node);
            }
        }

        // 统一刷新所有分组，避免同一节点被多个分组引用时显隐互相覆盖
        for (const group of this.statusNodeGroups) {
            for (const node of group?.nodes ?? []) {
                if (node && node.isValid) {
                    node.active = activeNodes.has(node);
                }
            }
        }
    }

}
