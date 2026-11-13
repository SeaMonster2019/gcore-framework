import { _decorator, CCInteger, Component, Sprite, SpriteFrame } from "cc";
import { EDITOR } from "cc/env";

const { ccclass, property, menu, executeInEditMode } = _decorator;

/** 精灵帧状态组件：通过属性绑定多个 SpriteFrame，通过 setStatus 切换目标 Sprite 的显示图片 */
@ccclass("StatusSprite")
@menu("GCore/Status/StatusSprite")
@executeInEditMode
export class StatusSprite extends Component {

    /** 状态精灵帧列表，数组下标即状态值 */
    @property({ type: [SpriteFrame], displayName: "状态图片", tooltip: "下标即状态值，setStatus 时切换到对应图片" })
    public spriteFrames: SpriteFrame[] = [];

    /** 目标 Sprite，未绑定时挂载阶段尝试绑定自身节点的 Sprite */
    @property({ type: Sprite, displayName: "目标Sprite", tooltip: "已手动绑定时不会被改绑" })
    public sprite: Sprite | null = null;

    /** 是否允许越界状态，false 时越界抛错且不切换 */
    @property({ displayName: "允许越界", tooltip: "true 时越界状态不显示任何内容；false 时越界抛错并保持当前状态" })
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
        if (EDITOR && this.spriteFrames.length > 0) {
            this._applyStatus(value);
        }
    }

    /****************  生命周期  ****************/

    /** 加载时绑定目标 Sprite 并应用初始化默认状态 */
    public onLoad(): void {
        this._tryBindSprite();
        if (this.spriteFrames.length === 0) {
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

    /** 设置当前状态，切换到对应下标的精灵帧
     * @param status 状态值（数组下标，从 0 开始）
     */
    public setStatus(status: number): void {
        // 不允许越界时保持当前显示与状态值，直接抛出错误
        if (!this._isValidStatus(status) && !this.allowOutOfRange) {
            throw new Error(`[StatusSprite] 状态 ${status} 超出范围 [0, ${this.spriteFrames.length - 1}] 或对应精灵帧未绑定`);
        }
        if (!this._applyStatus(status)) {
            return;
        }
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
        return Number.isInteger(status)
            && status >= 0
            && status < this.spriteFrames.length
            && !!this.spriteFrames[status];
    }

    /** 按状态值刷新 Sprite 显示，越界时清空帧并关闭渲染
     * @param status 状态值
     * @returns 是否成功应用
     */
    private _applyStatus(status: number): boolean {
        // 动态添加组件后可能尚未走 onLoad，此处做同样的兜底绑定
        this._tryBindSprite();
        if (!this.sprite) {
            console.warn(`[StatusSprite] 未找到目标 Sprite`);
            return false;
        }

        const frame = this._isValidStatus(status) ? this.spriteFrames[status] : null;
        if (frame) {
            // 正常状态恢复渲染并切换到对应精灵帧
            this.sprite.enabled = true;
            this.sprite.spriteFrame = frame;
        } else {
            // 越界时清空精灵帧并关闭渲染，不显示任何东西
            this.sprite.spriteFrame = null;
            this.sprite.enabled = false;
        }
        return true;
    }

    /** 仅在目标 Sprite 未绑定（undefined/null）时尝试绑定自身节点的 Sprite */
    private _tryBindSprite(): void {
        // 已有绑定一律保留，不覆盖编辑器手动指定的目标
        if (this.sprite !== undefined && this.sprite !== null) {
            return;
        }
        this.sprite = this.getComponent(Sprite);
    }

}
