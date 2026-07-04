import { Component, EventTouch, Node, UITransform, Vec3, _decorator, math } from "cc";
const { property, ccclass, menu } = _decorator;

/** 拖拽移动节点，并按判断节点边界限制移动范围。支持两种模式：移动节点 < 判断节点时被限制在内部；移动节点 > 判断节点时完全覆盖不露白 */
@ccclass('SlidingNode')
@menu('GCore/Operation/SlidingNode')
export class SlidingNode extends Component {

    /** 被拖拽移动的节点 */
    @property({ type: Node, displayName: '移动节点' })
    public moveNode: Node = null!;
    /** 用于判断边界约束的参考节点 */
    @property({ type: Node, displayName: '边界判断节点' })
    public judgeNode: Node = null!;
    /** 滑动时的移动比例系数 */
    @property({ displayName: '滑动比例' })
    public slideRatio: number = 1;

    /** 临时位置向量，用于计算和设置节点位置 */
    private _tempPos: Vec3 = new Vec3();
    /** 移动回调 */
    private _moveCallback?: (moveNode: Node, judgeNode: Node) => void;

    /** 设置移动回调
     * @param callback 移动回调
     */
    public setMoveCallback(callback?: (moveNode: Node, judgeNode: Node) => void): void {
        this._moveCallback = callback;
    }

    /****************  生命周期回调  ****************/

    /** 在组件启用时注册触摸移动事件 */
    protected onEnable(): void {
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
    }

    /** 在组件禁用时注销触摸移动事件 */
    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
    }

    /****************  触摸事件处理  ****************/

    /** 处理触摸移动事件，计算并应用边界约束
     * @param event 触摸事件对象
     */
    private _onTouchMove(event: EventTouch): void {
        if (!this.moveNode || !this.judgeNode) return;

        const delta = event.getDelta();
        const moveUITrans = this.moveNode.getComponent(UITransform)!;
        const judgeUITrans = this.judgeNode.getComponent(UITransform)!;

        // 1. 获取 moveNode 当前的本地位置
        this._tempPos.set(this.moveNode.position);

        // 2. 计算目标位置（未限制前）
        const targetX = this._tempPos.x + delta.x * this.slideRatio;
        const targetY = this._tempPos.y + delta.y * this.slideRatio;

        // 3. 将 judgeNode 的世界坐标边界转换到 moveNode 的父节点本地空间，适配缩放、旋转或不同层级
        const parentNode = this.moveNode.parent!;
        const judgeBounds = judgeUITrans.getBoundingBoxToWorld();
        
        // 计算 judgeNode 在父节点坐标系下的四极
        const worldMin = new Vec3(judgeBounds.xMin, judgeBounds.yMin, 0);
        const worldMax = new Vec3(judgeBounds.xMax, judgeBounds.yMax, 0);
        const localMin = parentNode.getComponent(UITransform)!.convertToNodeSpaceAR(worldMin);
        const localMax = parentNode.getComponent(UITransform)!.convertToNodeSpaceAR(worldMax);

        // 4. 计算 moveNode 自身的尺寸影响（考虑锚点）
        const halfW = moveUITrans.width * moveUITrans.anchorX;
        const restW = moveUITrans.width * (1 - moveUITrans.anchorX);
        const halfH = moveUITrans.height * moveUITrans.anchorY;
        const restH = moveUITrans.height * (1 - moveUITrans.anchorY);

        // 5. 应用边界约束逻辑
        this._tempPos.x = this._calculateClamp(targetX, moveUITrans.width, localMin.x, localMax.x, halfW, restW);
        this._tempPos.y = this._calculateClamp(targetY, moveUITrans.height, localMin.y, localMax.y, halfH, restH);

        this.moveNode.setPosition(this._tempPos);
        this._moveCallback?.(this.moveNode, this.judgeNode);
    }

    /****************  辅助计算方法  ****************/

    /** 计算并限制坐标值在指定边界内
     * @param target 目标坐标值
     * @param mSize 移动节点尺寸
     * @param jMin 判断节点最小边界
     * @param jMax 判断节点最大边界
     * @param anchorOffsetMin 锚点到左下方向的距离
     * @param anchorOffsetMax 锚点到右上方向的距离
     * @returns 限制后的坐标值
     */
    private _calculateClamp(target: number, mSize: number, jMin: number, jMax: number, anchorOffsetMin: number, anchorOffsetMax: number): number {
        const jSize = jMax - jMin;
        let min: number, max: number;

        // 根据移动节点和判断节点的大小关系选择约束模式
        if (mSize <= jSize) {
            // 模式 A: 小图在内。移动节点的边缘不能超过判断节点的边缘
            min = jMin + anchorOffsetMin;
            max = jMax - anchorOffsetMax;
        } else {
            // 模式 B: 大图覆盖。移动节点的边缘必须在判断节点边缘之外
            min = jMax - anchorOffsetMax;
            max = jMin + anchorOffsetMin;
        }

        // 应用约束，min > max 时会自动处理平滑衔接
        return math.clamp(target, Math.min(min, max), Math.max(min, max));
    }
}