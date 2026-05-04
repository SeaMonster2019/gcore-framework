import { Asset, AssetManager, error, Sprite, SpriteAtlas, SpriteFrame } from "cc";
import { gcoreEvent, GCoreEvent } from "../../event/gcore-event";

type Bundle = AssetManager.Bundle;

/** 资源加载管理器 */
export class ResLoadMgr {

    /** 已加载资源包列表 */
    private _loadedPackList: Map<string, Bundle> = new Map();

    /** 初始化 */
    public init() { }

    /** 加载资源包
     * @param packName 资源包类型id
     * @returns 资源包
     */
    public async loadBundle(packName: string): Promise<Bundle> {

        if (this._loadedPackList.has(packName)) {
            gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.BUNDLE_LOAD_COMPLETE, packName);
            const bundle = this._loadedPackList.get(packName);
            if (!bundle) {
                throw new Error(`资源包不存在 包名:${packName}`);
            }

            return bundle;
        }

        return new Promise((resolve, reject) => {
            AssetManager.instance.loadBundle(packName, (err, bundle) => {
                if (err) {
                    reject(err);
                }
                this._loadedPackList.set(packName, bundle);
                gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.BUNDLE_LOAD_COMPLETE, packName);
                resolve(bundle);
            });
        });

    }

    /** 加载资源
     * @param resPath 资源路径
     * @param packName 资源包名
     * @returns 资源
     */
    public async loadRes<T extends Asset>(resPath: string, packName: string): Promise<T> {

        const bundle = this._loadedPackList.get(packName);
        if (!bundle) {
            throw new Error(`资源包不存在 包名:${packName}`);
        }

        return new Promise((resolve, reject) => {
            bundle.load(resPath, (err, asset) => {
                if (err) {
                    console.error(`资源不存在 包名:${packName} 路径:${resPath} 错误:${err ? err.message : "未知错误"}`);
                    reject(err);
                }
                gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.RES_LOAD_COMPLETE, resPath, packName);
                resolve(asset as T);
            });
        });
    }

    /** 异步设置精灵帧
     * @param resPath 资源路径
     * @param packName 资源包名
     * @param sprite 精灵
     */
    public async setSprite(resPath: string, packName: string, sprite: Sprite): Promise<boolean> {

        if (!sprite.isValid) {
            console.error(`精灵已失效`);
            return false;
        }

        const bundle = this._loadedPackList.get(packName);
        if (!bundle) {
            console.error(`资源包不存在 包名:${packName}`);
            return false;
        }

        return new Promise<boolean>((resolve, reject) => {
            bundle.load(resPath, (err, asset: SpriteFrame) => {
                if (err) {
                    console.error(`资源不存在 包名:${packName} 路径:${resPath} 错误:${err.message}`);
                    reject(err);
                    return;
                }

                if (!(asset instanceof SpriteFrame)) {
                    reject(new Error(`资源类型错误 包名:${packName} 路径:${resPath}`));
                    return;
                }

                if (!sprite.isValid) {
                    console.warn(`精灵已失效`);
                    reject();
                    return;
                }

                sprite.spriteFrame = asset;
                resolve(true);
            });
        });

    }

    /** 异步设置精灵帧
     * @param resPath 资源路径
     * @param spriteFrameName 精灵帧名称
     * @param packName 资源包名
     * @param sprite 精灵
     * @returns 是否成功
     */
    public async setSpriteFormAtlas(resPath: string, spriteFrameName: string, packName: string, sprite: Sprite): Promise<boolean> {

        const bundle = this._loadedPackList.get(packName);
        if (!bundle) {
            throw new Error(`资源包不存在 包名:${packName}`);
        }

        return new Promise<boolean>((resolve, reject) => {

            bundle.load(resPath, (err, asset: SpriteAtlas) => {

                if (err) {
                    console.error(`资源不存在 包名:${packName} 路径:${resPath} 错误:${error}`);
                    reject(err);
                    return;
                }

                if (!(asset instanceof SpriteAtlas)) {
                    reject(new Error(`资源类型错误 包名:${packName} 路径:${resPath}`));
                    return;
                }

                if (!sprite.isValid) {
                    console.warn(`精灵已失效`);
                    reject();
                    return;
                }

                const sf = asset.getSpriteFrame(spriteFrameName);
                if (!sf) {
                    reject(new Error(`精灵帧不存在 包名:${packName} 路径:${resPath} 名称:${spriteFrameName}`));
                }

                sprite.spriteFrame = sf;
                resolve(true);

            });

        });

    }

}