/** 小型对象池 */
export class Pool<T> {
    private pool: T[] = [];
    private maxSize: number;
    private create: () => T;

    constructor(create: () => T, maxSize: number = 32) {
        this.create = create;
        this.maxSize = maxSize;
    }

    /** 获取一个对象，如果池中有则复用，否则新建 */
    public alloc(): T {
        if (this.pool.length > 0) {
            return this.pool.pop() as T;
        }
        return this.create();
    }

    /** 回收一个对象到池中 */
    public free(obj: T): void {
        if (this.pool.length < this.maxSize) {
            this.pool.push(obj);
        }
        // 超出最大容量则丢弃
    }

    /** 清空对象池 */
    public clear(): void {
        this.pool.length = 0;
    }

    /** 当前池中对象数量 */
    public size(): number {
        return this.pool.length;
    }
}