import { _decorator, CCInteger, Component, instantiate, Node, Prefab } from "cc";
const { ccclass, property, menu } = _decorator;

/** 预制体池 */
@ccclass("PrefabPool")
@menu("GCore/Prefab/PrefabPool")
export default class PrefabPool extends Component {

    /** 预制体 */
    @property({ type: Prefab, tooltip: "预制体" })
    public prefab: Prefab | undefined;

    /** 父节点 */
    @property({ type: Node, tooltip: "父节点" })
    public parentNode: Node | undefined;

    /** 对象池大小 */
    @property({ type: CCInteger, tooltip: "初始对象池大小" })
    private poolSize: number = 0;

    /** 池 */
    private _pool: Node[] = [];

    /** 加载 */
    protected onLoad(): void {
        // 初始化对象池
        for (let i = 0; i < this.poolSize; i++) {
            const node = this._instantiatePrefab();
            node.active = false; // 初始禁用
            this._pool.push(node);
        }
    }

    /** 获取节点 (从池中取用) */
    public getNode(): Node {

        // 如果池空，实例化一个新节点
        if (this._pool.length === 0) {
            return this._instantiatePrefab();
        }

        const node = this._pool.pop()!;
        node.active = true;
        return node;
    }

    /** 获取多个节点 */
    public getNodes(count: number): Node[] {
        const nodes: Node[] = [];
        for (let i = 0; i < count; i++) {
            nodes.push(this.getNode());
        }
        return nodes;
    }

    /** 归还节点 (回收到池) */
    public putNode(node: Node): void {
        // 禁用节点
        node.active = false;
        // 移出场景
        node.removeFromParent();
        if (this._pool.length >= this.poolSize) {
            // 超出池大小，销毁节点
            node.destroy();
            return;
        }
        this._pool.push(node);
    }

    /** 实例化预制体 */
    private _instantiatePrefab(): Node {
        const node = instantiate(this.prefab!) as unknown as Node;
        node && this.parentNode && (node.parent = this.parentNode);
        return node;
    }

}
