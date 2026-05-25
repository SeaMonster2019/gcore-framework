import { Asset, AssetManager, Sprite, SpriteAtlas, SpriteFrame } from "cc";
import { gcoreEvent, GCoreEvent } from "../../event/gcore-event";

type Bundle = AssetManager.Bundle;

/** Bundle 资源生命周期策略 */
export enum EResBundlePolicy {
    /** 随 Bundle 加载，常驻内存直到调用 releaseBundle 释放 */
    Core,
    /** 业务引用归零后保持在共享 LRU 缓存中 */
    Hot,
    /** 业务引用归零后立即释放 */
    Normal,
}

/** ResLoadMgr 初始化选项 */
export interface ResLoadMgrInitOptions {
    /** 共享热更新资源缓存容量（按资源数量计） */
    hotCacheCapacity?: number;
}

/** Bundle 策略信息 */
interface BundlePolicyInfo {
    policy: EResBundlePolicy;
}

/** 资源引用信息 */
interface ResRefInfo<T extends Asset = Asset> {
    asset: T;
    refs: number;
    packName: string;
    resPath: string;
    policy: EResBundlePolicy;
    /** 是否已被缓存（Core 模式常驻或 Hot 模式在 LRU 中） */
    cached: boolean;
    /** 是否由 ResLoadMgr 的引用计数机制管理 asset.addRef/decRef */
    managedRef: boolean;
}

/** 资源加载、引用计数与 Bundle 策略管理器 */
export class ResLoadMgr {

    /** 已加载的资源包列表 */
    private _loadedPackList: Map<string, Bundle> = new Map();
    /** Bundle 策略映射表 */
    private _bundlePolicyMap: Map<string, BundlePolicyInfo> = new Map();
    /** 资源引用信息映射表 */
    private _resRefMap: Map<string, ResRefInfo> = new Map();
    /** 正在加载的资源 Promise 映射表 */
    private _loadingResMap: Map<string, Promise<Asset>> = new Map();
    /** 正在加载的 Bundle 映射表 */
    private _loadingBundleMap: Map<string, Promise<Bundle>> = new Map();
    /** 热更新资源 LRU 缓存映射表 */
    private _hotLruMap: Map<string, true> = new Map();
    /** 热缓存容量 */
    private _hotCacheCapacity = 0;
    /** Core Bundle 固定资源映射表 (uuid -> Asset) */
    private _coreAssetMap: Map<string, Map<string, Asset>> = new Map();
    /** 反向索引：asset.uuid → resKey */
    private _uuidToKeyMap: Map<string, string> = new Map();
    
    /** 正在加载中的组件追踪，处理 setSprite 等异步竞争 */
    private _compLoadingMap: WeakMap<any, string> = new WeakMap();
    /** 组件当前持有的资源追踪，用于自动释放旧资源，防止替换泄漏 */
    private _compActiveResMap: WeakMap<any, { resPath: string, packName: string }> = new WeakMap();

    /****************  生命周期方法  ****************/

    /** 初始化管理器 */
    public init(options: ResLoadMgrInitOptions = {}): void {
        this.setHotCacheCapacity(options.hotCacheCapacity ?? this._hotCacheCapacity);
    }

    /****************  Bundle 策略配置  ****************/

    /** 
     * 设置 Bundle 资源生命周期策略
     * 设为私有：禁止运行时动态切换策略，只能在加载时定义
     */
    private setBundlePolicy(packName: string, policy: EResBundlePolicy): void {
        this._bundlePolicyMap.set(packName, { policy });
    }

    /** 获取 Bundle 资源生命周期策略 */
    public getBundlePolicy(packName: string): EResBundlePolicy {
        return this._bundlePolicyMap.get(packName)?.policy ?? EResBundlePolicy.Normal;
    }

    /** 设置热缓存容量 */
    public setHotCacheCapacity(lruCapacity: number): void {
        this._hotCacheCapacity = Math.max(0, lruCapacity);
        this.trimHotCache();
    }

