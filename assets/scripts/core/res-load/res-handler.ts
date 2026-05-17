import { Asset } from "cc";

/** 资源加载句柄，负责保存资源实例并提供配对释放入口 */
export class ResHandler<T extends Asset> {
    /** 资源实例 */
    public asset: T | undefined;

    /** 是否已经释放，避免重复释放导致引用计数异常 */
    private _released = false;

    /** 管理器提供的释放回调 */
    private readonly _releaseFunc: () => void;

    public constructor(asset: T, releaseFunc: () => void) {
        this.asset = asset;
        this._releaseFunc = releaseFunc;
    }

    /** 释放本句柄持有的资源引用 */
    public release(): void {
        if (this._released) {
            return;
        }

        this._released = true;
        this._releaseFunc();
        this.asset = undefined;
    }
}