    /****************  Bundle 加载与管理  ****************/

    /** 加载资源包 */
    public async loadBundle(packName: string, policy?: EResBundlePolicy): Promise<Bundle> {
        const loadedBundle = this._loadedPackList.get(packName);
        if (loadedBundle) {
            // 已加载的 Bundle 不允许修改策略，以防引用计数逻辑崩溃
            if (this.getBundlePolicy(packName) === EResBundlePolicy.Core) {
                await this.loadCoreBundleAssets(packName, loadedBundle);
            }
            return loadedBundle;
        }

        if (policy !== undefined) {
            this.setBundlePolicy(packName, policy);
        }

        const loadingBundle = this._loadingBundleMap.get(packName);
        if (loadingBundle) return loadingBundle;

        const promise = new Promise<Bundle>((resolve, reject) => {
            AssetManager.instance.loadBundle(packName, async (err, bundle) => {
                if (err || !bundle) {
                    reject(err || new Error(`Bundle load failed: ${packName}`));
                    return;
                }
                try {
                    if (this.getBundlePolicy(packName) === EResBundlePolicy.Core) {
                        await this.loadCoreBundleAssets(packName, bundle);
                    }
                    this._loadedPackList.set(packName, bundle);
                    gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.BUNDLE_LOAD_COMPLETE, packName);
                    resolve(bundle);
                } catch (e) {
                    reject(e);
                }
            });
        });

        this._loadingBundleMap.set(packName, promise);
        try {
            return await promise;
        } finally {
            this._loadingBundleMap.delete(packName);
        }
    }

    /** 释放资源包 */
    public releaseBundle(packName: string): boolean {
        const bundle = this._loadedPackList.get(packName);
        if (!bundle) return false;

        this.releasePackRes(packName);
        this.releaseCorePinnedAssets(packName);
        this._bundlePolicyMap.delete(packName);
        this._loadedPackList.delete(packName);
        AssetManager.instance.removeBundle(bundle);
        return true;
    }

    /****************  资源加载与引用计数  ****************/

    /** 加载资源（带引用计数） */
    public async loadRes<T extends Asset>(resPath: string, packName: string): Promise<T> {
        const key = this.getResKey(packName, resPath);

        const loadedInfo = this._resRefMap.get(key);
        if (loadedInfo) {
            this.acquireLoadedRes(loadedInfo);
            return loadedInfo.asset as T;
        }

        const loadingPromise = this._loadingResMap.get(key);
        if (loadingPromise) {
            await loadingPromise;
            return this.loadRes<T>(resPath, packName);
        }

        let bundle = this._loadedPackList.get(packName);
        if (!bundle) {
            const loadingBundle = this._loadingBundleMap.get(packName);
            bundle = loadingBundle ? await loadingBundle : await this.loadBundle(packName);
        }

        const task = new Promise<T>((resolve, reject) => {
            bundle!.load(resPath, (err, asset) => {
                if (err || !asset) {
                    reject(err || new Error(`Asset load failed: ${resPath} in ${packName}`));
                    return;
                }
                resolve(asset as T);
            });
        });

        this._loadingResMap.set(key, task);

        try {
            const asset = await task;
            let finalInfo = this._resRefMap.get(key);
            if (!finalInfo) {
                const policy = this.getBundlePolicy(packName);
                const corePinned = policy === EResBundlePolicy.Core && this.isCoreAssetPinned(packName, asset);

                if (!corePinned) {
                    asset.addRef();
                }

                finalInfo = {
                    asset,
                    refs: 1,
                    packName,
                    resPath,
                    policy,
                    cached: corePinned,
                    managedRef: !corePinned,
                };
                this._resRefMap.set(key, finalInfo);
                this._uuidToKeyMap.set(asset.uuid, key);
            } else {
                this.acquireLoadedRes(finalInfo);
            }

            return finalInfo.asset as T;
        } finally {
            this._loadingResMap.delete(key);
        }
    }

    /** 增加资源引用计数 */
    public retainRes(resPath: string, packName: string): boolean {
        const key = this.getResKey(packName, resPath);
        const info = this._resRefMap.get(key);
        if (!info) return false;
        this.acquireLoadedRes(info);
        return true;
    }

    /** 释放资源引用 */
    public releaseRes(resPath: string, packName: string): boolean {
        const key = this.getResKey(packName, resPath);
        const info = this._resRefMap.get(key);
        if (!info || info.refs <= 0) return false;

        // 无论何种策略，若是 Hot 模式且引用归零，则进入热缓存
        if (info.policy === EResBundlePolicy.Hot && info.refs === 1) {
            info.refs = 0;
            info.cached = true;
            this.addHotCache(info);
            return true;
        }

        info.refs--;
        // 严格遵循 managedRef 标记，避免引用计数失衡导致崩溃
        if (info.managedRef) {
            info.asset.decRef();
        }

        // 归零清理逻辑
        if (info.refs <= 0) {
            // Core 策略下且 managedRef=false 的资源（Pinned 资源）不主动清理
            if (info.policy !== EResBundlePolicy.Core || info.managedRef) {
                this.deleteResInfo(key);
            }
        }

        return true;
    }

    /** 通过资源实例释放资源 */
    public releaseAssets(asset: Asset): boolean {
        if (!asset) return false;
        let key = this._uuidToKeyMap.get(asset.uuid);
        if (!key) {
            for (const [k, v] of this._resRefMap.entries()) {
                if (v.asset === asset || v.asset.uuid === asset.uuid) {
                    key = k; break;
                }
            }
        }
        const info = key ? this._resRefMap.get(key) : undefined;
        if (!info) return false;
        return this.releaseRes(info.resPath, info.packName);
    }

    /****************  Sprite 设置便捷方法  ****************/

    /** 设置 Sprite 的 SpriteFrame */
    public async setSprite(resPath: string, packName: string, sprite: Sprite): Promise<boolean> {
        if (!sprite || !sprite.isValid) return false;
        this._compLoadingMap.set(sprite, resPath);

        try {
            const asset = await this.loadRes<SpriteFrame>(resPath, packName);
            if (!sprite.isValid || this._compLoadingMap.get(sprite) !== resPath) {
                this.releaseRes(resPath, packName);
                return false;
            }

            if (!(asset instanceof SpriteFrame)) {
                this.releaseRes(resPath, packName);
                return false;
            }

            // 自动释放旧资源引用，解决替换产生的内存泄漏
            this.releaseSpriteOldRes(sprite);

            sprite.spriteFrame = asset;
            this._compLoadingMap.delete(sprite);
            this._compActiveResMap.set(sprite, { resPath, packName });
            return true;
        } catch (e) {
            if (this._compLoadingMap.get(sprite) === resPath) this._compLoadingMap.delete(sprite);
            throw e;
        }
    }

    /** 从图集中设置 Sprite 的 SpriteFrame */
    public async setSpriteFormAtlas(resPath: string, spriteFrameName: string, packName: string, sprite: Sprite): Promise<boolean> {
        if (!sprite || !sprite.isValid) return false;
        const requestKey = `${resPath}#${spriteFrameName}`;
        this._compLoadingMap.set(sprite, requestKey);

        try {
            const asset = await this.loadRes<SpriteAtlas>(resPath, packName);
            if (!sprite.isValid || this._compLoadingMap.get(sprite) !== requestKey) {
                this.releaseRes(resPath, packName);
                return false;
            }

            if (!(asset instanceof SpriteAtlas)) {
                this.releaseRes(resPath, packName);
                return false;
            }

            const sf = asset.getSpriteFrame(spriteFrameName);
            if (!sf) {
                this.releaseRes(resPath, packName);
                return false;
            }

            this.releaseSpriteOldRes(sprite);

            sprite.spriteFrame = sf;
            this._compLoadingMap.delete(sprite);
            this._compActiveResMap.set(sprite, { resPath, packName });
            return true;
        } catch (e) {
            if (this._compLoadingMap.get(sprite) === requestKey) this._compLoadingMap.delete(sprite);
            throw e;
        }
    }

    /** 释放 Sprite 组件持有的旧资源引用 */
    private releaseSpriteOldRes(sprite: Sprite): void {
        const oldRes = this._compActiveResMap.get(sprite);
        if (oldRes) {
            this.releaseRes(oldRes.resPath, oldRes.packName);
            this._compActiveResMap.delete(sprite);
        }
    }

    /****************  私有辅助方法  ****************/

    private getResKey(packName: string, resPath: string): string {
        return `${packName}:${resPath}`;
    }

    private acquireLoadedRes(info: ResRefInfo): void {
        if (info.policy === EResBundlePolicy.Hot && info.cached && info.refs === 0) {
            info.refs = 1;
            info.cached = false;
            this._hotLruMap.delete(this.getResKey(info.packName, info.resPath));
            return;
        }

        info.refs++;
        // 严格遵循 managedRef，确保 Core 模式下未 Pinned 资源也能正确增加底层引用
        if (info.managedRef) {
            info.asset.addRef();
        }
    }

    private async loadCoreBundleAssets(packName: string, bundle: Bundle): Promise<void> {
        if (this._coreAssetMap.has(packName)) return;
        const assets = await new Promise<Asset[]>((resolve, reject) => {
            bundle.loadDir("", (err, data) => err ? reject(err) : resolve(data || []));
        });
        const pinnedMap = new Map<string, Asset>();
        for (const asset of assets) {
            if (pinnedMap.has(asset.uuid)) continue;
            asset.addRef();
            pinnedMap.set(asset.uuid, asset);
        }
        this._coreAssetMap.set(packName, pinnedMap);
    }

    private isCoreAssetPinned(packName: string, asset: Asset): boolean {
        return this._coreAssetMap.get(packName)?.has(asset.uuid) ?? false;
    }

    private addHotCache(info: ResRefInfo): void {
        const key = this.getResKey(info.packName, info.resPath);
        this._hotLruMap.delete(key);
        this._hotLruMap.set(key, true);
        this.trimHotCache();
    }

    private trimHotCache(): void {
        while (this._hotLruMap.size > this._hotCacheCapacity) {
            const evictKey = this._hotLruMap.keys().next().value;
            if (!evictKey) break;
            this.releaseHotCacheKey(evictKey);
        }
    }

    private releaseHotCacheKey(key: string): void {
        this._hotLruMap.delete(key);
        const info = this._resRefMap.get(key);
        if (!info || info.refs > 0) return;
        if (info.cached) {
            info.asset.decRef();
            info.cached = false;
        }
        this.deleteResInfo(key);
    }

    private clearOneHotCache(packName: string): void {
        for (const key of Array.from(this._hotLruMap.keys())) {
            const info = this._resRefMap.get(key);
            if (info?.packName === packName) this.releaseHotCacheKey(key);
        }
    }

    private releasePackRes(packName: string): void {
        const infos = Array.from(this._resRefMap.values()).filter(i => i.packName === packName);
        for (const info of infos) {
            const key = this.getResKey(info.packName, info.resPath);
            this._hotLruMap.delete(key);
            const count = (info.cached && info.refs === 0) ? 1 : info.refs;
            if (info.managedRef) {
                for (let i = 0; i < count; i++) info.asset.decRef();
            }
            this.deleteResInfo(key);
        }
    }

    private releaseCorePinnedAssets(packName: string): void {
        const pinnedMap = this._coreAssetMap.get(packName);
        if (!pinnedMap) return;
        for (const asset of pinnedMap.values()) asset.decRef();
        this._coreAssetMap.delete(packName);
    }

    private deleteResInfo(key: string): void {
        const info = this._resRefMap.get(key);
        if (info) this._uuidToKeyMap.delete(info.asset.uuid);
        this._resRefMap.delete(key);
    }

    public releaseAssetsFormAtlas(resPath: string, packName: string): void {
        this.releaseRes(resPath, packName);
    }
}
